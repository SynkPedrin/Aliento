// Pasos finales de producción (idempotente; se puede ejecutar varias veces):
//   1) trae las variables de Vercel (incluida la base Supabase de la integración)
//   2) aplica las migraciones  3) publica la jornada  4) crea la cuenta interna
//   5) programa los recordatorios con pg_cron (cada 10 min)  6) redespliega
//   node scripts/finish-production.js admin@admin.com 'Contraseña' [--no-deploy]
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { parseEnv } from 'node:util';

const [email, password] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!email || !password) throw new Error("Uso: node scripts/finish-production.js correo 'contraseña'");
const run = (cmd, args, env = {}) => execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
const ENV_FILE = '.env.production.local';

console.log('1/6 Variables de producción (Vercel)…');
run('npx', ['--yes', 'vercel@latest', 'env', 'pull', ENV_FILE, '--environment', 'production', '--yes']);
const env = parseEnv(readFileSync(ENV_FILE, 'utf8'));
const direct = env.POSTGRES_URL_NON_POOLING || env.SUPABASE_DB_URL || env.POSTGRES_URL;
if (!direct || !(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)) throw new Error('La integración de Supabase aún no ha creado las variables en Vercel.');
const prodEnv = { ...env, SUPABASE_DB_URL: direct, NODE_ENV: 'production' };

try {
  console.log('2/6 Migraciones…');
  run('npx', ['supabase', 'db', 'push', '--db-url', direct, '--include-all', '--yes']);

  console.log('3/6 Jornada…');
  run('node', ['scripts/seed-content.js'], prodEnv);

  console.log('4/6 Cuenta interna…');
  run('node', ['scripts/create-comp-account.js', email, password, 'Admin', '--admin'], prodEnv);

  console.log('5/6 Recordatorios (pg_cron + pg_net)…');
  const appUrl = env.APP_URL || 'https://alentohealth.com';
  const { createDb } = await import('../server/db.js');
  const db = createDb(direct, { max: 1 });
  try {
    await db.service.exec('create extension if not exists pg_cron');
    await db.service.exec('create extension if not exists pg_net');
    await db.service.exec(`select cron.unschedule(jobid) from cron.job where jobname = 'aliento-notificaciones'`);
    const command = `select net.http_get(url := ${literal(`${appUrl}/api/cron/notifications`)}, headers := jsonb_build_object('Authorization', ${literal(`Bearer ${env.CRON_SECRET}`)}), timeout_milliseconds := 25000)`;
    await db.service.exec(`select cron.schedule('aliento-notificaciones', '*/10 * * * *', $1)`, [command]);
    console.log('   Programado cada 10 minutos.');
    // Panel de growth: un único cron (cada 10 min) gobierna bandeja de eventos, anuncios, monitor, informe diario y semanal.
    await db.service.exec(`select cron.unschedule(jobid) from cron.job where jobname = 'alento-growth'`);
    const growthCmd = `select net.http_get(url := ${literal(`${appUrl}/api/cron/growth?job=tick`)}, headers := jsonb_build_object('Authorization', ${literal(`Bearer ${env.CRON_SECRET}`)}), timeout_milliseconds := 25000)`;
    await db.service.exec(`select cron.schedule('alento-growth', '*/10 * * * *', $1)`, [growthCmd]);
    console.log('   Growth: programado cada 10 minutos.');
  } finally {
    await db.end();
  }

  if (!process.argv.includes('--no-deploy')) {
    console.log('6/6 Despliegue…');
    run('npx', ['--yes', 'vercel@latest', 'deploy', '--prod', '--yes']);
  }
  console.log('\nProducción lista.');
} finally {
  rmSync(ENV_FILE, { force: true }); // no dejar credenciales en disco
}

function literal(v) { return `'${String(v).replace(/'/g, "''")}'`; }
