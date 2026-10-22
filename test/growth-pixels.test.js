// Configuración de pixels de punta a punta: guardar → probar conexión → evento del navegador → API de conversiones.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createGrowth } from '../server/growth/index.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
let db, config, growth, server, base;
const calls = [];
const vids = [];
let mode = 'ok';
const fakeFetch = async (url, init = {}) => {
  const u = String(url);
  if (/graph\.facebook\.com|business-api\.tiktok\.com/.test(u)) {
    calls.push({ url: u, headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null });
    if (mode === 'error') return new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token.' }, code: 1 }), { status: 400 });
    if (u.includes('facebook')) return new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'TRACE1' }), { status: 200 });
    return new Response(JSON.stringify({ code: 0, message: 'OK', request_id: 'REQ1' }), { status: 200 });
  }
  return globalThis.fetch(url, init);
};

before(async () => {
  config = loadConfig({ APP_URL: 'https://alentohealth.com', CRON_SECRET: 'x', GROWTH_ENCRYPTION_KEY: 'k', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 5 });
  const auth = createAuth({ config, db });
  growth = createGrowth({ db, config, auth, fetchImpl: fakeFetch, log: silent });
  const billing = { enabled: false, activeSubscription: async () => null, subscriptionsByProgram: async () => [] };
  server = createApp({ db, auth, billing, config, programs: { get: async () => null }, growth, log: silent }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  await db.service.exec(`delete from growth.settings where key in ('pixels.meta', 'pixels.tiktok')`);
  await db.service.exec(`delete from growth.outbox where status = 'pending'`);
});
after(async () => {
  for (const v of vids) await db.service.exec('select growth.erase_person(null, null, $1)', [v]);
  await db.service.exec(`delete from growth.outbox where destination in ('meta', 'tiktok') and status in ('pending', 'sent', 'failed')  and created_at > now() - interval '1 hour'`);
  await db.service.exec(`delete from growth.settings where key in ('pixels.meta', 'pixels.tiktok')`);
  server.close(); await db.end();
});

const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('probar conexión: pide ID, token y código de prueba; envía PageView de teste y esconde o token nos erros', async () => {
  assert.match((await growth.forwarders.sendTest('meta')).message, /Preencha/);
  await growth.settings.set('pixels.meta', { pixelId: '111222333', accessToken: 'EAAB-token-secreto' });
  assert.match((await growth.forwarders.sendTest('meta')).message, /Código de eventos de teste/);
  await growth.settings.set('pixels.meta', { pixelId: '111222333', accessToken: '********', testEventCode: 'TEST42' });
  calls.length = 0;
  const ok = await growth.forwarders.sendTest('meta');
  assert.equal(ok.ok, true, ok.message);
  assert.match(calls[0].url, /graph\.facebook\.com\/v\d+\.\d+\/111222333\/events\?access_token=EAAB-token-secreto/);
  assert.equal(calls[0].body.test_event_code, 'TEST42');
  assert.equal(calls[0].body.data[0].event_name, 'PageView');
  mode = 'error';
  const bad = await growth.forwarders.sendTest('meta');
  mode = 'ok';
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Invalid OAuth access token/);
  assert.ok(!bad.message.includes('EAAB-token-secreto'), 'el token nunca vuelve a la pantalla');
  await growth.settings.set('pixels.tiktok', { pixelId: 'TTPIX9', accessToken: 'tt-token', testEventCode: 'TTTEST' });
  calls.length = 0;
  const tt = await growth.forwarders.sendTest('tiktok');
  assert.equal(tt.ok, true, tt.message);
  assert.equal(calls[0].headers['Access-Token'], 'tt-token');
  assert.equal(calls[0].body.event_source_id, 'TTPIX9');
  assert.equal(calls[0].body.test_event_code, 'TTTEST');
});

test('de punta a punta: con consentimiento el evento llega a Meta y TikTok con el mismo event_id y sin datos de salud; sin consentimiento no sale nada', async () => {
  const vid = randomUUID(); vids.push(vid);
  const touch = { first: { utm_source: 'facebook', utm_content: 'ad_9' }, last: { utm_source: 'facebook', utm_content: 'ad_9', fbclid: 'abc123', fbp: 'fb.1.111.222' } };
  const idYes = randomUUID(), idNo = randomUUID();
  const send = (marketing, id) => post('/api/track', { visitor: { id: vid, session: randomUUID(), touch }, language: 'pt-BR', page: '/quiz/alcohol', consent: { marketing }, events: [{ id, name: 'quiz_started', props: { program: 'alcohol' } }] });
  assert.equal((await send(false, idNo)).status, 200);
  assert.equal((await send(true, idYes)).status, 200);
  const cfg = await (await fetch(base + '/api/track/config')).json();
  assert.equal(cfg.meta.pixelId, '111222333'); assert.equal(cfg.tiktok.pixelId, 'TTPIX9');
  assert.ok(!JSON.stringify(cfg).includes('secreto') && !JSON.stringify(cfg).includes('tt-token'), 'o navegador não recebe tokens');
  calls.length = 0;
  const out = await growth.forwarders.processOutbox({ limit: 100 });
  assert.ok(out.sent >= 2, JSON.stringify(out));
  const meta = calls.find((c) => c.url.includes('facebook') && c.body.data[0].event_id === idYes);
  const tik = calls.find((c) => c.url.includes('tiktok') && c.body.data[0].event_id === idYes);
  assert.ok(meta && tik, 'ambos reciben el evento con su event_id');
  assert.equal(meta.body.data[0].event_name, 'ViewContent'); assert.equal(tik.body.data[0].event, 'ViewContent');
  assert.equal(meta.body.data[0].user_data.fbp, 'fb.1.111.222');
  assert.equal(meta.body.data[0].action_source, 'website');
  assert.ok(!calls.some((c) => c.body.data[0].event_id === idNo), 'sin consentimiento nada sale');
  assert.ok(!/alcohol|sueno|azucar|ansiedad|sem-fumo/i.test(JSON.stringify(calls)), 'el hábito no viaja a los anuncios');
  assert.equal(meta.body.data[0].event_source_url, 'https://alentohealth.com/quiz');
});
