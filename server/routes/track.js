// Rastreo público: eventos del navegador, captura de leads, configuración de pixels y variantes A/B.
// Las respuestas del quiz se guardan solo en la base; a anuncios nunca viajan (ver growth/tracker.js).
import { Router } from 'express';
import { isValidEmail, sharedRateLimiter } from '../auth.js';
import { attributionFromRequest, clientInfo, cleanTouch, isUuid } from '../growth/context.js';
import { CLIENT_EVENTS } from '../growth/tracker.js';
import { HttpError, wrap } from './util.js';

const LANGS = new Set(['es', 'pt-BR', 'pt-PT', 'en', 'fr', 'de']);
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

export function trackRoutes({ db, config, growth, store, log = console }) {
  const r = Router();
  const limiter = sharedRateLimiter(db, { windowSeconds: 60, max: 240 });
  const leadLimiter = sharedRateLimiter(db, { windowSeconds: 10 * 60, max: 20 });
  const { tracker, settings, experiments } = growth;

  // Solo identificadores públicos de los pixels (nunca tokens) y experimentos activos.
  r.get('/track/config', wrap(async (req, res) => {
    const [meta, tiktok] = await Promise.all([settings.get('pixels.meta'), settings.get('pixels.tiktok')]);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      meta: meta?.pixelId ? { pixelId: String(meta.pixelId) } : null,
      tiktok: tiktok?.pixelId ? { pixelId: String(tiktok.pixelId) } : null,
      experiments: experiments ? await experiments.publicConfig().catch(() => []) : [],
    });
  }));

  // Variante de un experimento para un visitante (asignación estable).
  r.get('/track/variant', wrap(async (req, res) => {
    const vid = String(req.query.visitor ?? '');
    if (!isUuid(vid) || !experiments) return res.json({ variant: null });
    res.json({ variant: await experiments.assign(vid, String(req.query.key ?? '').slice(0, 60)) });
  }));

  r.post('/track', wrap(async (req, res) => {
    if (!(await limiter(`track:${req.ip}`))) throw new HttpError(429, 'Demasiadas solicitudes.', 'RATE_LIMITED');
    const body = req.body ?? {};
    const vis = body.visitor ?? {};
    const events = Array.isArray(body.events) ? body.events.slice(0, 20) : [];
    if (!isUuid(vis.id)) throw new HttpError(422, 'visitor.id no válido.', 'INVALID');
    const info = clientInfo(req);
    const language = LANGS.has(body.language) ? body.language : null;
    const consentMarketing = body.consent?.marketing === true;
    const touch = { first: cleanTouch(vis.touch?.first), last: cleanTouch(vis.touch?.last ?? vis.touch?.first) };
    const page = clip(body.page, 300);
    const ctx = { ...info, language, page };
    await tracker.touchVisitor({ visitorId: vis.id, sessionId: vis.session, touch, ctx });

    let recorded = 0;
    for (const e of events) {
      const name = String(e?.name ?? '');
      if (!CLIENT_EVENTS.has(name)) continue;
      const props = e.props && typeof e.props === 'object' ? e.props : {};
      const identity = await tracker.identityFor({ userId: req.user?.id, visitorId: vis.id });
      const base = { eventId: e.id, visitorId: vis.id, sessionId: vis.session, userId: req.user?.id ?? null, leadId: identity.leadId, touch, ctx: { ...ctx, page: clip(e.page ?? page, 300) },
        variant: body.variant && typeof body.variant === 'object' ? body.variant : {}, consentMarketing, occurredAt: null };

      if (name === 'consent') {
        const kind = ['cookies_marketing', 'cookies_analytics', 'health_data', 'marketing_email'].includes(props.kind) ? props.kind : null;
        if (kind) await tracker.recordConsent({ visitorId: vis.id, leadId: identity.leadId, userId: req.user?.id, kind, granted: props.granted === true, ip: info.ip });
        continue;
      }
      if (name === 'quiz_answered') {
        const question = clip(props.question, 80), program = clip(props.program, 40);
        if (!question) continue;
        await db.service.exec(`insert into growth.quiz_answers (lead_id, visitor_id, program_slug, question, answer, seconds, quiz_version) values ($1,$2,$3,$4,$5,$6,$7)`,
          [identity.leadId, vis.id, program, question, clip(typeof props.answer === 'object' ? JSON.stringify(props.answer) : props.answer, 200),
            Number.isFinite(Number(props.seconds)) ? Math.min(Number(props.seconds), 3600) : null, clip(props.version, 20)]);
        await tracker.record({ ...base, name, program, props: { question, seconds: props.seconds ?? null } });
        recorded += 1; continue;
      }
      if (name === 'app_activated') {
        if (!req.user) continue;
        const done = await db.service.one(`select 1 from growth.events where name = 'app_activated' and user_id = $1 limit 1`, [req.user.id]);
        if (done) continue;
        await tracker.record({ ...base, name, program: clip(props.program, 40), consentMarketing: await tracker.adConsent({ visitorId: vis.id, leadId: identity.leadId }) });
        recorded += 1; continue;
      }
      await tracker.record({ ...base, name, program: clip(props.program, 40), props: { plan: clip(props.plan, 20), step: clip(props.step, 40) },
        valueCents: Number.isInteger(props.valueCents) ? props.valueCents : null, currency: clip(props.currency, 3) });
      recorded += 1;
    }
    res.json({ ok: true, recorded });
  }));

  // Captura de e-mail tras el quiz. Dos consentimientos separados: datos de salud (obligatorio) y marketing (opcional).
  r.post('/lead', wrap(async (req, res) => {
    if (!(await leadLimiter(`lead:${req.ip}`))) throw new HttpError(429, 'Demasiados intentos. Espera unos minutos.', 'RATE_LIMITED');
    const b = req.body ?? {};
    const email = String(b.email ?? req.user?.email ?? '').trim();
    if (!isValidEmail(email)) throw new HttpError(422, 'Introduce un e-mail válido.', 'INVALID', { field: 'email' });
    if (b.consents?.health_data !== true) throw new HttpError(422, 'Necesitamos tu consentimiento para usar tus respuestas en tu plan.', 'CONSENT_REQUIRED');
    const att = attributionFromRequest(req);
    const visitorId = isUuid(b.visitorId) ? b.visitorId : att.visitorId;
    const info = clientInfo(req);
    const program = clip(b.program, 40);
    const language = LANGS.has(b.language) ? b.language : null;
    let assessmentId = null;
    try { const s = await store?.current?.(req, program); assessmentId = s?.id ?? null; } catch { /* sin sesión de quiz */ }
    const ctx = { ...info, language, page: clip(b.page, 300) };
    if (visitorId) await tracker.touchVisitor({ visitorId, touch: att, ctx });
    const { leadId, created } = await tracker.createLead({
      email, firstName: clip(String(b.name ?? '').trim(), 40) || null, visitorId, language, topic: program, assessmentId, userId: req.user?.id ?? null, touch: att, ip: info.ip,
      consents: { health_data: true, marketing_email: b.consents?.marketing_email === true, cookies_marketing: b.consents?.cookies_marketing === true },
    });
    let eventId = null;
    if (created) {
      ({ eventId } = await tracker.record({ name: 'lead_created', visitorId, leadId, userId: req.user?.id ?? null, program, touch: att, ctx,
        consentMarketing: await tracker.adConsent({ visitorId, leadId }), props: { marketing_email: b.consents?.marketing_email === true } }));
    }
    res.json({ ok: true, leadId, eventId });
  }));

  return r;
}
