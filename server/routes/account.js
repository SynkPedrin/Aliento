// Cuenta: identificación, sesión, recuperación de contraseña, perfil, suscripción, exportación y baja.
import { Router } from 'express';
import {
  AuthError, ACCESS_COOKIE, clearSessionCookies, isValidEmail, setSessionCookies, sharedRateLimiter,
} from '../auth.js';
import { isValidTimezone } from '../services/stats.js';
import { HttpError, requireUser, wrap } from './util.js';

import { attributionFromRequest, clientInfo, eventIdFor } from '../growth/context.js';

export function accountRoutes({ db, auth, billing, config, store, programs, growth = null, log = console }) {
  const r = Router();
  // Límites compartidos entre instancias (Postgres): por IP y por cuenta.
  const ipLimiter = sharedRateLimiter(db, { windowSeconds: 15 * 60, max: 30 });
  const accountLimiter = sharedRateLimiter(db, { windowSeconds: 15 * 60, max: 10 });
  const recoveryLimiter = sharedRateLimiter(db, { windowSeconds: 60 * 60, max: 5 });
  const tooMany = () => new HttpError(429, 'Demasiados intentos. Espera unos minutos.', 'RATE_LIMITED');

  const password = (v, field = 'password') => {
    if (typeof v !== 'string' || v.length < 8 || v.length > 72) {
      throw new HttpError(422, 'La contraseña debe tener entre 8 y 72 caracteres.', 'INVALID', { field });
    }
    return v;
  };

  r.post('/auth/register', wrap(async (req, res) => {
    if (!(await ipLimiter(`register:${req.ip}`))) throw tooMany();
    const { name, email, emailConfirm, acceptTerms, healthConsent, timezone } = req.body ?? {};
    const cleanName = String(name ?? '').trim();
    if (!cleanName || cleanName.length > 80) throw new HttpError(422, 'Escribe tu nombre.', 'INVALID', { field: 'name' });
    if (!isValidEmail(email)) throw new HttpError(422, 'Revisa tu correo electrónico.', 'INVALID', { field: 'email' });
    // Evita cuentas con un correo mal escrito (sin correo no hay recibos ni recuperación).
    if (emailConfirm !== undefined && String(emailConfirm).trim().toLowerCase() !== email.trim().toLowerCase()) {
      throw new HttpError(422, 'Los correos no coinciden.', 'INVALID', { field: 'emailConfirm' });
    }
    password(req.body?.password);
    if (acceptTerms !== true) throw new HttpError(422, 'Debes aceptar los términos y la política de privacidad.', 'INVALID', { field: 'acceptTerms' });
    if (healthConsent !== true) throw new HttpError(422, 'Necesitamos tu consentimiento para tratar los datos sobre tu consumo de tabaco.', 'INVALID', { field: 'healthConsent' });
    const session = await auth.register({
      name: cleanName, email: email.trim().toLowerCase(), password: req.body.password,
      timezone: isValidTimezone(timezone) ? timezone : 'UTC',
    });
    await store.claim(req, session.user.id);
    setSessionCookies(res, config, session);
    res.status(201).json({ ok: true });
  }));

  r.post('/auth/login', wrap(async (req, res) => {
    const { email } = req.body ?? {};
    if (!(await ipLimiter(`login:${req.ip}`))) throw tooMany();
    if (isValidEmail(email) && !(await accountLimiter(`login:${email.trim().toLowerCase()}`))) throw tooMany();
    if (!isValidEmail(email) || typeof req.body?.password !== 'string') throw new AuthError('INVALID_LOGIN', 'Correo o contraseña incorrectos.', 401);
    const session = await auth.signIn({ email: email.trim().toLowerCase(), password: req.body.password });
    await store.claim(req, session.user.id);
    setSessionCookies(res, config, session);
    res.json({ ok: true });
  }));

  r.post('/auth/logout', wrap(async (req, res) => {
    await auth.signOut(req.cookies[ACCESS_COOKIE]);
    clearSessionCookies(res);
    res.json({ ok: true });
  }));

  // Siempre la misma respuesta: no revela si el correo tiene cuenta.
  r.post('/auth/forgot', wrap(async (req, res) => {
    const { email } = req.body ?? {};
    if (!isValidEmail(email)) throw new HttpError(422, 'Revisa tu correo electrónico.', 'INVALID', { field: 'email' });
    if (await recoveryLimiter(`forgot:${req.ip}`) && await recoveryLimiter(`forgot:${email.trim().toLowerCase()}`)) {
      await auth.sendRecovery(email.trim().toLowerCase());
    }
    res.json({ ok: true });
  }));

  // El enlace del correo trae un token de acceso de recuperación; con él se fija la nueva contraseña.
  r.post('/auth/reset', wrap(async (req, res) => {
    const { accessToken, refreshToken } = req.body ?? {};
    if (!(await ipLimiter(`reset:${req.ip}`))) throw tooMany();
    password(req.body?.password);
    const user = await auth.userFromToken(accessToken);
    // Solo un token del enlace de recuperación (no un token de sesión cualquiera).
    if (!user || !auth.isRecoveryToken(accessToken)) throw new HttpError(400, 'El enlace no es válido o ha caducado. Solicita uno nuevo.', 'INVALID_LINK');
    await auth.setPassword(user.id, req.body.password);
    const session = await auth.signIn({ email: user.email, password: req.body.password });
    if (refreshToken) await auth.signOut(accessToken);
    setSessionCookies(res, config, session);
    res.json({ ok: true });
  }));

  r.get('/me', wrap(async (req, res) => {
    if (!req.user) return res.json({ user: null });
    const active = await billing.activeSubscription(req.user.id);
    const programs = (await billing.subscriptionsByProgram(req.user.id))
      .filter((x) => ['active', 'trialing', 'past_due'].includes(x.status)).map((x) => x.program_slug);
    const grants = await db.service.rows(`select program_slug from public.access_grants where user_id = $1
      and revoked_at is null and (expires_at is null or expires_at > now())`, [req.user.id]);
    const onboarded = await db.service.one('select onboarded_at from public.profiles where user_id = $1', [req.user.id]);
    const s = await store.current(req);
    res.json({
      user: { id: req.user.id, name: req.user.name, email: req.user.email, isAdmin: req.user.is_admin },
      access: Boolean(active) || grants.length > 0,
      programs: [...new Set([...programs, ...grants.map((g) => g.program_slug)])],
      subscription: subscriptionView(active ?? await billing.latestSubscription(req.user.id)),
      pendingCheckout: active ? null : await billing.pendingCheckout(req.user.id),
      onboardingCompleted: Boolean(onboarded?.onboarded_at),
      hasResult: Boolean(s?.completed_at),
    });
  }));

  // ---------------------------------------------------------------- programas (catálogo)
  r.get('/programs', requireUser, wrap(async (req, res) => {
    res.json(await programs.catalogFor(req.user.id));
  }));

  r.post('/programs/:slug/last', requireUser, wrap(async (req, res) => {
    const p = await programs.get(String(req.params.slug));
    if (!p) throw new HttpError(404, 'Programa no encontrado.');
    await programs.setLastProgram(req.user.id, p.slug);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- checkout y suscripción
  r.post('/checkout', requireUser, wrap(async (req, res) => {
    const program = String(req.body?.program ?? 'sem-fumo');
    // El cuestionario del programa (el embudo de anuncios) alimenta la app: su resultado se vincula a la cuenta
    // al pagar y se usa en el plan y las estimaciones. Sem Fumo exige haberlo completado (embudo con oferta de salida).
    let assessment = null;
    const quizSession = await store.current(req, program);
    assessment = quizSession?.completed_at ? await store.assessmentFor(quizSession.id) : null;
    if (program === 'sem-fumo' && !req.body?.fromCatalog) {
      if (!assessment) throw new HttpError(409, 'Completa el cuestionario antes de suscribirte.', 'NO_RESULT');
    }
    if (assessment && quizSession && !quizSession.claimed_user_id) await store.claim(req, req.user.id);
    await programs.assertPurchasable(program);
    const att = attributionFromRequest(req);
    // El rastreo nunca puede impedir un pago: si falla (p. ej. migración pendiente), se compra igual sin atribución.
    const tracking = growth ? await growth.tracker.identityFor({ userId: req.user.id, visitorId: att.visitorId })
      .then((id) => ({ visitorId: att.visitorId, first: att.first, last: att.last, leadId: id.leadId }))
      .catch(() => ({ visitorId: att.visitorId, first: att.first, last: att.last, leadId: null })) : null;
    const { url, reused } = await billing.startCheckout({
      user: req.user, program, plan: req.body?.plan, assessment, useExitOffer: req.body?.exitOffer === true,
      trackingMetadata: growth ? growth.hooks.checkoutMetadata(tracking) : {},
    });
    const eventId = growth && !reused ? await growth.hooks.onCheckoutStarted({ user: req.user, program, plan: req.body?.plan, url, tracking, ctx: { ...clientInfo(req), page: '/planes' } }) : null;
    res.json({ url, reused, eventId });
  }));

  r.get('/checkout/status', requireUser, wrap(async (req, res) => {
    const sessionId = String(req.query.session_id ?? '');
    const state = await billing.checkoutState(req.user.id, sessionId);
    if (growth && state.state === 'active') {
      const c = await db.service.one('select amount_cents, currency from growth.checkouts where stripe_session_id = $1 and user_id = $2', [sessionId, req.user.id]).catch(() => null);
      return res.json({ ...state, purchaseEventId: eventIdFor('purchase', sessionId), valueCents: c?.amount_cents ?? null, currency: c?.currency ?? null });
    }
    res.json(state);
  }));

  r.post('/billing/portal', requireUser, wrap(async (req, res) => {
    res.json({ url: await billing.portalUrl(req.user) });
  }));

  r.get('/subscription', requireUser, wrap(async (req, res) => {
    const all = await billing.subscriptionsByProgram(req.user.id);
    const byProgram = {};
    for (const s of all) if (!byProgram[s.program_slug]) byProgram[s.program_slug] = subscriptionView(s);
    const active = await billing.activeSubscription(req.user.id);
    res.json({
      access: Boolean(active),
      subscription: subscriptionView(active ?? await billing.latestSubscription(req.user.id)),
      subscriptions: byProgram,
      hasBilling: Boolean(await billing.customerIdOf(req.user.id)),
      pendingCheckout: active ? null : await billing.pendingCheckout(req.user.id),
      hasResult: Boolean((await store.current(req))?.completed_at),
    });
  }));

  // ---------------------------------------------------------------- perfil
  r.get('/profile', requireUser, wrap(async (req, res) => {
    res.json({ name: req.user.name, email: req.user.email, timezone: req.user.timezone, locale: 'es', createdAt: req.user.created_at });
  }));

  r.patch('/profile', requireUser, wrap(async (req, res) => {
    const name = String(req.body?.name ?? req.user.name).trim();
    const timezone = req.body?.timezone ?? req.user.timezone;
    if (!name || name.length > 80) throw new HttpError(422, 'Escribe tu nombre.', 'INVALID', { field: 'name' });
    if (!isValidTimezone(timezone)) throw new HttpError(422, 'Zona horaria no válida.', 'INVALID', { field: 'timezone' });
    // Con el rol del usuario: RLS + permisos de columna (solo nombre y zona horaria).
    await db.asUser(req.user.id, (q) => q.exec('update public.profiles set name = $1, timezone = $2 where user_id = $3', [name, timezone, req.user.id]));
    res.json({ ok: true });
  }));

  r.post('/profile/password', requireUser, wrap(async (req, res) => {
    if (!(await accountLimiter(`password:${req.user.id}`))) throw tooMany();
    if (!(await auth.verifyPassword(req.user.email, String(req.body?.current ?? '')))) {
      throw new HttpError(422, 'La contraseña actual no es correcta.', 'INVALID', { field: 'current' });
    }
    await auth.setPassword(req.user.id, password(req.body?.next, 'next'));
    const session = await auth.signIn({ email: req.user.email, password: req.body.next });
    setSessionCookies(res, config, session);
    res.json({ ok: true });
  }));

  r.get('/account/export', requireUser, wrap(async (req, res) => {
    const data = await db.asUser(req.user.id, async (q) => {
      const id = req.user.id;
      const all = (sql) => q.rows(sql, [id]);
      return {
        exportedAt: new Date().toISOString(),
        profile: await q.one('select name, timezone, created_at from public.profiles where user_id = $1', [id]),
        email: req.user.email,
        assessments: await q.rows(`select a.result, a.created_at from public.user_assessments a`),
        goals: await all('select strategy, start_date, quit_date, max_daily, exercise_per_week, money_goal, money_goal_label, created_at, superseded_at from public.user_goals where user_id = $1 order by created_at'),
        weeklyGoals: await all('select week, title, done_at from public.daily_goals where user_id = $1'),
        smoking: await all('select smoked_at, quantity, trigger, mood, note from public.smoking_entries where user_id = $1 order by smoked_at'),
        smokeFreeDays: await all('select day from public.daily_checkins where user_id = $1 order by day'),
        cravings: await all('select felt_at, feeling, trigger, intensity, outcome, strategy from public.craving_entries where user_id = $1 order by felt_at'),
        moods: await all('select day, mood, note from public.mood_entries where user_id = $1 order by day'),
        breathing: await all('select exercise_slug, planned_seconds, started_at, completed_at from public.breathing_sessions where user_id = $1 order by started_at'),
        lessons: await all(`select l.title, p.status, p.completed_at from public.user_lesson_progress p
          join public.journey_lessons l on l.id = p.lesson_id where p.user_id = $1`),
        lessonResponses: await all('select lesson_id, block_key, response, responded_at from public.lesson_responses where user_id = $1'),
        achievements: await all('select achievement_slug, unlocked_at from public.user_achievements where user_id = $1'),
        consents: await q.one('select terms_accepted_at, health_consent_at from public.profiles where user_id = $1', [id]),
        questionnaireAnswers: await q.rows(`select a.question_id, a.value, a.answered_at from public.questionnaire_answers a
          join public.questionnaire_sessions s on s.id = a.session_id where s.user_id = $1 or s.claimed_user_id = $1`, [id]),
        planVersions: await q.rows(`select v.version, v.data, v.reason, v.created_at from public.plan_versions v
          join public.personalized_plans p on p.id = v.plan_id where p.user_id = $1 order by v.version`, [id]),
        chapters: await all('select chapter_id, status, completed_at from public.user_chapter_progress where user_id = $1'),
        supportMessages: await all('select role, content, created_at from public.support_messages where user_id = $1 order by id'),
        pushDevices: await all('select user_agent, created_at, last_success_at from public.push_subscriptions where user_id = $1'),
        notificationsSent: await all('select category, status, title, scheduled_for, sent_at from public.notification_deliveries where user_id = $1 order by scheduled_for desc limit 500'),
        accessGrants: await all('select reason, expires_at, revoked_at, created_at from public.access_grants where user_id = $1'),
        notifications: await q.one('select * from public.notification_preferences where user_id = $1', [id]),
        subscriptions: await all('select plan, status, current_period_end, cancel_at_period_end, created_at from public.subscriptions where user_id = $1'),
      };
    });
    res.set('Content-Disposition', 'attachment; filename="aliento-mis-datos.json"');
    res.json(data);
  }));

  /**
   * Baja de la cuenta. Requiere la contraseña y que no quede una renovación pendiente
   * (la suscripción se cancela antes desde el portal, para no cobrar a una cuenta borrada).
   */
  r.delete('/account', requireUser, wrap(async (req, res) => {
    if (req.body?.confirm !== 'ELIMINAR') throw new HttpError(422, 'Escribe ELIMINAR para confirmar.', 'INVALID', { field: 'confirm' });
    if (!(await auth.verifyPassword(req.user.email, String(req.body?.password ?? '')))) {
      throw new HttpError(422, 'La contraseña no es correcta.', 'INVALID', { field: 'password' });
    }
    const activeSubs = (await billing.subscriptionsByProgram(req.user.id))
      .filter((x) => (!x.billing_provider || x.billing_provider === 'stripe') && ['active', 'trialing', 'past_due'].includes(x.status) && !x.cancel_at_period_end);
    if (activeSubs.length) {
      throw new HttpError(409, 'Antes de eliminar tu cuenta, cancela tus suscripciones desde «Mis suscripciones».', 'ACTIVE_SUBSCRIPTION');
    }
    await db.tx(async (q) => {
      await q.exec('delete from public.questionnaire_sessions where user_id = $1 or claimed_user_id = $1', [req.user.id]);
      await q.exec(`insert into public.admin_audit_logs (action, entity, entity_id, details)
        values ('account.deleted', 'user', $1, '{}')`, [req.user.id]);
    });
    await billing.deleteCustomer(req.user.id); // cancela lo que quede y borra el cliente de Stripe
    await auth.signOut(req.cookies[ACCESS_COOKIE]);
    await auth.deleteUser(req.user.id); // en cascada: perfil, registros, progreso, respuestas
    clearSessionCookies(res);
    log.info?.(`[cuenta] Usuario ${req.user.id} eliminado a petición propia.`);
    res.json({ ok: true });
  }));

  return r;
}

export function subscriptionView(sub) {
  return sub && {
    billingProvider: sub.billing_provider || 'stripe',
    plan: sub.plan,
    status: sub.status,
    amount: sub.amount,
    currency: sub.currency,
    interval: sub.interval,
    intervalCount: sub.interval_count,
    currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end).toISOString() : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
  };
}

