// Núcleo de rastreo: toda conversión se guarda primero en growth.events y después se copia
// (outbox) a Meta, TikTok y Customer.io. Nunca se envían respuestas del quiz a anuncios.
import { randomUUID } from 'node:crypto';
import { cleanTouch, hashEmail, isUuid, sanitizeUrl } from './context.js';

/** Eventos que el navegador puede registrar. El resto (lead, checkout, compra…) lo escribe solo el servidor. */
export const CLIENT_EVENTS = new Set(['page_view', 'quiz_started', 'quiz_answered', 'plan_viewed', 'plan_selected', 'app_activated', 'consent']);

/** Eventos que viajan a Meta/TikTok (con el nombre estándar que mapea forwarders.js). Nada más sale. */
export const AD_EVENTS = new Set(['page_view', 'quiz_started', 'lead_created', 'plan_viewed', 'plan_selected', 'checkout_started', 'purchase', 'app_activated']);

/** Eventos que viajan a Customer.io para disparar flujos de e-mail. */
export const EMAIL_EVENTS = new Set(['lead_created', 'checkout_started', 'purchase', 'app_activated', 'payment_failed',
  'subscription_renewed', 'subscription_canceled', 'refund', 'trial_ending']);

export function createTracker({ db, settings, config, log = console }) {
  const q = db.service;

  async function emailOf({ leadId, userId }) {
    if (leadId) {
      const r = await q.one('select email from growth_pii.lead_pii where lead_id = $1', [leadId]);
      if (r?.email) return r.email;
    }
    if (userId) {
      const r = await q.one('select email from auth.users where id = $1', [userId]);
      if (r?.email) return r.email;
    }
    return null;
  }

  async function marketingEmailConsent({ leadId, visitorId, userId }) {
    const r = await q.one(`select granted from growth.consents where kind = 'marketing_email'
      and (($1::uuid is not null and lead_id = $1) or ($2::uuid is not null and visitor_id = $2) or ($3::uuid is not null and user_id = $3))
      order by created_at desc limit 1`, [leadId ?? null, visitorId ?? null, userId ?? null]);
    return Boolean(r?.granted);
  }

  /** ¿Aceptó cookies de marketing? (último consentimiento registrado del visitante o lead). */
  async function adConsent({ visitorId, leadId }) {
    const r = await q.one(`select granted from growth.consents where kind = 'cookies_marketing'
      and (($1::uuid is not null and visitor_id = $1) or ($2::uuid is not null and lead_id = $2)) order by created_at desc limit 1`,
    [isUuid(visitorId) ? visitorId : null, leadId ?? null]);
    return Boolean(r?.granted);
  }

  /** Crea o actualiza al visitante y la sesión. */
  async function touchVisitor({ visitorId, sessionId, touch, ctx = {} }) {
    if (!isUuid(visitorId)) return;
    const first = cleanTouch(touch?.first), last = cleanTouch(touch?.last ?? touch?.first);
    await q.exec(`
      insert into growth.visitors (visitor_id, first_touch, last_touch, country, language, ip, user_agent)
      values ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7)
      on conflict (visitor_id) do update set last_seen_at = now(),
        last_touch = case when excluded.last_touch = '{}'::jsonb then growth.visitors.last_touch else excluded.last_touch end,
        first_touch = case when growth.visitors.first_touch = '{}'::jsonb then excluded.first_touch else growth.visitors.first_touch end,
        country = coalesce(excluded.country, growth.visitors.country), language = coalesce(excluded.language, growth.visitors.language),
        ip = coalesce(excluded.ip, growth.visitors.ip), user_agent = coalesce(excluded.user_agent, growth.visitors.user_agent)`,
    [visitorId, JSON.stringify(first), JSON.stringify(last), ctx.country ?? null, ctx.language ?? null, ctx.ip ?? null, ctx.userAgent ?? null]);
    if (isUuid(sessionId)) {
      await q.exec(`insert into growth.sessions (session_id, visitor_id, entry_page, device, browser) values ($1, $2, $3, $4, $5)
        on conflict (session_id) do nothing`, [sessionId, visitorId, ctx.page ?? null, ctx.device ?? null, ctx.browser ?? null]);
    }
  }

  /** Guarda un evento y encola las copias. Devuelve { eventId, duplicate }. */
  async function record(ev) {
    const eventId = isUuid(ev.eventId) ? ev.eventId : randomUUID();
    const ctx = ev.ctx ?? {};
    const last = cleanTouch(ev.touch?.last ?? ev.touch?.first);
    const n = await q.exec(`
      insert into growth.events (event_id, name, occurred_at, visitor_id, session_id, lead_id, user_id, language, country, device, browser, page,
        program_slug, utm_source, utm_medium, utm_campaign, utm_term, utm_content, fbclid, ttclid, fbp, fbc, variant, value_cents, currency, consent_marketing, props)
      values ($1,$2,coalesce($3::timestamptz, now()),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24,$25,$26,$27::jsonb)
      on conflict (event_id) do nothing`,
    [eventId, ev.name, ev.occurredAt ?? null, isUuid(ev.visitorId) ? ev.visitorId : null, isUuid(ev.sessionId) ? ev.sessionId : null,
      ev.leadId ?? null, ev.userId ?? null, ctx.language ?? null, ctx.country ?? null, ctx.device ?? null, ctx.browser ?? null, ctx.page ?? null,
      ev.program ?? null, last.utm_source ?? null, last.utm_medium ?? null, last.utm_campaign ?? null, last.utm_term ?? null, last.utm_content ?? null,
      last.fbclid ?? null, last.ttclid ?? null, last.fbp ?? null, last.fbc ?? null, JSON.stringify(ev.variant ?? {}),
      ev.valueCents ?? null, ev.currency ?? null, Boolean(ev.consentMarketing), JSON.stringify(ev.props ?? {})]);
    if (!n) return { eventId, duplicate: true };
    if (!ev.skipForward) await enqueue({ ...ev, eventId, last, ctx }).catch((err) => log.warn?.(`[growth] outbox: ${err.message}`));
    return { eventId, duplicate: false };
  }

  async function enqueue(ev) {
    const when = ev.occurredAt ? Math.floor(new Date(ev.occurredAt).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const rows = [];
    // --- anuncios: solo con consentimiento de marketing y pixel configurado; sin datos de salud.
    if (AD_EVENTS.has(ev.name) && ev.consentMarketing) {
      const visitor = ev.visitorId ? await q.one('select ip, user_agent from growth.visitors where visitor_id = $1', [ev.visitorId]) : null;
      const email = await emailOf({ leadId: ev.leadId, userId: ev.userId });
      const base = {
        event_name: ev.name, event_id: ev.eventId, time: when,
        url: sanitizeUrl(ev.ctx?.page ?? '/', config.appUrl),
        user: {
          external_id: ev.visitorId ?? ev.userId ?? null,
          email_hash: email ? hashEmail(email) : null,
          ip: ev.ctx?.ip ?? visitor?.ip ?? null, user_agent: ev.ctx?.userAgent ?? visitor?.user_agent ?? null,
          fbp: ev.last?.fbp ?? null, fbc: ev.last?.fbc ?? (ev.last?.fbclid ? `fb.1.${when * 1000}.${ev.last.fbclid}` : null),
          ttclid: ev.last?.ttclid ?? null, country: ev.ctx?.country ?? null,
        },
        value_cents: ev.valueCents ?? null, currency: ev.currency ?? null,
        content_name: ev.props?.plan ?? null, // solo el plan, nunca el hábito
      };
      for (const dest of ['meta', 'tiktok']) {
        const cfg = await settings.get(`pixels.${dest}`);
        if (cfg?.pixelId && cfg?.accessToken) rows.push([dest, base]);
      }
    }
    // --- e-mail: Customer.io recibe la identidad y el evento (la elegibilidad de marketing viaja como atributo).
    if (EMAIL_EVENTS.has(ev.name) && (config.growth.customerio.siteId || (await settings.get('customerio'))?.siteId)) {
      const email = await emailOf({ leadId: ev.leadId, userId: ev.userId });
      if (email) {
        rows.push(['customerio', {
          id: ev.userId ?? ev.leadId, lead_id: ev.leadId ?? null, user_id: ev.userId ?? null, email, event_name: ev.name, event_id: ev.eventId, time: when,
          language: ev.ctx?.language ?? null, topic: ev.program ?? null, data: ev.props ?? {}, value_cents: ev.valueCents ?? null, currency: ev.currency ?? null,
          marketing_consent: await marketingEmailConsent({ leadId: ev.leadId, visitorId: ev.visitorId, userId: ev.userId }),
        }]);
      }
    }
    for (const [dest, payload] of rows) {
      await q.exec(`insert into growth.outbox (event_id, destination, payload) values ($1, $2, $3::jsonb) on conflict do nothing`,
        [ev.eventId, dest, JSON.stringify(payload)]);
    }
    return rows.length;
  }

  /** Alta de lead (e-mail + consentimientos). Idempotente por e-mail. */
  async function createLead({ email, firstName = null, visitorId, language, topic, assessmentId, userId, touch, consents = {}, ip, ctx = {} }) {
    const em = String(email ?? '').trim().toLowerCase();
    const existing = await q.one('select lead_id from growth_pii.lead_pii where lower(email) = $1', [em]);
    let leadId = existing?.lead_id;
    const attribution = { first: cleanTouch(touch?.first), last: cleanTouch(touch?.last ?? touch?.first) };
    if (!leadId) {
      leadId = randomUUID();
      await q.exec(`insert into growth.leads (lead_id, visitor_id, user_id, assessment_id, language, topic, attribution) values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
        [leadId, isUuid(visitorId) ? visitorId : null, userId ?? null, assessmentId ?? null, language ?? null, topic ?? null, JSON.stringify(attribution)]);
      await q.exec('insert into growth_pii.lead_pii (lead_id, email, email_hash, first_name) values ($1, $2, $3, $4)', [leadId, em, hashEmail(em), firstName]);
    } else {
      if (firstName) await q.exec('update growth_pii.lead_pii set first_name = $2 where lead_id = $1', [leadId, firstName]);
      await q.exec(`update growth.leads set visitor_id = coalesce(visitor_id, $2), user_id = coalesce($3, user_id), assessment_id = coalesce($4, assessment_id),
        topic = coalesce($5, topic) where lead_id = $1`, [leadId, isUuid(visitorId) ? visitorId : null, userId ?? null, assessmentId ?? null, topic ?? null]);
    }
    const textVersion = { health_data: '2026-10-v1', marketing_email: '2026-10-v1', cookies_marketing: '2026-10-v1' };
    for (const [kind, granted] of Object.entries(consents)) {
      if (!['health_data', 'marketing_email', 'cookies_marketing', 'cookies_analytics'].includes(kind) || typeof granted !== 'boolean') continue;
      await q.exec(`insert into growth.consents (lead_id, visitor_id, user_id, kind, granted, text_version, ip) values ($1,$2,$3,$4,$5,$6,$7)`,
        [leadId, isUuid(visitorId) ? visitorId : null, userId ?? null, kind, granted, textVersion[kind] ?? null, ip ?? null]);
    }
    return { leadId, created: !existing };
  }

  /** Registra un consentimiento de cookies/datos hecho por el visitante. */
  async function recordConsent({ visitorId, leadId, userId, kind, granted, ip }) {
    await q.exec(`insert into growth.consents (lead_id, visitor_id, user_id, kind, granted, text_version, ip) values ($1,$2,$3,$4,$5,'2026-10-v1',$6)`,
      [leadId ?? null, isUuid(visitorId) ? visitorId : null, userId ?? null, kind, Boolean(granted), ip ?? null]);
  }

  /** Último toque/primer toque y ids guardados para un usuario (lead o visitante) — para compras desde webhooks. */
  async function identityFor({ userId, visitorId, leadId }) {
    let lead = null;
    if (leadId) lead = await q.one('select lead_id, visitor_id, attribution from growth.leads where lead_id = $1', [leadId]);
    if (!lead && userId) lead = await q.one('select lead_id, visitor_id, attribution from growth.leads where user_id = $1 order by created_at desc limit 1', [userId]);
    const vid = isUuid(visitorId) ? visitorId : lead?.visitor_id ?? null;
    const v = vid ? await q.one('select first_touch, last_touch from growth.visitors where visitor_id = $1', [vid]) : null;
    return {
      leadId: lead?.lead_id ?? null, visitorId: vid,
      first: v?.first_touch ?? lead?.attribution?.first ?? {}, last: v?.last_touch ?? lead?.attribution?.last ?? {},
    };
  }

  return { record, enqueue, adConsent, marketingEmailConsent, touchVisitor, createLead, recordConsent, identityFor, emailOf };
}
