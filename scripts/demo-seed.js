// Prepara el entorno de PRUEBAS LOCAL (Supabase local + Stripe simulado): activa los 5 programas y crea
// dos cuentas de prueba. Nunca toca producción: se niega a ejecutarse si la base no es local.
//   node scripts/demo-seed.js
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createBilling } from '../server/billing.js';
import { computeResult } from '../server/results.js';
import { QUIZ_VERSION } from '../server/quiz.js';
import { localSupabaseEnv } from './local-supabase.js';

const config = loadConfig({ ...localSupabaseEnv() });
if (!/127\.0\.0\.1|localhost/.test(config.supabase.url)) throw new Error('demo-seed solo funciona con el Supabase local.');
const db = createDb(config.supabase.dbUrl, { max: 2 });
const billing = createBilling({ db, stripe: null, config });
const SEM_FUMO_ANSWERS = {
  q_producto: 'cigarrillos', q_cantidad: 10, q_gasto: 25, q_anios: '5-9', q_primer: '30min', q_gatillos: ['cafe', 'estres'], q_dificil: 'cafe',
  q_intentos: ['solo'], q_preocupacion: 'ansiedad', q_motivos: ['salud', 'dinero'], q_objetivo: 'gradual', q_edad: '25-34',
};
const admin = createClient(config.supabase.url, config.supabase.secretKey, { auth: { persistSession: false } });

const PASSWORD = 'Alento2026!';
const ACCOUNTS = [
  { email: 'comprador@alento.test', name: 'Comprador de prueba', premium: false },
  { email: 'premium@alento.test', name: 'Premium de prueba', premium: true },
];
const PROGRAMS = ['sem-fumo', 'alcohol', 'azucar', 'ansiedad', 'sueno'];

try {
  // Los 5 programas a la venta, con todo su contenido publicado (solo en la base local).
  await db.service.exec(`update public.journey_programs set commercial_status = 'active', published = true`);
  await db.service.exec(`update public.journey_chapters set published = true`);
  await db.service.exec(`update public.journey_lessons set published = true, clinical_review = 'approved' where clinical_review is distinct from 'approved'`).catch(() => {});

  for (const a of ACCOUNTS) {
    let user = await db.service.one('select id from auth.users where lower(email) = $1', [a.email]);
    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({ email: a.email, password: PASSWORD, email_confirm: true, user_metadata: { name: a.name } });
      if (error) throw error;
      user = { id: data.user.id };
    } else {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password: PASSWORD });
      if (error) throw error;
    }
    await db.service.exec(`insert into public.profiles (user_id, name, timezone, terms_accepted_at, health_consent_at)
      values ($1, $2, 'Europe/Madrid', now(), now()) on conflict (user_id) do update set name = excluded.name`, [user.id, a.name]);
    // Estado limpio: sin accesos ni suscripciones previas.
    await db.service.exec('delete from public.access_grants where user_id = $1', [user.id]);
    for (const t of ['subscriptions', 'checkout_sessions', 'user_assessments']) await db.service.exec(`delete from public.${t} where user_id = $1`, [user.id]).catch(() => {});
    await db.service.exec('delete from public.questionnaire_sessions where user_id = $1 or claimed_user_id = $1', [user.id]).catch(() => {});
    if (a.premium) {
      for (const p of PROGRAMS) {
        await db.service.exec(`insert into public.access_grants (user_id, reason, program_slug) values ($1, 'Cuenta de prueba', $2)`, [user.id, p]);
      }
      // Sem Fumo listo para usar: cuestionario, plan y configuración inicial (como una cuenta que ya pagó).
      await db.tx(async (q) => {
        await q.exec('update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where user_id = $1', [user.id]);
        let assessment = await q.one(`select * from public.user_assessments where user_id = $1 and program_slug = 'sem-fumo' limit 1`, [user.id]);
        if (!assessment) {
          const ses = await q.one(`insert into public.questionnaire_sessions (quiz_version, user_id, claimed_user_id, completed_at, current_step, program_slug)
            values ($1, $2, $2, now(), 'analisis', 'sem-fumo') returning id`, [QUIZ_VERSION, user.id]);
          for (const [k, v] of Object.entries(SEM_FUMO_ANSWERS)) await q.exec('insert into public.questionnaire_answers (session_id, question_id, value) values ($1, $2, $3)', [ses.id, k, JSON.stringify(v)]);
          assessment = await q.one(`insert into public.user_assessments (session_id, user_id, program_slug, result) values ($1, $2, 'sem-fumo', $3) returning *`,
            [ses.id, user.id, JSON.stringify(computeResult(SEM_FUMO_ANSWERS))]);
        }
        await billing.ensureActivated(q, user.id, assessment.id);
      });
    }
    console.log(`${a.email} / ${PASSWORD}  ${a.premium ? '(acceso a los 5 programas)' : '(sin acceso: prueba el pago de cada programa)'}`);
  }
} finally {
  await db.end();
}
