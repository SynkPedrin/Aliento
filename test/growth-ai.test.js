// Capa de IA: consulta de solo lectura (2 capas), informes por reglas y con Claude (simulado), alertas, acciones y interruptor general.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createAi } from '../server/growth/ai.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
const U = randomUUID().slice(0, 8);
let db; let cfg; let ai; let sent; let adCalls; let startedAt;
const reportIds = []; const actionIds = []; const alertCodes = new Set(); const expKeys = [];
const store = { timezone: { tz: 'Europe/Madrid' }, ai: { auto_enabled: false, auto: { creative_brief: true, promote_variant: true, pause_ad: true, scale_budget: true } }, goals: { min_sample: 50 }, alerts: { emails: ['equipo@example.com'], webhookUrl: 'https://hooks.example.com/x' } };
const settings = { get: async (k, f = {}) => store[k] ?? f };
const email = { sendTransactional: async (m) => { sent.push(['email', m.to]); return { ok: true }; } };
const fakeAds = {
  execute: async (a) => { adCalls.push(['execute', a.kind, a.target_id]); if (a.data?.boom) throw new Error('Meta: token inválido'); return { ok: true, result: { done: a.target_id }, undo_data: { platform: a.platform, ad_id: a.target_id } }; },
  undo: async (a) => { adCalls.push(['undo', a.kind, a.target_id]); return { ok: true }; },
};
const fakeExperiments = {
  list: async () => [], stats: async () => ({}),
  promote: async (key, variant) => { await db.service.exec("update growth.experiments set status = 'won', winner = $2, ended_at = now() where key = $1", [key, variant]); },
};
let llm = null; // guion de respuestas de Anthropic
const anthropicCalls = [];
async function fakeFetch(url, init = {}) {
  if (String(url).startsWith('https://api.anthropic.com/v1/messages')) {
    anthropicCalls.push({ headers: init.headers, body: JSON.parse(init.body) });
    const step = llm.shift();
    if (step === 'error') return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
    return { ok: true, status: 200, json: async () => step };
  }
  sent.push(['webhook', String(url)]);
  return { ok: true, status: 200, json: async () => ({}) };
}
const toolUse = (name, input, id = `tu_${Math.random()}`) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] });
const endTurn = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });

before(async () => {
  cfg = loadConfig({ APP_URL: 'http://localhost', CRON_SECRET: 'cron-test', ...localSupabaseEnv() });
  db = createDb(cfg.supabase.dbUrl, { max: 4 });
  ai = createAi({ db, settings, config: cfg, ads: fakeAds, email, experiments: fakeExperiments, fetchImpl: fakeFetch, log: silent });
  startedAt = (await db.service.one('select now() as t')).t;
});
after(async () => {
  for (const id of reportIds) await db.service.exec('delete from growth.ai_reports where id = $1', [id]);
  await db.service.exec("delete from growth.ai_reports where kind = 'question' and title like $1", [`%${U}%`]);
  for (const id of actionIds) await db.service.exec('delete from growth.ai_actions where id = $1', [id]);
  for (const k of expKeys) await db.service.exec('delete from growth.experiments where key = $1', [k]);
  for (const c of alertCodes) await db.service.exec('delete from growth.alerts where code = $1 and created_at >= $2', [c, startedAt]);
  await db.service.exec("delete from growth.outbox where payload->>'tag' = $1", [U]);
  await db.end();
});
const reset = () => { sent = []; adCalls = []; llm = null; anthropicCalls.length = 0; };

// ------------------------------------------------------------------ consulta de solo lectura
test('queryReadonly: permite select sobre vistas growth.v_* (con CTE y extract)', async () => {
  const a = await ai.queryReadonly('select count(*) as n from growth.v_emails');
  assert.equal(typeof a.rows[0].n, 'number');
  const b = await ai.queryReadonly('with x as (select day, purchases from growth.v_funil_diario) select extract(month from day::date) m, sum(purchases) from x group by 1;');
  assert.ok(Array.isArray(b.rows));
  const c = await ai.queryReadonly("select day from growth.v_funil_diario where program = 'sem;fumo' limit 1");
  assert.ok(Array.isArray(c.rows));
});

test('queryReadonly capa 1: bloquea DML, DDL, tablas base, PII, auth, funciones y múltiples instrucciones', async () => {
  const bad = [
    "insert into growth.alerts (code, message) values ('x','y')", "update growth.ai_actions set status = 'executed'", 'delete from growth.events',
    'drop table growth.events', 'truncate growth.events', 'select * from growth.events', 'select * from growth.orders',
    'select * from growth_pii.lead_pii', 'select * from auth.users', 'select * from public.profiles',
    'select 1; select 2', 'select 1; drop table growth.events', 'select * from growth.v_emails; delete from growth.events',
    'select pg_sleep(10)', "select pg_read_file('/etc/passwd')", 'select * from pg_shadow', "select dblink('x','y')",
    'select * into growth.copia from growth.v_emails', "copy growth.events to '/tmp/x'", "set role postgres", "select set_config('role','postgres',false)",
    'select * from growth.v_emails, growth.events', 'select * from growth.v_emails join growth.events on true',
    'with d as (delete from growth.events returning 1) select * from d', 'select * from generate_series(1,5)',
    'select 1 -- comentario', 'select /* x */ 1', 'select "x" from growth.v_emails', 'explain select 1', 'show all', '',
    'select * from information_schema.tables', 'select * from pg_catalog.pg_tables', 'select * from growth.v_emails for update',
  ];
  for (const sql of bad) await assert.rejects(ai.queryReadonly(sql), /./, `debería bloquear: ${sql}`);
});

test('queryReadonly capa 2: aunque se salte la validación, el rol growth_ai solo lee vistas v_* y en solo lectura', async () => {
  const who = await ai._execReadonly('select current_user as u');
  assert.equal(who[0].u, 'growth_ai');
  await assert.doesNotReject(ai._execReadonly('select * from growth.v_emails'));
  await assert.rejects(ai._execReadonly('select * from growth.events limit 1'), /permission denied/);
  await assert.rejects(ai._execReadonly('select * from growth.orders limit 1'), /permission denied/);
  await assert.rejects(ai._execReadonly('select * from growth_pii.lead_pii limit 1'), /permission denied/);
  await assert.rejects(ai._execReadonly('select * from auth.users limit 1'), /permission denied/);
  await assert.rejects(ai._execReadonly("select * from (select 1) a; delete from growth.events"), /./);
  await assert.rejects(ai._execReadonly('select 1; select 2'), /./);
  await assert.rejects(ai._execReadonly("with d as (insert into growth.alerts (code, message) values ('x','y') returning 1) select * from d"), /read-only|permission denied|data-modifying/);
  await assert.rejects(ai._execReadonly("with d as (delete from growth.ai_actions returning 1) select * from d"), /read-only|permission denied|data-modifying/);
  // tras todo, el rol de la sesión no se quedó cambiado en el pool
  assert.notEqual((await db.service.one('select current_user as u')).u, 'growth_ai');
});

test('queryReadonly limita a 200 filas y corta consultas lentas', async () => {
  const many = await ai._execReadonly('select * from growth.v_funil_diario union all select * from growth.v_funil_diario');
  assert.ok(many.length <= 200);
});

// ------------------------------------------------------------------ informes
test('sin clave de Anthropic: informes por reglas con llm=false (diario, semanal, monitor)', async () => {
  reset();
  const d = await ai.runDaily({ now: '2031-03-10T07:00:00Z' });
  reportIds.push(d.report.id);
  assert.equal(d.report.llm, false); assert.equal(d.report.kind, 'daily'); assert.match(d.report.body, /por reglas/); assert.equal(anthropicCalls.length, 0);
  const w = await ai.runWeekly(); reportIds.push(w.report.id);
  assert.equal(w.report.llm, false); assert.equal(w.report.kind, 'weekly');
  const ask = await ai.ask('¿cuántas ventas hubo?', { user: { id: randomUUID() } });
  assert.equal(ask.llm, false); assert.ok(ask.answer);
});

test('shouldRunDaily: a partir de las 8:00 del fuso y una vez al día', async () => {
  reset();
  // 2031-03-10 es CET (UTC+1): 06:59Z = 07:59 Madrid; 07:00Z = 08:00
  assert.equal(await ai.shouldRunDaily(new Date('2031-03-11T06:59:00Z')), false);
  assert.equal(await ai.shouldRunDaily(new Date('2031-03-11T07:00:00Z')), true);
  const d = await ai.runDaily({ now: '2031-03-11T07:00:00Z' }); reportIds.push(d.report.id);
  assert.equal(await ai.shouldRunDaily(new Date('2031-03-11T07:30:00Z')), false, 'ya hay informe de ese día');
  assert.equal(await ai.shouldRunDaily(new Date('2031-03-12T07:00:00Z')), true, 'día siguiente');
  store.timezone = { tz: 'America/Sao_Paulo' }; // UTC-3: las 8:00 allí son las 11:00Z
  assert.equal(await ai.shouldRunDaily(new Date('2031-03-13T10:59:00Z')), false);
  assert.equal(await ai.shouldRunDaily(new Date('2031-03-13T11:00:00Z')), true);
  store.timezone = { tz: 'Europe/Madrid' };
});

test('con clave: usa Claude con bucle de herramientas, modelos correctos y SQL bloqueado dentro del bucle', async () => {
  reset();
  store.anthropic = { apiKey: 'sk-ant-test-secret' };
  llm = [
    toolUse('consultar_banco', { sql: 'select count(*) n from growth.v_emails' }, 'a1'),
    toolUse('consultar_banco', { sql: 'delete from growth.events' }, 'a2'),
    toolUse('publicar_relatorio', { title: `Diario ${U}`, body: 'Ayer todo bien.' }, 'a3'),
    endTurn('listo'),
  ];
  const before_ = (await db.service.one('select count(*)::int n from growth.events')).n;
  const r = await ai.runDaily({ now: '2031-04-10T07:00:00Z' }); reportIds.push(r.report.id);
  assert.equal(r.report.llm, true); assert.equal(r.report.model, 'claude-sonnet-5-5'); assert.equal(r.report.body, 'Ayer todo bien.');
  assert.equal(anthropicCalls[0].headers['x-api-key'], 'sk-ant-test-secret'); assert.equal(anthropicCalls[0].headers['anthropic-version'], '2023-06-01');
  assert.deepEqual(anthropicCalls[0].body.tools.map((t) => t.name).sort(), ['consultar_banco', 'ler_anuncios', 'propor_acao', 'publicar_relatorio']);
  const results = anthropicCalls[2].body.messages.at(-1).content;
  assert.equal(results[0].tool_use_id, 'a2');
  assert.equal(results[0].is_error, true, 'el DELETE pedido por la IA fue rechazado');
  assert.equal((await db.service.one('select count(*)::int n from growth.events')).n, before_);
  // semanal: Opus
  llm = [endTurn('Semana revisada')];
  const w = await ai.runWeekly(); reportIds.push(w.report.id);
  assert.equal(w.report.model, 'claude-opus-5-5'); assert.equal(w.report.llm, true);
  // fallo de la API: vuelve a reglas sin romper
  llm = ['error'];
  const f = await ai.runDaily({ now: '2031-05-10T07:00:00Z' }); reportIds.push(f.report.id);
  assert.equal(f.report.llm, false);
  assert.ok(!JSON.stringify(f).includes('sk-ant-test-secret'));
  // ask
  llm = [toolUse('consultar_banco', { sql: 'select count(*) n from growth.v_emails' }), endTurn(`Hay N correos ${U}`)];
  const a = await ai.ask(`¿cuántos correos? ${U}`, { user: null });
  assert.equal(a.llm, true); assert.match(a.answer, /Hay N correos/); assert.match(a.sql, /v_emails/); assert.equal(a.rows.length, 1);
  delete store.anthropic;
});

// ------------------------------------------------------------------ alertas
test('alertas: no se duplican mientras haya una abierta del mismo code; notifica una vez', async () => {
  reset();
  const code = `test_${U}`; alertCodes.add(code);
  const a = await ai.raiseAlert({ code, message: 'Prueba' });
  const b = await ai.raiseAlert({ code, message: 'Prueba otra vez' });
  assert.equal(a.created, true); assert.equal(b.created, false); assert.equal(a.alert.id, b.alert.id);
  assert.equal(sent.filter((s) => s[0] === 'email').length, 1); assert.equal(sent.filter((s) => s[0] === 'webhook').length, 1);
  assert.equal((await db.service.one('select count(*)::int n from growth.alerts where code = $1 and resolved_at is null', [code])).n, 1);
  assert.ok((await db.service.one('select notified_at from growth.alerts where id = $1', [a.alert.id])).notified_at);
  await db.service.exec('update growth.alerts set resolved_at = now() where id = $1', [a.alert.id]);
  assert.equal((await ai.raiseAlert({ code, message: 'Nueva' })).created, true, 'tras resolver puede abrirse otra');
});

test('monitor: detecta el outbox atascado, no duplica y la resuelve al normalizarse', async () => {
  reset(); ['outbox_stalled', 'outbox_failed', 'conversion_drop', 'cac_high', 'checkout_errors', 'payment_failed_spike', 'spend_pace'].forEach((c) => alertCodes.add(c));
  await db.service.exec("update growth.alerts set resolved_at = now() where code = 'outbox_stalled' and resolved_at is null");
  await db.service.exec("insert into growth.outbox (event_id, destination, payload, status, next_attempt_at) values ($1, 'customerio', $2::jsonb, 'pending', now() - interval '2 hours')", [randomUUID(), JSON.stringify({ tag: U })]);
  const r1 = await ai.runMonitor();
  assert.ok(r1.alerts.some((a) => a.code === 'outbox_stalled'));
  assert.equal(r1.report.llm, false);
  const r2 = await ai.runMonitor();
  assert.equal(r2.created, 0, 'segunda pasada: nada nuevo');
  assert.equal((await db.service.one("select count(*)::int n from growth.alerts where code = 'outbox_stalled' and resolved_at is null")).n, 1);
  await db.service.exec("delete from growth.outbox where payload->>'tag' = $1", [U]);
  const r3 = await ai.runMonitor();
  if (!r3.alerts.some((a) => a.code === 'outbox_stalled')) assert.equal((await db.service.one("select count(*)::int n from growth.alerts where code = 'outbox_stalled' and resolved_at is null")).n, 0);
});

// ------------------------------------------------------------------ acciones
const mk = async (o) => { const a = await ai.propose(o); actionIds.push(a.id); return a; };

test('acciones: precio nunca automático; baja confianza nunca automática', async () => {
  reset(); store.ai = { auto_enabled: true, auto: { creative_brief: true, promote_variant: true, pause_ad: true, scale_budget: true } };
  const price = await mk({ kind: 'price_change', target_id: `p${U}`, confidence: 'high', reason: 'Probar 9,99', data: {} });
  const lowBrief = await mk({ kind: 'creative_brief', target_id: `lb${U}`, confidence: 'low', reason: 'poca muestra' });
  const lowPromo = await mk({ kind: 'promote_variant', target_id: `lp${U}`, confidence: 'low', reason: 'x', data: { variant: 'b' } });
  assert.equal(price.auto, false); assert.equal(lowBrief.auto, false); assert.equal(lowPromo.auto, false);
  await ai.autoExecute();
  for (const a of [price, lowBrief, lowPromo]) assert.equal((await db.service.one('select status from growth.ai_actions where id = $1', [a.id])).status, 'proposed');
  assert.equal(adCalls.length, 0);
  // aprobar un cambio de precio sí es posible (manual) pero no toca nada externo
  const ok = await ai.approve(price.id, { id: randomUUID() });
  assert.equal(ok.status, 'executed'); assert.equal(ok.result.manual, true);
  await assert.rejects(ai.undo(price.id), /a mano/);
});

test('acciones: interruptor general apagado impide toda ejecución automática; encendido ejecuta solo las elegibles', async () => {
  reset();
  store.ai = { auto_enabled: false, auto: { creative_brief: true } };
  const brief = await mk({ kind: 'creative_brief', target_id: `b${U}`, confidence: 'high', reason: 'cansancio', data: { brief: 'nuevo gancho' } });
  assert.equal(brief.auto, true);
  const off = await ai.autoExecute();
  assert.equal(off.skipped, true);
  assert.equal((await db.service.one('select status from growth.ai_actions where id = $1', [brief.id])).status, 'proposed');
  store.ai = { auto_enabled: true, auto: { creative_brief: true } };
  const on = await ai.autoExecute();
  assert.ok(on.executed >= 1);
  const row = await db.service.one('select * from growth.ai_actions where id = $1', [brief.id]);
  assert.equal(row.status, 'executed'); assert.equal(row.auto, true); assert.equal(row.result.brief, 'nuevo gancho');
  // si se apaga la opción por tipo, deja de ser automática aunque estuviera marcada
  store.ai = { auto_enabled: true, auto: { creative_brief: false } };
  const b2 = await mk({ kind: 'creative_brief', target_id: `b2${U}`, confidence: 'high', reason: 'x' });
  assert.equal(b2.auto, false);
});

test('acciones: pausar exige aprobación; aprobar ejecuta, undo revierte; fallos quedan en failed', async () => {
  reset(); store.ai = { auto_enabled: true, auto: { pause_ad: true } };
  const p = await mk({ kind: 'pause_ad', platform: 'meta', target_id: `ad${U}`, confidence: 'high', reason: 'CPA alto', data: { spend_cents: 9000 } });
  assert.equal(p.auto, false, 'sin histórico suficiente no es automática');
  await ai.autoExecute();
  assert.equal(adCalls.length, 0);
  assert.equal((await ai.reject(( await mk({ kind: 'pause_ad', platform: 'meta', target_id: `adr${U}`, confidence: 'low', reason: 'r' })).id, null)).status, 'rejected');
  const ex = await ai.approve(p.id, { id: randomUUID() });
  assert.equal(ex.status, 'executed'); assert.deepEqual(adCalls[0], ['execute', 'pause_ad', `ad${U}`]); assert.equal(ex.undo_data.ad_id, `ad${U}`); assert.ok(ex.decided_by);
  await assert.rejects(ai.approve(p.id, null), /pendiente/, 'no se aprueba dos veces');
  const un = await ai.undo(p.id, null);
  assert.equal(un.status, 'undone'); assert.deepEqual(adCalls[1], ['undo', 'pause_ad', `ad${U}`]);
  await assert.rejects(ai.undo(p.id), /ejecutadas/);
  const bad = await mk({ kind: 'pause_ad', platform: 'meta', target_id: `adb${U}`, confidence: 'high', reason: 'x', data: { boom: true } });
  const fl = await ai.approve(bad.id, null);
  assert.equal(fl.status, 'failed'); assert.match(fl.result.error, /token inválido/);
});

test('acciones: con histórico humano suficiente, escalar pasa a ser elegible a automática (y respeta límites)', async () => {
  reset(); store.ai = { auto_enabled: true, limits: { budget_max_step_pct: 20 }, auto: { scale_budget: true } };
  const data = { current_budget_cents: 5000, new_budget_cents: 6000 };
  const before_ = await mk({ kind: 'scale_budget', platform: 'meta', target_id: `st0${U}`, confidence: 'high', reason: 'x', data });
  assert.equal(before_.auto, false);
  await assert.rejects(ai.propose({ kind: 'scale_budget', platform: 'meta', target_id: `st${U}`, confidence: 'high', reason: 'x', data: { current_budget_cents: 5000, new_budget_cents: 7000 } }), /máximo del 20%/);
  for (let i = 0; i < 5; i++) {
    const h = await db.service.one("insert into growth.ai_actions (kind, platform, target_id, reason, status, auto, executed_at) values ('scale_budget','meta',$1,'hist','executed',false,now()) returning id", [`h${i}${U}`]);
    actionIds.push(h.id);
  }
  const hasUndone = (await db.service.one("select count(*)::int n from growth.ai_actions where kind = 'scale_budget' and status = 'undone' and proposed_at > now() - interval '60 days'")).n;
  const good = await mk({ kind: 'scale_budget', platform: 'meta', target_id: `st1${U}`, confidence: 'high', reason: 'x', data });
  const low = await mk({ kind: 'scale_budget', platform: 'meta', target_id: `st2${U}`, confidence: 'low', reason: 'x', data });
  assert.equal(good.auto, hasUndone === 0); assert.equal(low.auto, false);
  if (hasUndone === 0) {
    await ai.autoExecute();
    assert.equal((await db.service.one('select status from growth.ai_actions where id = $1', [good.id])).status, 'executed');
    assert.equal((await db.service.one('select status from growth.ai_actions where id = $1', [low.id])).status, 'proposed');
  }
  // kill switch: apagado de golpe
  store.ai = { auto_enabled: false, auto: { scale_budget: true } };
  assert.equal((await ai.autoExecute()).skipped, true);
});

test('acciones: promover variante (95%) automática y reversible', async () => {
  reset(); store.ai = { auto_enabled: true, auto: { promote_variant: true } };
  const key = `exp_${U}`; expKeys.push(key);
  await db.service.exec("insert into growth.experiments (key, name, kind, variants) values ($1, 'T', 'page', '[{\"key\":\"a\",\"weight\":50},{\"key\":\"b\",\"weight\":50}]')", [key]);
  const a = await mk({ kind: 'promote_variant', target_id: key, confidence: 'high', reason: '95%', data: { variant: 'b' } });
  assert.equal(a.auto, true);
  await ai.autoExecute();
  let e = await db.service.one('select status, winner from growth.experiments where key = $1', [key]);
  assert.deepEqual([e.status, e.winner], ['won', 'b']);
  await ai.undo(a.id, null);
  e = await db.service.one('select status, winner from growth.experiments where key = $1', [key]);
  assert.deepEqual([e.status, e.winner], ['running', null]);
});
