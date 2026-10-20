// Rutas del "companheiro" de programa (alcohol, azúcar, ansiedad, sueño), montadas por app.js en
// /api/app/programs/:slug. Todas exigen acceso a ESE programa. Los datos personales se leen con el
// rol del usuario (RLS); las escrituras de registros también (políticas *_own).
import { Router } from 'express';
import { getCompanion } from '../content/companions/index.js';
import { JourneyEngine } from '../services/journey-engines.js';
import {
  MAX_LOGS_PER_DAY, RANGES, achievementsView, checkProgramAchievements, dashboardView, dayRowOf, defaultGoal, entryView,
  loadAnswers, loadContext, loadGoal, loadGoalHistory, loadRange, normalizeGoalInput, parseInstant, progressView,
  publicStrategies, saveGoalAndPlan, seedCompanionAchievements, setupFormView, validateFields,
} from '../services/program-companion.js';
import { addDays, todayIn } from '../services/stats.js';
import { DAY_RE, HttpError, int, oneOf, text, uuid, wrap } from './util.js';

export function programRoutes({ db, config, notifier, programs, requireProgram }) {
  const r = Router({ mergeParams: true });
  let seeded = null;

  // Solo los programas con companheiro; el resto (p. ej. sem-fumo) sigue su camino por las rutas genéricas.
  r.use(wrap(async (req, res, next) => {
    const def = getCompanion(String(req.params.slug));
    if (!def) return next('router');
    req.entitlement = await requireProgram(req, def.slug);
    req.def = def;
    seeded ??= seedCompanionAchievements(db).catch((err) => { seeded = null; throw err; });
    await seeded;
    next();
  }));

  const tz = (req) => req.user.timezone || 'UTC';
  const today = (req) => todayIn(tz(req));
  const asUser = (req, fn) => db.asUser(req.user.id, fn);
  const ctxOf = (req) => ({ userId: req.user.id, tz: tz(req), today: today(req), currency: config.currency });

  async function achievementsAfter(req) {
    const unlocked = await checkProgramAchievements(db, req.def, ctxOf(req));
    notifier?.notifyAchievements(req.user.id, unlocked);
    return unlocked;
  }

  function localDay(value, req, field = 'day') {
    if (!DAY_RE.test(value ?? '') || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) throw new HttpError(422, 'Fecha no válida.', 'INVALID', { field });
    const t = today(req);
    if (value > t || value < addDays(t, -400)) throw new HttpError(422, 'La fecha no puede ser futura ni de hace más de 400 días.', 'INVALID', { field });
    return value;
  }

  const needGoal = (goal) => {
    if (!goal) throw new HttpError(409, 'Completa la configuración inicial de este programa.', 'ONBOARDING_REQUIRED');
    return goal;
  };

  const program = (req) => programs.get(req.def.slug);

  // ---------------------------------------------------------------- configuración inicial
  async function setupView(req) {
    const def = req.def;
    const t = today(req);
    return asUser(req, async (q) => {
      const goal = await loadGoal(q, def, req.user.id);
      const prefs = await q.one('select enabled, reminder_time from public.notification_preferences where user_id = $1 and program_slug = $2', [req.user.id, def.slug]);
      const { answers } = await loadAnswers(db.service, req.user.id, def.slug);
      const baseline = def.baseline(answers);
      const suggestions = { start: baseline?.start ?? null };
      return {
        program: def.slug,
        completed: Boolean(goal), planReady: Boolean(goal),
        strategies: publicStrategies(def),
        goal: goal && { strategy: goal.strategy, startDate: goal.startDate, target: goal.target, start: goal.start, exercisePerWeek: goal.exercisePerWeek },
        notifications: { enabled: prefs?.enabled ?? false, time: (prefs?.reminder_time ?? `${def.defaultReminderTime}:00`).slice(0, 5) },
        form: setupFormView(def, { today: t, suggestions }),
        suggestions,
        today: t,
      };
    });
  }

  r.get('/setup', wrap(async (req, res) => res.json(await setupView(req))));

  r.put('/setup', wrap(async (req, res) => {
    const def = req.def;
    const b = req.body ?? {};
    const n = b.notifications ?? {};
    const time = n.time ?? def.defaultReminderTime;
    if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new HttpError(422, 'Hora no válida.', 'INVALID', { field: 'notifications.time' });
    const { answers } = await loadAnswers(db.service, req.user.id, def.slug);
    const goal = normalizeGoalInput(def, b, { today: today(req), suggestions: { start: def.baseline(answers)?.start ?? null } });
    await db.tx(async (q) => {
      await saveGoalAndPlan(q, def, req.user.id, goal, 'Configuración inicial');
      await q.exec(`insert into public.notification_preferences (user_id, program_slug, enabled, consent_at, timezone, reminder_time)
        values ($1, $2, $3, case when $3 then now() end, $4, $5)
        on conflict (user_id, program_slug) do update set enabled = excluded.enabled, reminder_time = excluded.reminder_time, timezone = excluded.timezone,
          consent_at = case when excluded.enabled then coalesce(public.notification_preferences.consent_at, now()) else public.notification_preferences.consent_at end`,
      [req.user.id, def.slug, Boolean(n.enabled), tz(req), time]);
      await q.exec('update public.profiles set onboarded_at = coalesce(onboarded_at, now()), last_program_slug = $2 where user_id = $1', [req.user.id, def.slug]);
    });
    await achievementsAfter(req);
    res.json(await setupView(req));
  }));

  // ---------------------------------------------------------------- panel
  r.get('/dashboard', wrap(async (req, res) => {
    const def = req.def;
    const prog = await program(req);
    const out = await asUser(req, async (q) => {
      const c = await loadContext(q, def, ctxOf(req));
      needGoal(c.goal);
      return dashboardView(q, def, c, { program: prog, entitlement: req.entitlement, user: req.user, config });
    });
    await programs.setLastProgram(req.user.id, def.slug);
    res.json(out);
  }));

  // ---------------------------------------------------------------- registro principal
  /** Si un registro nuevo contradice el check-in del día (p. ej. "hoy no bebí"), el check-in se retira. */
  async function reconcileCheckin(req, q, day) {
    const def = req.def;
    const goal = (await loadGoal(q, def, req.user.id)) ?? defaultGoal(def, today(req));
    const data = await loadRange(q, def, req.user.id, tz(req), day, day);
    if (data.checkins.length && def.checkin.blockedWhen(dayRowOf(def, goal, day, data))) {
      await q.exec(`delete from public.program_activity_entries where user_id = $1 and program_slug = $2 and kind = 'checkin' and value ->> 'day' = $3`, [req.user.id, def.slug, day]);
    }
  }

  function cleanLogValue(req) {
    const def = req.def;
    const value = validateFields(def.log.fields, req.body?.value, { label: 'registro' });
    const problem = def.log.validate?.(value);
    if (problem) throw new HttpError(422, problem.message, 'INVALID', { field: problem.field });
    return value;
  }

  r.post('/log', wrap(async (req, res) => {
    const def = req.def;
    const value = cleanLogValue(req);
    const at = parseInstant(req.body?.at);
    const day = todayIn(tz(req), at);
    const row = await asUser(req, async (q) => {
      const n = await q.one(`select count(*)::int as n from public.program_activity_entries where user_id = $1 and program_slug = $2 and kind = $3
        and (occurred_at at time zone $4)::date = $5::date`, [req.user.id, def.slug, def.log.kind, tz(req), day]);
      if (n.n >= MAX_LOGS_PER_DAY) throw new HttpError(422, 'Has alcanzado el máximo de registros de un día.', 'TOO_MANY_ENTRIES');
      const inserted = await q.one(`insert into public.program_activity_entries (user_id, program_slug, kind, value, occurred_at)
        values ($1, $2, $3, $4, $5) returning id, value, occurred_at`, [req.user.id, def.slug, def.log.kind, JSON.stringify(value), at.toISOString()]);
      await reconcileCheckin(req, q, day);
      return inserted;
    });
    res.status(201).json({ entry: entryView(def, row), achievements: await achievementsAfter(req) });
  }));

  r.get('/log', wrap(async (req, res) => {
    const def = req.def;
    const t = today(req);
    const from = req.query.from ? localDay(String(req.query.from), req, 'from') : addDays(t, -29);
    const to = req.query.to ? localDay(String(req.query.to), req, 'to') : t;
    const limit = req.query.limit == null ? 50 : int(req.query.limit, { min: 1, max: 200, field: 'limit' });
    const rows = await asUser(req, (q) => q.rows(`select id, value, occurred_at from public.program_activity_entries
      where user_id = $1 and program_slug = $2 and kind = $3
        and occurred_at >= ($4::date)::timestamp at time zone $6 and occurred_at < (($5::date) + 1)::timestamp at time zone $6
      order by occurred_at desc limit ${limit}`, [req.user.id, def.slug, def.log.kind, from, to, tz(req)]));
    res.json({ entries: rows.map((e) => entryView(def, e)) });
  }));

  r.patch('/log/:id', wrap(async (req, res) => {
    const def = req.def;
    const id = uuid(req.params.id);
    const value = cleanLogValue(req);
    const at = req.body?.at ? parseInstant(req.body.at) : null;
    const row = await asUser(req, async (q) => {
      const updated = await q.one(`update public.program_activity_entries set value = $4, occurred_at = coalesce($5::timestamptz, occurred_at)
        where id = $1 and user_id = $2 and program_slug = $3 and kind = $6 returning id, value, occurred_at`,
      [id, req.user.id, def.slug, JSON.stringify(value), at?.toISOString() ?? null, def.log.kind]);
      if (updated) await reconcileCheckin(req, q, todayIn(tz(req), new Date(updated.occurred_at)));
      return updated;
    });
    if (!row) throw new HttpError(404, 'Registro no encontrado.', 'NOT_FOUND');
    res.json({ entry: entryView(def, row), achievements: await achievementsAfter(req) });
  }));

  r.delete('/log/:id', wrap(async (req, res) => {
    const n = await asUser(req, (q) => q.exec(`delete from public.program_activity_entries where id = $1 and user_id = $2 and program_slug = $3 and kind = $4`,
      [uuid(req.params.id), req.user.id, req.def.slug, req.def.log.kind]));
    if (!n) throw new HttpError(404, 'Registro no encontrado.', 'NOT_FOUND');
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- momento difícil
  const urgeView = (def, e) => ({
    id: e.id, at: e.occurred_at, feeling: e.value?.feeling ?? null, feelingLabel: def.urge.feelings.find((f) => f.id === e.value?.feeling)?.label ?? null,
    intensity: e.value?.intensity ?? null, technique: e.value?.technique ?? null, note: e.value?.note ?? null,
    outcome: e.value?.outcome ?? null, afterIntensity: e.value?.afterIntensity ?? null,
  });

  r.post('/urge', wrap(async (req, res) => {
    const def = req.def;
    const b = req.body ?? {};
    const feeling = oneOf(b.feeling, def.urge.feelings.map((f) => f.id), 'feeling');
    if (!feeling) throw new HttpError(422, 'Elige qué sientes.', 'INVALID', { field: 'feeling' });
    const value = {
      feeling,
      intensity: int(b.intensity, { min: def.urge.intensity.min, max: def.urge.intensity.max, field: 'intensity' }),
      technique: oneOf(b.technique, def.urge.techniques.map((t) => t.id), 'technique'),
      note: text(b.note, { max: 300, field: 'note' }),
      outcome: null,
    };
    const row = await asUser(req, (q) => q.one(`insert into public.program_activity_entries (user_id, program_slug, kind, value)
      values ($1, $2, 'urge', $3) returning id, value, occurred_at`, [req.user.id, def.slug, JSON.stringify(value)]));
    res.status(201).json({ urge: urgeView(def, row), achievements: await achievementsAfter(req) });
  }));

  r.patch('/urge/:id', wrap(async (req, res) => {
    const def = req.def;
    const b = req.body ?? {};
    const outcome = oneOf(b.outcome, ['resolved', 'continued'], 'outcome');
    if (!outcome) throw new HttpError(422, 'Indica cómo terminó.', 'INVALID', { field: 'outcome' });
    const patch = { outcome };
    if (b.afterIntensity != null && b.afterIntensity !== '') patch.afterIntensity = int(b.afterIntensity, { min: def.urge.intensity.min, max: def.urge.intensity.max, field: 'afterIntensity' });
    if (b.technique) patch.technique = oneOf(b.technique, def.urge.techniques.map((t) => t.id), 'technique');
    const row = await asUser(req, (q) => q.one(`update public.program_activity_entries set value = value || $4::jsonb
      where id = $1 and user_id = $2 and program_slug = $3 and kind = 'urge' returning id, value, occurred_at`,
    [uuid(req.params.id), req.user.id, def.slug, JSON.stringify(patch)]));
    if (!row) throw new HttpError(404, 'Registro no encontrado.', 'NOT_FOUND');
    res.json({ urge: urgeView(def, row), achievements: await achievementsAfter(req) });
  }));

  r.get('/urge', wrap(async (req, res) => {
    const def = req.def;
    const t = today(req);
    const from = req.query.from ? localDay(String(req.query.from), req, 'from') : addDays(t, -29);
    const to = req.query.to ? localDay(String(req.query.to), req, 'to') : t;
    const rows = await asUser(req, (q) => q.rows(`select id, value, occurred_at from public.program_activity_entries
      where user_id = $1 and program_slug = $2 and kind = 'urge'
        and occurred_at >= ($3::date)::timestamp at time zone $5 and occurred_at < (($4::date) + 1)::timestamp at time zone $5
      order by occurred_at desc limit 200`, [req.user.id, def.slug, from, to, tz(req)]));
    res.json({ urges: rows.map((e) => urgeView(def, e)) });
  }));

  // ---------------------------------------------------------------- check-in del día
  r.post('/checkin', wrap(async (req, res) => {
    const def = req.def;
    const day = localDay(req.body?.day ?? today(req), req);
    const inserted = await asUser(req, async (q) => {
      const goal = (await loadGoal(q, def, req.user.id)) ?? defaultGoal(def, today(req));
      const data = await loadRange(q, def, req.user.id, tz(req), day, day);
      if (def.checkin.blockedWhen(dayRowOf(def, goal, day, { ...data, checkins: [] }))) {
        throw new HttpError(409, def.checkin.blockedMessage, 'HAS_ENTRIES');
      }
      return q.one(`insert into public.program_activity_entries (user_id, program_slug, kind, value, occurred_at)
        values ($1, $2, 'checkin', $3, (($4::date) + time '12:00') at time zone $5)
        on conflict (user_id, program_slug, (value ->> 'day')) where kind = 'checkin' do nothing returning id`,
      [req.user.id, def.slug, JSON.stringify({ day }), day, tz(req)]);
    });
    res.status(inserted ? 201 : 200).json({ ok: true, day, already: !inserted, achievements: inserted ? await achievementsAfter(req) : [] });
  }));

  r.delete('/checkin/:day', wrap(async (req, res) => {
    const day = localDay(req.params.day, req);
    await asUser(req, (q) => q.exec(`delete from public.program_activity_entries where user_id = $1 and program_slug = $2 and kind = 'checkin' and value ->> 'day' = $3`,
      [req.user.id, req.def.slug, day]));
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- progreso
  r.get('/progress', wrap(async (req, res) => {
    const def = req.def;
    const range = Number(req.query.range ?? req.query.days ?? 30);
    if (!RANGES.includes(range)) throw new HttpError(422, `El rango debe ser ${RANGES.join(', ')}.`, 'INVALID', { field: 'range' });
    const out = await asUser(req, async (q) => {
      const c = await loadContext(q, def, ctxOf(req));
      needGoal(c.goal);
      const view = await progressView(def, c, range, { config });
      view.goalHistory = (await loadGoalHistory(q, def, req.user.id)).map(({ strategy, startDate, target, start, createdAt, supersededAt }) => ({ strategy, startDate, target, start, createdAt, supersededAt }));
      const journey = await JourneyEngine.getJourneyState(q, req.user.id, def.slug);
      view.journey = { totals: journey.totals, chapters: journey.chapters.map((ch) => ({ number: ch.number, title: ch.title, status: ch.status, completedLessons: ch.completedLessons, totalLessons: ch.lessons.length })) };
      return view;
    });
    res.json(out);
  }));

  // ---------------------------------------------------------------- objetivos y metas semanales
  r.get('/goals', wrap(async (req, res) => {
    const def = req.def;
    const out = await asUser(req, async (q) => {
      const goal = needGoal(await loadGoal(q, def, req.user.id));
      const history = (await loadGoalHistory(q, def, req.user.id)).filter((g) => g.supersededAt);
      const tasks = await q.rows('select id, week, title, detail, done_at from public.daily_goals where user_id = $1 and program_slug = $2 order by week, created_at', [req.user.id, def.slug]);
      return { goal, current: goal, history, strategies: publicStrategies(def), form: setupFormView(def, { today: today(req) }),
        tasks: tasks.map((t) => ({ id: t.id, week: t.week, title: t.title, detail: t.detail, done: Boolean(t.done_at) })) };
    });
    res.json(out);
  }));

  r.put('/goals', wrap(async (req, res) => {
    const def = req.def;
    const current = needGoal(await asUser(req, (q) => loadGoal(q, def, req.user.id)));
    const next = normalizeGoalInput(def, req.body, { today: today(req), current });
    const { changed } = await db.tx((q) => saveGoalAndPlan(q, def, req.user.id, next, 'Cambio de objetivo'));
    const goal = await asUser(req, (q) => loadGoal(q, def, req.user.id));
    res.json({ goal, current: goal, changed });
  }));

  r.patch('/tasks/:id', wrap(async (req, res) => {
    const done = req.body?.done;
    if (typeof done !== 'boolean') throw new HttpError(422, 'Indica si la meta está hecha.', 'INVALID', { field: 'done' });
    const row = await asUser(req, (q) => q.one(`update public.daily_goals set done_at = $1 where id = $2 and user_id = $3 and program_slug = $4 returning id, done_at`,
      [done ? new Date().toISOString() : null, uuid(req.params.id), req.user.id, req.def.slug]));
    if (!row) throw new HttpError(404, 'Meta no encontrada.', 'NOT_FOUND');
    res.json({ ok: true, id: row.id, done: Boolean(row.done_at), achievements: await achievementsAfter(req) });
  }));

  // ---------------------------------------------------------------- logros
  r.get('/achievements', wrap(async (req, res) => {
    await achievementsAfter(req);
    res.json({ achievements: await asUser(req, (q) => achievementsView(q, req.def, req.user.id)) });
  }));

  return r;
}
