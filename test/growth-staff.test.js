// Equipo y 2FA del panel de growth contra el Supabase local.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createAuth } from '../server/auth.js';
import { createSettings } from '../server/growth/settings.js';
import { createStaff, totp, base32Decode, base32Encode, TWOFA_COOKIE } from '../server/growth/staff.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
let db, config, auth, staff, admin;
const users = [];

async function newUser(tag) {
  const email = `gstaff-${tag}-${randomUUID().slice(0, 8)}@example.com`;
  await auth.register({ name: tag, email, password: `Pw-${randomUUID()}`, timezone: 'UTC' });
  const row = await db.service.one('select id from auth.users where email = $1', [email]);
  users.push(row.id);
  return { id: row.id, email };
}

function fakeRes() {
  const cookies = {};
  return { cookies, cookie(n, v, o) { cookies[n] = { v, o }; }, clearCookie() {} };
}
function run(mw, req) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(b) { resolve({ status: this.statusCode, body: b }); },
    };
    mw(req, res, () => resolve({ status: 'next', req }));
  });
}

before(async () => {
  config = loadConfig({ APP_URL: 'http://localhost', GROWTH_REQUIRE_2FA: 'true', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 3 });
  auth = createAuth({ config, db });
  admin = createClient(config.supabase.url, config.supabase.secretKey, { auth: { persistSession: false } });
  const settings = createSettings({ db, config });
  // El "último admin" se calcula solo entre los usuarios de la prueba (la base local puede tener otros admins).
  const scoped = { service: {
    ...db.service,
    rows: async (sql, p) => {
      const r = await db.service.rows(sql, p);
      return sql.includes('public.admin_users') && sql.includes('union') ? r.filter((x) => users.includes(x.user_id)) : r;
    },
    one: (...a) => db.service.one(...a),
    exec: (...a) => db.service.exec(...a),
  } };
  staff = createStaff({ db: scoped, settings, config, log: silent });
});

after(async () => {
  for (const id of users) {
    await db.service.exec('delete from growth.audit_log where entity_id = $1::text or actor = $1::uuid', [id]);
    await db.service.exec('delete from growth.staff where user_id = $1', [id]);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  await db.end();
});

test('TOTP: vectores oficiales de RFC 6238 (SHA-1, 8 dígitos)', () => {
  const secret = Buffer.from('12345678901234567890');
  const vec = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
  for (const [t, code] of vec) assert.equal(totp(secret, t * 1000, { digits: 8 }), code);
  assert.deepEqual(base32Decode(base32Encode(secret)), secret);
});

test('2FA: setup, rechaza código erróneo, activa y verifica con ventana ±1', async () => {
  const u = await newUser('totp');
  await staff.grantByEmail(u.email, 'marketing');
  const { secret, otpauthUrl } = await staff.totpSetup(u.id, u.email);
  assert.match(otpauthUrl, /^otpauth:\/\/totp\/.*issuer=Alento/);
  const raw = await db.service.one('select totp_secret from growth.staff where user_id = $1', [u.id]);
  assert.ok(raw.totp_secret.startsWith('enc:') && !raw.totp_secret.includes(secret), 'secreto cifrado');
  const key = base32Decode(secret);
  const now = Date.now();
  assert.equal(await staff.totpEnable(u.id, '000000'), false);
  assert.equal(await staff.twofaEnabled(u.id), false);
  assert.equal(await staff.totpEnable(u.id, totp(key, now)), true);
  assert.equal(await staff.twofaEnabled(u.id), true);
  assert.equal(await staff.verifyTotp(u.id, totp(key, now)), true);
  assert.equal(await staff.verifyTotp(u.id, totp(key, now - 30000)), true, 'ventana -1');
  assert.equal(await staff.verifyTotp(u.id, totp(key, now - 120000)), false, 'caducado');
  assert.equal(await staff.verifyTotp(u.id, totp(key, now + 120000)), false);
  assert.equal(await staff.verifyTotp(u.id, 'abcdef'), false);
  await assert.rejects(staff.totpSetup(u.id), (e) => e.code === 'TWOFA_ALREADY');
});

test('cookie al_gt: firma, usuario, caducidad y adulteración', async () => {
  const u = await newUser('cookie');
  const res = fakeRes();
  staff.issue2fa(res, u.id);
  const c = res.cookies[TWOFA_COOKIE];
  assert.equal(c.o.httpOnly, true);
  assert.equal(c.o.sameSite, 'strict');
  assert.equal(c.o.maxAge, 12 * 3600 * 1000);
  const req = (v) => ({ cookies: { [TWOFA_COOKIE]: v } });
  assert.equal(staff.has2fa(req(c.v), u.id), true);
  assert.equal(staff.has2fa(req(c.v), randomUUID()), false, 'otro usuario');
  assert.equal(staff.has2fa({ headers: { cookie: `${TWOFA_COOKIE}=${c.v}` } }, u.id), true, 'desde cabecera');
  const [id, exp, sig] = c.v.split('.');
  assert.equal(staff.has2fa(req(`${id}.${Number(exp) + 999}.${sig}`), u.id), false, 'exp adulterado');
  assert.equal(staff.has2fa(req(`${id}.${exp}.${sig.slice(0, -2)}xx`), u.id), false, 'firma adulterada');
  assert.equal(staff.has2fa(req(''), u.id), false);
  const old = staff.makeToken(u.id, Date.now() - 13 * 3600 * 1000);
  assert.equal(staff.has2fa(req(old), u.id), false, 'expirado');
  const prod = createStaff({ db, settings: createSettings({ db, config }), config: { ...config, isProduction: true } });
  const r2 = fakeRes(); prod.issue2fa(r2, u.id);
  assert.equal(r2.cookies[TWOFA_COOKIE].o.secure, true);
});

test('requireStaff: 401, 403, 428 TWOFA_REQUIRED y paso con 2FA', async () => {
  const u = await newUser('mw');
  const outsider = await newUser('mw-out');
  await staff.grantByEmail(u.email, 'readonly');
  const mw = staff.requireStaff();
  assert.equal((await run(mw, { cookies: {} })).status, 401);
  assert.equal((await run(mw, { user: { id: outsider.id }, cookies: {} })).status, 403);
  assert.equal((await run(staff.requireStaff({ roles: ['admin'] }), { user: { id: u.id }, cookies: {} })).status, 403);
  const no2fa = await run(mw, { user: { id: u.id }, cookies: {} });
  assert.equal(no2fa.status, 428);
  assert.equal(no2fa.body.code, 'TWOFA_REQUIRED');
  const res = fakeRes(); staff.issue2fa(res, u.id);
  const ok = await run(mw, { user: { id: u.id }, cookies: { [TWOFA_COOKIE]: res.cookies[TWOFA_COOKIE].v } });
  assert.equal(ok.status, 'next');
  assert.deepEqual(ok.req.staff, { userId: u.id, role: 'readonly' });
});

test('equipo: grant, list, audit y nunca se quita al último admin', async () => {
  const a = await newUser('adm1');
  const b = await newUser('adm2');
  assert.equal(await staff.roleOf(a.id), null);
  const g = await staff.grant({ email: a.email, role: 'admin' });
  assert.equal(g.userId, a.id);
  assert.equal(await staff.roleOf(a.id), 'admin');
  assert.ok((await staff.list()).some((r) => r.user_id === a.id && r.role === 'admin'));
  await staff.audit({ user: { id: a.id } }, 'test.audit', 'staff', a.id, { x: 1 });
  assert.ok(await db.service.one(`select 1 from growth.audit_log where actor = $1 and action = 'test.audit'`, [a.id]));
  // único admin: no se puede revocar ni degradar
  await assert.rejects(staff.revoke(a.id), (e) => e.code === 'LAST_ADMIN');
  await assert.rejects(staff.grant({ email: a.email, role: 'readonly' }), (e) => e.code === 'LAST_ADMIN');
  assert.equal(await staff.roleOf(a.id), 'admin');
  // con un segundo admin sí
  await staff.grant({ email: b.email, role: 'admin' });
  await staff.revoke(a.id);
  assert.equal(await staff.roleOf(a.id), null);
  await assert.rejects(staff.revoke(b.id), (e) => e.code === 'LAST_ADMIN');
  await assert.rejects(staff.grant({ email: a.email, role: 'dios' }), (e) => e.status === 422);
  await assert.rejects(staff.grant({ email: 'nadie-xyz@example.com', role: 'admin' }), (e) => e.status === 404);
});
