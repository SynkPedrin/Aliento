// Concede (o retira) acceso de administración. Solo desde el servidor con credenciales de base de datos.
//   npm run admin:grant -- correo@dominio.com
//   npm run admin:grant -- correo@dominio.com --revoke
import { createDb } from '../server/db.js';
import { loadConfig } from '../server/config.js';

const email = process.argv[2];
if (!email) throw new Error('Uso: npm run admin:grant -- correo@dominio.com [--revoke]');
const db = createDb(loadConfig().supabase.dbUrl, { max: 1 });
try {
  const user = await db.service.one('select id from auth.users where lower(email) = lower($1)', [email]);
  if (!user) throw new Error(`No existe una cuenta con el correo ${email}`);
  if (process.argv.includes('--revoke')) {
    await db.service.exec('delete from public.admin_users where user_id = $1', [user.id]);
    await db.service.exec(`insert into public.admin_audit_logs (action, entity, entity_id) values ('admin.revoked', 'user', $1)`, [user.id]);
    console.log(`Acceso de administración retirado a ${email}.`);
  } else {
    await db.service.exec('insert into public.admin_users (user_id) values ($1) on conflict do nothing', [user.id]);
    await db.service.exec(`insert into public.admin_audit_logs (action, entity, entity_id) values ('admin.granted', 'user', $1)`, [user.id]);
    console.log(`Acceso de administración concedido a ${email}.`);
  }
} finally {
  await db.end();
}
