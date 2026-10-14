// Cálculos del panel y de "Mi progreso". Todo sale de registros reales; lo que es una
// estimación (dinero ahorrado, cigarrillos evitados) se marca como tal en la respuesta.

export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Fecha local (YYYY-MM-DD) en la zona del usuario. */
export function todayIn(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400_000);

/** Plan vigente (última versión), objetivo activo y funciones de objetivo diario. */
export async function planContext(q, userId) {
  const plan = await q.one(`
    select v.data, p.created_at from public.personalized_plans p
    join public.plan_versions v on v.plan_id = p.id and v.version = p.current_version
    where p.user_id = $1`, [userId]);
  const goal = await q.one('select * from public.user_goals where user_id = $1 and superseded_at is null', [userId]);
  if (!plan) return null;
  const { baseline, schedule, strategy } = plan.data;
  const pricePerCig = baseline.perDay > 0 ? baseline.weeklySpend / (baseline.perDay * 7) : 0;
  const targetFor = (day) => {
    if (goal?.max_daily != null) return goal.max_daily;
    if (!goal || day < goal.start_date) return baseline.perDay;
    if (goal.strategy === 'parar' && goal.quit_date && day >= goal.quit_date) return 0;
    return schedule[Math.min(Math.floor(daysBetween(goal.start_date, day) / 7) + 1, schedule.length - 1)];
  };
  return { plan: plan.data, planCreatedAt: plan.created_at, goal, baseline, strategy, pricePerCig, targetFor };
}

/** Serie diaria entre dos fechas locales (inclusive). */
export async function dailySeries(q, userId, tz, from, to) {
  return q.rows(`
    with days as (select generate_series($3::date, $4::date, interval '1 day')::date as d)
    select to_char(d, 'YYYY-MM-DD') as day,
      coalesce((select sum(quantity) from public.smoking_entries s where s.user_id = $1 and (s.smoked_at at time zone $2)::date = d), 0)::int as cigarettes,
      exists (select 1 from public.smoking_entries s where s.user_id = $1 and (s.smoked_at at time zone $2)::date = d) as has_entries,
      exists (select 1 from public.daily_checkins c where c.user_id = $1 and c.day = d) as checked_in,
      (select count(*) from public.craving_entries c where c.user_id = $1 and (c.felt_at at time zone $2)::date = d)::int as cravings,
      (select count(*) from public.craving_entries c where c.user_id = $1 and (c.felt_at at time zone $2)::date = d and c.outcome = 'resisted')::int as resisted,
      (select mood from public.mood_entries m where m.user_id = $1 and m.day = d) as mood,
      (select count(*) from public.breathing_sessions b where b.user_id = $1 and b.completed_at is not null
         and (b.completed_at at time zone $2)::date = d)::int as breathing,
      (select count(*) from public.user_lesson_progress p where p.user_id = $1 and p.status = 'completed'
         and (p.completed_at at time zone $2)::date = d)::int as lessons
    from days order by d`, [userId, tz, from, to]);
}

/** Resumen de un período: valores registrados y estimaciones, claramente separados. */
export function summarize(series, ctx) {
  const tracked = series.filter((d) => d.has_entries || d.checked_in);
  const smokeFree = tracked.filter((d) => d.cigarettes === 0);
  const baseline = ctx?.baseline.perDay ?? 0;
  const avoided = tracked.reduce((a, d) => a + Math.max(0, baseline - d.cigarettes), 0);
  const avg = tracked.length ? tracked.reduce((a, d) => a + d.cigarettes, 0) / tracked.length : null;
  return {
    recorded: {
      cigarettes: series.reduce((a, d) => a + d.cigarettes, 0),
      trackedDays: tracked.length,
      smokeFreeDays: smokeFree.length,
      cravings: series.reduce((a, d) => a + d.cravings, 0),
      cravingsResisted: series.reduce((a, d) => a + d.resisted, 0),
      breathingSessions: series.reduce((a, d) => a + d.breathing, 0),
      lessonsCompleted: series.reduce((a, d) => a + d.lessons, 0),
      averagePerTrackedDay: avg == null ? null : Math.round(avg * 10) / 10,
    },
    estimated: {
      // Frente al consumo inicial del cuestionario, solo en días registrados.
      cigarettesAvoided: avoided,
      moneySaved: Math.round(avoided * (ctx?.pricePerCig ?? 0) * 100) / 100,
      reductionPercent: avg == null || !baseline ? null : Math.max(-100, Math.round((1 - avg / baseline) * 100)),
    },
  };
}
