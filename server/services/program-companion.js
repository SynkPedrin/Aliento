// Motor genérico del "companheiro" de programa (alcohol, azúcar, ansiedad, sueño).
// Toda la lógica de producto sale de la definición del programa (server/content/companions/*) y de
// registros reales en program_activity_entries (+ daily_goals, mood_entries, breathing_sessions).
// Lo que es una estimación se marca con `estimate: true` y nunca se inventan cifras.
import { COMPANIONS } from '../content/companions/index.js';
import { TIME_RE, longestRun, mean, round1, round2, sum } from '../content/companions/_shared.js';
import { HttpError } from '../routes/util.js';
import { JourneyEngine } from './journey-engines.js';
import { addDays, daysBetween } from './stats.js';

export const RANGES = [7, 30, 90, 365];
export const WINDOW_DAYS = 400;
const MAX_LOGS_PER_DAY = 100;
const WEEKDAY_NAMES = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

// ---------------------------------------------------------------- validación del registro
const bad = (message, field) => new HttpError(422, message, 'INVALID', { field });

/** Valida `input` contra los campos del formulario. Rechaza campos desconocidos; devuelve el valor limpio. */
export function validateFields(fields, input, { label = 'registro' } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad(`Faltan los datos del ${label}.`, 'value');
  const known = new Set(fields.map((f) => f.id));
  for (const key of Object.keys(input)) if (!known.has(key)) throw bad('Campo no reconocido.', key);
  const out = {};
  for (const f of fields) {
    const raw = input[f.id];
    const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
    if (empty) {
      if (f.required) throw bad('Completa este campo.', f.id);
      continue;
    }
    switch (f.type) {
      case 'number': {
        const n = Number(raw);
        if (typeof raw === 'boolean' || !Number.isFinite(n) || n < f.min || n > f.max) throw bad(`Introduce un número entre ${f.min} y ${f.max}.`, f.id);
        if (f.integer && !Number.isInteger(n)) throw bad('Introduce un número entero.', f.id);
        out[f.id] = f.step ? Math.round(n / f.step) * f.step : n;
        break;
      }
      case 'scale': {
        const n = Number(raw);
        if (typeof raw === 'boolean' || !Number.isInteger(n) || n < f.min || n > f.max) throw bad(`Elige un valor entre ${f.min} y ${f.max}.`, f.id);
        out[f.id] = n;
        break;
      }
      case 'select':
        if (typeof raw !== 'string' || !f.options.some((o) => o.id === raw)) throw bad('Valor no válido.', f.id);
        out[f.id] = raw;
        break;
      case 'multi': {
        if (!Array.isArray(raw)) throw bad('Selección no válida.', f.id);
        const ids = [...new Set(raw)];
        if (ids.length > (f.max ?? f.options.length) || !ids.every((id) => typeof id === 'string' && f.options.some((o) => o.id === id))) throw bad('Selección no válida.', f.id);
        out[f.id] = ids;
        break;
      }
      case 'time':
        if (typeof raw !== 'string' || !TIME_RE.test(raw)) throw bad('Hora no válida (HH:MM).', f.id);
        out[f.id] = raw;
        break;
      case 'text': {
        const t = typeof raw === 'string' ? raw.trim() : null;
        if (t === null) throw bad('Texto no válido.', f.id);
        if (t.length > (f.maxLength ?? 500)) throw bad(`Máximo ${f.maxLength ?? 500} caracteres.`, f.id);
        if (t) out[f.id] = t;
        break;
      }
      default:
        throw bad('Campo no soportado.', f.id);
    }
  }
  return out;
}

/** Instante válido: no futuro (margen de 5 min) ni de hace más de 400 días. */
export function parseInstant(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime()) || d > new Date(Date.now() + 5 * 60_000) || d < new Date(Date.now() - WINDOW_DAYS * 86400_000)) {
    throw bad('Fecha y hora no válidas.', 'at');
  }
  return d;
}

// ---------------------------------------------------------------- vistas de la definición
const safeSummary = (def, value) => { try { return def.log.summary(value ?? {}); } catch { return ''; } };

/** Parte pública (sin funciones) de la definición. */
export const publicStrategies = (def) => def.strategies.map(({ id, name, description, fixedTarget, defaultTarget, usesStart }) =>
  ({ id, name, description, fixedTarget: fixedTarget ?? null, defaultTarget: defaultTarget ?? null, usesStart: Boolean(usesStart) }));

export const logFormView = (def) => ({ label: def.log.label, cta: def.log.cta, kind: def.log.kind, fields: def.log.fields });
export const urgeFormView = (def) => ({ ...def.urge });

export function setupFormView(def, { today, suggestions = {} } = {}) {
  const t = def.setup.target;
  const fixed = def.strategies.filter((s) => s.fixedTarget != null).map((s) => s.id);
  const fields = [
    { id: 'strategy', label: 'Tu camino', type: 'select', required: true, options: def.strategies.map((s) => ({ id: s.id, label: s.name, help: s.description })) },
    { id: 'startDate', label: 'Fecha de inicio', type: 'date', required: true, default: today ?? null,
      min: today ? addDays(today, -30) : null, max: today ? addDays(today, 60) : null },
    { id: 'target', label: t.label, help: t.help, type: 'number', unit: t.unit, min: t.min, max: t.max, step: t.step, default: t.default, hideFor: fixed },
  ];
  if (def.setup.start) {
    const s = def.setup.start;
    fields.push({ id: 'start', label: s.label, help: s.help, type: 'number', unit: s.unit, min: s.min, max: s.max, step: s.step,
      default: suggestions.start ?? s.default, showFor: def.strategies.filter((x) => x.usesStart).map((x) => x.id) });
  }
  fields.push({ id: 'exercisePerWeek', label: 'Ejercicios de respiración por semana', type: 'number', min: 0, max: 21, step: 1, integer: true, default: 3 });
  fields.push({ id: 'notifications', label: 'Recordatorio diario', type: 'reminder', default: { enabled: false, time: def.defaultReminderTime } });
  return { intro: def.setup.intro, fields };
}

// ---------------------------------------------------------------- objetivo y plan
const rowToGoal = (def, row) => ({
  id: row.id, strategy: row.strategy, startDate: row.start_date,
  target: row.settings?.target ?? row.max_daily ?? def.setup.target.default,
  start: row.settings?.start ?? null, exercisePerWeek: row.exercise_per_week, createdAt: row.created_at, supersededAt: row.superseded_at ?? null,
});

/** Objetivo activo del programa, o null si todavía no hizo la configuración inicial. */
export async function loadGoal(q, def, userId) {
  const row = await q.one('select * from public.user_goals where user_id = $1 and program_slug = $2 and superseded_at is null', [userId, def.slug]);
  // Un objetivo heredado de otro esquema (estrategia de Sem Fumo) no cuenta como configurado.
  if (!row || !def.strategies.some((s) => s.id === row.strategy)) return null;
  return rowToGoal(def, row);
}

export async function loadGoalHistory(q, def, userId) {
  const rows = await q.rows('select * from public.user_goals where user_id = $1 and program_slug = $2 order by created_at desc limit 50', [userId, def.slug]);
  return rows.filter((r) => def.strategies.some((s) => s.id === r.strategy)).map((r) => rowToGoal(def, r));
}

/** Objetivo provisional (estrategia por defecto) para calcular estados cuando aún no hay configuración. */
export const defaultGoal = (def, today) => ({
  strategy: def.strategies[0].id, startDate: today, target: def.strategies[0].fixedTarget ?? def.strategies[0].defaultTarget ?? def.setup.target.default,
  start: null, exercisePerWeek: 3,
});

export async function loadPlan(q, def, userId) {
  const row = await q.one(`select v.data, v.version, p.created_at from public.personalized_plans p
    join public.plan_versions v on v.plan_id = p.id and v.version = p.current_version
    where p.user_id = $1 and p.program_slug = $2`, [userId, def.slug]);
  return row?.data?.program === def.slug ? row.data : null;
}

/** Respuestas del cuestionario del programa (si las hay): base de las estimaciones. */
export async function loadAnswers(q, userId, slug) {
  const a = await q.one('select session_id from public.user_assessments where user_id = $1 and program_slug = $2 order by created_at desc limit 1', [userId, slug]);
  if (!a) return { assessmentId: null, answers: {} };
  const rows = await q.rows('select question_id, value from public.questionnaire_answers where session_id = $1', [a.session_id]);
  const id = (await q.one('select id from public.user_assessments where session_id = $1', [a.session_id]))?.id ?? null;
  return { assessmentId: id, answers: Object.fromEntries(rows.map((r) => [r.question_id, r.value])) };
}

/**
 * Valida y normaliza la configuración. `current` (objetivo vigente) completa lo que no se envía,
 * así PUT /goals admite cambios parciales.
 */
export function normalizeGoalInput(def, input, { today, current = null, suggestions = {} }) {
  const b = input ?? {};
  const strategyId = b.strategy ?? current?.strategy;
  const strategy = def.strategies.find((s) => s.id === strategyId);
  if (!strategy) throw bad('Elige tu camino.', 'strategy');
  const t = def.setup.target;
  let target;
  if (strategy.fixedTarget != null) target = strategy.fixedTarget;
  else {
    const raw = b.target ?? (current && current.strategy === strategy.id ? current.target : (strategy.defaultTarget ?? t.default));
    const n = Number(raw);
    if (typeof raw === 'boolean' || !Number.isFinite(n) || n < t.min || n > t.max) throw bad(`Introduce un número entre ${t.min} y ${t.max}.`, 'target');
    target = Math.round(n / t.step) * t.step;
  }
  let start = null;
  if (strategy.usesStart && def.setup.start) {
    const s = def.setup.start;
    const raw = b.start ?? current?.start ?? suggestions.start ?? s.default;
    const n = Number(raw);
    if (typeof raw === 'boolean' || !Number.isFinite(n) || n < s.min || n > s.max) throw bad(`Introduce un número entre ${s.min} y ${s.max}.`, 'start');
    start = Math.round(n / s.step) * s.step;
  }
  const startDate = b.startDate ?? current?.startDate ?? today;
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(new Date(`${startDate}T00:00:00Z`).getTime())
    || startDate < addDays(today, -30) || startDate > addDays(today, 60)) {
    throw bad('Elige una fecha entre los últimos 30 días y los próximos 60.', 'startDate');
  }
  const epw = b.exercisePerWeek ?? current?.exercisePerWeek ?? 3;
  const exercisePerWeek = Number(epw);
  if (typeof epw === 'boolean' || !Number.isInteger(exercisePerWeek) || exercisePerWeek < 0 || exercisePerWeek > 21) throw bad('Introduce un número entre 0 y 21.', 'exercisePerWeek');
  return { strategy: strategy.id, startDate, target, start, exercisePerWeek };
}

/**
 * Guarda el objetivo (nueva versión si algo cambió), su versión de plan y las metas semanales.
 * Idempotente: el mismo contenido no crea versiones nuevas. `q` es una transacción de servicio.
 */
export async function saveGoalAndPlan(q, def, userId, goal, reason) {
  const cur = await q.one('select * from public.user_goals where user_id = $1 and program_slug = $2 and superseded_at is null', [userId, def.slug]);
  const same = cur && cur.strategy === goal.strategy && cur.start_date === goal.startDate && cur.exercise_per_week === goal.exercisePerWeek
    && Number(cur.settings?.target) === goal.target && (cur.settings?.start ?? null) === goal.start;
  const { assessmentId, answers } = await loadAnswers(q, userId, def.slug);
  let changed = false;
  if (!same) {
    changed = true;
    if (cur) await q.exec('update public.user_goals set superseded_at = now() where id = $1', [cur.id]);
    await q.exec(`insert into public.user_goals (user_id, program_slug, strategy, start_date, max_daily, exercise_per_week, settings)
      values ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, def.slug, goal.strategy, goal.startDate, Number.isInteger(goal.target) && goal.target <= 200 ? goal.target : null,
      goal.exercisePerWeek, JSON.stringify({ target: goal.target, start: goal.start })]);
  }
  // Plan versionado (historial). Un plan heredado con otro esquema también se reemplaza.
  const strategy = def.strategies.find((s) => s.id === goal.strategy);
  const baseline = def.baseline(answers);
  const data = {
    program: def.slug, strategy: { id: strategy.id, name: strategy.name, description: strategy.description },
    target: goal.target, start: goal.start, startDate: goal.startDate, exercisePerWeek: goal.exercisePerWeek,
    baseline, tools: def.urge.techniques.map((t) => ({ id: t.id, name: t.label, detail: t.detail })),
    weeks: def.weeklyTasks.length,
  };
  let plan = await q.one('select * from public.personalized_plans where user_id = $1 and program_slug = $2', [userId, def.slug]);
  const planData = plan && (await q.one('select data from public.plan_versions where plan_id = $1 and version = $2', [plan.id, plan.current_version]))?.data;
  if (!plan) {
    plan = await q.one('insert into public.personalized_plans (user_id, program_slug, assessment_id) values ($1, $2, $3) returning *', [userId, def.slug, assessmentId]);
    await q.exec('insert into public.plan_versions (plan_id, version, data, reason) values ($1, $2, $3, $4)', [plan.id, plan.current_version, JSON.stringify(data), reason]);
  } else if (changed || planData?.program !== def.slug) {
    plan = await q.one('update public.personalized_plans set current_version = current_version + 1, assessment_id = coalesce($2, assessment_id) where id = $1 returning *', [plan.id, assessmentId]);
    await q.exec('insert into public.plan_versions (plan_id, version, data, reason) values ($1, $2, $3, $4)', [plan.id, plan.current_version, JSON.stringify(data), reason]);
  }
  // Metas semanales: se retiran las pendientes que no son de este programa y se añaden las que faltan.
  await q.exec('delete from public.daily_goals where user_id = $1 and program_slug = $2 and done_at is null and title <> all($3::text[])',
    [userId, def.slug, def.weeklyTasks.map((t) => t.title)]);
  for (const t of def.weeklyTasks) {
    await q.exec(`insert into public.daily_goals (user_id, program_slug, week, title, detail)
      select $1, $2, $3, $4, $5 where not exists (select 1 from public.daily_goals where user_id = $1 and program_slug = $2 and title = $4)`,
    [userId, def.slug, t.week, t.title, t.detail]);
  }
  return { changed, plan: data };
}

// ---------------------------------------------------------------- datos y agregaciones
/** Registros del programa y datos transversales entre dos días locales (inclusive). */
export async function loadRange(q, def, userId, tz, from, to) {
  const lo = `($4::date)::timestamp at time zone $3`;
  const hi = `(($5::date) + 1)::timestamp at time zone $3`;
  const rows = await q.rows(`
    select id, kind, value, occurred_at, to_char((occurred_at at time zone $3)::date, 'YYYY-MM-DD') as day
    from public.program_activity_entries
    where user_id = $1 and program_slug = $2 and kind in ($6, 'urge', 'checkin') and occurred_at >= ${lo} and occurred_at < ${hi}
    order by occurred_at limit 20000`, [userId, def.slug, tz, from, to, def.log.kind]);
  const moods = await q.rows(`select to_char(day, 'YYYY-MM-DD') as day, mood from public.mood_entries
    where user_id = $1 and program_slug = $2 and day between $3::date and $4::date`, [userId, def.slug, from, to]);
  const breathing = await q.rows(`select exercise_slug, completed_at, to_char((completed_at at time zone $3)::date, 'YYYY-MM-DD') as day
    from public.breathing_sessions where user_id = $1 and program_slug = $2 and completed_at is not null
      and completed_at >= ${lo} and completed_at < ${hi} order by completed_at`, [userId, def.slug, tz, from, to]);
  return {
    logs: rows.filter((r) => r.kind === def.log.kind),
    urges: rows.filter((r) => r.kind === 'urge'),
    checkins: rows.filter((r) => r.kind === 'checkin'),
    moods: new Map(moods.map((m) => [m.day, m.mood])),
    breathing,
  };
}

const groupByDay = (rows) => {
  const m = new Map();
  for (const r of rows) (m.get(r.day) ?? m.set(r.day, []).get(r.day)).push(r);
  return m;
};

function rowFor(def, goal, day, { logs = [], urges = [], checkedIn = false, mood = null }) {
  const vals = logs.map((e) => def.metric.value(e.value)).filter((v) => v != null);
  let value = null;
  if (vals.length) value = def.metric.aggregate === 'avg' ? mean(vals) : def.metric.aggregate === 'last' ? vals.at(-1) : sum(vals);
  if (value != null) value = round2(value);
  if (value == null && checkedIn) value = def.checkin.value;
  const target = def.metric.targetFor(day, goal);
  let status = 'none';
  if (value != null) {
    const tol = def.metric.tolerance ?? 0;
    const ok = def.metric.direction === 'min' ? value >= target - tol : value <= target + tol;
    status = ok ? 'ok' : 'warn';
  } else if (checkedIn && def.checkin.status !== 'none') status = 'ok';
  const quality = logs.length ? Number(logs.at(-1).value?.calidad) : NaN;
  return {
    day, value, target, status, tracked: logs.length > 0 || checkedIn, checkedIn,
    urges: urges.length, urgesResolved: urges.filter((u) => u.value?.outcome === 'resolved').length,
    mood, entries: logs, quality: Number.isFinite(quality) ? quality : null,
  };
}

/** Serie diaria cronológica entre dos días. */
export function buildDays(def, goal, data, from, to) {
  const logs = groupByDay(data.logs);
  const urges = groupByDay(data.urges);
  const checks = new Set(data.checkins.map((c) => c.day));
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(rowFor(def, goal, d, { logs: logs.get(d), urges: urges.get(d), checkedIn: checks.has(d), mood: data.moods.get(d) ?? null }));
  }
  return out;
}

/** Fila de un solo día (para decidir si un check-in es compatible con los registros). */
export const dayRowOf = (def, goal, day, data) => buildDays(def, goal, data, day, day)[0];

export function computeStreak(def, goal, days, today) {
  const span = days.filter((d) => d.day >= goal.startDate && d.day <= today);
  const best = longestRun(span, (d) => d.status === 'ok');
  let i = span.length - 1;
  if (i >= 0 && span[i].day === today && span[i].status === 'none') i -= 1; // hoy todavía sin registrar: no corta la racha
  let current = 0;
  for (; i >= 0 && span[i].status === 'ok'; i -= 1) current += 1;
  return { current, best, label: def.streakLabel(goal) };
}

// ---------------------------------------------------------------- totales, insights, progreso
function periodContext(def, c, from, to, periodLabel) {
  const period = c.days.filter((d) => d.day >= from && d.day <= to);
  const week = c.days.filter((d) => d.day > addDays(c.today, -7) && d.day <= c.today);
  const urges = c.data.urges.filter((u) => u.day >= from && u.day <= to);
  return {
    period, week, days: period, goal: c.goal, baseline: c.baseline, currency: c.currency, periodLabel, today: c.today,
    entries: c.data.logs.filter((e) => e.day >= from && e.day <= to),
    urges: urges.length, urgesResolved: urges.filter((u) => u.value?.outcome === 'resolved').length,
    breathing: c.data.breathing.filter((b) => b.day >= from && b.day <= to).length,
    exercisesThisWeek: c.data.breathing.filter((b) => b.day > addDays(c.today, -7)).length,
    todayValue: c.days.at(-1)?.value ?? null,
  };
}

export function totalsFor(def, c, from, to, periodLabel) {
  const p = periodContext(def, c, from, to, periodLabel);
  const tracked = p.period.filter((d) => d.tracked);
  return {
    cards: def.totals(p),
    period: { from, to, days: p.period.length },
    trackedDays: tracked.length, okDays: tracked.filter((d) => d.status === 'ok').length,
    urges: p.urges, urgesResolved: p.urgesResolved, breathing: p.breathing,
  };
}

function genericInsights(def, p) {
  const out = [];
  const m = def.metric;
  const unit = m.unit;
  const tracked = p.days.filter((d) => d.tracked && d.value != null);
  if (!p.days.some((d) => d.tracked)) return ['Todavía no hay registros en este período. Con unos días de datos empezarás a ver tus patrones.'];
  if (tracked.length < 3) out.push('Aún hay pocos registros para sacar conclusiones. Con una semana de datos verás mucho más claro.');
  // Esta semana frente a la anterior (solo con datos suficientes en ambas).
  const last7 = p.week.filter((d) => d.tracked && d.value != null);
  const prev7 = p.allDays.filter((d) => d.day <= addDays(p.today, -7) && d.day > addDays(p.today, -14) && d.tracked && d.value != null);
  if (last7.length >= 3 && prev7.length >= 3) {
    const a = mean(last7.map((d) => d.value));
    const b = mean(prev7.map((d) => d.value));
    const better = m.direction === 'min' ? a > b : a < b;
    const diff = Math.abs(a - b);
    if (diff >= 0.1) {
      out.push(`Tu promedio de los últimos 7 días fue de ${round1(a)} ${unit} por día registrado, frente a ${round1(b)} la semana anterior${better ? ': vas en la dirección que buscas.' : '. Un dato más, no un juicio: mira qué cambió esos días.'}`);
    }
  }
  // Día de la semana con más carga (o menos horas de sueño).
  if (tracked.length >= 10) {
    const by = {};
    for (const d of tracked) (by[weekdayOf(d.day)] ??= []).push(d.value);
    const overall = mean(tracked.map((d) => d.value));
    const ranked = Object.entries(by).filter(([, xs]) => xs.length >= 2).map(([wd, xs]) => [Number(wd), mean(xs)])
      .sort((x, y) => (m.direction === 'min' ? x[1] - y[1] : y[1] - x[1]));
    const top = ranked[0];
    if (top) {
      const worse = m.direction === 'min' ? top[1] <= overall * 0.85 : top[1] >= overall * 1.25 && top[1] - overall >= 0.5;
      if (worse) out.push(m.direction === 'min'
        ? `Los ${WEEKDAY_NAMES[top[0]]} sueles dormir menos (${round1(top[1])} ${unit} de media frente a ${round1(overall)}). Puedes preparar esa noche con antelación.`
        : `Los ${WEEKDAY_NAMES[top[0]]} suelen ser tus días con más carga (${round1(top[1])} ${unit} de media frente a ${round1(overall)}). Puedes preparar un plan para ese día.`);
    }
  }
  if (p.topTriggers[0]?.count >= 3) out.push(`Lo que más aparece en tus registros es «${p.topTriggers[0].label}» (${p.topTriggers[0].count} veces). Conocerlo te ayuda a preparar una alternativa.`);
  if (p.urges > 0) out.push(`Pasaste por ${p.urges} ${p.urges === 1 ? 'momento difícil' : 'momentos difíciles'} y en ${p.urgesResolved} saliste adelante con una técnica. Cada vez es más fácil reconocerlos.`);
  if (p.streak.current >= 2) out.push(`Tu racha actual es de ${p.streak.current} ${p.streak.label}.`);
  return out;
}

export function topTriggers(def, data, from) {
  const counts = new Map();
  const label = (id) => def.triggers.find((t) => t.id === id)?.label ?? def.urge.feelings.find((t) => t.id === id)?.label ?? null;
  const add = (id) => { if (id && label(id)) counts.set(id, (counts.get(id) ?? 0) + 1); };
  for (const e of data.logs) if (e.day >= from && def.triggerField) add(e.value?.[def.triggerField]);
  for (const u of data.urges) if (u.day >= from) add(u.value?.feeling);
  return [...counts].map(([id, count]) => ({ id, label: label(id), count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

export function byWeekday(def, days) {
  const by = Array.from({ length: 7 }, () => []);
  for (const d of days) if (d.tracked && d.value != null) by[weekdayOf(d.day)].push(d.value);
  // Lunes primero.
  return [1, 2, 3, 4, 5, 6, 0].map((wd) => ({ weekday: wd === 0 ? 7 : wd, label: WEEKDAY_SHORT[wd], average: by[wd].length ? round2(mean(by[wd])) : null, days: by[wd].length }));
}

export function timeline(def, data, from, limit = 40) {
  const feel = (id) => def.urge.feelings.find((f) => f.id === id)?.label ?? id;
  const events = [
    ...data.logs.filter((e) => e.day >= from).map((e) => ({ type: 'log', at: e.occurred_at, day: e.day, title: safeSummary(def, e.value), id: e.id })),
    ...data.urges.filter((e) => e.day >= from).map((e) => ({ type: 'urge', at: e.occurred_at, day: e.day, id: e.id,
      title: `${def.urge.cta}: ${feel(e.value?.feeling)}`, detail: e.value?.outcome === 'resolved' ? def.urge.resolvedLabel : e.value?.outcome === 'continued' ? def.urge.continuedLabel : null })),
    ...data.checkins.filter((e) => e.day >= from).map((e) => ({ type: 'checkin', at: e.occurred_at, day: e.day, title: def.checkin.doneLabel, id: e.id })),
    ...data.breathing.filter((b) => b.day >= from).map((b) => ({ type: 'breathing', at: b.completed_at, day: b.day, title: 'Ejercicio de respiración', detail: b.exercise_slug })),
  ];
  return events.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
}

export function insightsFor(def, c, from, to) {
  const p = periodContext(def, c, from, to, '');
  p.allDays = c.days;
  p.topTriggers = topTriggers(def, c.data, from);
  p.streak = c.streak;
  const texts = [...genericInsights(def, p)];
  try { texts.push(...(def.insights?.(p) ?? [])); } catch { /* una pista menos, nunca un error */ }
  // Cifras en español (coma decimal).
  return texts.map((text) => ({ text: text.replace(/(\d)\.(\d)/g, '$1,$2') }));
}

// ---------------------------------------------------------------- contexto completo
/**
 * Carga todo lo necesario (objetivo, plan, 400 días de datos) y calcula la serie y la racha.
 * `q` es una consulta con el rol del usuario (RLS).
 */
export async function loadContext(q, def, { userId, tz, today, currency }) {
  const goal = await loadGoal(q, def, userId);
  const plan = await loadPlan(q, def, userId);
  const from = addDays(today, -(WINDOW_DAYS - 1));
  const data = await loadRange(q, def, userId, tz, from, today);
  const eff = goal ?? defaultGoal(def, today);
  const days = buildDays(def, eff, data, from, today);
  return { def, userId, goal, plan, baseline: plan?.baseline ?? null, data, days, today, from, currency, effGoal: eff,
    streak: computeStreak(def, eff, days, today) };
}

// ---------------------------------------------------------------- logros
export async function seedCompanionAchievements(db) {
  let i = 0;
  for (const def of Object.values(COMPANIONS)) {
    i += 1;
    let pos = 0;
    // Retira logros que ya no están en la definición (y sus concesiones) para que el total sea el real.
    const slugs = def.achievements.map((a) => a.slug);
    await db.service.exec(`delete from public.user_achievements where achievement_slug in
      (select slug from public.achievements where program_slug = $1 and slug <> all($2::text[]))`, [def.slug, slugs]);
    await db.service.exec('delete from public.achievements where program_slug = $1 and slug <> all($2::text[])', [def.slug, slugs]);
    for (const a of def.achievements) {
      pos += 1;
      await db.service.exec(`insert into public.achievements (slug, title, description, icon, position, program_slug)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (slug) do update set title = excluded.title, description = excluded.description,
          icon = excluded.icon, position = excluded.position, program_slug = excluded.program_slug`,
      [a.slug, a.title, a.description, a.icon, i * 100 + pos, def.slug]);
    }
  }
}

export async function loadFacts(q, c) {
  const { def, goal, days, data, today } = c;
  const counts = await q.one(`select
    (select count(*) from public.breathing_sessions where user_id = $1 and program_slug = $2 and completed_at is not null)::int as breathing,
    (select count(*) from public.user_lesson_progress p join public.journey_lessons l on l.id = p.lesson_id
       join public.journey_chapters ch on ch.id = l.chapter_id join public.journey_programs j on j.id = ch.program_id
       where p.user_id = $1 and p.status = 'completed' and j.slug = $2)::int as lessons,
    (select count(*) from public.user_chapter_progress p join public.journey_chapters ch on ch.id = p.chapter_id
       join public.journey_programs j on j.id = ch.program_id where p.user_id = $1 and p.status = 'completed' and j.slug = $2)::int as chapters,
    (select count(*) from public.daily_goals where user_id = $1 and program_slug = $2 and done_at is not null)::int as tasks_done`,
  [c.userId, def.slug]);
  const since = goal ? days.filter((d) => d.day >= goal.startDate) : [];
  const techniques = new Set([
    ...data.logs.map((e) => e.value?.tecnica).filter((t) => t && t !== 'ninguna'),
    ...data.urges.map((u) => u.value?.technique).filter(Boolean),
  ]);
  const facts = {
    hasGoal: Boolean(goal),
    daysSinceStart: goal ? daysBetween(goal.startDate, today) + 1 : 0,
    logs: data.logs.length, checkins: data.checkins.length,
    trackedDays: days.filter((d) => d.tracked).length,
    okDays: since.filter((d) => d.status === 'ok').length,
    zeroDays: days.filter((d) => d.tracked && d.value === 0).length,
    bestZeroStreak: longestRun(since, (d) => d.tracked && d.value === 0),
    bestStreak: c.streak.best, currentStreak: c.streak.current,
    urges: data.urges.length, urgesResolved: data.urges.filter((u) => u.value?.outcome === 'resolved').length,
    techniques: techniques.size, moods: data.moods.size,
    breathing: counts.breathing, lessons: counts.lessons, chapters: counts.chapters, tasksDone: counts.tasks_done,
    days, entries: data.logs.map((e) => ({ day: e.day, value: e.value })),
  };
  return { ...facts, ...(def.extraFacts?.(facts) ?? {}) };
}

/**
 * Concede los logros del programa que ya se cumplen (nunca dos veces: clave user_id + slug).
 * Lee con el rol del usuario y escribe con el de servicio; devuelve los recién desbloqueados.
 */
export async function checkProgramAchievements(db, def, { userId, tz, today, currency }) {
  const facts = await db.asUser(userId, async (q) => loadFacts(q, await loadContext(q, def, { userId, tz, today, currency })));
  const earned = def.achievements.filter((a) => a.rule(facts));
  if (!earned.length) return [];
  const rows = await db.service.rows(`insert into public.user_achievements (user_id, achievement_slug)
    select $1, unnest($2::text[]) on conflict do nothing returning achievement_slug`, [userId, earned.map((a) => a.slug)]);
  const fresh = new Set(rows.map((r) => r.achievement_slug));
  return earned.filter((a) => fresh.has(a.slug)).map(({ slug, title, description, icon }) => ({ slug, title, description, icon }));
}

export const entryView = (def, e) => ({ id: e.id, at: e.occurred_at, value: e.value, summary: safeSummary(def, e.value) });

export async function achievementsView(q, def, userId) {
  const rows = await q.rows(`select a.slug, a.title, a.description, a.icon, ua.unlocked_at
    from public.achievements a left join public.user_achievements ua on ua.achievement_slug = a.slug and ua.user_id = $1
    where a.program_slug = $2 order by a.position`, [userId, def.slug]);
  return rows.map((r) => ({ slug: r.slug, title: r.title, description: r.description, icon: r.icon, unlocked: Boolean(r.unlocked_at), unlockedAt: r.unlocked_at ?? null }));
}

// ---------------------------------------------------------------- panel
export async function dashboardView(q, def, c, { program, entitlement, user, config }) {
  const { goal, days, today } = c;
  const todayRow = days.at(-1);
  const from = goal.startDate > today ? today : (goal.startDate < c.from ? c.from : goal.startDate);
  const week = days.slice(-7);
  const journey = await JourneyEngine.getJourneyState(q, c.userId, def.slug);
  // Metas do plano são do sistema: uma semana encerrada fecha as metas dela.
  await q.exec('update public.daily_goals set done_at = now() where user_id = $1 and program_slug = $2 and done_at is null and week <= $3',
    [c.userId, def.slug, Math.floor(daysBetween(goal.startDate, today) / 7)]);
  const tasks = await q.rows('select id, week, title, detail, done_at from public.daily_goals where user_id = $1 and program_slug = $2 order by week, created_at', [c.userId, def.slug]);
  const maxWeek = Math.max(1, ...tasks.map((t) => t.week));
  const weekNumber = Math.min(maxWeek, Math.max(1, Math.floor(daysBetween(goal.startDate, today) / 7) + 1));
  const ach = await achievementsView(q, def, c.userId);
  const unlocked = ach.filter((a) => a.unlocked).sort((a, b) => new Date(b.unlockedAt) - new Date(a.unlockedAt));
  const exercisesThisWeek = c.data.breathing.filter((b) => b.day > addDays(today, -7)).length;
  const label = daysBetween(goal.startDate, today) < 0 ? 'desde que empiece tu plan' : 'desde que empezaste';
  const strategy = def.strategies.find((s) => s.id === goal.strategy);
  const ctx = periodContext(def, c, from, today, label);
  return {
    program: { slug: def.slug, name: program?.name ?? def.slug, tagline: program?.tagline ?? def.ui.tagline, color: program?.color ?? null, icon: program?.icon ?? null, theme: program?.theme ?? 'light' },
    user: { name: user?.name ?? null },
    today,
    dayNumber: daysBetween(goal.startDate, today) + 1,
    startDate: goal.startDate,
    strategy: { id: strategy.id, name: strategy.name, description: strategy.description },
    goal: { strategy: goal.strategy, startDate: goal.startDate, target: goal.target, start: goal.start, exercisePerWeek: goal.exercisePerWeek },
    todayStatus: {
      value: todayRow.value, unit: def.metric.unit, label: def.metric.todayLabel, target: todayRow.target, direction: def.metric.direction,
      status: todayRow.status, checkedIn: todayRow.checkedIn, urges: todayRow.urges, urgesResolved: todayRow.urgesResolved,
      mood: todayRow.mood, entries: todayRow.entries.map((e) => entryView(def, e)),
    },
    week: week.map((d) => ({ day: d.day, value: d.value, target: d.target, status: d.status })),
    weekMeta: { label: def.metric.weekLabel, unit: def.metric.unit, format: def.metric.format, direction: def.metric.direction },
    totals: { cards: def.totals(ctx), periodLabel: label },
    streak: c.streak,
    journey: {
      nextLesson: journey.nextLesson,
      currentChapter: journey.currentChapter && {
        slug: journey.currentChapter.slug, number: journey.currentChapter.number, title: journey.currentChapter.title,
        completedLessons: journey.currentChapter.completedLessons, totalLessons: journey.currentChapter.lessons.length,
      },
      totals: journey.totals,
    },
    recommendedExercise: def.recommendedExercise({ todayValue: todayRow.value, exercisesThisWeek }),
    exercises: { thisWeek: exercisesThisWeek, goal: goal.exercisePerWeek },
    weekNumber,
    tasks: tasks.map((t) => ({ id: t.id, week: t.week, title: t.title, detail: t.detail, done: Boolean(t.done_at) })),
    logForm: logFormView(def),
    urgeForm: urgeFormView(def),
    checkinLabel: def.checkin.label,
    achievements: { unlocked: unlocked.length, total: ach.length, recent: unlocked.slice(0, 3).map((a) => ({ slug: a.slug, title: a.title, icon: a.icon })) },
    subscription: { status: entitlement.access_status, provider: entitlement.billing_provider, currentPeriodEnd: entitlement.current_period_end, cancelAtPeriodEnd: entitlement.cancel_at_period_end },
    safety: def.safety,
    ui: def.ui,
    currency: config.currency, locale: config.locale,
  };
}

export async function progressView(def, c, rangeDays, { config }) {
  const { today, days } = c;
  const from = addDays(today, -(rangeDays - 1));
  const series = days.filter((d) => d.day >= from).map((d) => ({
    day: d.day, value: d.value, target: d.target, status: d.status, urges: d.urges, urgesResolved: d.urgesResolved, checkedIn: d.checkedIn, mood: d.mood,
  }));
  return {
    range: { days: rangeDays, from, to: today },
    program: def.slug,
    metric: { id: def.metric.id, label: def.metric.weekLabel, unit: def.metric.unit, format: def.metric.format, direction: def.metric.direction },
    series,
    totals: totalsFor(def, c, from, today, `últimos ${rangeDays} días`),
    streak: c.streak,
    byWeekday: byWeekday(def, days.filter((d) => d.day >= from)),
    topTriggers: topTriggers(def, c.data, from),
    timeline: timeline(def, c.data, from),
    insights: insightsFor(def, c, from, today),
    currency: config.currency, locale: config.locale,
  };
}

export { MAX_LOGS_PER_DAY };
