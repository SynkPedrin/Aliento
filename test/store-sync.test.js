// Facturación nativa: sincronización Apple/Google (store-sync), verificación JWS de Apple
// y rutas /api/store. Usa Supabase LOCAL real; ninguna compra de verdad.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createSign, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Stripe from 'stripe';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { createBilling } from '../server/billing.js';
import { createPrograms } from '../server/programs.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';
import { createStoreSync } from '../server/services/store-sync.js';
import { createAppleJwsVerifier } from '../server/services/apple-jws.js';
import { createGooglePlayVerifier } from '../server/services/google-play.js';
import { createProgramEntitlementService } from '../server/services/entitlements.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };

let server, base, db, auth, config, storeSync, apple, googlePlay, entitlements;
const createdUsers = [];

// ---------------------------------------------------------------- llaves de prueba Apple
// CA raíz de prueba y hoja firmada por ella con OpenSSL. El verificador de App Store se fija
// en ESTA raíz durante los tests; en producción se usa la Apple Root CA - G3 publicada.
const tmpCerts = mkdtempSync(join(tmpdir(), 'alento-certs-'));
const rootKey = join(tmpCerts, 'root.key');
const rootPem = join(tmpCerts, 'root.pem');
const leafKey = join(tmpCerts, 'leaf.key');
const leafPem = join(tmpCerts, 'leaf.pem');
execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
  '-keyout', rootKey, '-out', rootPem, '-days', '1', '-subj', '/CN=Test Root CA/O=Alento Test/C=US'], { stdio: 'ignore' });
execFileSync('openssl', ['req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
  '-keyout', leafKey, '-out', join(tmpCerts, 'leaf.csr'), '-days', '1', '-subj', '/CN=App Store Signed/O=Apple Inc./C=US'], { stdio: 'ignore' });
execFileSync('openssl', ['x509', '-req', '-in', join(tmpCerts, 'leaf.csr'), '-CA', rootPem, '-CAkey', rootKey,
  '-out', leafPem, '-days', '1', '-set_serial', '01'], { stdio: 'ignore' });
const TEST_ROOT_PEM = execFileSync('openssl', ['x509', '-in', rootPem], { encoding: 'utf8', maxBuffer: 64 * 1024 });
const LEAF_KEY_PEM = execFileSync('openssl', ['pkey', '-in', leafKey], { encoding: 'utf8', maxBuffer: 64 * 1024 });
const LEAF_PEM = execFileSync('openssl', ['x509', '-in', leafPem], { encoding: 'utf8', maxBuffer: 64 * 1024 });

before(async () => {
  config = loadConfig({ APP_URL: 'http://localhost', STRIPE_SECRET_KEY: 'sk_test', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 5 });
  auth = createAuth({ config, db });
  const stripe = new Stripe('sk_test_dummy', { maxNetworkRetries: 0, timeout: 3000 });
  const billing = createBilling({ db, stripe, config, log: silent });
  storeSync = createStoreSync({ db, billing });
  apple = createAppleJwsVerifier({ bundleId: 'app.alento.test', rootCaPem: TEST_ROOT_PEM });
  googlePlay = createGooglePlayVerifier({ env: {}, log: silent });
  entitlements = createProgramEntitlementService({ db, billing });
  server = createApp({
    db, auth, billing, config, programs: createPrograms({ db, billing }),
    storeSync, apple, googlePlay, log: silent,
  }).listen(0);
  await new Promise((r) => server.once('listening', r));
  await db.service.exec('delete from public.rate_limits'); // ventana de límites por suite (misma isolación que flow.test.js)
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const id of createdUsers) await auth.deleteUser(id).catch(() => {});
  server.close();
  await db.end();
});

/** Usuario real en el auth local; devuelve { id, client } con cookies de sesión. */
async function user(name) {
  const email = `${name}-${randomUUID().slice(0, 8)}@test.local`;
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `T ${name}`, email, password: 'alento-test-1', acceptTerms: true, healthConsent: true, emailConfirm: email, timezone: 'UTC' }),
  });
  assert.equal(res.status, 201, `registro de ${name}`);
  const jar = [];
  for (const c of res.headers.getSetCookie()) if (c.startsWith('al_at=')) jar.push(c.split(';')[0]);
  const me = await fetch(`${base}/api/me`, { headers: { cookie: jar.join('; ') } });
  const meBody = await me.json();
  assert.ok(meBody.user?.id, 'la sesión tras el registro expone el id');
  createdUsers.push(meBody.user.id);
  return {
    id: meBody.user.id,
    email,
    client: async (path, opts = {}) => {
      const r = await fetch(base + path, {
        method: opts.method ?? 'GET',
        headers: { 'content-type': 'application/json', cookie: jar.join('; '), ...(opts.headers ?? {}) },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      const text = await r.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      return { status: r.status, body: json };
    },
  };
}

/** Construye un JWS ES256 con la hoja de prueba y su cadena de certificados. */
function forgeJws(payload, { chain = [LEAF_PEM, TEST_ROOT_PEM], key = LEAF_KEY_PEM } = {}) {
  // x5c lleva certificados DER en base64 estándar (el cuerpo del PEM, sin cabeceras).
  const der = (p) => p.replace(/-----BEGIN CERTIFICATE-----/, '').replace(/-----END CERTIFICATE-----/, '').replace(/\s+/g, '');
  const header = { alg: 'ES256', x5c: chain.map((p) => der(p)) };
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createSign('SHA256').update(`${h}.${p}`).sign({ key, dsaEncoding: 'ieee-p1363' }, 'base64url');
  return `${h}.${p}.${sig}`;
}

function appleTx(over = {}) {
  return {
    transactionId: `tx_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    originalTransactionId: `orig_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
    bundleId: 'app.alento.test',
    productId: 'app.alento.sem_fumo.mensual',
    environment: 'production',
    purchaseDate: Date.now(),
    expiresDate: Date.now() + 30 * 86400 * 1000,
    subscriptionGroupIdentifier: 'group_test',
    ...over,
  };
}

// ---------------------------------------------------------------- 1. verificación JWS
test('apple-jws: acepta JWS válido con cadena a la raíz fijada', () => {
  const payload = appleTx();
  const out = apple.verify(forgeJws(payload));
  assert.equal(out.transactionId, payload.transactionId);
  assert.equal(out.productId, payload.productId);
});

test('apple-jws: rechaza payload alterado y raíz desconocida (la oficial de Apple)', () => {
  // La cadena de prueba no acaba en la raíz REAL de Apple → el verificador de
  // producción (huella fijada) la rechaza.
  const official = createAppleJwsVerifier({ bundleId: 'app.alento.test' });
  assert.throws(() => official.verify(forgeJws(appleTx())), (e) => /Raíz de confianza/.test(e.message));

  // Payload alterado tras firmar: la firma deja de cuadrar.
  const jws = forgeJws(appleTx());
  const [h, , s] = jws.split('.');
  const forjado = Buffer.from(JSON.stringify(appleTx({ transactionId: 'tx_forjada' }))).toString('base64url');
  assert.throws(() => apple.verify(`${h}.${forjado}.${s}`), (e) => /Firma del JWS|Raíz|Certificado/.test(e.message));
});

test('apple-jws: exige bundle id y algoritmo ES256', () => {
  assert.throws(() => apple.verify(forgeJws(appleTx({ bundleId: 'com.otro.app' }))), (e) => /Bundle id/.test(e.message));
  const header = { alg: 'HS256', x5c: [Buffer.from(LEAF_PEM).toString('base64')] };
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(appleTx())).toString('base64url');
  assert.throws(() => apple.verify(`${h}.${p}.AAAA`), (e) => /Firma no soportada/.test(e.message));
});

// ---------------------------------------------------------------- 2. store-sync (servicio)
test('store-sync: transacción nativa concede acceso, es idempotente y se puede revocar', async () => {
  const u = await user('sincrono');
  // Estado comercial determinista: solo Sem Fumo a la venta (como el flujo real).
  await db.service.exec('update public.journey_programs set commercial_status = case when slug = \'sem-fumo\' then \'active\' else \'coming_soon\' end');

  const tx = appleTx();
  await storeSync.syncStorePurchase({
    userId: u.id, provider: 'apple', productId: tx.productId, transactionId: tx.transactionId,
    originalTransactionId: tx.originalTransactionId, expiresAt: new Date(Date.now() + 25 * 86400 * 1000),
  });

  const ent = await entitlements.getEntitlement(u.id, 'sem-fumo');
  assert.equal(ent.has_access, true, 'la compra nativa activa el programa');
  assert.equal(ent.billing_provider, 'apple');

  const replay = await storeSync.syncStorePurchase({
    userId: u.id, provider: 'apple', productId: tx.productId, transactionId: tx.transactionId,
    originalTransactionId: tx.originalTransactionId, expiresAt: new Date(Date.now() + 25 * 86400 * 1000),
  });
  assert.equal(replay.status, 'already_processed', 'reenvío de la misma transacción sin efecto');

  const revoked = await storeSync.syncStoreRevocation({ provider: 'apple', originalTransactionId: tx.originalTransactionId, reason: 'refund', transactionId: tx.transactionId });
  assert.equal(revoked.status, 'revoked');
  assert.equal((await entitlements.getEntitlement(u.id, 'sem-fumo')).has_access, false, 'el reembolso corta el acceso');

  assert.deepEqual(await storeSync.restoreUserPurchases(u.id), [], 'tras el reembolso no queda nada que restaurar');
});

test('store-sync: restore devuelve los programas con acceso vigente', async () => {
  const u = await user('restaura');
  const tx = appleTx();
  await storeSync.syncStorePurchase({
    userId: u.id, provider: 'apple', productId: tx.productId, transactionId: tx.transactionId,
    originalTransactionId: tx.originalTransactionId, expiresAt: new Date(Date.now() + 40 * 86400 * 1000),
  });
  const restored = await storeSync.restoreUserPurchases(u.id);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].program_slug, 'sem-fumo');
  assert.equal(restored[0].provider, 'apple');

  // Otro usuario no ve la compra de este.
  const v = await user('ajena');
  assert.deepEqual(await storeSync.restoreUserPurchases(v.id), []);
});

// ---------------------------------------------------------------- 3. rutas /api/store
test('rutas store: registro de transacción firmada, replay e aislamiento', async () => {
  const owner = await user('rutas-owner');
  const tx = appleTx({ appAccountToken: owner.id });
  const result = await owner.client('/api/store/transactions', { method: 'POST', body: { provider: 'apple', signedTransaction: forgeJws(tx) } });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.program, 'sem-fumo');

  // Repetición idéntica: 200 y ningún efecto colateral.
  const replay = await owner.client('/api/store/transactions', { method: 'POST', body: { provider: 'apple', signedTransaction: forgeJws(tx) } });
  assert.equal(replay.status, 200);

  const anon = await fetch(`${base}/api/store/transactions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'apple', signedTransaction: forgeJws(appleTx()) }) });
  assert.equal(anon.status, 401, 'sin sesión no se registra ninguna compra');

  const stranger = await user('rutas-otro');
  assert.deepEqual((await stranger.client('/api/store/restore')).body.purchases, []);
  const mine = await owner.client('/api/store/restore');
  assert.equal(mine.body.purchases.length, 1);
});

test('rutas store: mapeo de productos público para el cliente móvil', async () => {
  const u = await user('rutas-mapa');
  const res = await u.client('/api/store/products');
  assert.equal(res.status, 200);
  assert.equal(res.body.store, 'apple');
  const mensualSemFumo = res.body.products.find((p) => p.program === 'sem-fumo' && p.plan === 'mensual');
  assert.equal(mensualSemFumo.productId, 'app.alento.sem_fumo.mensual');
});

test('rutas store: google sin credenciales responde 503 y no inventa acceso', async () => {
  const u = await user('rutas-google');
  const res = await u.client('/api/store/transactions', { method: 'POST', body: { provider: 'google', productId: 'aliento_sem_fumo_mensual', purchaseToken: 'token-falso' } });
  assert.equal(res.status, 503);
});

test('rutas store: notificación de servidor de Apple (JWS v2) reembolsa con seguridad', async () => {
  const owner = await user('notify-owner');
  const tx = appleTx({ appAccountToken: owner.id });
  await owner.client('/api/store/transactions', { method: 'POST', body: { provider: 'apple', signedTransaction: forgeJws(tx) } });
  assert.equal((await owner.client('/api/store/restore')).body.purchases.length, 1);

  // Reembolso vía notificación firmada: corta el acceso.
  const notification = {
    notificationUUID: randomUUID(),
    notificationType: 'REFUND',
    data: { environment: 'production', status: 1, signedTransactionInfo: forgeJws({ ...tx, revocationDate: Date.now() }) },
  };
  const res = await owner.client('/api/store/notifications/apple', { method: 'POST', body: { signedPayload: forgeJws(notification) } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await owner.client('/api/store/restore')).body.purchases.length, 0, 'la notificación confirmada por Apple corta el derecho');

  // Payload sin estructura JWS se rechaza: no se procesa nada.
  const fake = await owner.client('/api/store/notifications/apple', { method: 'POST', body: { signedPayload: 'abc.def.ghi' } });
  assert.equal(fake.status, 400);
});

test('store: signed purchase cannot be claimed by another Alento account', async () => {
  const owner = await user('token-owner');
  const stranger = await user('token-stranger');
  const tx = appleTx({ appAccountToken: owner.id, environment: 'Production' });
  const body = { provider: 'apple', signedTransaction: forgeJws(tx) };
  assert.equal((await stranger.client('/api/store/transactions', { method: 'POST', body })).status, 403);
  assert.equal((await owner.client('/api/store/transactions', { method: 'POST', body })).status, 200);
  assert.equal((await stranger.client('/api/store/transactions', { method: 'POST', body })).status, 403);
  assert.equal((await entitlements.getEntitlement(stranger.id, 'sem-fumo')).has_access, false);
});

test('store: missing expiration and missing account binding fail closed', async () => {
  const owner = await user('invalid-expiry');
  for (const tx of [appleTx({ appAccountToken: owner.id, expiresDate: null }), appleTx()]) {
    const r = await owner.client('/api/store/transactions', { method: 'POST', body: { provider: 'apple', signedTransaction: forgeJws(tx) } });
    assert.ok(r.status >= 400);
  }
  assert.equal((await entitlements.getEntitlement(owner.id, 'sem-fumo')).has_access, false);
});

test('store: expiration of one program preserves the other program', async () => {
  const owner = await user('independent-expiry');
  for (const [program, expiry] of [['sem_fumo', Date.now() + 86400000], ['sueno', Date.now() - 86400000]]) {
    const tx = appleTx({ productId: `app.alento.${program}.mensual` });
    await storeSync.syncStorePurchase({ userId: owner.id, provider: 'apple', productId: tx.productId,
      transactionId: tx.transactionId, originalTransactionId: tx.originalTransactionId, expiresAt: expiry });
  }
  assert.equal((await entitlements.getEntitlement(owner.id, 'sem-fumo')).has_access, true);
  assert.equal((await entitlements.getEntitlement(owner.id, 'sueno')).has_access, false);
});

test('store: renewal notification resolves the original owner', async () => {
  const owner = await user('renew-owner');
  const tx = appleTx({ appAccountToken: owner.id });
  await owner.client('/api/store/transactions', { method: 'POST', body: { provider: 'apple', signedTransaction: forgeJws(tx) } });
  const renewal = { ...tx, transactionId: randomUUID(), expiresDate: Date.now() + 60 * 86400000 };
  const r = await owner.client('/api/store/notifications/apple', { method: 'POST', body: {
    signedPayload: forgeJws({ notificationUUID: randomUUID(), notificationType: 'DID_RENEW',
      data: { environment: 'Production', signedTransactionInfo: forgeJws(renewal) } })
  } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(new Date((await entitlements.getEntitlement(owner.id, 'sem-fumo')).current_period_end).getTime(), renewal.expiresDate);
});

test('store: revoked entitlement rejects an older renewal notification', async () => {
  const owner = await user('ordered');
  const tx = appleTx();
  const purchase = { userId: owner.id, provider: 'apple', productId: tx.productId,
    transactionId: tx.transactionId, originalTransactionId: tx.originalTransactionId,
    expiresAt: tx.expiresDate, signedAt: 100 };
  await storeSync.syncStorePurchase(purchase);
  await storeSync.syncStoreRevocation({ provider: 'apple', originalTransactionId: tx.originalTransactionId,
    transactionId: tx.transactionId, signedAt: 300 });
  const stale = await storeSync.syncStorePurchase({ ...purchase, transactionId: randomUUID(), signedAt: 200 });
  assert.equal(stale.status, 'stale');
  assert.equal((await entitlements.getEntitlement(owner.id, 'sem-fumo')).has_access, false);
  await storeSync.syncStorePurchase({ ...purchase, eventKey: randomUUID(), signedAt: 400 });
  assert.equal((await entitlements.getEntitlement(owner.id, 'sem-fumo')).has_access, true);
});

test('store: concurrent ownership claims cannot transfer a subscription', async () => {
  const a = await user('claim-a'), b = await user('claim-b');
  const tx = appleTx();
  const purchase = { provider: 'apple', productId: tx.productId, transactionId: tx.transactionId,
    originalTransactionId: tx.originalTransactionId, expiresAt: tx.expiresDate };
  const outcomes = await Promise.allSettled([storeSync.syncStorePurchase({ ...purchase, userId: a.id }),
    storeSync.syncStorePurchase({ ...purchase, userId: b.id })]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  const access = await Promise.all([a,b].map((u) => entitlements.getEntitlement(u.id, 'sem-fumo')));
  assert.equal(access.filter((e) => e.has_access).length, 1);
});

test('store: purchase context prevents duplicate and unpublished purchases', async () => {
  const owner = await user('context');
  assert.equal((await owner.client('/api/store/purchase-context', { method: 'POST', body: { program: 'sueno', plan: 'mensual' } })).status, 409);
  const context = await owner.client('/api/store/purchase-context', { method: 'POST', body: { program: 'sem-fumo', plan: 'mensual' } });
  assert.equal(context.status, 200);
  assert.equal(context.body.appAccountToken, owner.id);
  const tx = appleTx({ appAccountToken: owner.id });
  await owner.client('/api/store/transactions', { method: 'POST', body: { provider: 'apple', signedTransaction: forgeJws(tx) } });
  assert.equal((await owner.client('/api/store/purchase-context', { method: 'POST', body: { program: 'sem-fumo', plan: 'mensual' } })).status, 409);
});
