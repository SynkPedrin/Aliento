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
