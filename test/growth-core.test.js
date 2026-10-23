// Núcleo del panel de growth: ingesta, atribución, consentimiento, outbox, hooks de Stripe y vistas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createGrowth } from '../server/growth/index.js';
import { eventIdFor, hashEmail, sanitizeUrl } from '../server/growth/context.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
let db, config, growth, server, base;
const vids = [], emails = [], users = [];

before(async () => {
  config = loadConfig({ APP_URL: 'http://localhost', CRON_SECRET: 'cron-test', GROWTH_ENCRYPTION_KEY: 'test-key', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 5 });
  growth = createGrowth({ db, config, auth: createAuth({ config, db }), log: silent });
  const billing = { enabled: false, activeSubscription: async () => null, subscriptionsByProgram: async () => [] };
  server = createApp({ db, auth: createAuth({ config, db }), billing, config, programs: { get: async () => null }, growth, log: silent }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await db.service.exec(`delete from growth.settings where key in ('pixels.meta', 'pixels.tiktok', 'customerio') or key like 'pixel:%'`);
});

after(async () => {
  for (const v of vids) await db.service.exec('select growth.erase_person(null, null, $1)', [v]);
  for (const e of emails) {
    const l = await db.service.one('select lead_id from growth_pii.lead_pii where email = $1', [e]);
    if (l) await db.service.exec('select growth.erase_person($1, null, null)', [l.lead_id]);
  }
  await db.service.exec(`delete from growth.outbox where status = 'pending' and destination in ('meta', 'tiktok', 'customerio')`); // nada de pruebas hacia APIs reales
  await db.service.exec(`delete from growth.settings where key in ('pixels.meta', 'pixels.tiktok') or key like 'pixel:%'`);
  server.close();
  await db.end();
});

const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const touch = (extra = {}) => ({ first: { utm_source: 'facebook', utm_content: 'ad_111', ...extra }, last: { utm_source: 'facebook', utm_campaign: 'c1', utm_term: 's1', utm_content: 'ad_111', fbclid: 'abc', ...extra } });

test('settings: los tokens se guardan cifrados y se devuelven descifrados solo al servidor', async () => {
  await growth.settings.set('pixels.meta', { pixelId: '123', accessToken: 'secreto-token' });
  const raw = await db.service.one(`select value from growth.settings where key = 'pixels.meta'`);
  assert.ok(raw.value.accessToken.startsWith('enc:'));
  assert.ok(!JSON.stringify(raw.value).includes('secreto-token'));
  assert.equal((await growth.settings.get('pixels.meta')).accessToken, 'secreto-token');
  assert.equal((await growth.settings.getMasked('pixels.meta')).accessToken, '********');
  await growth.settings.set('pixels.meta', { pixelId: '123', accessToken: '********' }); // conserva el guardado
  assert.equal((await growth.settings.get('pixels.meta')).accessToken, 'secreto-token');
});

test('track: guarda evento, visitante, atribución y respuestas del quiz; ignora eventos no permitidos', async () => {
  const vid = randomUUID(); vids.push(vid);
  const res = await post('/api/track', {
    visitor: { id: vid, session: randomUUID(), touch: touch() }, language: 'es', page: '/quiz/sem-fumo', consent: { marketing: false },
    events: [
      { id: randomUUID(), name: 'quiz_started', props: { program: 'sem-fumo' } },
      { id: randomUUID(), name: 'quiz_answered', props: { program: 'sem-fumo', question: 'edad', answer: '30', seconds: 4.2 } },
      { id: randomUUID(), name: 'purchase', props: {} }, // el navegador NO puede registrar compras
    ],
  }, { 'user-agent': 'Mozilla/5.0 (iPhone) Mobile Safari' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).recorded, 2);
  const ev = await db.service.rows('select name, utm_content, device, language from growth.events where visitor_id = $1 order by name', [vid]);
  assert.deepEqual(ev.map((e) => e.name), ['quiz_answered', 'quiz_started']);
  assert.equal(ev[0].utm_content, 'ad_111');
  assert.equal(ev[0].device, 'mobile');
  const qa = await db.service.one('select question, answer, seconds from growth.quiz_answers where visitor_id = $1', [vid]);
  assert.equal(qa.question, 'edad'); assert.equal(Number(qa.seconds), 4.2);
  const v = await db.service.one('select first_touch, last_touch from growth.visitors where visitor_id = $1', [vid]);
  assert.equal(v.first_touch.utm_source, 'facebook'); assert.equal(v.last_touch.fbclid, 'abc');
});

test('track: el mismo event_id no se duplica y los eventos son de solo inserción', async () => {
  const vid = randomUUID(); vids.push(vid); const id = randomUUID();
  const body = { visitor: { id: vid, session: randomUUID(), touch: touch() }, events: [{ id, name: 'page_view' }] };
  await post('/api/track', body); await post('/api/track', body);
  assert.equal((await db.service.one('select count(*)::int n from growth.events where event_id = $1', [id])).n, 1);
  await assert.rejects(db.service.exec(`update growth.events set name = 'x' where event_id = $1`, [id]), /solo inserci/);
  await assert.rejects(db.service.exec('delete from growth.events where event_id = $1', [id]));
});

test('outbox: sin consentimiento de marketing nada viaja a Meta/TikTok; con consentimiento sale sin datos de salud', async () => {
  await growth.settings.set('pixels.meta', { pixelId: '999', accessToken: 'tok' });
  await growth.settings.set('pixels.tiktok', { pixelId: 'TT1', accessToken: 'tok2' });
  const vid = randomUUID(); vids.push(vid);
  const mk = (marketing, page) => post('/api/track', { visitor: { id: vid, session: randomUUID(), touch: touch() }, language: 'es', page, consent: { marketing },
    events: [{ id: randomUUID(), name: 'quiz_started', props: { program: 'alcohol' } }] }).then((r) => r.json());
  const a = randomUUID(), b = randomUUID();
  await post('/api/track', { visitor: { id: vid, session: randomUUID(), touch: touch() }, consent: { marketing: false }, events: [{ id: a, name: 'quiz_started', props: { program: 'alcohol' } }] });
  await post('/api/track', { visitor: { id: vid, session: randomUUID(), touch: touch() }, page: '/quiz/alcohol?utm_source=x', consent: { marketing: true }, events: [{ id: b, name: 'quiz_started', props: { program: 'alcohol' } }] });
  assert.equal((await db.service.one(`select count(*)::int n from growth.outbox where event_id = $1`, [a])).n, 0);
  const rows = await db.service.rows(`select destination, payload from growth.outbox where event_id = $1 order by destination`, [b]);
  assert.deepEqual(rows.map((r) => r.destination), ['meta', 'tiktok']);
  const text = JSON.stringify(rows);
  assert.ok(!/alcohol|sueno|sem-fumo|azucar|ansiedad/i.test(text), 'el hábito no puede salir hacia anuncios');
  assert.equal(rows[0].payload.url, 'http://localhost/quiz');
});

test('lead: exige consentimiento de salud, guarda e-mail en esquema restringido y es idempotente', async () => {
  const email = `lead-${randomUUID().slice(0, 8)}@example.com`; emails.push(email);
  const vid = randomUUID(); vids.push(vid);
  const att = encodeURIComponent(JSON.stringify(touch()));
  const headers = { cookie: `al_vid=${vid}; al_att=${att}` };
  const noConsent = await post('/api/lead', { email, program: 'sem-fumo', consents: { health_data: false } }, headers);
  assert.equal(noConsent.status, 422);
  assert.equal((await noConsent.json()).code, 'CONSENT_REQUIRED');
  assert.equal((await post('/api/lead', { email: 'no-es-email', consents: { health_data: true } }, headers)).status, 422);
  const ok = await post('/api/lead', { email, program: 'sem-fumo', language: 'es', consents: { health_data: true, marketing_email: false } }, headers);
  assert.equal(ok.status, 200);
  const { leadId, eventId } = await ok.json();
  assert.ok(leadId && eventId);
  const pii = await db.service.one('select email, email_hash from growth_pii.lead_pii where lead_id = $1', [leadId]);
  assert.equal(pii.email, email); assert.equal(pii.email_hash, hashEmail(email));
  const lead = await db.service.one('select attribution, topic from growth.leads where lead_id = $1', [leadId]);
  assert.equal(lead.attribution.last.utm_content, 'ad_111'); assert.equal(lead.topic, 'sem-fumo');
  const c = await db.service.rows('select kind, granted from growth.consents where lead_id = $1 order by kind', [leadId]);
  assert.deepEqual(c.map((x) => `${x.kind}:${x.granted}`), ['cookies_marketing:false', 'health_data:true', 'marketing_email:false']);
  const again = await (await post('/api/lead', { email: email.toUpperCase(), program: 'sem-fumo', consents: { health_data: true } }, headers)).json();
  assert.equal(again.leadId, leadId);
  assert.equal((await db.service.one(`select count(*)::int n from growth.events where lead_id = $1 and name = 'lead_created'`, [leadId])).n, 1);
});

test('stripe hooks: compra → pedido con atribución, evento con id determinista, idempotencia y reembolso', async () => {
  const vid = randomUUID(); vids.push(vid);
  const userId = randomUUID(); users.push(userId);
  const sid = `cs_test_${randomUUID().slice(0, 8)}`;
  const email = `buy-${randomUUID().slice(0, 8)}@example.com`; emails.push(email);
  await growth.tracker.touchVisitor({ visitorId: vid, touch: touch() });
  const { leadId } = await growth.tracker.createLead({ email, visitorId: vid, language: 'es', topic: 'sem-fumo', touch: touch(), consents: { health_data: true, cookies_marketing: true } });
  await db.service.exec(`insert into growth.checkouts (stripe_session_id, user_id, lead_id, visitor_id, program_slug, plan, first_touch, last_touch) values ($1,$2,$3,$4,'sem-fumo','mensual',$5::jsonb,$6::jsonb)`,
    [sid, null, leadId, vid, JSON.stringify(touch().first), JSON.stringify(touch().last)]);
  const event = { id: `evt_${randomUUID()}`, type: 'checkout.session.completed', data: { object: {
    id: sid, mode: 'subscription', payment_status: 'paid', amount_total: 1999, currency: 'usd', invoice: `in_${sid}`, total_details: { amount_tax: 0 }, metadata: { plan: 'mensual', program: 'sem-fumo', vid, lid: leadId } } } };
  await growth.hooks.onStripeEvent(event);
  await growth.hooks.onStripeEvent(event); // reentrega
  const o = await db.service.rows('select * from growth.orders where order_id = $1', [`in_${sid}`]);
  assert.equal(o.length, 1); assert.equal(o[0].amount_cents, 1999); assert.equal(o[0].last_touch.utm_content, 'ad_111'); assert.equal(o[0].currency, 'USD');
  const ev = await db.service.rows(`select event_id, value_cents, utm_content from growth.events where name = 'purchase' and lead_id = $1`, [leadId]);
  assert.equal(ev.length, 1); assert.equal(ev[0].event_id, eventIdFor('purchase', sid)); assert.equal(Number(ev[0].value_cents), 1999);
  // vista de atribución y reembolso
  await growth.hooks.onStripeEvent({ id: 'evt_r', type: 'charge.refunded', data: { object: { id: 'ch_1', invoice: `in_${sid}`, amount_refunded: 500, currency: 'usd', refunds: { data: [{ id: `re_${sid}`, amount: 500, reason: 'requested_by_customer' }] } } } });
  const a = await db.service.one('select amount_cents, refunded_cents, net_cents, last_ad from growth.v_atribuicao where order_id = $1', [`in_${sid}`]);
  assert.deepEqual([a.amount_cents, a.refunded_cents, a.net_cents, a.last_ad], [1999, 500, 1499, 'ad_111']);
  // las vistas de IA no exponen datos personales
  const cols = (await db.service.rows(`select column_name from information_schema.columns where table_schema = 'growth' and table_name like 'v\\_%'`)).map((c) => c.column_name);
  assert.ok(!cols.some((c) => /email|phone|^(first|last|full)_name$|^ip$|user_agent/.test(c)), cols.join(','));
  // limpieza
  await db.service.exec('delete from growth.refunds where refund_id = $1', [`re_${sid}`]);
  await db.service.exec('delete from growth.orders where order_id = $1', [`in_${sid}`]);
  await db.service.exec('delete from growth.checkouts where stripe_session_id = $1', [sid]);
});

test('supresión: erase_person borra e-mail, eventos y consentimientos', async () => {
  const email = `del-${randomUUID().slice(0, 8)}@example.com`; emails.push(email);
  const vid = randomUUID(); vids.push(vid);
  await growth.tracker.touchVisitor({ visitorId: vid, touch: touch() });
  const { leadId } = await growth.tracker.createLead({ email, visitorId: vid, topic: 'sem-fumo', touch: touch(), consents: { health_data: true } });
  await growth.tracker.record({ name: 'lead_created', visitorId: vid, leadId, touch: touch() });
  await db.service.exec('select growth.erase_person($1, null, $2)', [leadId, vid]);
  for (const [t, col, val] of [['growth_pii.lead_pii', 'lead_id', leadId], ['growth.events', 'lead_id', leadId], ['growth.consents', 'lead_id', leadId], ['growth.visitors', 'visitor_id', vid]]) {
    assert.equal((await db.service.one(`select count(*)::int n from ${t} where ${col} = $1`, [val])).n, 0, t);
  }
});

test('sanitizeUrl no revela el hábito', () => {
  assert.equal(sanitizeUrl('https://citavel.ai/quiz/alcohol?utm_source=x', 'https://citavel.ai'), 'https://citavel.ai/quiz');
  assert.equal(sanitizeUrl('/resultados?program=sueno', 'https://citavel.ai'), 'https://citavel.ai/resultados');
  assert.equal(sanitizeUrl('/', 'https://citavel.ai'), 'https://citavel.ai/');
});
