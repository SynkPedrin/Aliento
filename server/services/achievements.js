// Logros: se conceden automáticamente a partir de datos reales y nunca dos veces
// (clave primaria user_id + achievement_slug). Un tropiezo no borra logros anteriores.

export async function unlockAchievement(q, userId, slug) {
  const row = await q.one(`
    insert into public.user_achievements (user_id, achievement_slug) values ($1, $2)
    on conflict do nothing returning achievement_slug`, [userId, slug]);
  return Boolean(row);
}

/** Días con registro (consumo, "hoy no he fumado", ganas o ánimo) en la zona horaria del usuario. */
export const TRACKED_DAYS_SQL = `
  select distinct d from (
    select (smoked_at at time zone $2)::date as d from public.smoking_entries where user_id = $1
    union select day from public.daily_checkins where user_id = $1
    union select (felt_at at time zone $2)::date from public.craving_entries where user_id = $1
    union select day from public.mood_entries where user_id = $1
  ) t`;

const RULES = [
  ['primera-leccion', `select count(*) >= 1 as ok from public.user_lesson_progress where user_id = $1 and status = 'completed'`],
  ['primer-capitulo', `select count(*) >= 1 as ok from public.user_chapter_progress where user_id = $1 and status = 'completed'`],
  ['primer-registro', `select (exists (select 1 from public.smoking_entries where user_id = $1)
      or exists (select 1 from public.daily_checkins where user_id = $1)
      or exists (select 1 from public.craving_entries where user_id = $1)
      or exists (select 1 from public.mood_entries where user_id = $1)) as ok`],
  ['semana-seguimiento', `select count(*) >= 7 as ok from (${TRACKED_DAYS_SQL}) x`],
  ['ganas-superadas', `select exists (select 1 from public.craving_entries where user_id = $1 and outcome = 'resisted') as ok`],
  ['respiracion-5', `select count(*) >= 5 as ok from public.breathing_sessions where user_id = $1 and completed_at is not null`],
  ['primer-dia-sin-fumar', `select exists (
      select 1 from public.daily_checkins c where c.user_id = $1
      and not exists (select 1 from public.smoking_entries s where s.user_id = $1 and (s.smoked_at at time zone $2)::date = c.day)) as ok`],
  ['un-mes', `select exists (select 1 from public.personalized_plans where user_id = $1 and created_at <= now() - interval '30 days') as ok`],
];

/**
 * Revisa todas las reglas y concede los logros nuevos. Se ejecuta con el rol de servicio
 * (los usuarios no pueden escribir en user_achievements). Devuelve los logros recién desbloqueados.
 */
export async function checkAchievements(q, userId, timezone = 'UTC') {
  const unlocked = [];
  const have = new Set((await q.rows('select achievement_slug from public.user_achievements where user_id = $1', [userId]))
    .map((r) => r.achievement_slug));
  for (const [slug, sql] of RULES) {
    if (have.has(slug)) continue;
    const params = sql.includes('$2') ? [userId, timezone] : [userId];
    const { ok } = await q.one(sql, params);
    if (ok && await unlockAchievement(q, userId, slug)) unlocked.push(slug);
  }
  if (!unlocked.length) return [];
  return q.rows('select slug, title, description, icon from public.achievements where slug = any($1) order by position', [unlocked]);
}
