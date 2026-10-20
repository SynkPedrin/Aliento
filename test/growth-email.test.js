// Customer.io: entrega de identidad/eventos, transaccionales y webhook de informes (fetch simulado, Supabase local real).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';
import { createEmail, FLOWS } from '../server/growth/email.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
let db, config, calls, cio;
const settings = { get: async (k) => (k === 'customerio' ? cio : {}) };
const fetchImpl = async (url, opts) => { calls.push({ url: String(url), opts, body: opts.body ? JSON.parse(opts.body) : null }); return { ok: true, status: 200, json: async () => ({ delivery_id: 'd1' }), text: async () => '' }; };
const leads = []; const evKeys = [];
const mk = (cfg = config) => createEmail({ db, settings, config: cfg, fetchImpl, log: silent });
const sign = (secret, ts, raw) => createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex');

before(() => {
  config = loadConfig({ APP_URL: 'http://localhost', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 3 });
});
after(async () => {
  for (const k of evKeys) await db.service.exec(`delete from growth.email_events where raw->>'event_id' = $1`, [k]);
  for (const l of leads) {
    await db.service.exec('delete from growth.consents where lead_id = $1', [l]);
    await db.service.exec('delete from growth.leads where lead_id = $1', [l]);
  }
  await db.end();
});
const reset = (c = { siteId: 'site1', apiKey: 'key1', appApiKey: 'app1', region: 'eu', transactional: { welcome: 7 } }) => { calls = []; cio = c; };

test('FLOWS: 8 flujos con gatillo, secuencia y salida', () => {
  assert.equal(FLOWS.length, 8);
  for (const f of FLOWS) {
    assert.ok(f.key && f.name && f.trigger && f.exit && f.sequence.length > 0);
    assert.ok(['transactional', 'marketing'].includes(f.type));
  }
});

test('enabled() depende de siteId y apiKey', async () => {
  reset({});
  const noEnv = { ...config, growth: { ...config.growth, customerio: { siteId: '', apiKey: '', appApiKey: '', region: 'eu' } } };
  assert.equal(await mk(noEnv).enabled(), false);
  reset();
  assert.equal(await mk(noEnv).enabled(), true);
  assert.deepEqual(await mk(noEnv).deliver({ id: 'x' }).then(() => 'ok'), 'ok');
});

test('deliver: PUT de identidad + evento con id idempotente, host EU y Basic auth', async () => {
  reset();
  const eid = randomUUID();
  const r = await mk().deliver({ id: 'u-1', email: 'a@b.com', event_name: 'purchase', event_id: eid, time: 1790000000, language: 'es', topic: 'sem-fumo', data: { plan: 'anual' }, value_cents: 1999, currency: 'eur', marketing_consent: true });
  assert.equal(r.ok, true);
  assert.equal(calls.length, 2);
  const [put, ev] = calls;
  assert.equal(put.opts.method, 'PUT');
  assert.equal(put.url, 'https://track-eu.customer.io/api/v1/customers/u-1');
  assert.equal(put.opts.headers.authorization, `Basic ${Buffer.from('site1:key1').toString('base64')}`);
  assert.deepEqual(put.body, { email: 'a@b.com', language: 'es', topic: 'sem-fumo', marketing_consent: true });
  assert.equal(ev.url, 'https://track-eu.customer.io/api/v1/customers/u-1/events');
  assert.equal(ev.body.name, 'purchase');
  assert.equal(ev.body.id, eid);
  assert.equal(ev.body.timestamp, 1790000000);
  assert.equal(ev.body.data.plan, 'anual');
  reset({ siteId: 's', apiKey: 'k', region: 'us' });
  await mk().deliver({ id: 'u-2', email: 'a@b.com', event_name: 'lead_created', event_id: eid, time: 1 });
  assert.ok(calls[0].url.startsWith('https://track.customer.io/'));
});

test('sendTransactional: App API con Bearer; sin configurar devuelve skipped', async () => {
  reset();
  const r = await mk().sendTransactional({ to: 'a@b.com', template: 'welcome', data: { x: 1 }, language: 'es', userId: 'u-1' });
  assert.equal(r.ok, true);
  assert.equal(calls[0].url, 'https://api.eu.customer.io/v1/send/email');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer app1');
  assert.equal(calls[0].body.transactional_message_id, 7);
  assert.equal(calls[0].body.to, 'a@b.com');
  assert.deepEqual(calls[0].body.identifiers, { id: 'u-1' });
  assert.equal(calls[0].body.message_data.x, 1);
  reset({});
  assert.deepEqual(await mk().sendTransactional({ to: 'a@b.com', template: 'welcome' }), { skipped: true });
  assert.equal(calls.length, 0);
});

async function newLead() {
  const id = randomUUID();
  await db.service.exec('insert into growth.leads (lead_id) values ($1)', [id]);
  leads.push(id);
  return id;
}
const evt = (metric, id, extra = {}) => { const k = randomUUID(); evKeys.push(k); return { event_id: k, object_type: 'email', metric, timestamp: 1790000000, data: { campaign_name: 'welcome_confirm', subject: 'Confirma tu correo', identifiers: { id }, variant: 'A', language: 'es', ...extra } }; };

test('webhook: firma válida registra evento con flow, variante y lead; duplicado ignorado', async () => {
  const lead = await newLead();
  reset({ ...cio, webhookSecret: 'whsec' });
  const body = evt('opened', lead);
  const raw = JSON.stringify(body);
  const headers = { 'x-cio-signature': sign('whsec', '123', raw), 'x-cio-timestamp': '123' };
  const r = await mk().handleWebhook(body, headers, raw);
  assert.equal(r.ok, true);
  const row = await db.service.one(`select * from growth.email_events where raw->>'event_id' = $1`, [body.event_id]);
  assert.equal(row.event, 'opened');
  assert.equal(row.flow, 'welcome_confirm');
  assert.equal(row.variant, 'A');
  assert.equal(row.lead_id, lead);
  assert.equal((await mk().handleWebhook(body, headers, raw)).duplicate, true);
});

test('webhook: firma inválida o ausente se rechaza; sin secreto se rechaza en producción', async () => {
  const lead = await newLead();
  reset({ ...cio, webhookSecret: 'whsec' });
  const body = evt('sent', lead);
  assert.equal((await mk().handleWebhook(body, { 'x-cio-signature': 'deadbeef', 'x-cio-timestamp': '1' })).status, 401);
  assert.equal((await mk().handleWebhook(body, {})).status, 401);
  assert.equal(await db.service.one(`select 1 as x from growth.email_events where raw->>'event_id' = $1`, [body.event_id]), null);
  reset({ siteId: 's', apiKey: 'k' });
  const prod = { ...config, isProduction: true };
  assert.equal((await mk(prod).handleWebhook(body, {})).status, 401);
  assert.equal((await mk({ ...config, isProduction: false }).handleWebhook(body, {})).ok, true);
});

test('webhook: unsubscribed inserta consentimiento marketing_email=false', async () => {
  const lead = await newLead();
  reset({ ...cio, webhookSecret: '' });
  await mk({ ...config, isProduction: false }).handleWebhook(evt('unsubscribed', lead), {});
  const c = await db.service.one(`select * from growth.consents where lead_id = $1 and kind = 'marketing_email'`, [lead]);
  assert.equal(c.granted, false);
  const r = await mk({ ...config, isProduction: false }).handleWebhook({ metric: 'weird', data: {} }, {});
  assert.equal(r.ignored, true);
});
