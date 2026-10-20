// Integración con Customer.io: identidad y eventos (Track API), transaccionales (App API) y webhook de informes.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isUuid } from './context.js';

/** Catálogo de los 8 flujos (texto base en docs/GROWTH_EMAIL_FLOWS.md). `type`: transactional no exige consentimiento; marketing sí. */
export const FLOWS = [
  { key: 'welcome_confirm', name: 'Bienvenida y confirmación', type: 'transactional', trigger: 'lead_created', exit: 'Confirma el e-mail (email_confirmed) o pasan 7 días',
    sequence: [{ delay: '0 min', message: 'welcome_1', subject: 'Confirma tu correo y recibe tu plan' }, { delay: '48 h', message: 'welcome_2', subject: 'Tu confirmación sigue pendiente' }] },
  { key: 'plan_nurture', name: 'Plan sin compra', type: 'marketing', trigger: 'lead_created (con consentimiento confirmado)', exit: 'purchase',
    sequence: [{ delay: '1 día', message: 'nurture_1', subject: 'Tu primer paso, a tu ritmo' }, { delay: '3 días', message: 'nurture_2', subject: 'Lo que otras personas notaron la primera semana' }, { delay: '6 días', message: 'nurture_3', subject: 'Tu plan te espera cuando quieras' }] },
  { key: 'checkout_abandoned', name: 'Pago sin completar', type: 'marketing', trigger: 'checkout_started', exit: 'purchase',
    sequence: [{ delay: '1 h', message: 'checkout_1', subject: 'Tu plan quedó a medias' }, { delay: '1 día', message: 'checkout_2', subject: '¿Te surgió alguna duda?' }] },
  { key: 'onboarding', name: 'Primeros pasos tras la compra', type: 'transactional', trigger: 'purchase', exit: 'Fin de la secuencia',
    sequence: [{ delay: '0 min', message: 'onboarding_1', subject: 'Bienvenida a Alento: así empiezas' }, { delay: '2 días', message: 'onboarding_2', subject: 'Un recordatorio amable para tu día' }] },
  { key: 'activation', name: 'Activación de la app', type: 'transactional', trigger: 'purchase sin app_activated', exit: 'app_activated',
    sequence: [{ delay: '24 h', message: 'activation_1', subject: 'Abre la app y tu plan estará listo' }, { delay: '4 días', message: 'activation_2', subject: '¿Necesitas ayuda para empezar?' }] },
  { key: 'dunning', name: 'Pago fallido', type: 'transactional', trigger: 'payment_failed', exit: 'subscription_renewed o subscription_canceled',
    sequence: [{ delay: '0 min', message: 'dunning_1', subject: 'No pudimos cobrar tu suscripción' }, { delay: '3 días', message: 'dunning_2', subject: 'Actualiza tu método de pago para no perder tu avance' }, { delay: '7 días', message: 'dunning_3', subject: 'Último aviso sobre tu suscripción' }] },
  { key: 'winback', name: 'Cancelación y regreso', type: 'marketing', trigger: 'subscription_canceled', exit: 'purchase',
    sequence: [{ delay: '1 día', message: 'winback_1', subject: 'Gracias por haber estado, de verdad' }, { delay: '30 días', message: 'winback_2', subject: 'La puerta sigue abierta' }] },
  { key: 'billing_notices', name: 'Avisos de cobro y reembolsos', type: 'transactional', trigger: 'trial_ending, refund', exit: 'Fin del mensaje',
    sequence: [{ delay: '3 días antes', message: 'billing_trial_ending', subject: 'Tu período de prueba termina pronto' }, { delay: '0 min', message: 'billing_refund', subject: 'Hemos procesado tu reembolso' }] },
];

const METRICS = new Set(['sent', 'delivered', 'opened', 'clicked', 'unsubscribed', 'bounced', 'converted']);

export function createEmail({ db, settings, config, fetchImpl = globalThis.fetch, log = console }) {
  const q = db.service;

  /** Credenciales: ajustes del panel con respaldo en variables de entorno. */
  async function creds() {
    const s = (await settings.get('customerio')) ?? {};
    const e = config.growth?.customerio ?? {};
    const region = String(s.region || e.region || 'eu').toLowerCase() === 'us' ? 'us' : 'eu';
    return { siteId: s.siteId || e.siteId || '', apiKey: s.apiKey || e.apiKey || '', appApiKey: s.appApiKey || e.appApiKey || '',
      webhookSecret: s.webhookSecret || '', transactional: s.transactional ?? {}, region };
  }

  async function enabled() {
    const c = await creds();
    return Boolean(c.siteId && c.apiKey);
  }

  async function track(c, method, path, body) {
    const host = c.region === 'us' ? 'track.customer.io' : 'track-eu.customer.io';
    const res = await fetchImpl(`https://${host}${path}`, {
      method,
      headers: { authorization: `Basic ${Buffer.from(`${c.siteId}:${c.apiKey}`).toString('base64')}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Customer.io ${res.status}: ${t.slice(0, 160)}`);
    }
    return res.status;
  }

  /** Identidad + evento. Idempotente: Customer.io deduplica por el `id` del evento. */
  async function deliver(payload) {
    const c = await creds();
    if (!c.siteId || !c.apiKey) return { skipped: true };
    const id = encodeURIComponent(String(payload.id));
    await track(c, 'PUT', `/api/v1/customers/${id}`, {
      email: payload.email, language: payload.language ?? undefined, topic: payload.topic ?? undefined,
      marketing_consent: Boolean(payload.marketing_consent),
    });
    const data = { ...(payload.data ?? {}) };
    if (payload.value_cents != null) { data.value_cents = payload.value_cents; data.currency = payload.currency ?? null; }
    await track(c, 'POST', `/api/v1/customers/${id}/events`, { name: payload.event_name, id: payload.event_id, timestamp: payload.time, data });
    return { ok: true };
  }

  /** Mensaje transaccional (no requiere consentimiento de marketing). */
  async function sendTransactional({ to, template, data = {}, language = null, userId = null } = {}) {
    const c = await creds();
    if (!c.appApiKey) return { skipped: true };
    const messageId = c.transactional?.[template] ?? template;
    if (!to || !messageId) return { skipped: true };
    const host = c.region === 'us' ? 'api.customer.io' : 'api.eu.customer.io';
    const res = await fetchImpl(`https://${host}/v1/send/email`, {
      method: 'POST',
      headers: { authorization: `Bearer ${c.appApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        transactional_message_id: messageId, to, message_data: { ...data, language },
        identifiers: userId ? { id: userId } : { email: to }, ...(language ? { language } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Customer.io ${res.status}: ${body?.meta?.error ?? 'error'}`);
    return { ok: true, delivery_id: body.delivery_id ?? null };
  }

  /** v0:{timestamp}:{cuerpo crudo}, HMAC-SHA256 hex. */
  function verifySignature(secret, headers, raw) {
    const h = Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const sig = String(h['x-cio-signature'] ?? '');
    const ts = String(h['x-cio-timestamp'] ?? '');
    if (!sig || !ts) return false;
    const expected = createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex');
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Webhook de informes. `rawBody` (cadena exacta recibida) es necesario para la firma; si falta se re-serializa el JSON. */
  async function handleWebhook(body, headers = {}, rawBody = null) {
    const c = await creds();
    if (c.webhookSecret) {
      const raw = rawBody ?? (typeof body === 'string' ? body : Buffer.isBuffer(body) ? body.toString('utf8') : JSON.stringify(body));
      if (!verifySignature(c.webhookSecret, headers, raw)) return { ok: false, status: 401, error: 'firma inválida' };
    } else if (config.isProduction) {
      return { ok: false, status: 401, error: 'webhook sin secreto configurado' };
    }
    let evt = body;
    if (typeof evt === 'string' || Buffer.isBuffer(evt)) { try { evt = JSON.parse(String(evt)); } catch { return { ok: false, status: 400, error: 'JSON inválido' }; } }
    const metric = String(evt?.metric ?? '').toLowerCase();
    if (!METRICS.has(metric)) return { ok: true, ignored: true };
    const d = evt.data ?? {};
    const ident = d.identifiers?.id ?? d.customer_id ?? null;
    let leadId = null; let userId = null;
    if (isUuid(ident)) {
      const lead = await q.one('select lead_id from growth.leads where lead_id = $1', [ident]);
      if (lead) leadId = lead.lead_id; else userId = ident;
    }
    const eventKey = evt.event_id ?? null;
    if (eventKey) {
      const dup = await q.one(`select 1 as x from growth.email_events where raw->>'event_id' = $1 limit 1`, [String(eventKey)]);
      if (dup) return { ok: true, duplicate: true };
    }
    const occurred = evt.timestamp ? new Date(Number(evt.timestamp) * 1000) : new Date();
    await q.exec(`insert into growth.email_events (flow, message, variant, event, lead_id, user_id, language, occurred_at, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [d.campaign_name ?? d.newsletter_name ?? null, d.subject ?? d.action_name ?? null, d.variant ?? null, metric, leadId, userId, d.language ?? null,
      Number.isNaN(occurred.getTime()) ? new Date() : occurred, JSON.stringify({ event_id: eventKey, delivery_id: d.delivery_id ?? null })]);
    if (metric === 'unsubscribed') {
      await q.exec(`insert into growth.consents (lead_id, user_id, kind, granted, text_version) values ($1,$2,'marketing_email',false,'customerio-unsubscribe')`, [leadId, userId]);
    }
    return { ok: true };
  }

  return { enabled, deliver, sendTransactional, handleWebhook };
}
