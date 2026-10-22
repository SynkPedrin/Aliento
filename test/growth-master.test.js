// Modo master: solo la cuenta definida en GROWTH_MASTER_EMAIL entra al panel de growth.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createSettings } from '../server/growth/settings.js';
import { createStaff } from '../server/growth/staff.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

let db, admin, masterId, otherId;
const master = `master-${randomUUID().slice(0, 8)}@example.com`;
const other = `otro-${randomUUID().slice(0, 8)}@example.com`;
const config = loadConfig({ GROWTH_MASTER_EMAIL: master.toUpperCase(), ...localSupabaseEnv() });

before(async () => {
  db = createDb(config.supabase.dbUrl, { max: 3 });
  admin = createClient(config.supabase.url, config.supabase.secretKey, { auth: { persistSession: false } });
  masterId = (await admin.auth.admin.createUser({ email: master, password: 'secreta123', email_confirm: true })).data.user.id;
  otherId = (await admin.auth.admin.createUser({ email: other, password: 'secreta123', email_confirm: true })).data.user.id;
  for (const id of [masterId, otherId]) await db.service.exec(`insert into public.profiles (user_id, name, timezone, terms_accepted_at, health_consent_at) values ($1, 'Test', 'Europe/Madrid', now(), now()) on conflict (user_id) do nothing`, [id]);
  await db.service.exec(`insert into growth.staff (user_id, role) values ($1, 'admin'), ($2, 'admin') on conflict do nothing`, [masterId, otherId]);
  await db.service.exec('insert into public.admin_users (user_id) values ($1) on conflict do nothing', [otherId]);
});
after(async () => {
  await db.service.exec('delete from growth.staff where user_id in ($1, $2)', [masterId, otherId]);
  await db.service.exec('delete from public.admin_users where user_id = $1', [otherId]);
  await admin.auth.admin.deleteUser(masterId); await admin.auth.admin.deleteUser(otherId);
  await db.end();
});

test('master: solo el correo definido (sin importar mayúsculas) tiene acceso; otros admins quedan fuera', async () => {
  const staff = createStaff({ db, settings: createSettings({ db, config }), config, log: { warn() {}, error() {} } });
  assert.equal(config.growth.masterEmail, master);
  assert.equal(await staff.roleOf(masterId), 'admin');
  assert.equal(await staff.roleOf(otherId), null, 'otro admin (equipo y admin_users) no entra');
  assert.equal(await staff.roleOf(randomUUID()), null);
});

test('master: el panel responde sin segundo factor (sin 428) y la API de configuración funciona', async () => {
  const { createApp } = await import('../server/app.js');
  const { createAuth } = await import('../server/auth.js');
  const { createGrowth } = await import('../server/growth/index.js');
  const auth = createAuth({ config, db });
  const growth = createGrowth({ db, config, auth, log: { log() {}, info() {}, warn() {}, error() {} } });
  const billing = { enabled: false, activeSubscription: async () => null, subscriptionsByProgram: async () => [] };
  const server = createApp({ db, auth, billing, config, programs: { get: async () => null }, growth, log: { log() {}, info() {}, warn() {}, error() {} } }).listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const jar = new Map();
  const call = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body: body ? JSON.stringify(body) : undefined });
    for (const c of res.headers.getSetCookie()) { const [pair] = c.split(';'); const i = pair.indexOf('='); jar.set(pair.slice(0, i), pair.slice(i + 1)); }
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  try {
    await db.service.exec('delete from public.rate_limits');
    const lg = await call('/api/auth/login', { method: 'POST', body: { email: master, password: 'secreta123' } });
    assert.equal(lg.status, 200, JSON.stringify(lg.body));
    const me = await call('/api/growth/me');
    assert.equal(me.status, 200); assert.equal(me.body.role, 'admin'); assert.equal(me.body.twofa.required, false); assert.equal(me.body.twofa.verified, true);
    assert.equal((await call('/api/growth/overview')).status, 200, 'sin 428');
    assert.equal((await call('/api/growth/settings/pixels.meta', { method: 'PUT', body: { pixelId: '123456789', accessToken: 'tok-secreto', testEventCode: 'TEST123' } })).status, 200);
    const got = await call('/api/growth/settings');
    assert.equal(got.body.settings['pixels.meta'].pixelId, '123456789');
    assert.equal(got.body.settings['pixels.meta'].accessToken, '********');
    assert.equal((await call('/api/track/config')).body.meta.pixelId, '123456789', 'el navegador recibe solo el ID del pixel');
    assert.ok(!JSON.stringify((await call('/api/track/config')).body).includes('tok-secreto'));
    const eq = await call('/api/growth/staff');
    assert.equal(eq.body.rows.length, 1); assert.equal(eq.body.rows[0].email, master);
    assert.equal((await call('/api/growth/staff', { method: 'POST', body: { email: other, role: 'admin' } })).status, 403);
    // otro admin sigue fuera
    const jar2 = new Map(); jar.clear();
    assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: other, password: 'secreta123' } })).status, 200);
    assert.equal((await call('/api/growth/overview')).status, 403);
  } finally {
    await db.service.exec(`delete from growth.settings where key = 'pixels.meta'`);
    server.close();
  }
});
