// Contexto de la petición para el rastreo: dispositivo, país, atribución y consentimiento.
import { createHash } from 'node:crypto';

export const sha256 = (v) => createHash('sha256').update(String(v)).digest('hex');
export const hashEmail = (email) => sha256(String(email ?? '').trim().toLowerCase());
export const hashPhone = (phone) => sha256(String(phone ?? '').replace(/[^\d]/g, ''));

export function deviceOf(ua = '') {
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|Android/i.test(ua)) return 'mobile';
  return ua ? 'desktop' : null;
}
export function browserOf(ua = '') {
  if (/Edg\//.test(ua)) return 'edge';
  if (/OPR\/|Opera/.test(ua)) return 'opera';
  if (/CriOS|Chrome\//.test(ua)) return 'chrome';
  if (/FxiOS|Firefox\//.test(ua)) return 'firefox';
  if (/Safari\//.test(ua)) return 'safari';
  return ua ? 'other' : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID.test(String(v ?? ''));
const clip = (v, n = 200) => (v == null || v === '' ? null : String(v).slice(0, n));

/** Sanea un toque de atribución (UTMs y click ids). */
export function cleanTouch(t = {}) {
  const o = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'ttclid', 'fbp', 'fbc', 'px', 'referrer', 'landing']) {
    const v = clip(t?.[k], k === 'landing' || k === 'referrer' ? 500 : 200);
    if (v) o[k] = v;
  }
  if (t?.at) o.at = clip(t.at, 40);
  return o;
}

/** Atribución de una petición: cookie de primera parte `al_att` {first,last} + `al_vid`. */
export function attributionFromRequest(req) {
  let att = {};
  try { att = JSON.parse(decodeURIComponent(req.cookies?.al_att ?? '') || '{}'); } catch { att = {}; }
  const vid = req.cookies?.al_vid;
  return {
    visitorId: isUuid(vid) ? vid : null,
    first: cleanTouch(att.first), last: cleanTouch(att.last ?? att.first),
  };
}

/** Datos del cliente para correspondencia (IP, navegador, país). */
export function clientInfo(req) {
  const ua = String(req.get?.('user-agent') ?? '').slice(0, 400);
  const fwd = String(req.get?.('x-forwarded-for') ?? '').split(',')[0].trim();
  return {
    ip: fwd || req.ip || null,
    userAgent: ua,
    country: clip(req.get?.('x-vercel-ip-country'), 2),
    device: deviceOf(ua), browser: browserOf(ua),
  };
}

/** Quita cualquier rastro del hábito de una URL antes de enviarla a plataformas de anuncios. */
export function sanitizeUrl(url, appUrl) {
  try {
    const u = new URL(url, appUrl);
    const first = u.pathname.split('/').filter(Boolean)[0] ?? '';
    return `${u.origin}/${['quiz', 'test', 'resultados', 'planes'].includes(first) ? first : ''}`.replace(/\/$/, '/');
  } catch { return appUrl; }
}

/** UUID determinista para eventos que el navegador y el servidor deben compartir (deduplicación de pixels). */
export function eventIdFor(kind, key) {
  const h = sha256(`${kind}:${key}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
