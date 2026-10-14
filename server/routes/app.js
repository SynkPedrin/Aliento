// Área premium: onboarding, panel, jornada, registros, objetivos, respiración, diario, progreso,
// logros, notificaciones y guía de apoyo. Todo dato personal se consulta con el rol del usuario (RLS).
import { Router } from 'express';
import { TRIGGERS } from '../quiz.js';
import { STRATEGIES } from '../results.js';
import { buildPersonalPlan } from '../billing.js';
import { checkAchievements } from '../services/achievements.js';
import { completeLesson, getLesson, journeyState, saveResponse } from '../services/journey.js';
import { addDays, dailySeries, daysBetween, planContext, summarize, todayIn } from '../services/stats.js';
import { SUPPORT_TOPICS } from '../services/support.js';
import { DAY_RE, HttpError, int, oneOf, requireAccess, text, uuid, wrap } from './util.js';
import { subscriptionView } from './account.js';

export const MOODS = ['muy-bien', 'bien', 'regular', 'mal', 'muy-mal'];
export const FEELINGS = ['ansiedad', 'estres', 'aburrimiento', 'tristeza', 'enojo', 'cansancio', 'alegria', 'costumbre'];
const TRIGGER_IDS = [...Object.keys(TRIGGERS), 'otro'];
const RANGES = { 7: 7, 30: 30, 90: 90, 365: 365 };

export function appRoutes({ db, billing, config, notifier }) {
  const r = Router();
  r.use(requireAccess(billing));

  const tz = (req) => req.user.timezone || 'UTC';
  const asUser = (req, fn) => db.asUser(req.user.id, fn);
  const achievementsAfter = async (req) => {
    const unlocked = await checkAchievements(db.service, req.user.id, tz(req));
    notifier?.notifyAchievements(req.user.id, unlocked);
    return unlocked;
  };

  function localDay(value, req, field = 'day') {
    if (!DAY_RE.test(value ?? '')) throw new HttpError(422, 'Fecha no válida.', 'INVALID', { field });
    const today = todayIn(tz(req));
    if (value > today || value < addDays(today, -400)) throw new HttpError(422, 'La fecha no puede ser futura.', 'INVALID', { field });
    return value;
  }

  function instant(value, req) {
    const d = value ? new Date(value) : new Date();
    if (Number.isNaN(d.getTime()) || d > new Date(Date.now() + 5 * 60_000) || d < new Date(Date.now() - 400 * 86400_000)) {
      throw new HttpError(422, 'Fecha y hora no válidas.', 'INVALID', { field: 'at' });
    }
    return d.toISOString();
  }

  // ---------------------------------------------------------------- configuración inicial
  async function onboardingView(req) {
    return asUser(req, async (q) => {
      const goal = await q.one('select * from public.user_goals where user_id = $1 and superseded_at is null', [req.user.id]);
      const prefs = await q.one('select * from public.notification_preferences where user_id = $1', [req.user.id]);
      const prof = await db.service.one('select onboarded_at from public.profiles where user_id = $1', [req.user.id]);
      return {
        goal: goal?.strategy ?? null,
        startDate: goal?.start_date ?? null,
        quitDate: goal?.quit_date ?? null,
        notifications: prefs && { enabled: prefs.enabled, time: prefs.reminder_time.slice(0, 5) },
        completed: Boolean(prof?.onboarded_at),
        strategies: Object.values(STRATEGIES),
        planReady: Boolean(goal),
      };
    });
  }

  r.get('/onboarding', wrap(async (req, res) => res.json(await onboardingView(req))));

  r.put('/onboarding', wrap(async (req, res) => {
    const { goal, startDate, notifications, complete } = req.body ?? {};
    const userId = req.user.id;
    if (goal !== undefined) {
      if (!STRATEGIES[goal]) throw new HttpError(422, 'Meta no válida.');
      await changeStrategy(userId, goal, 'Meta confirmada en la configuración inicial');
    }
    if (startDate !== undefined) {
      const today = todayIn(tz(req));
      if (!DAY_RE.test(startDate) || startDate < today || daysBetween(today, startDate) > 60) {
        throw new HttpError(422, 'Elige una fecha entre hoy y los próximos 60 días.');
      }
      await updateGoal(req, { start_date: startDate });
    }
    if (notifications !== undefined) {
      const time = notifications?.time ?? '09:00';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(422, 'Hora no válida.');
      await asUser(req, (q) => q.exec(`
        insert into public.notification_preferences (user_id, enabled, consent_at, timezone, reminder_time)
        values ($1, $2, case when $2 then now() end, $3, $4)
        on conflict (user_id) do update set enabled = excluded.enabled, reminder_time = excluded.reminder_time,
          timezone = excluded.timezone, consent_at = case when excluded.enabled then coalesce(public.notification_preferences.consent_at, now()) else public.notification_preferences.consent_at end`,
      [userId, Boolean(notifications?.enabled), tz(req), time]));
    }
    if (complete === true) await db.service.exec('update public.profiles set onboarded_at = coalesce(onboarded_at, now()) where user_id = $1', [userId]);
    res.json(await onboardingView(req));
  }));

  /** Cambia la estrategia: nueva versión del plan (historial) y del objetivo. */
  async function changeStrategy(userId, strategy, reason) {
    await db.tx(async (q) => {
      const plan = await q.one(`select v.data, p.assessment_id from public.personalized_plans p
        join public.plan_versions v on v.plan_id = p.id and v.version = p.current_version where p.user_id = $1`, [userId]);
      if (!plan || plan.data.strategy.id === strategy) return;
      const assessment = await q.one('select * from public.user_assessments where id = $1', [plan.assessment_id]);
      if (assessment) await buildPersonalPlan(q, userId, assessment, { strategyOverride: strategy, reason });
    });
  }

  /** Nueva versión del objetivo con los cambios indicados; la anterior queda en el historial. */
  async function updateGoal(req, changes) {
    return asUser(req, async (q) => {
      const cur = await q.one('select * from public.user_goals where user_id = $1 and superseded_at is null', [req.user.id]);
      if (!cur) throw new HttpError(409, 'Tu plan todavía se está preparando.', 'PLAN_PENDING');
      const next = { ...cur, ...changes };
      const same = ['strategy', 'start_date', 'quit_date', 'max_daily', 'exercise_per_week', 'money_goal', 'money_goal_label']
        .every((k) => String(cur[k] ?? '') === String(next[k] ?? ''));
      if (same) return cur;
      await q.exec('update public.user_goals set superseded_at = now() where id = $1', [cur.id]);
      return q.one(`insert into public.user_goals (user_id, strategy, start_date, quit_date, max_daily, exercise_per_week, money_goal, money_goal_label)
        values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [req.user.id, next.strategy, next.start_date, next.quit_date, next.max_daily, next.exercise_per_week, next.money_goal, next.money_goal_label]);
    });
  }

  // ---------------------------------------------------------------- panel
  r.get('/dashboard', wrap(async (req, res) => {
    const userId = req.user.id;
    const today = todayIn(tz(req));
    const data = await asUser(req, async (q) => {
      const ctx = await planContext(q, userId);
      if (!ctx) throw new HttpError(409, 'Estamos preparando tu plan.', 'PLAN_PENDING');
      const prof = await db.service.one('select onboarded_at from public.profiles where user_id = $1', [userId]);
      if (!prof?.onboarded_at) throw new HttpError(409, 'Completa la configuración inicial.', 'ONBOARDING_REQUIRED');
      const week = await dailySeries(q, userId, tz(req), addDays(today, -6), today);
      const since = await dailySeries(q, userId, tz(req), ctx.goal.start_date < today ? ctx.goal.start_date : today, today);
      const journey = await journeyState(q, userId);
      const todayRow = week.at(-1);
      const tasks = await q.rows(`select id, week, title, detail, done_at from public.daily_goals where user_id = $1 order by week, created_at`, [userId]);
      const exercisesThisWeek = week.reduce((a, d) => a + d.breathing, 0);
      return {
        user: { name: req.user.name },
        today,
        dayNumber: daysBetween(ctx.goal.start_date, today) + 1,
        startDate: ctx.goal.start_date,
        strategy: ctx.strategy,
        goal: { maxDaily: ctx.goal.max_daily, quitDate: ctx.goal.quit_date, exercisePerWeek: ctx.goal.exercise_per_week },
        todayStatus: {
          cigarettes: todayRow.cigarettes, target: ctx.targetFor(today), checkedIn: todayRow.checked_in,
          cravings: todayRow.cravings, resisted: todayRow.resisted, mood: todayRow.mood,
        },
        week: week.map((d) => ({ day: d.day, cigarettes: d.has_entries || d.checked_in ? d.cigarettes : null, target: ctx.targetFor(d.day) })),
        totals: summarize(since, ctx),
        exercises: { thisWeek: exercisesThisWeek, goal: ctx.goal.exercise_per_week },
        recommendedExercise: todayRow.cravings > todayRow.resisted ? 'calma-4-6' : exercisesThisWeek % 2 ? 'caja-4-4' : 'calma-4-6',
        journey: { nextLesson: journey.nextLesson, currentChapter: journey.currentChapter && {
          slug: journey.currentChapter.slug, number: journey.currentChapter.number, title: journey.currentChapter.title,
          completedLessons: journey.currentChapter.completedLessons, totalLessons: journey.currentChapter.lessons.length,
        }, totals: journey.totals },
        tasks: tasks.map((t) => ({ ...t, done: Boolean(t.done_at) })),
      };
    });
    const sub = await billing.activeSubscription(userId);
    res.json({ ...data, currency: config.currency, locale: config.locale, subscription: subscriptionView(sub),
      triggerOptions: Object.entries(TRIGGERS).map(([id, t]) => ({ id, label: t.label })) });
  }));

  r.patch('/tasks/:id', wrap(async (req, res) => {
    const id = uuid(req.params.id);
    const n = await asUser(req, (q) => q.exec('update public.daily_goals set done_at = $1 where id = $2 and user_id = $3',
      [req.body?.done ? new Date().toISOString() : null, id, req.user.id]));
    if (!n) throw new HttpError(404, 'Meta no encontrada.');
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- jornada
  r.get('/journey', wrap(async (req, res) => {
    res.json(await asUser(req, (q) => journeyState(q, req.user.id)));
  }));

  r.get('/journey/lessons/:slug', wrap(async (req, res) => {
    res.json(await asUser(req, (q) => getLesson(q, req.user.id, String(req.params.slug))));
  }));

  r.post('/journey/lessons/:slug/responses', wrap(async (req, res) => {
    const blockKey = String(req.body?.blockId ?? '');
    const out = await asUser(req, (q) => saveResponse(q, db.service, req.user.id, String(req.params.slug), blockKey, req.body?.response));
    res.json(out);
  }));

  r.post('/journey/lessons/:slug/complete', wrap(async (req, res) => {
    const out = await asUser(req, (q) => completeLesson(q, db.service, req.user.id, String(req.params.slug)));
    res.json({ ...out, achievements: await achievementsAfter(req) });
  }));

  // ---------------------------------------------------------------- consumo
  const entryView = (e) => ({ id: e.id, at: e.smoked_at, quantity: e.quantity, trigger: e.trigger, mood: e.mood, note: e.note });

  r.get('/smoking', wrap(async (req, res) => {
    const days = RANGES[req.query.days] ?? 7;
    const from = addDays(todayIn(tz(req)), -(days - 1));
    const rows = await asUser(req, (q) => q.rows(`
      select * from public.smoking_entries where user_id = $1 and (smoked_at at time zone $2)::date >= $3::date
      order by smoked_at desc limit 500`, [req.user.id, tz(req), from]));
    const checkins = await asUser(req, (q) => q.rows('select day from public.daily_checkins where user_id = $1 and day >= $2 order by day desc', [req.user.id, from]));
    res.json({ entries: rows.map(entryView), smokeFreeDays: checkins.map((c) => c.day),
      triggerOptions: Object.entries(TRIGGERS).map(([id, t]) => ({ id, label: t.label })), moods: MOODS });
  }));

  function entryInput(body, req) {
    return {
      at: instant(body?.at, req),
      quantity: int(body?.quantity ?? 1, { min: 1, max: 50, field: 'quantity' }),
      trigger: oneOf(body?.trigger, TRIGGER_IDS, 'trigger'),
      mood: oneOf(body?.mood, [...MOODS, ...FEELINGS], 'mood'),
      note: text(body?.note, { max: 500, field: 'note' }),
    };
  }

  r.post('/smoking', wrap(async (req, res) => {
    const e = entryInput(req.body, req);
    const requestId = uuid(req.body?.clientRequestId, 'clientRequestId');
    // Idempotente: el mismo clientRequestId (doble clic o reintento) no crea otra entrada.
    const row = await asUser(req, async (q) => (await q.one(`
      insert into public.smoking_entries (user_id, smoked_at, quantity, trigger, mood, note, client_request_id)
      values ($1, $2, $3, $4, $5, $6, $7) on conflict (user_id, client_request_id) do nothing returning *`,
    [req.user.id, e.at, e.quantity, e.trigger, e.mood, e.note, requestId]))
      ?? q.one('select * from public.smoking_entries where user_id = $1 and client_request_id = $2', [req.user.id, requestId]));
    res.status(201).json({ entry: entryView(row), achievements: await achievementsAfter(req) });
  }));

  r.patch('/smoking/:id', wrap(async (req, res) => {
    const e = entryInput(req.body, req);
    const row = await asUser(req, (q) => q.one(`
      update public.smoking_entries set smoked_at = $1, quantity = $2, trigger = $3, mood = $4, note = $5
      where id = $6 and user_id = $7 returning *`, [e.at, e.quantity, e.trigger, e.mood, e.note, uuid(req.params.id), req.user.id]));
    if (!row) throw new HttpError(404, 'Registro no encontrado.');
    res.json({ entry: entryView(row) });
  }));

  r.delete('/smoking/:id', wrap(async (req, res) => {
    const n = await asUser(req, (q) => q.exec('delete from public.smoking_entries where id = $1 and user_id = $2', [uuid(req.params.id), req.user.id]));
    if (!n) throw new HttpError(404, 'Registro no encontrado.');
    res.json({ ok: true });
  }));

  // "Hoy no he fumado"
  r.post('/checkins', wrap(async (req, res) => {
    const day = localDay(req.body?.day ?? todayIn(tz(req)), req);
    await asUser(req, async (q) => {
      const smoked = await q.one(`select 1 from public.smoking_entries where user_id = $1 and (smoked_at at time zone $2)::date = $3::date limit 1`, [req.user.id, tz(req), day]);
      if (smoked) throw new HttpError(409, 'Ese día ya tiene cigarrillos registrados.', 'HAS_ENTRIES');
      await q.exec('insert into public.daily_checkins (user_id, day) values ($1, $2) on conflict do nothing', [req.user.id, day]);
    });
    res.status(201).json({ ok: true, achievements: await achievementsAfter(req) });
  }));

  r.delete('/checkins/:day', wrap(async (req, res) => {
    await asUser(req, (q) => q.exec('delete from public.daily_checkins where user_id = $1 and day = $2', [req.user.id, localDay(req.params.day, req)]));
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- ganas de fumar
  r.get('/cravings', wrap(async (req, res) => {
    const rows = await asUser(req, (q) => q.rows(`select id, felt_at, feeling, trigger, intensity, outcome, strategy
      from public.craving_entries where user_id = $1 order by felt_at desc limit 100`, [req.user.id]));
    res.json({ cravings: rows, feelings: FEELINGS, triggerOptions: Object.entries(TRIGGERS).map(([id, t]) => ({ id, label: t.label })) });
  }));

  r.post('/cravings', wrap(async (req, res) => {
    const b = req.body ?? {};
    const requestId = uuid(b.clientRequestId, 'clientRequestId');
    const values = [req.user.id, oneOf(b.feeling, FEELINGS, 'feeling'), oneOf(b.trigger, TRIGGER_IDS, 'trigger'),
      int(b.intensity, { min: 1, max: 5, field: 'intensity' }), oneOf(b.outcome, ['resisted', 'smoked'], 'outcome'),
      text(b.strategy, { max: 60 }), requestId];
    const row = await asUser(req, async (q) => (await q.one(`
      insert into public.craving_entries (user_id, feeling, trigger, intensity, outcome, strategy, client_request_id)
      values ($1, $2, $3, $4, $5, $6, $7) on conflict (user_id, client_request_id) do nothing returning *`, values))
      ?? q.one('select * from public.craving_entries where user_id = $1 and client_request_id = $2', [req.user.id, requestId]));
    res.status(201).json({ craving: row, achievements: await achievementsAfter(req) });
  }));

  r.patch('/cravings/:id', wrap(async (req, res) => {
    const row = await asUser(req, (q) => q.one(`update public.craving_entries set outcome = $1, strategy = coalesce($2, strategy)
      where id = $3 and user_id = $4 returning *`,
    [oneOf(req.body?.outcome, ['resisted', 'smoked'], 'outcome'), text(req.body?.strategy, { max: 60 }), uuid(req.params.id), req.user.id]));
    if (!row) throw new HttpError(404, 'Registro no encontrado.');
    res.json({ craving: row, achievements: await achievementsAfter(req) });
  }));

  // ---------------------------------------------------------------- objetivos
  r.get('/goals', wrap(async (req, res) => {
    const rows = await asUser(req, (q) => q.rows('select * from public.user_goals where user_id = $1 order by created_at desc limit 50', [req.user.id]));
    res.json({ current: rows.find((g) => !g.superseded_at) ?? null, history: rows.filter((g) => g.superseded_at), strategies: Object.values(STRATEGIES), currency: config.currency });
  }));

  r.put('/goals', wrap(async (req, res) => {
    const b = req.body ?? {};
    const strategy = oneOf(b.strategy, Object.keys(STRATEGIES), 'strategy');
    if (!strategy) throw new HttpError(422, 'Elige tu objetivo principal.', 'INVALID', { field: 'strategy' });
    const quit = b.quitDate ? b.quitDate : null;
    if (quit && (!DAY_RE.test(quit) || quit < todayIn(tz(req)))) throw new HttpError(422, 'La fecha para dejar de fumar no puede estar en el pasado.', 'INVALID', { field: 'quitDate' });
    const changes = {
      strategy,
      quit_date: quit,
      max_daily: b.maxDaily === '' || b.maxDaily == null ? null : int(b.maxDaily, { min: 0, max: 200, field: 'maxDaily' }),
      exercise_per_week: int(b.exercisePerWeek ?? 3, { min: 0, max: 21, field: 'exercisePerWeek' }),
      money_goal: b.moneyGoal === '' || b.moneyGoal == null ? null : (() => {
        const n = Number(b.moneyGoal);
        if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new HttpError(422, 'Importe no válido.', 'INVALID', { field: 'moneyGoal' });
        return Math.round(n * 100) / 100;
      })(),
      money_goal_label: text(b.moneyGoalLabel, { max: 80, field: 'moneyGoalLabel' }),
    };
    await changeStrategy(req.user.id, strategy, 'Cambio de objetivo');
    const goal = await updateGoal(req, changes);
    res.json({ current: goal });
  }));

  // ---------------------------------------------------------------- respiración
  r.get('/breathing', wrap(async (req, res) => {
    const exercises = await db.service.rows('select slug, name, description, inhale, hold, exhale, hold_after from public.breathing_exercises order by position');
    const recent = await asUser(req, (q) => q.rows(`select exercise_slug, planned_seconds, completed_at from public.breathing_sessions
      where user_id = $1 and completed_at is not null order by completed_at desc limit 10`, [req.user.id]));
    res.json({ exercises, recent });
  }));

  r.post('/breathing/sessions', wrap(async (req, res) => {
    const slug = String(req.body?.exercise ?? '');
    if (!(await db.service.one('select 1 from public.breathing_exercises where slug = $1', [slug]))) throw new HttpError(422, 'Ejercicio no válido.');
    const planned = int(req.body?.plannedSeconds, { min: 30, max: 1800, field: 'plannedSeconds' });
    const row = await asUser(req, (q) => q.one(`insert into public.breathing_sessions (user_id, exercise_slug, planned_seconds)
      values ($1, $2, $3) returning id, started_at`, [req.user.id, slug, planned]));
    res.status(201).json({ session: row });
  }));

  // Solo cuenta como completada si de verdad transcurrió el tiempo (las pausas no cuentan).
  r.post('/breathing/sessions/:id/complete', wrap(async (req, res) => {
    const active = int(req.body?.activeSeconds, { min: 0, max: 3600, field: 'activeSeconds' });
    const row = await asUser(req, async (q) => {
      const s = await q.one('select * from public.breathing_sessions where id = $1 and user_id = $2', [uuid(req.params.id), req.user.id]);
      if (!s) throw new HttpError(404, 'Sesión no encontrada.');
      if (s.completed_at) return s;
      const elapsed = (Date.now() - new Date(s.started_at).getTime()) / 1000;
      if (active < s.planned_seconds * 0.9 || elapsed + 3 < active) {
        throw new HttpError(422, 'La sesión no se completó.', 'INCOMPLETE_SESSION');
      }
      return q.one('update public.breathing_sessions set completed_at = now(), active_seconds = $1 where id = $2 returning *', [active, s.id]);
    });
    res.json({ session: { id: row.id, completedAt: row.completed_at }, achievements: await achievementsAfter(req) });
  }));

  // ---------------------------------------------------------------- diario de ánimo
  r.get('/mood', wrap(async (req, res) => {
    const days = RANGES[req.query.days] ?? 30;
    const from = addDays(todayIn(tz(req)), -(days - 1));
    const rows = await asUser(req, (q) => q.rows(`select day, mood, note, updated_at from public.mood_entries
      where user_id = $1 and day >= $2 order by day desc`, [req.user.id, from]));
    res.json({ entries: rows, today: todayIn(tz(req)) });
  }));

  r.put('/mood/:day', wrap(async (req, res) => {
    const day = localDay(req.params.day, req);
    const mood = int(req.body?.mood, { min: 1, max: 5, field: 'mood' });
    const note = text(req.body?.note, { max: 1000, field: 'note' });
    await asUser(req, (q) => q.exec(`insert into public.mood_entries (user_id, day, mood, note) values ($1, $2, $3, $4)
      on conflict (user_id, day) do update set mood = excluded.mood, note = excluded.note`, [req.user.id, day, mood, note]));
    res.json({ ok: true, achievements: await achievementsAfter(req) });
  }));

  // ---------------------------------------------------------------- progreso
  r.get('/progress', wrap(async (req, res) => {
    const days = RANGES[req.query.days] ?? 30;
    const today = todayIn(tz(req));
    const from = addDays(today, -(days - 1));
    const out = await asUser(req, async (q) => {
      const ctx = await planContext(q, req.user.id);
      if (!ctx) throw new HttpError(409, 'Estamos preparando tu plan.', 'PLAN_PENDING');
      const series = await dailySeries(q, req.user.id, tz(req), from, today);
      const triggers = await q.rows(`
        select trigger, count(*)::int as total from (
          select trigger from public.smoking_entries where user_id = $1 and trigger is not null and (smoked_at at time zone $2)::date >= $3::date
          union all select trigger from public.craving_entries where user_id = $1 and trigger is not null and (felt_at at time zone $2)::date >= $3::date
        ) t group by trigger order by total desc`, [req.user.id, tz(req), from]);
      const goals = await q.rows('select strategy, max_daily, quit_date, created_at, superseded_at from public.user_goals where user_id = $1 order by created_at', [req.user.id]);
      const journey = await journeyState(q, req.user.id);
      return {
        range: { days, from, to: today },
        baseline: ctx.baseline,
        series: series.map((d) => ({
          day: d.day,
          cigarettes: d.has_entries || d.checked_in ? d.cigarettes : null,
          target: ctx.targetFor(d.day),
          cravings: d.cravings, resisted: d.resisted, mood: d.mood, breathing: d.breathing, lessons: d.lessons,
        })),
        summary: summarize(series, ctx),
        triggers: triggers.map((t) => ({ ...t, label: TRIGGERS[t.trigger]?.label ?? 'Otro' })),
        goalHistory: goals,
        journey: { totals: journey.totals, chapters: journey.chapters.map((c) => ({ number: c.number, title: c.title, status: c.status, completedLessons: c.completedLessons, totalLessons: c.lessons.length })) },
      };
    });
    res.json({ ...out, currency: config.currency, locale: config.locale });
  }));

  // ---------------------------------------------------------------- logros
  r.get('/achievements', wrap(async (req, res) => {
    await achievementsAfter(req);
    const rows = await asUser(req, (q) => q.rows(`
      select a.slug, a.title, a.description, a.icon, ua.unlocked_at
      from public.achievements a left join public.user_achievements ua on ua.achievement_slug = a.slug and ua.user_id = $1
      order by a.position`, [req.user.id]));
    res.json({ achievements: rows });
  }));

  // ---------------------------------------------------------------- notificaciones
  const prefsView = (p) => ({
    enabled: p?.enabled ?? false, consentAt: p?.consent_at ?? null, timezone: p?.timezone ?? 'UTC',
    time: (p?.reminder_time ?? '09:00').slice(0, 5), lessons: p?.lessons ?? true, tracking: p?.tracking ?? true,
    exercises: p?.exercises ?? true, achievements: p?.achievements ?? true, weeklySummary: p?.weekly_summary ?? true,
    deliveryAvailable: Boolean(notifier?.enabled), // canal Web Push configurado (claves VAPID)
  });

  r.get('/notifications', wrap(async (req, res) => {
    const p = await asUser(req, (q) => q.one('select * from public.notification_preferences where user_id = $1', [req.user.id]));
    res.json(prefsView(p));
  }));

  r.put('/notifications', wrap(async (req, res) => {
    const b = req.body ?? {};
    const time = b.time ?? '09:00';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(422, 'Hora no válida.', 'INVALID', { field: 'time' });
    const zone = b.timezone ?? tz(req);
    try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { throw new HttpError(422, 'Zona horaria no válida.', 'INVALID', { field: 'timezone' }); }
    const p = await asUser(req, (q) => q.one(`
      insert into public.notification_preferences (user_id, enabled, consent_at, timezone, reminder_time, lessons, tracking, exercises, achievements, weekly_summary)
      values ($1, $2, case when $2 then now() end, $3, $4, $5, $6, $7, $8, $9)
      on conflict (user_id) do update set enabled = excluded.enabled, timezone = excluded.timezone, reminder_time = excluded.reminder_time,
        lessons = excluded.lessons, tracking = excluded.tracking, exercises = excluded.exercises, achievements = excluded.achievements,
        weekly_summary = excluded.weekly_summary,
        consent_at = case when excluded.enabled then coalesce(public.notification_preferences.consent_at, now()) else public.notification_preferences.consent_at end
      returning *`,
    [req.user.id, Boolean(b.enabled), zone, time, b.lessons !== false, b.tracking !== false, b.exercises !== false, b.achievements !== false, b.weeklySummary !== false]));
    res.json(prefsView(p));
  }));

  // ---------------------------------------------------------------- dispositivos (Web Push)
  r.get('/push', wrap(async (req, res) => {
    const devices = await asUser(req, (q) => q.one('select count(*)::int as n from public.push_subscriptions where user_id = $1', [req.user.id]));
    res.json({ available: Boolean(notifier?.enabled), publicKey: notifier?.publicKey || null, devices: devices.n });
  }));

  r.post('/push/subscriptions', wrap(async (req, res) => {
    const { endpoint, keys } = req.body ?? {};
    let url;
    try { url = new URL(endpoint); } catch { throw new HttpError(422, 'Suscripción no válida.'); }
    if (url.protocol !== 'https:' || !keys?.p256dh || !keys?.auth || endpoint.length > 1000) throw new HttpError(422, 'Suscripción no válida.');
    // El mismo endpoint pasa a la cuenta actual (p. ej. un dispositivo compartido que cambia de usuario).
    await db.service.exec(`
      insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ($1, $2, $3, $4, $5)
      on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, failures = 0`,
    [req.user.id, endpoint, String(keys.p256dh).slice(0, 200), String(keys.auth).slice(0, 100), String(req.get('user-agent') ?? '').slice(0, 300)]);
    res.status(201).json({ ok: true });
  }));

  r.delete('/push/subscriptions', wrap(async (req, res) => {
    await asUser(req, (q) => q.exec('delete from public.push_subscriptions where user_id = $1 and endpoint = $2', [req.user.id, String(req.body?.endpoint ?? '')]));
    res.json({ ok: true });
  }));

  r.post('/push/test', wrap(async (req, res) => {
    const result = await notifier.test(req.user.id);
    if (result !== 'sent') throw new HttpError(409, result === 'no-devices' ? 'Activa primero las notificaciones en este dispositivo.' : 'No se pudo enviar la notificación de prueba.', 'PUSH_FAILED');
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- guía de apoyo
  r.get('/support', wrap(async (req, res) => {
    const messages = await asUser(req, (q) => q.rows(`
      select m.role, m.content, m.created_at from public.support_messages m
      where m.user_id = $1 order by m.id desc limit 40`, [req.user.id]));
    res.json({ topics: SUPPORT_TOPICS.map(({ id, label }) => ({ id, label })), messages: messages.reverse().map((m) => ({ ...m, ...parseGuide(m) })) });
  }));

  r.post('/support/messages', wrap(async (req, res) => {
    const topic = SUPPORT_TOPICS.find((t) => t.id === req.body?.topic);
    if (!topic) throw new HttpError(422, 'Elige un tema.');
    await asUser(req, async (q) => {
      let conv = await q.one('select id from public.support_conversations where user_id = $1 order by created_at desc limit 1', [req.user.id]);
      if (!conv) conv = await q.one('insert into public.support_conversations (user_id) values ($1) returning id', [req.user.id]);
      await q.exec(`insert into public.support_messages (conversation_id, user_id, role, content) values ($1, $2, 'user', $3)`, [conv.id, req.user.id, topic.label]);
      await q.exec(`insert into public.support_messages (conversation_id, user_id, role, content) values ($1, $2, 'guide', $3)`,
        [conv.id, req.user.id, JSON.stringify({ topic: topic.id, text: topic.reply })]);
    });
    res.status(201).json({ reply: { text: topic.reply, links: topic.links } });
  }));

  return r;
}

function parseGuide(m) {
  if (m.role !== 'guide') return {};
  try {
    const { topic, text: t } = JSON.parse(m.content);
    return { content: t, links: SUPPORT_TOPICS.find((x) => x.id === topic)?.links ?? [] };
  } catch {
    return {};
  }
}
