// Envío de la bandeja de salida (growth.outbox) a Meta CAPI, TikTok Events API y Customer.io.
// Solo viaja lo que ya está en el payload (sin respuestas del quiz ni hábito).
import { randomUUID } from 'node:crypto';
import { sha256 } from './context.js';

const META_EVENTS = {
  page_view: 'PageView', quiz_started: 'ViewContent', lead_created: 'Lead', plan_viewed: 'PlanViewed',
  plan_selected: 'AddToCart', checkout_started: 'InitiateCheckout', purchase: 'Purchase', app_activated: 'CompleteRegistration',
};
const TIKTOK_EVENTS = {
  page_view: 'PageView', quiz_started: 'ViewContent', lead_created: 'SubmitForm', plan_viewed: 'PlanViewed',
  plan_selected: 'AddToCart', checkout_started: 'InitiateCheckout', purchase: 'CompletePayment', app_activated: 'CompleteRegistration',
};
export const MAX_ATTEMPTS = 6;
const BACKOFF_SECONDS = [60, 300, 1800, 7200, 43200]; // 1m, 5m, 30m, 2h, 12h
const LEASE_SECONDS = 600; // reserva mientras se envía (evita doble envío entre ejecuciones)

const money = (cents) => (cents == null ? null : Math.round(Number(cents)) / 100);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ''));

/** Cuerpo para Meta Conversions API (puro). */
export function buildMetaBody(payload, cfg = {}) {
  const u = payload.user ?? {};
  const user_data = clean({
    em: u.email_hash ? [u.email_hash] : null,
    client_ip_address: u.ip, client_user_agent: u.user_agent, fbp: u.fbp, fbc: u.fbc,
    external_id: u.external_id ? [sha256(u.external_id)] : null,
    country: u.country ? [sha256(String(u.country).toLowerCase())] : null,
  });
  const custom = clean({ value: money(payload.value_cents), currency: payload.value_cents != null ? (payload.currency ?? 'EUR').toUpperCase() : null, content_name: payload.content_name });
  const event = clean({
    event_name: META_EVENTS[payload.event_name], event_time: payload.time, event_id: payload.event_id,
    event_source_url: payload.url, action_source: 'website', user_data,
    custom_data: Object.keys(custom).length ? custom : null,
  });
  return clean({ data: [event], test_event_code: cfg.testEventCode });
}

/** Cuerpo para TikTok Events API 1.3 (puro). */
export function buildTikTokBody(payload, cfg = {}) {
  const u = payload.user ?? {};
  const props = clean({ value: money(payload.value_cents), currency: payload.value_cents != null ? (payload.currency ?? 'EUR').toUpperCase() : null, content_name: payload.content_name });
  const event = clean({
    event: TIKTOK_EVENTS[payload.event_name], event_time: payload.time, event_id: payload.event_id,
    user: clean({ email: u.email_hash, external_id: u.external_id ? sha256(u.external_id) : null, ip: u.ip, user_agent: u.user_agent, ttclid: u.ttclid }),
    page: clean({ url: payload.url }),
    properties: Object.keys(props).length ? props : null,
  });
  return clean({ event_source: 'web', event_source_id: cfg.pixelId, test_event_code: cfg.testEventCode, data: [event] });
}

/** Calidad de coincidencia 0..10 según los campos de identidad presentes. */
export function matchQuality(payload) {
  const u = payload?.user ?? {};
  let score = 0;
  if (u.email_hash) score += 4;
  if (u.ip) score += 2;
  if (u.user_agent) score += 1;
  if (u.fbp || u.fbc || u.ttclid) score += 2;
  if (u.external_id) score += 1;
  return score;
}

export function createForwarders({ db, settings, config, email, fetchImpl = globalThis.fetch, log = console }) {
  const q = db.service;

  async function sendMeta(payload) {
    const cfg = await settings.get('pixels.meta');
    if (!cfg?.pixelId || !cfg?.accessToken) return { skipped: true };
    if (!META_EVENTS[payload.event_name]) return { skipped: true };
    const res = await fetchImpl(`https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.pixelId)}/events?access_token=${encodeURIComponent(cfg.accessToken)}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(buildMetaBody(payload, cfg)),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Meta ${res.status}: ${body?.error?.message ?? 'erro'}`);
    return { response: { events_received: body.events_received ?? null, fbtrace_id: body.fbtrace_id ?? null } };
  }

  async function sendTikTok(payload) {
    const cfg = await settings.get('pixels.tiktok');
    if (!cfg?.pixelId || !cfg?.accessToken) return { skipped: true };
    if (!TIKTOK_EVENTS[payload.event_name]) return { skipped: true };
    const res = await fetchImpl('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
      method: 'POST', headers: { 'content-type': 'application/json', 'Access-Token': cfg.accessToken }, body: JSON.stringify(buildTikTokBody(payload, cfg)),
    });
    const body = await res.json().catch(() => ({}));
    // TikTok responde 200 con code != 0 en error.
    if (!res.ok || (body.code !== undefined && body.code !== 0)) throw new Error(`TikTok ${res.status}: ${body?.message ?? 'erro'}`);
    return { response: { code: body.code ?? 0, request_id: body.request_id ?? null } };
  }

  async function sendOne(row) {
    if (row.destination === 'meta') return sendMeta(row.payload);
    if (row.destination === 'tiktok') return sendTikTok(row.payload);
    if (row.destination === 'customerio') {
      if (!email?.enabled || !(await email.enabled())) return { skipped: true };
      const r = await email.deliver(row.payload);
      return r?.skipped ? { skipped: true } : { response: r ?? {} };
    }
    return { skipped: true };
  }

  async function processOutbox({ limit = 50 } = {}) {
    // Reserva las filas vencidas (skip locked) y aplaza su próximo intento; el envío ocurre fuera de la transacción.
    const rows = await db.tx((t) => t.rows(`
      with due as (
        select id from growth.outbox where status = 'pending' and next_attempt_at <= now()
        order by next_attempt_at, id limit $1 for update skip locked)
      update growth.outbox o set next_attempt_at = now() + make_interval(secs => $2)
      from due where o.id = due.id
      returning o.id, o.destination, o.payload, o.attempts`, [limit, LEASE_SECONDS]));
    const out = { sent: 0, failed: 0, skipped: 0 };
    for (const row of rows) {
      try {
        const r = await sendOne(row);
        if (r.skipped) {
          await q.exec(`update growth.outbox set status = 'skipped', last_error = 'destino no configurado' where id = $1`, [row.id]);
          out.skipped++;
        } else {
          await q.exec(`update growth.outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, response = $2::jsonb, last_error = null where id = $1`,
            [row.id, JSON.stringify(r.response ?? {})]);
          out.sent++;
        }
      } catch (err) {
        const attempts = row.attempts + 1;
        const final = attempts >= MAX_ATTEMPTS;
        const delay = BACKOFF_SECONDS[Math.min(attempts - 1, BACKOFF_SECONDS.length - 1)];
        await q.exec(`update growth.outbox set status = $2, attempts = $3, last_error = $4,
          next_attempt_at = now() + make_interval(secs => $5) where id = $1`,
        [row.id, final ? 'failed' : 'pending', attempts, String(err.message).slice(0, 500), delay]);
        out.failed++; // cuenta cada intento fallido (reintento o definitivo)
        log.warn?.(`[growth] outbox ${row.destination} #${row.id}: ${String(err.message).slice(0, 120)}`);
      }
    }
    return out;
  }

  /** Teste de conexão pelo painel: envia um PageView com o código de eventos de teste (não conta como evento real). */
  async function sendTest(dest) {
    if (!['meta', 'tiktok'].includes(dest)) return { ok: false, message: 'Integração desconhecida.' };
    const cfg = await settings.get(`pixels.${dest}`);
    const nome = dest === 'meta' ? 'Meta' : 'TikTok';
    if (!cfg?.pixelId || !cfg?.accessToken) return { ok: false, message: `Preencha o ID do pixel e o token de acesso do ${nome} e salve antes de testar.` };
    if (!cfg.testEventCode) return { ok: false, message: `Informe o "Código de eventos de teste" do ${nome} e salve. Assim o teste não conta como evento real.` };
    const payload = { event_name: 'page_view', event_id: randomUUID(), time: Math.floor(Date.now() / 1000), url: `${config.appUrl}/`,
      user: { ip: '203.0.113.10', user_agent: 'AlentoPainel/1.0 (teste de conexão)' } };
    try {
      const r = dest === 'meta' ? await sendMeta(payload) : await sendTikTok(payload);
      if (r.skipped) return { ok: false, message: 'Nada foi enviado: configuração incompleta.' };
      const detalhe = dest === 'meta' ? `eventos recebidos: ${r.response.events_received ?? '?'}` : `código ${r.response.code}`;
      return { ok: true, message: `Conexão OK com ${nome} (${detalhe}). Abra "Testar eventos" no ${dest === 'meta' ? 'Gerenciador de Eventos' : 'TikTok Events Manager'} com o código ${cfg.testEventCode} para ver o PageView de teste.` };
    } catch (err) {
      return { ok: false, message: `Falha na conexão com ${nome}: ${String(err.message).replace(/access_token=[^&\s]+/g, 'access_token=***')}` };
    }
  }

  return { processOutbox, sendTest };
}
