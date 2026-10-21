// Concede acceso de cortesía a los 5 programas a una cuenta ya registrada (sin pago, sin configuración previa:
// la persona vive el primer uso real de cada programa). Idempotente.
//   SUPABASE_DB_URL=… node scripts/grant-all-programs.js correo@dominio.com
import { createDb } from '../server/db.js';

const email = process.argv[2];
if (!email) throw new Error('Uso: node scripts/grant-all-programs.js correo@dominio.com');
if (!process.env.SUPABASE_DB_URL) throw new Error('Falta SUPABASE_DB_URL');
const db = createDb(process.env.SUPABASE_DB_URL, { max: 1 });
try {
  const user = await db.service.one('select id from auth.users where lower(email) = lower($1)', [email]);
  if (!user) throw new Error(`No existe la cuenta ${email}. Regístrala primero en /acceso.`);
  await db.service.exec(`insert into public.profiles (user_id, name, timezone, terms_accepted_at, health_consent_at)
    select id, coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1)), 'Europe/Madrid', now(), now() from auth.users where id = $1
    on conflict (user_id) do nothing`, [user.id]);
  for (const slug of ['sem-fumo', 'alcohol', 'azucar', 'ansiedad', 'sueno']) {
    const has = await db.service.one('select 1 from public.access_grants where user_id = $1 and program_slug = $2 and revoked_at is null', [user.id, slug]);
    if (!has) await db.service.exec(`insert into public.access_grants (user_id, reason, program_slug) values ($1, 'Cuenta de prueba (primer uso)', $2)`, [user.id, slug]);
  }
  await db.service.exec(`insert into public.admin_audit_logs (action, entity, entity_id, details) values ('access.granted', 'user', $1, $2)`, [user.id, JSON.stringify({ programs: 'all', reason: 'primer uso' })]);
  console.log(`Listo: ${email} tiene acceso a los 5 programas.`);
} finally { await db.end(); }
