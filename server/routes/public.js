// Embudo público: configuración, cuestionario, resultados, planes y oferta de salida.
import { Router } from 'express';
import { ASSESSMENT_COOKIE, cookieOptions, sharedRateLimiter } from '../auth.js';
import { QUIZ_VERSION, STEPS, missingAnswers, publicQuiz, validateAnswer } from '../quiz.js';
import { computeResult } from '../results.js';
import { wrap } from './util.js';

/** Sesión de cuestionario del navegador o, si no hay, la última completada de la cuenta. */
export function createAssessmentStore({ db, config }) {
  const createLimiter = sharedRateLimiter(db, { windowSeconds: 10 * 60, max: 60 });
  async function cookieSession(req) {
    const id = req.cookies[ASSESSMENT_COOKIE];
    if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) return null;
    return db.service.one('select * from public.questionnaire_sessions where id = $1', [id]);
  }

  async function answersOf(sessionId) {
    const rows = await db.service.rows('select question_id, value from public.questionnaire_answers where session_id = $1', [sessionId]);
    return Object.fromEntries(rows.map((r) => [r.question_id, r.value]));
  }

  async function current(req) {
    const s = await cookieSession(req);
    if (s && (!s.claimed_user_id || s.claimed_user_id === req.user?.id)) return s;
    if (!req.user) return null;
    return db.service.one(`
      select * from public.questionnaire_sessions where (user_id = $1 or claimed_user_id = $1) and completed_at is not null
      order by (user_id is not null) desc, completed_at desc limit 1`, [req.user.id]);
  }

  async function assessmentFor(sessionId) {
    return db.service.one('select * from public.user_assessments where session_id = $1', [sessionId]);
  }

  async function create(res, req) {
    // Límite por IP: evita que bots llenen la base de cuestionarios vacíos.
    if (req && !(await createLimiter(`quiz:${req.ip}`))) {
      throw Object.assign(new Error('Demasiadas solicitudes. Espera un momento.'), { status: 429 });
    }
    const s = await db.service.one('insert into public.questionnaire_sessions (quiz_version) values ($1) returning *', [QUIZ_VERSION]);
    res.cookie(ASSESSMENT_COOKIE, s.id, cookieOptions(config, 180 * 86400));
    return s;
  }

  /** Vincula la sesión anónima a la cuenta al identificarse (no es la vinculación por pago). */
  async function claim(req, userId) {
    const s = await cookieSession(req);
    if (s && !s.claimed_user_id && !s.user_id) {
      await db.service.exec('update public.questionnaire_sessions set claimed_user_id = $1 where id = $2', [userId, s.id]);
    }
  }

  return { cookieSession, answersOf, current, assessmentFor, create, claim };
}

export function publicRoutes({ db, billing, config, store, programs }) {
  const r = Router();

  const view = async (s) => s && ({
    id: s.id,
    answers: await store.answersOf(s.id),
    currentStep: s.current_step,
    completed: Boolean(s.completed_at),
    paid: Boolean(s.user_id),
  });

  // Respuestas públicas, iguales para todos (sin datos personales): caché en la CDN.
  const publicCache = (res) => res.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');

  r.get('/config', (req, res) => {
    publicCache(res);
    res.json({ currency: config.currency, locale: config.locale, paymentsEnabled: billing.enabled });
  });

  r.get('/quiz', (req, res) => { publicCache(res); res.json(publicQuiz()); });

  r.get('/legal', (req, res) => { publicCache(res); res.json(config.legal); });

  r.get('/assessment', wrap(async (req, res) => {
    res.json({ assessment: await view(await store.current(req)) });
  }));

  r.post('/assessment/reset', wrap(async (req, res) => {
    res.json({ assessment: await view(await store.create(res, req)) });
  }));

  r.put('/assessment/answers', wrap(async (req, res) => {
    const { questionId, value, step } = req.body ?? {};
    let s = await store.cookieSession(req);
    // Una evaluación ya vinculada a una suscripción no se modifica: se empieza otra.
    if (!s || s.user_id || (s.claimed_user_id && s.claimed_user_id !== req.user?.id)) s = await store.create(res, req);
    const currentStep = STEPS.some((x) => x.id === step) ? step : s.current_step;
    await db.tx(async (q) => {
      if (questionId !== undefined) {
        const check = validateAnswer(questionId, value);
        if (!check.ok) throw Object.assign(new Error(check.error), { status: 422 });
        await q.exec(`
          insert into public.questionnaire_answers (session_id, question_id, value) values ($1, $2, $3)
          on conflict (session_id, question_id) do update set value = excluded.value, answered_at = now()`,
        [s.id, questionId, JSON.stringify(check.value)]);
        // Consentimiento (datos relacionados con la salud): se registra con la primera respuesta,
        // tras el aviso visible en el cuestionario.
        if (req.body?.consent === true) await q.exec('update public.questionnaire_sessions set consent_at = coalesce(consent_at, now()) where id = $1', [s.id]);
        // Cambiar una respuesta invalida el resultado anterior.
        await q.exec('delete from public.user_assessments where session_id = $1', [s.id]);
        await q.exec('update public.questionnaire_sessions set completed_at = null, current_step = $2 where id = $1', [s.id, currentStep]);
      } else {
        await q.exec('update public.questionnaire_sessions set current_step = $2 where id = $1', [s.id, currentStep]);
      }
    });
    const fresh = await db.service.one('select * from public.questionnaire_sessions where id = $1', [s.id]);
    res.json({ assessment: await view(fresh) });
  }));

  r.post('/assessment/complete', wrap(async (req, res) => {
    const s = await store.cookieSession(req);
    if (!s) return res.status(404).json({ error: 'No encontramos tu cuestionario.' });
    const answers = await store.answersOf(s.id);
    const missing = missingAnswers(answers);
    if (missing.length) return res.status(422).json({ error: 'Faltan respuestas.', missing });
    if (!s.completed_at) {
      await db.tx(async (q) => {
        await q.exec(`insert into public.user_assessments (session_id, result) values ($1, $2)
          on conflict (session_id) do update set result = excluded.result`, [s.id, JSON.stringify(computeResult(answers))]);
        await q.exec(`update public.questionnaire_sessions set completed_at = now(), current_step = 'analisis' where id = $1`, [s.id]);
      });
    }
    res.json({ ok: true });
  }));

  // Los resultados son gratuitos y siempre accesibles para su dueño.
  r.get('/assessment/result', wrap(async (req, res) => {
    const s = await store.current(req);
    const a = s?.completed_at ? await store.assessmentFor(s.id) : null;
    if (!a) return res.status(404).json({ error: 'Aún no has completado el cuestionario.', code: 'NO_RESULT' });
    res.json({ result: a.result, completedAt: s.completed_at, currency: config.currency, locale: config.locale });
  }));

  r.get('/catalog', wrap(async (req, res) => {
    publicCache(res);
    res.json({ programs: await programs.publicCatalog() });
  }));

  r.get('/plans', wrap(async (req, res) => {
    const plans = await billing.getPlans(String(req.query.program ?? 'sem-fumo'));
    publicCache(res);
    res.json({
      plans: plans.map(({ priceId, ...p }) => p),
      paymentsEnabled: billing.enabled && plans.some((p) => p.available),
    });
  }));

  /**
   * Oferta de salida: se muestra como máximo una vez por cuestionario. La primera llamada la
   * "reclama" y la devuelve; las siguientes devuelven null. Solo para quien aún no pagó.
   */
  r.post('/exit-offer', wrap(async (req, res) => {
    const s = await store.current(req);
    if (!s?.completed_at || s.user_id) return res.json({ offer: null });
    if (req.user && await billing.activeSubscription(req.user.id)) return res.json({ offer: null });
    res.json({ offer: await billing.claimExitOffer(s.id, req.user?.id ?? s.claimed_user_id) });
  }));

  return r;
}
