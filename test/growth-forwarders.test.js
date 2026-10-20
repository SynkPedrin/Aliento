// Reenvío de la bandeja de salida a Meta/TikTok/Customer.io (fetch simulado, Supabase local real).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';
import { sha256, hashEmail } from '../server/growth/context.js';
import { createForwarders, buildMetaBody, buildTikTokBody, matchQuality } from '../server/growth/forwarders.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
let db, config;
const ids = [];
let cfgMap, calls, respond, delivered;
const settings = { get: async (k) => cfgMap[k] ?? {} };
const email = { enabled: async () => Boolean(cfgMap.customerio?.siteId), deliver: async (p) => { delivered.push(p); return { ok: true }; } };
const fetchImpl = async (url, opts) => { calls.push({ url: String(url), opts, body: JSON.parse(opts.body) }); return respond(String(url)); };
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

before(() => {
  config = loadConfig({ APP_URL: 'http://localhost', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 3 });
});
after(async () => {
  if (ids.length) await db.service.exec('delete from growth.outbox where id = any($1::bigint[])', [ids]);
  await db.end();
});
const fresh = () => {
  cfgMap = { 'pixels.meta': { pixelId: '111', accessToken: 'tok-meta-secret', testEventCode: 'TEST1' }, 'pixels.tiktok': { pixelId: 'PX2', accessToken: 'tok-tt-secret' } };
  calls = []; delivered = []; respond = (url) => (url.includes('tiktok') ? json(200, { code: 0, request_id: 'r' }) : json(200, { events_received: 1, fbtrace_id: 'x' }));
};
const payload = (extra = {}) => ({
  event_name: 'purchase', event_id: randomUUID(), time: 1790000000, url: 'https://citavel.ai/checkout',
  user: { external_id: 'vis-1', email_hash: hashEmail('A@b.com'), ip: '1.2.3.4', user_agent: 'UA', fbp: 'fb.1.1.2', fbc: 'fb.1.1.abc', ttclid: 'tt1', country: 'ES' },
  value_cents: 1999, currency: 'eur', content_name: 'anual', ...extra,
});
async function enqueue(dest, p) {
  const r = await db.service.one(`insert into growth.outbox (event_id, destination, payload) values ($1,$2,$3::jsonb) returning id`, [p.event_id, dest, JSON.stringify(p)]);
  ids.push(r.id);
  return r.id;
}
const row = (id) => db.service.one('select * from growth.outbox where id = $1', [id]);

test('buildMetaBody: mapeo, hash del e-mail, valor en unidades y test code', () => {
  const p = payload();
  const b = buildMetaBody(p, { testEventCode: 'T' });
  const e = b.data[0];
  assert.equal(e.event_name, 'Purchase');
  assert.equal(e.event_id, p.event_id);
  assert.equal(e.action_source, 'website');
  assert.equal(e.event_source_url, p.url);
  assert.deepEqual(e.user_data.em, [hashEmail('a@b.com')]);
  assert.deepEqual(e.user_data.external_id, [sha256('vis-1')]);
  assert.equal(e.user_data.client_ip_address, '1.2.3.4');
  assert.equal(e.custom_data.value, 19.99);
  assert.equal(e.custom_data.currency, 'EUR');
  assert.equal(b.test_event_code, 'T');
  for (const [i, m] of [['page_view', 'PageView'], ['quiz_started', 'ViewContent'], ['lead_created', 'Lead'], ['plan_viewed', 'PlanViewed'], ['plan_selected', 'AddToCart'], ['checkout_started', 'InitiateCheckout'], ['app_activated', 'CompleteRegistration']]) {
    assert.equal(buildMetaBody(payload({ event_name: i }), {}).data[0].event_name, m);
  }
});

test('buildTikTokBody: mapeo, ttclid y hashes', () => {
  const p = payload();
  const b = buildTikTokBody(p, { pixelId: 'PX2', testEventCode: 'TT' });
  assert.equal(b.event_source_id, 'PX2');
  assert.equal(b.test_event_code, 'TT');
  const e = b.data[0];
  assert.equal(e.event, 'CompletePayment');
  assert.equal(e.event_id, p.event_id);
  assert.equal(e.user.email, hashEmail('a@b.com'));
  assert.equal(e.user.external_id, sha256('vis-1'));
  assert.equal(e.user.ttclid, 'tt1');
  assert.equal(e.properties.value, 19.99);
  assert.equal(buildTikTokBody(payload({ event_name: 'lead_created' }), {}).data[0].event, 'SubmitForm');
});

test('nunca viajan datos de salud ni nada fuera del payload', () => {
  const p = payload({ habit: 'fumar', quiz: { habit: 'alcohol', answers: [1, 2] }, props: { habit: 'fumar' }, data: { habit: 'fumar' }, topic: 'sem-fumo' });
  p.user.habit = 'fumar';
  const txt = JSON.stringify([buildMetaBody(p, {}), buildTikTokBody(p, {})]);
  for (const bad of ['fumar', 'alcohol', 'sem-fumo', 'quiz', 'answers', 'habit']) assert.ok(!txt.includes(bad), `filtró ${bad}`);
  assert.ok(!txt.includes('a@b.com'), 'e-mail en claro');
});

test('matchQuality cuenta campos presentes', () => {
  assert.equal(matchQuality(payload()), 10);
  assert.equal(matchQuality({ user: {} }), 0);
  const mid = matchQuality({ user: { email_hash: 'h', ip: '1.1.1.1' } });
  assert.ok(mid > 0 && mid < 10);
});

test('processOutbox envía a Meta y TikTok con el mismo event_id y marca sent', async () => {
  fresh();
  const p = payload();
  const a = await enqueue('meta', p);
  const b = await enqueue('tiktok', p);
  const r = await forwarders().processOutbox({ limit: 500 });
  assert.ok(r.sent >= 2);
  const meta = calls.find((c) => c.url.includes('graph.facebook.com') && c.body.data[0].event_id === p.event_id);
  const tt = calls.find((c) => c.url.includes('business-api.tiktok.com') && c.body.data[0].event_id === p.event_id);
  assert.ok(meta && tt);
  assert.match(meta.url, /\/v21\.0\/111\/events\?access_token=/);
  assert.equal(meta.body.test_event_code, 'TEST1');
  assert.equal(tt.opts.headers['Access-Token'], 'tok-tt-secret');
  for (const id of [a, b]) {
    const x = await row(id);
    assert.equal(x.status, 'sent');
    assert.ok(x.sent_at);
    assert.ok(!JSON.stringify(x.response).includes('secret'));
  }
});

test('reintentos con backoff y fallo definitivo tras 6 intentos', async () => {
  fresh();
  respond = () => json(500, { error: { message: 'boom' } });
  const p = payload();
  const id = await enqueue('meta', p);
  const f = forwarders();
  await f.processOutbox({ limit: 500 });
  let x = await row(id);
  assert.equal(x.status, 'pending');
  assert.equal(x.attempts, 1);
  assert.match(x.last_error, /boom/);
  const secs = async () => Number((await db.service.one('select extract(epoch from (next_attempt_at - now())) as s from growth.outbox where id = $1', [id])).s);
  let s = await secs();
  assert.ok(s > 30 && s <= 61, `1m, fue ${s}`);
  // No se reintenta antes de tiempo
  calls = [];
  await f.processOutbox({ limit: 500 });
  assert.ok(!calls.some((c) => c.body.data?.[0]?.event_id === p.event_id));
  for (let n = 2; n <= 6; n++) {
    await db.service.exec(`update growth.outbox set next_attempt_at = now() where id = $1`, [id]);
    await f.processOutbox({ limit: 500 });
    x = await row(id);
    assert.equal(x.attempts, n);
    if (n === 3) { s = await secs(); assert.ok(s > 1700 && s <= 1801, `30m, fue ${s}`); }
  }
  assert.equal(x.status, 'failed');
});

test('TikTok con code != 0 cuenta como fallo; recuperación posterior marca sent', async () => {
  fresh();
  respond = () => json(200, { code: 40001, message: 'bad token' });
  const id = await enqueue('tiktok', payload());
  const f = forwarders();
  await f.processOutbox({ limit: 500 });
  assert.equal((await row(id)).status, 'pending');
  respond = () => json(200, { code: 0, request_id: 'ok' });
  await db.service.exec(`update growth.outbox set next_attempt_at = now() where id = $1`, [id]);
  await f.processOutbox({ limit: 500 });
  assert.equal((await row(id)).status, 'sent');
});

test('destino sin configurar se marca skipped; customerio delega en email.deliver', async () => {
  fresh();
  cfgMap = {};
  const pm = payload();
  const idm = await enqueue('meta', pm);
  const pc = { id: 'u1', email: 'x@y.z', event_name: 'lead_created', event_id: randomUUID(), time: 1, data: {}, marketing_consent: false };
  const idc = await enqueue('customerio', pc);
  await forwarders().processOutbox({ limit: 500 });
  assert.equal((await row(idm)).status, 'skipped');
  assert.equal((await row(idc)).status, 'skipped');
  assert.ok(!delivered.some((d) => d.event_id === pc.event_id));
  cfgMap = { customerio: { siteId: 's' } };
  const pc2 = { ...pc, event_id: randomUUID() };
  const idc2 = await enqueue('customerio', pc2);
  await forwarders().processOutbox({ limit: 500 });
  assert.equal((await row(idc2)).status, 'sent');
  assert.ok(delivered.some((d) => d.event_id === pc2.event_id));
});

test('dedup: el mismo event_id y destino no se encola dos veces', async () => {
  fresh();
  const p = payload();
  await enqueue('meta', p);
  await assert.rejects(() => enqueue('meta', p));
});

function forwarders() { return createForwarders({ db, settings, config, email, fetchImpl, log: silent }); }
