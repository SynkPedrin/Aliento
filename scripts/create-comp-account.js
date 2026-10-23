// Crea (o completa) una cuenta con acceso de cortesía, lista para usar: cuestionario, plan,
// objetivos, configuración inicial y, opcionalmente, administración. No genera cobros.
//   node scripts/create-comp-account.js correo contraseña "Nombre" [--admin]
import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createBilling } from '../server/billing.js';
import { computeResult } from '../server/results.js';
import { QUIZ_VERSION } from '../server/quiz.js';

const [email, password, name = 'Admin'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!email || !password) throw new Error('Uso: node scripts/create-comp-account.js correo contraseña "Nombre" [--admin]');
const config = loadConfig();
const db = createDb(config.supabase.dbUrl, { max: 2 });
const admin = createClient(config.supabase.url, config.supabase.secretKey, { auth: { persistSession: false } });
const billing = createBilling({ db, stripe: null, config });

// Respuestas de referencia (una persona que fuma 10 cigarrillos al día).
const ANSWERS = {
  q_diario: 'si', q_genero: 'hombre', q_edad: '35-44', q_medico: 'no', q_producto: 'cigarrillos', q_anios: '11a20',
  q_cantidad: '21mas', q_primer: '30min', q_enfermo: 'no', q_prohibido: 'irritado', q_sin24h: 'cualquiera', q_patron: 'automatico',
  q_gatillos: ['cafe', 'estres'], q_preocupacion: 'ansiedad', q_secreto: 'igual', q_amigo: 'no', q_disfrute: ['pausa'],
  q_metodos: ['golpe'], q_objetivo: 'gradual', q_gasto: '150a299', q_ahorro: 'viajar', q_meta3m: 'control',
};

try {
  let user = await db.service.one('select id from auth.users where lower(email) = lower($1)', [email]);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (error) throw error;
    user = { id: data.user.id };
    console.log('Cuenta creada.');
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    console.log('La cuenta ya existía: contraseña actualizada.');
  }
  await db.tx(async (q) => {
    await q.exec(`insert into public.profiles (user_id, name, timezone, terms_accepted_at, health_consent_at, onboarded_at)
      values ($1, $2, 'America/Sao_Paulo', now(), now(), now())
      on conflict (user_id) do update set onboarded_at = coalesce(public.profiles.onboarded_at, now())`, [user.id, name]);
    let assessment = await q.one('select * from public.user_assessments where user_id = $1 limit 1', [user.id]);
    if (!assessment) {
      const s = await q.one(`insert into public.questionnaire_sessions (quiz_version, user_id, claimed_user_id, completed_at, current_step)
        values ($1, $2, $2, now(), 'analisis') returning id`, [QUIZ_VERSION, user.id]);
      for (const [k, v] of Object.entries(ANSWERS)) {
        await q.exec('insert into public.questionnaire_answers (session_id, question_id, value) values ($1, $2, $3)', [s.id, k, JSON.stringify(v)]);
      }
      assessment = await q.one('insert into public.user_assessments (session_id, user_id, result) values ($1, $2, $3) returning *',
        [s.id, user.id, JSON.stringify(computeResult(ANSWERS))]);
    }
    if (!(await q.one('select 1 from public.access_grants where user_id = $1 and revoked_at is null', [user.id]))) {
      await q.exec(`insert into public.access_grants (user_id, reason, program_slug) values ($1, 'Cuenta interna de administración', 'sem-fumo')`, [user.id]);
    }
    await billing.ensureActivated(q, user.id, assessment.id);
    if (process.argv.includes('--admin')) await q.exec('insert into public.admin_users (user_id) values ($1) on conflict do nothing', [user.id]);
    await q.exec(`insert into public.admin_audit_logs (action, entity, entity_id, details) values ('access.granted', 'user', $1, $2)`,
      [user.id, JSON.stringify({ reason: 'Cuenta interna', admin: process.argv.includes('--admin') })]);
  });
  console.log(`Listo: ${email} tiene acceso premium de cortesía${process.argv.includes('--admin') ? ' y administración' : ''}.`);
} finally {
  await db.end();
}
