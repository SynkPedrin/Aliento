// API del panel: acceso de equipo + 2FA, métricas, CSV, cron y configuración.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createGrowth } from '../server/growth/index.js';
import { base32Decode, totp } from '../server/growth/staff.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
let db, config, growth, auth, server, base;
const created = [], tag = randomUUID().slice(0, 8);

before(async () => {
  config = loadConfig({ APP_URL: 'http://localhost', CRON_SECRET: 'cron-test', GROWTH_ENCRYPTION_KEY: 'test-key', GROWTH_REQUIRE_2FA: 'true', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 5 });
  auth = createAuth({ config, db });
  growth = createGrowth({ db, config, auth, log: silent });
  const billing = { enabled: false, activeSubscription: async () => null, subscriptionsByProgram: async () => [] };
  server = createApp({ db, auth, billing, config, programs: { get: async () => null }, growth, log: silent }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await db.service.exec('delete from public.rate_limits');
});
after(async () => {
  await db.service.exec(`delete from growth.ad_spend_daily where ad_id like $1`, [`adT-${tag}%`]);
  await db.service.exec(`delete from growth.ads where ad_id like $1`, [`adT-${tag}%`]);
  await db.service.exec(`delete from growth.orders where order_id like $1`, [`ordT-${tag}%`]);
  await db.service.exec(`delete from growth.settings where key = 'pixels.meta'`);
  for (const id of created) { await db.service.exec('delete from growth.staff where user_id = $1', [id]); await auth.deleteUser(id).catch(() => {}); }
  server.close(); await db.end();
});

function client(b) {
  const jar = new Map();
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch((b ?? base) + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); const k = pair.slice(0, i), v = pair.slice(i + 1); if (v) jar.set(k, v); else jar.delete(k); }
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
}
async function register() {
  const c = client(); const mail = `staff-${randomUUID().slice(0, 8)}@example.com`;
  const r = await c('/api/auth/register', { method: 'POST', body: { name: 'Eq', email: mail, password: 'secreta123', acceptTerms: true, healthConsent: true, timezone: 'Europe/Madrid' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const u = await db.service.one('select id from auth.users where email = $1', [mail]); created.push(u.id);
  return { c, id: u.id, mail };
}

test('acceso: sin sesión 401, sin rol 403, con rol exige 2FA y luego da acceso', async () => {
  assert.equal((await client()('/api/growth/me')).status, 401);
  const outsider = await register();
  assert.equal((await outsider.c('/api/growth/me')).status, 403);
  assert.equal((await outsider.c('/api/growth/overview')).status, 403);

  const staffer = await register();
  await growth.staff.grantUser(staffer.id, 'admin');
  const me = await staffer.c('/api/growth/me');
  assert.equal(me.status, 200); assert.equal(me.body.role, 'admin'); assert.equal(me.body.twofa.enabled, false);
  assert.equal((await staffer.c('/api/growth/overview')).status, 428);

  const setup = await staffer.c('/api/growth/2fa/setup', { method: 'POST' });
  assert.equal(setup.status, 200); assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\//);
  const secret = base32Decode(setup.body.secret);
  assert.equal((await staffer.c('/api/growth/2fa/enable', { method: 'POST', body: { code: '000000' } })).status, 422);
  assert.equal((await staffer.c('/api/growth/2fa/enable', { method: 'POST', body: { code: totp(secret) } })).status, 200);
  assert.equal((await staffer.c('/api/growth/overview')).status, 200);

  // otra sesión del mismo usuario sin cookie 2FA debe verificar
  const again = client();
  const login = await again('/api/auth/login', { method: 'POST', body: { email: staffer.mail, password: 'secreta123' } });
  assert.equal(login.status, 200);
  assert.equal((await again('/api/growth/funnel')).status, 428);
  assert.equal((await again('/api/growth/2fa/verify', { method: 'POST', body: { code: '123456' } })).status, 422);
  assert.equal((await again('/api/growth/2fa/verify', { method: 'POST', body: { code: totp(secret) } })).status, 200);
  assert.equal((await again('/api/growth/funnel')).status, 200);
  globalThis.__staffer = staffer;
});

test('métricas: gasto + ventas atribuidas calculan ROAS, CAC y llegan al panel', async () => {
  const s = globalThis.__staffer;
  const today = new Date().toISOString().slice(0, 10);
  const ad = `adT-${tag}`;
  await db.service.exec(`insert into growth.ads (platform, ad_id, campaign_id, campaign_name, adset_id, adset_name, ad_name) values ('meta', $1, 'camT', 'Campaña T', 'setT', 'Conjunto T', 'Anuncio T')`, [ad]);
  await db.service.exec(`insert into growth.ad_spend_daily (platform, ad_id, day, spend_cents, impressions, clicks, video_3s_views) values ('meta', $1, $2, 1000, 10000, 200, 3000)`, [ad, today]);
  await db.service.exec(`insert into growth.orders (order_id, provider, program_slug, plan, kind, amount_cents, currency, paid_at, last_touch, first_touch)
    values ($1, 'stripe', 'sem-fumo', 'mensual', 'first', 2000, $3, now(), $2::jsonb, $2::jsonb)`, [`ordT-${tag}`, JSON.stringify({ utm_source: 'facebook', utm_content: ad, utm_campaign: 'camT', utm_term: 'setT' }), config.currency]);

  const acq = await s.c(`/api/growth/acquisition?from=${today}&to=${today}`);
  assert.equal(acq.status, 200);
  const row = acq.body.rows.find((r) => r.ad_id === ad);
  assert.ok(row, 'anuncio en la tabla');
  assert.equal(row.spend_cents, 1000); assert.equal(row.purchases, 1); assert.equal(row.cac_cents, 1000); assert.equal(row.roas_d0, 2);
  assert.equal(acq.body.tree.find((t) => t.campaign_id === 'camT').adsets[0].ads[0].ad_id, ad);

  const cr = await s.c(`/api/growth/creatives?from=${today}&to=${today}`);
  const c = cr.body.ads.find((a) => a.ad_id === ad);
  assert.equal(c.ctr_pct, 2); assert.equal(c.hook_rate_pct, 30); assert.equal(c.cost_per_sale_cents, 1000);

  const ov = await s.c('/api/growth/overview');
  assert.ok(ov.body.kpis.today.revenue_cents >= 2000 && ov.body.kpis.today.spend_cents >= 1000);
  assert.ok(ov.body.kpis.d30.roas > 0);

  const sales = await s.c(`/api/growth/sales?from=${today}&to=${today}`);
  assert.ok(sales.body.summary.orders >= 1);
  const csv = await s.c(`/api/growth/acquisition?from=${today}&to=${today}&format=csv`);
  assert.match(csv.headers.get('content-type'), /text\/csv/); assert.match(csv.body, /ad_id/); assert.match(csv.body, new RegExp(ad));
});

test('pantallas sin datos devuelven estructura vacía válida y la configuración enmascara secretos', async () => {
  const s = globalThis.__staffer;
  for (const p of ['funnel', 'emails', 'experiments', 'ai/status', 'ai/reports', 'ai/actions', 'outbox', 'staff', 'people?q=zzzz-no-existe']) {
    const r = await s.c(`/api/growth/${p}`);
    assert.equal(r.status, 200, `${p}: ${JSON.stringify(r.body).slice(0, 200)}`);
  }
  assert.ok(Array.isArray((await s.c('/api/growth/funnel')).body.steps));
  const put = await s.c('/api/growth/settings/pixels.meta', { method: 'PUT', body: { pixelId: '555', accessToken: 'super-secreto' } });
  assert.equal(put.status, 200);
  const got = await s.c('/api/growth/settings');
  assert.equal(got.body.settings['pixels.meta'].accessToken, '********');
  assert.ok(!JSON.stringify(got.body).includes('super-secreto'));
  assert.equal((await s.c('/api/growth/settings/inventada', { method: 'PUT', body: {} })).status, 404);
});

test('cron: exige CRON_SECRET', async () => {
  await db.service.exec(`delete from growth.settings where key = 'pixels.meta'`); // sin destinos reales en pruebas
  await db.service.exec(`delete from growth.outbox where status = 'pending'`);
  const c = client();
  assert.equal((await c('/api/cron/growth?job=outbox')).status, 401);
  assert.equal((await c('/api/cron/growth?job=outbox', { headers: { authorization: 'Bearer nope' } })).status, 401);
  const ok = await c('/api/cron/growth?job=outbox', { headers: { authorization: 'Bearer cron-test' } });
  assert.equal(ok.status, 200);
  assert.equal((await c('/api/cron/growth?job=inventado', { headers: { authorization: 'Bearer cron-test' } })).status, 404);
});

test('embudo: preguntas en el orden del quiz (P1, P2…) con retención sobre P1', async () => {
  const s = globalThis.__staffer;
  const ids = (await import('../server/quiz.js')).PROGRAM_STEPS.sueno.filter((x) => ['single', 'multi', 'number'].includes(x.type)).slice(0, 3).map((x) => x.id);
  const v = [randomUUID(), randomUUID()];
  // Inserción desordenada: la respuesta de la 3.ª pregunta llega primero.
  for (const [vis, q] of [[v[0], ids[2]], [v[0], ids[0]], [v[1], ids[0]], [v[0], ids[1]], [v[1], ids[1]]]) {
    await db.service.exec(`insert into growth.quiz_answers (visitor_id, program_slug, question, answer, seconds, quiz_version) values ($1, 'sueno', $2, 'x', 3, $3)`, [vis, q, `t-${tag}`]);
  }
  try {
    const qs = (await s.c('/api/growth/funnel?program=sueno')).body.questions.filter((q) => q.program === 'sueno');
    assert.deepEqual(qs.slice(0, 3).map((q) => q.n), [1, 2, 3]);
    assert.equal(qs[0].retention_pct, 100);
    assert.ok(qs[2].retention_pct < 100 && qs[2].title);
  } finally {
    await db.service.exec('delete from growth.quiz_answers where quiz_version = $1', [`t-${tag}`]);
  }
});

test('equipe: o admin cria a conta de um membro novo dentro do painel (sem cadastro público)', async () => {
  const s = globalThis.__staffer;
  const mail = `novo-${tag}@example.com`;
  const short = await s.c('/api/growth/staff', { method: 'POST', body: { name: 'Ana', email: mail, password: 'curta', role: 'marketing' } });
  assert.equal(short.status, 422);
  const ok = await s.c('/api/growth/staff', { method: 'POST', body: { name: 'Ana', email: mail, password: 'senha-inicial-123', role: 'marketing' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const u = await db.service.one('select id from auth.users where email = $1', [mail]);
  created.push(u.id);
  assert.equal(await growth.staff.roleOf(u.id), 'marketing');
  const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: mail, password: 'senha-inicial-123' }) });
  assert.equal(login.status, 200);
});

test('2FA desligado (padrão): membro da equipe entra no painel só com a senha', async () => {
  const cfg = loadConfig({ APP_URL: 'http://localhost', CRON_SECRET: 'cron-test', GROWTH_ENCRYPTION_KEY: 'test-key', ...localSupabaseEnv() });
  assert.equal(cfg.growth.require2fa, false);
  const app = createApp({ db, auth, billing: { enabled: false, activeSubscription: async () => null, subscriptionsByProgram: async () => [] }, config: cfg, programs: { get: async () => null }, growth: createGrowth({ db, config: cfg, auth, log: silent }), log: silent }).listen(0);
  await new Promise((r) => app.once('listening', r));
  try {
    const c = client(`http://127.0.0.1:${app.address().port}`);
    const mail = `sem2fa-${tag}@example.com`;
    assert.equal((await c('/api/auth/register', { method: 'POST', body: { name: 'Eq', email: mail, password: 'secreta123', acceptTerms: true, healthConsent: true, timezone: 'Europe/Madrid' } })).status < 300, true);
    const u = await db.service.one('select id from auth.users where email = $1', [mail]); created.push(u.id);
    await growth.staff.grantUser(u.id, 'marketing');
    assert.equal((await c('/api/growth/funnel')).status, 200);
    assert.equal((await c('/api/growth/me')).body.twofa.verified, true);
  } finally { app.close(); }
});
