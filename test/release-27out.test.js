// Entrega 27-Out: analytics por UTM + zerar métricas, leads, melhorias futuras, suporte e e-mail de compra.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createGrowth } from '../server/growth/index.js';
import { purchaseEmail, recoveryEmail } from '../server/services/mailer.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
const sent = [];
const mailer = { enabled: true, send: async (m) => { sent.push(m); return {}; }, sendSupport: async (m) => { sent.push({ support: m }); return {}; } };
let db, auth, growth, server, base, prevReset, prevRoadmap;
const created = [];

before(async () => {
  const config = loadConfig({ APP_URL: 'http://localhost', CRON_SECRET: 'cron-test', GROWTH_ENCRYPTION_KEY: 'test-key', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 5 });
  auth = createAuth({ config, db });
  growth = createGrowth({ db, config, auth, log: silent });
  // Valores locais do painel: restaurados no fim (o teste zera métricas e grava melhorias).
  prevReset = await db.service.one(`select value from growth.settings where key = 'funnels.reset'`);
  prevRoadmap = await db.service.one(`select value from growth.settings where key = 'roadmap'`);
  const billing = { enabled: false, activeSubscription: async () => null, subscriptionsByProgram: async () => [] };
  server = createApp({ db, auth, billing, config, programs: { get: async () => null }, growth, mailer, log: silent }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await db.service.exec('delete from public.rate_limits');
});
after(async () => {
  for (const [key, prev] of [['funnels.reset', prevReset], ['roadmap', prevRoadmap]]) {
    if (prev) await db.service.exec('update growth.settings set value = $2::jsonb where key = $1', [key, JSON.stringify(prev.value)]);
    else await db.service.exec('delete from growth.settings where key = $1', [key]);
  }
  for (const id of created) { await db.service.exec('delete from growth.staff where user_id = $1', [id]); await auth.deleteUser(id).catch(() => {}); }
  server.close(); await db.end();
});

function client() {
  const jar = new Map();
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body !== undefined ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); const k = pair.slice(0, i), v = pair.slice(i + 1); if (v) jar.set(k, v); else jar.delete(k); }
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
}
async function staffer(role = 'admin') {
  const c = client(); const mail = `r27-${randomUUID().slice(0, 8)}@example.com`;
  const r = await c('/api/auth/register', { method: 'POST', body: { name: 'Eq', email: mail, password: 'secreta123', acceptTerms: true, healthConsent: true, timezone: 'Europe/Madrid' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const u = await db.service.one('select id from auth.users where email = $1', [mail]); created.push(u.id);
  await growth.staff.grantUser(u.id, role);
  return c;
}

test('analytics: recorte por anúncio devolve linhas; zerar exige RESETAR e passa a contar do zero', async () => {
  const c = await staffer();
  const byAd = await c('/api/growth/funnels/sem-fumo?days=90&dim=ad');
  assert.equal(byAd.status, 200);
  assert.ok(Array.isArray(byAd.body.series));
  for (const s of byAd.body.series) assert.equal(s.retention.length, byAd.body.screens.length);

  assert.equal((await c('/api/growth/funnels/sem-fumo/reset', { method: 'POST', body: { confirm: 'resetar' } })).status, 422);
  const reader = await staffer('readonly');
  assert.equal((await reader('/api/growth/funnels/sem-fumo/reset', { method: 'POST', body: { confirm: 'RESETAR' } })).status, 403);
  const ok = await c('/api/growth/funnels/sem-fumo/reset', { method: 'POST', body: { confirm: 'RESETAR' } });
  assert.equal(ok.status, 200);
  const after = await c('/api/growth/funnels/sem-fumo?days=90');
  assert.equal(after.body.since, ok.body.since);
  assert.equal(after.body.metrics.started, 0);
});

test('melhorias futuras: começa com exemplos, salva, valida e somente leitura não edita', async () => {
  await db.service.exec(`delete from growth.settings where key = 'roadmap'`);
  const c = await staffer();
  const start = await c('/api/growth/roadmap');
  assert.equal(start.status, 200);
  assert.ok(start.body.items.some((x) => /order bump/i.test(x.title)));
  const saved = await c('/api/growth/roadmap', { method: 'PUT', body: { items: [{ title: 'Chat no app', tag: 'app', done: true }, { title: '   ' }] } });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.items.length, 1); // título vazio é descartado
  assert.equal(saved.body.items[0].done, true); assert.ok(saved.body.items[0].done_at);
  assert.equal((await c('/api/growth/roadmap', { method: 'PUT', body: { items: 'x' } })).status, 422);
  const reader = await staffer('readonly');
  assert.equal((await reader('/api/growth/roadmap', { method: 'PUT', body: { items: [] } })).status, 403);
  assert.equal((await c('/api/growth/leads?days=30')).status, 200);
});

test('suporte: valida, ignora robô e manda para a caixa do suporte', async () => {
  const c = client();
  assert.equal((await c('/api/support', { method: 'POST', body: { name: 'Ana', email: 'nao-e-email', message: 'Preciso de ajuda com o acesso' } })).status, 422);
  assert.equal((await c('/api/support', { method: 'POST', body: { name: 'Ana', email: 'ana@example.com', message: 'curta' } })).status, 422);
  const before = sent.length;
  assert.equal((await c('/api/support', { method: 'POST', body: { name: 'Bot', email: 'b@example.com', message: 'spam spam spam', website: 'x' } })).status, 200);
  assert.equal(sent.length, before); // campo-isca preenchido: nada enviado
  const r = await c('/api/support', { method: 'POST', body: { name: 'Ana', email: 'ana@example.com', orderId: 'in_123', message: 'Não consigo entrar no app.' } });
  assert.equal(r.status, 200);
  assert.deepEqual(sent.at(-1).support, { name: 'Ana', email: 'ana@example.com', orderId: 'in_123', message: 'Não consigo entrar no app.', page: '' });
});

test('e-mail de compra: idioma da conta, link de criar senha e nome escapado', () => {
  const m = purchaseEmail({ locale: 'en', name: '<b>Ana</b> Lima', plan: 'trimestral', amountCents: 4999, currency: 'eur', link: 'https://x.test/set?a=1&b=2', needsPassword: true, supportUrl: 'https://x.test/soporte' });
  assert.equal(m.subject, 'Your Alento access is ready');
  assert.match(m.text, /3-month plan/); assert.match(m.text, /https:\/\/x\.test\/set\?a=1&b=2/);
  assert.match(m.html, /Create my password/); assert.match(m.html, /&lt;b&gt;Ana&lt;\/b&gt;/);
  assert.match(purchaseEmail({ locale: 'xx', link: 'l', supportUrl: 's' }).subject, /Tu acceso/); // idioma desconhecido → espanhol
  assert.match(purchaseEmail({ locale: 'es', link: 'l', supportUrl: 's', needsPassword: false }).text, /Entra en la app/);
});

test('e-mail de redefinir senha: idioma da conta, link no nosso domínio e espanhol como reserva', () => {
  const link = 'https://alentohealth.com/restablecer?th=abc';
  const pt = recoveryEmail({ locale: 'pt-BR', link, appUrl: 'https://alentohealth.com' });
  assert.equal(pt.subject, 'Crie uma nova senha para o Alento');
  assert.ok(pt.html.includes(`href="${link}"`) && pt.text.includes(link));
  assert.equal(recoveryEmail({ locale: 'xx', link }).subject, 'Crea una nueva contraseña para Alento');
});

test('esqueci a senha: sai pelo nosso e-mail com link no nosso domínio; e-mail sem conta não envia nada', async () => {
  const c = client(); const mail = `r27-${randomUUID().slice(0, 8)}@example.com`;
  assert.equal((await c('/api/auth/register', { method: 'POST', body: { name: 'Ana', email: mail, password: 'secreta123', acceptTerms: true, healthConsent: true, timezone: 'Europe/Madrid', locale: 'pt-BR' } })).status, 201);
  created.push((await db.service.one('select id from auth.users where email = $1', [mail])).id);
  const before = sent.length;
  assert.equal((await client()('/api/auth/forgot', { method: 'POST', body: { email: mail } })).status, 200);
  const msg = sent.at(-1);
  assert.equal(sent.length, before + 1);
  assert.equal(msg.to, mail);
  assert.match(msg.text, /http:\/\/localhost\/restablecer\?th=/);
  assert.equal((await client()('/api/auth/forgot', { method: 'POST', body: { email: `ninguem-${randomUUID().slice(0, 6)}@example.com` } })).status, 200);
  assert.equal(sent.length, before + 1);
});
