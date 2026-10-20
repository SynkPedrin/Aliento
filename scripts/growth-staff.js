// Concede (o retira) un papel del panel de growth por e-mail.
//   npm run growth:staff -- correo@dominio.com admin|marketing|readonly
//   npm run growth:staff -- correo@dominio.com --revoke
import { createDb } from '../server/db.js';
import { loadConfig } from '../server/config.js';
import { createSettings } from '../server/growth/settings.js';
import { createStaff, ROLES } from '../server/growth/staff.js';

const [email, role] = process.argv.slice(2);
if (!email || !(role === '--revoke' || ROLES.includes(role))) {
  throw new Error(`Uso: npm run growth:staff -- correo@dominio.com ${ROLES.join('|')} | --revoke`);
}
const config = loadConfig();
const db = createDb(config.supabase.dbUrl, { max: 1 });
try {
  const staff = createStaff({ db, settings: createSettings({ db, config }), config });
  if (role === '--revoke') {
    const user = await db.service.one('select id from auth.users where lower(email) = lower($1)', [email]);
    if (!user) throw new Error(`No existe una cuenta con el correo ${email}`);
    await staff.revoke(user.id);
    console.log(`Acceso al panel retirado a ${email}.`);
  } else {
    await staff.grantByEmail(email, role);
    console.log(`Papel ${role} concedido a ${email}.`);
  }
} finally {
  await db.end();
}
