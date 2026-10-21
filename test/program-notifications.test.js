// Recordatorios push por programa: mensaje, URL y deduplicación propios de cada programa.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAuth } from '../server/auth.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createNotifier } from '../server/services/notifications.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
const TZ = 'Europe/Madrid';
let db, auth, notifier, config;
const pushed = [], users = [];

before(async () => {
  config = loadConfig({ APP_URL: 'http://localhost', CRON_SECRET: 'x', VAPID_SUBJECT: 'mailto:t@example.com',
    VAPID_PUBLIC_KEY: 'BLs0rb7qGq5Ae7oZr3GgOq0h2vrnU2zrYsDYZJqgQzkQ2gO1pJ6s0x7VYb4i9i3Qzq2zK2sY3bJtV3l4n5o6p7Q', VAPID_PRIVATE_KEY: 'x7m4uN4mWm1kO6y4rH0q2Jv9cQe1b3d5f7h9j1l3n5p', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 4 });
  auth = createAuth({ config, db });
  notifier = createNotifier({ db, config, log: silent, sender: async (sub, body) => { pushed.push({ endpoint: sub.endpoint, body: JSON.parse(body) }); } });
});
after(async () => { for (const id of users) await auth.deleteUser(id).catch(() => {}); await db.end(); });

async function setup(program) {
  const mail = `push-${randomUUID().slice(0, 8)}@example.com`;
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(config.supabase.url, config.supabase.secretKey, { auth: { persistSession: false } });
  const { data: u, error: e } = await admin.auth.admin.createUser({ email: mail, password: 'secreta123', email_confirm: true, user_metadata: { name: 'Ana Pérez' } });
  if (e) throw e;
  users.push(u.user.id);
  await db.service.exec(`insert into public.profiles (user_id, name, timezone, terms_accepted_at, health_consent_at, onboarded_at) values ($1, 'Ana Pérez', $2, now(), now(), now()) on conflict (user_id) do nothing`, [u.user.id, TZ]);
  await db.service.exec(`insert into public.access_grants (user_id, reason, program_slug) values ($1, 'test', $2)`, [u.user.id, program]);
  const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
  await db.service.exec(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, $2, 'p', 'a')`, [u.user.id, endpoint]);
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date());
  await db.service.exec(`insert into public.notification_preferences (user_id, program_slug, enabled, consent_at, timezone, reminder_time, lessons, tracking)
    values ($1, $2, true, now(), $3, $4, true, true) on conflict (user_id, program_slug) do update set enabled = true, consent_at = now(), timezone = $3, reminder_time = $4`, [u.user.id, program, TZ, hhmm]);
  return { id: u.user.id, endpoint };
}

for (const [slug, urlPart] of [['alcohol', '/programa?p=alcohol'], ['azucar', '/programa?p=azucar'], ['ansiedad', '/programa?p=ansiedad'], ['sueno', '/programa?p=sueno']]) {
  test(`push ${slug}: recordatorio propio, enlace al programa y una sola vez al día`, async () => {
    const u = await setup(slug);
    const before = pushed.length;
    await notifier.runDue();
    const mine = pushed.slice(before).filter((p) => p.endpoint === u.endpoint);
    assert.equal(mine.length, 1, `se esperaba 1 aviso, hubo ${mine.length}`);
    assert.equal(mine[0].body.url, urlPart);
    assert.match(mine[0].body.title, /Hola, Ana/);
    assert.ok(mine[0].body.body.length > 10);
    await notifier.runDue(); // no se repite
    assert.equal(pushed.slice(before).filter((p) => p.endpoint === u.endpoint).length, 1);
    const key = await db.service.one(`select dedupe_key from public.notification_deliveries where user_id = $1 and category = 'daily'`, [u.id]);
    assert.match(key.dedupe_key, new RegExp(`^daily:${slug}:`));
  });
}

test('push: un registro del día en el programa evita el recordatorio de registro', async () => {
  const u = await setup('alcohol');
  await db.service.exec(`insert into public.program_activity_entries (user_id, program_slug, kind, value) values ($1, 'alcohol', 'consumo', '{}'::jsonb)`, [u.id]);
  const before = pushed.length;
  await notifier.runDue();
  const mine = pushed.slice(before).filter((p) => p.endpoint === u.endpoint);
  // Con registro hecho solo queda la próxima lección (si la hay publicada); nunca el texto de «anota cómo va tu día».
  for (const m of mine) assert.ok(!/cada dato cuenta/.test(m.body.body));
});
