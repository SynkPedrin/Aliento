// Personas: búsqueda, línea de tiempo, exportación y supresión (RGPD) contra el Supabase local.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createPeople } from '../server/growth/people.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
let db, people;
const tag = randomUUID().slice(0, 8);
const created = { orders: [], refunds: [], leads: [], visitors: [], audit: [] };

async function seedPerson(label) {
  const lead = randomUUID(); const visitor = randomUUID();
  const email = `gp-${label}-${tag}@example.com`;
  const orderId = `gp_ord_${label}_${tag}`; const refundId = `gp_ref_${label}_${tag}`;
  await db.service.exec('insert into growth.visitors (visitor_id) values ($1)', [visitor]);
  await db.service.exec('insert into growth.leads (lead_id, visitor_id, topic, language) values ($1, $2, $3, $4)', [lead, visitor, 'sem-fumo', 'es']);
  await db.service.exec('insert into growth_pii.lead_pii (lead_id, email, email_hash) values ($1, $2, $3)', [lead, email, `hash-${label}-${tag}`]);
  await db.service.exec(`insert into growth.events (event_id, name, visitor_id, lead_id) values ($1, 'lead_created', $2, $3), ($4, 'page_view', $2, null)`,
    [randomUUID(), visitor, lead, randomUUID()]);
  await db.service.exec(`insert into growth.quiz_answers (lead_id, visitor_id, question, answer) values ($1, $2, 'q1', 'a1')`, [lead, visitor]);
  await db.service.exec(`insert into growth.consents (lead_id, visitor_id, kind, granted) values ($1, $2, 'marketing_email', true)`, [lead, visitor]);
  await db.service.exec(`insert into growth.email_events (flow, event, lead_id) values ('welcome', 'sent', $1)`, [lead]);
  await db.service.exec(`insert into growth.orders (order_id, lead_id, visitor_id, amount_cents, currency) values ($1, $2, $3, 1999, 'eur')`, [orderId, lead, visitor]);
  await db.service.exec(`insert into growth.refunds (refund_id, order_id, amount_cents, currency) values ($1, $2, 500, 'eur')`, [refundId, orderId]);
  created.orders.push(orderId); created.refunds.push(refundId); created.leads.push(lead); created.visitors.push(visitor);
  return { lead, visitor, email, orderId, refundId };
}

before(async () => {
  const config = loadConfig({ APP_URL: 'http://localhost', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 3 });
});

after(async () => {
  await db.service.exec('delete from growth.refunds where refund_id = any($1::text[])', [created.refunds]);
  await db.service.exec('delete from growth.orders where order_id = any($1::text[])', [created.orders]);
  for (const v of created.visitors) await db.service.exec('select growth.erase_person(null, null, $1::uuid)', [v]);
  await db.service.exec('delete from growth.leads where lead_id = any($1::uuid[])', [created.leads]);
  await db.service.exec('delete from growth.audit_log where entity_id = any($1::text[])', [created.leads]);
  await db.end();
});

test('search por e-mail parcial, timeline y export', async () => {
  const p = await seedPerson('a');
  people = createPeople({ db, tracker: null, auth: null, log: silent });
  assert.deepEqual(await people.search('x'), []);
  const rows = await people.search(`GP-a-${tag}`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, p.lead);
  assert.equal(rows[0].email, p.email);
  assert.equal(rows[0].status, 'customer');
  assert.equal(rows[0].topic, 'sem-fumo');
  const t = await people.timeline(p.lead);
  assert.equal(t.person.email, p.email);
  assert.equal(t.events.length, 2, 'eventos del lead y del visitante');
  assert.equal(t.answers.length, 1);
  assert.equal(t.consents.length, 1);
  assert.equal(t.emails.length, 1);
  assert.equal(t.orders.length, 1);
  assert.equal(t.refunds.length, 1);
  const ex = await people.export(p.lead);
  assert.ok(ex.exported_at && ex.leads.length === 1 && ex.visitors.length === 1);
  assert.equal(await people.timeline(randomUUID()), null);
  assert.equal(await people.timeline('no-uuid'), null);
});

test('erase: desaparecen e-mail, eventos, respuestas y consentimientos; pedidos y reembolsos quedan anonimizados', async () => {
  const p = await seedPerson('b');
  const other = await seedPerson('c'); // no debe verse afectada
  const calls = [];
  const settings = { get: async () => ({ siteId: 's', apiKey: 'k', region: 'eu' }) };
  const fetchImpl = async (url, init) => { calls.push({ url, method: init.method }); return { ok: true, status: 200 }; };
  const pe = createPeople({ db, tracker: null, auth: null, log: silent, settings, fetchImpl });
  const actor = randomUUID();
  assert.deepEqual(await pe.erase(p.lead, actor), { ok: true });

  const cnt = async (sql, params) => Number((await db.service.one(sql, params)).n);
  assert.equal(await cnt('select count(*) n from growth_pii.lead_pii where lead_id = $1', [p.lead]), 0);
  assert.equal(await cnt('select count(*) n from growth.leads where lead_id = $1', [p.lead]), 0);
  assert.equal(await cnt('select count(*) n from growth_pii.lead_pii where email = $1', [p.email]), 0);
  assert.equal(await cnt('select count(*) n from growth.events where lead_id = $1 or visitor_id = $2', [p.lead, p.visitor]), 0);
  assert.equal(await cnt('select count(*) n from growth.quiz_answers where lead_id = $1 or visitor_id = $2', [p.lead, p.visitor]), 0);
  assert.equal(await cnt('select count(*) n from growth.consents where lead_id = $1 or visitor_id = $2', [p.lead, p.visitor]), 0);
  assert.equal(await cnt('select count(*) n from growth.email_events where lead_id = $1', [p.lead]), 0);
  assert.equal(await cnt('select count(*) n from growth.visitors where visitor_id = $1', [p.visitor]), 0);
  const order = await db.service.one('select * from growth.orders where order_id = $1', [p.orderId]);
  assert.ok(order && order.lead_id === null && order.user_id === null && order.visitor_id === null, 'pedido anonimizado');
  assert.equal(Number(order.amount_cents), 1999);
  const refund = await db.service.one('select * from growth.refunds where refund_id = $1', [p.refundId]);
  assert.ok(refund && refund.user_id === null && Number(refund.amount_cents) === 500, 'reembolso conservado');
  assert.ok(await db.service.one(`select 1 from growth.audit_log where action = 'person.erase' and entity_id = $1 and actor = $2`, [p.lead, actor]));
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url === `https://track-eu.customer.io/api/v1/customers/${p.lead}`), 'Customer.io');
  assert.equal(await pe.timeline(p.lead), null);
  await assert.rejects(pe.erase(p.lead, actor), (e) => e.status === 404);

  // la otra persona sigue intacta
  assert.equal((await pe.timeline(other.lead)).events.length, 2);
  assert.equal((await pe.search(other.email)).length, 1);
});

test('erase: un fallo de Customer.io no bloquea la supresión local', async () => {
  const p = await seedPerson('d');
  const pe = createPeople({ db, tracker: null, auth: null, log: silent,
    settings: { get: async () => ({ siteId: 's', apiKey: 'k' }) }, fetchImpl: async () => { throw new Error('red'); } });
  await pe.erase(p.lead, null);
  assert.equal(await pe.timeline(p.lead), null);
});
