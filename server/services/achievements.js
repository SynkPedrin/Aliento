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

const TOTAL = 9;

/**
 * Revisa todas las reglas en UNA consulta y concede los logros nuevos. Se ejecuta con el rol de
 * servicio (los usuarios no pueden escribir en user_achievements). Devuelve los recién desbloqueados.
 */
export async function checkAchievements(q, userId, timezone = 'UTC') {
  const have = await q.one('select count(*)::int as n from public.user_achievements where user_id = $1', [userId]);
  if (have.n >= TOTAL) return [];
  const rows = await q.rows(`
    with rules(slug, ok) as (values
      ('primera-leccion', exists (select 1 from public.user_lesson_progress where user_id = $1 and status = 'completed')),
      ('primer-capitulo', exists (select 1 from public.user_chapter_progress where user_id = $1 and status = 'completed')),
      ('primer-registro', exists (select 1 from public.smoking_entries where user_id = $1)
         or exists (select 1 from public.daily_checkins where user_id = $1)
         or exists (select 1 from public.craving_entries where user_id = $1)
         or exists (select 1 from public.mood_entries where user_id = $1)),
      ('semana-seguimiento', (select count(*) >= 7 from (${TRACKED_DAYS_SQL}) x)),
      ('ganas-superadas', exists (select 1 from public.craving_entries where user_id = $1 and outcome = 'resisted')),
      ('respiracion-5', (select count(*) >= 5 from public.breathing_sessions where user_id = $1 and completed_at is not null)),
      ('primer-dia-sin-fumar', exists (select 1 from public.daily_checkins c where c.user_id = $1 and not exists (
         select 1 from public.smoking_entries s where s.user_id = $1
           and s.smoked_at >= c.day::timestamp at time zone $2 and s.smoked_at < (c.day + 1)::timestamp at time zone $2))),
      ('un-mes', exists (select 1 from public.personalized_plans where user_id = $1 and created_at <= now() - interval '30 days'))
    ),
    granted as (
      insert into public.user_achievements (user_id, achievement_slug)
      select $1, slug from rules where ok
      on conflict do nothing returning achievement_slug
    )
    select a.slug, a.title, a.description, a.icon from public.achievements a
    join granted g on g.achievement_slug = a.slug order by a.position`, [userId, timezone]);
  return rows;
}
