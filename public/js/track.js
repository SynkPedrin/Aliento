// Rastreo del embudo (primera parte). Un solo módulo para la landing y la app:
//  · visitante (cookie al_vid) y atribución primer/último toque 90 días (cookie al_att)
//  · eventos → /api/track (base propia) y, solo con consentimiento de marketing, pixels de Meta/TikTok
//    con el mismo event_id que la API de conversiones del servidor (deduplicación).
//  · nunca se envían respuestas del quiz ni el hábito a las plataformas de anuncios.
const DAY = 86400;
const LANGS = ['es', 'pt-BR', 'pt-PT', 'en', 'fr', 'de'];
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

function getCookie(name) {
  return document.cookie.split('; ').find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}
function setCookie(name, value, days) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${value}; Max-Age=${days * DAY}; Path=/; SameSite=Lax${secure}`;
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* modo privado */ } },
  sget(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  sset(k, v) { try { sessionStorage.setItem(k, v); } catch { /* modo privado */ } },
};

// ---------------------------------------------------------------- visitante y atribución
export function visitorId() {
  let id = getCookie('al_vid');
  if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) { id = uuid(); }
  setCookie('al_vid', id, 400);
  return id;
}
function sessionId() {
  let s = store.sget('al_sid');
  if (!s) { s = uuid(); store.sset('al_sid', s); }
  return s;
}

const TOUCH_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'ttclid'];
function currentTouch() {
  const p = new URLSearchParams(location.search);
  const t = {};
  for (const k of TOUCH_KEYS) if (p.get(k)) t[k] = p.get(k).slice(0, 200);
  if (document.referrer) { try { const r = new URL(document.referrer); if (r.host !== location.host) t.referrer = r.host; } catch { /* sin referrer */ } }
  return t;
}
const hasSignal = (t) => TOUCH_KEYS.some((k) => t[k]);

function readAttribution() {
  let a = {};
  try { a = JSON.parse(decodeURIComponent(getCookie('al_att') ?? '') || '{}'); } catch { a = {}; }
  const cur = currentTouch();
  const stamp = { ...cur, landing: location.pathname.replace(/^\/quiz\/.*/, '/quiz'), at: new Date().toISOString() };
  const fbp = getCookie('_fbp'); let fbc = getCookie('_fbc');
  if (!fbc && cur.fbclid) fbc = `fb.1.${Date.now()}.${cur.fbclid}`;
  if (fbp) stamp.fbp = fbp; if (fbc) stamp.fbc = fbc;
  if (!a.first) a.first = stamp;
  if (!a.last || hasSignal(cur)) a.last = stamp; else { a.last = { ...a.last, ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) }; }
  setCookie('al_att', encodeURIComponent(JSON.stringify(a)), 90);
  return a;
}

// ---------------------------------------------------------------- consentimiento
const CONSENT_KEY = 'alento-cookies'; // 'all' | 'min' (lo escribe también la landing)
export const marketingConsent = () => ['all', 'todos'].includes(store.get(CONSENT_KEY));
export function setCookieConsent(choice) {
  store.set(CONSENT_KEY, choice);
  window.dispatchEvent(new Event('alento-consent'));
}

/** Consentimiento explícito para usar respuestas de salud en el plan (RGPD art. 9 / LGPD). */
const HEALTH_KEY = 'alento-health-consent';
export const hasHealthConsent = () => store.get(HEALTH_KEY) === '2026-10-v1';
export function giveHealthConsent() {
  store.set(HEALTH_KEY, '2026-10-v1');
  send([{ name: 'consent', props: { kind: 'health_data', granted: true } }]);
}

function language() {
  const l = store.get('alento-lang') || document.documentElement.lang || 'es';
  return LANGS.includes(l) ? l : 'es';
}

// ---------------------------------------------------------------- envío
let config = null;
let pending = [];
let timer = null;

async function loadConfig() {
  if (config) return config;
  try { config = await (await fetch('/api/track/config', { credentials: 'same-origin' })).json(); } catch { config = {}; }
  return config;
}

function send(events, { beacon = false } = {}) {
  const att = readAttribution();
  const body = JSON.stringify({
    visitor: { id: visitorId(), session: sessionId(), touch: att },
    language: language(), page: location.pathname + location.search,
    consent: { marketing: marketingConsent() }, variant: variants(),
    events: events.map((e) => ({ id: e.id ?? uuid(), name: e.name, props: e.props ?? {}, page: location.pathname })),
  });
  if (beacon && navigator.sendBeacon) { navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' })); return Promise.resolve(); }
  return fetch('/api/track', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body }).then((r) => r.text()).catch(() => {});
}

function flush() { timer = null; const batch = pending; pending = []; if (batch.length) send(batch); }

// ---------------------------------------------------------------- pixels (solo con consentimiento de marketing)
const META = { page_view: ['track', 'PageView'], quiz_started: ['track', 'ViewContent'], lead_created: ['track', 'Lead'], plan_viewed: ['trackCustom', 'PlanViewed'],
  plan_selected: ['track', 'AddToCart'], checkout_started: ['track', 'InitiateCheckout'], purchase: ['track', 'Purchase'], app_activated: ['track', 'CompleteRegistration'] };
const TIKTOK = { page_view: 'Pageview', quiz_started: 'ViewContent', lead_created: 'SubmitForm', plan_viewed: 'PlanViewed', plan_selected: 'AddToCart',
  checkout_started: 'InitiateCheckout', purchase: 'CompletePayment', app_activated: 'CompleteRegistration' };
let pixelsReady = false;

function loadScript(src) { const s = document.createElement('script'); s.async = true; s.src = src; document.head.append(s); }

async function ensurePixels() {
  if (pixelsReady || !marketingConsent()) return;
  const cfg = await loadConfig();
  pixelsReady = true;
  if (cfg.meta?.pixelId && !window.fbq) {
    const f = window.fbq = function fbq() { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
    window._fbq = f; f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
    loadScript('https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', cfg.meta.pixelId);
  }
  if (cfg.tiktok?.pixelId && !window.ttq) {
    const ttq = window.ttq = [];
    ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
    ttq.setAndDefer = (t, e) => { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))); }; };
    for (const m of ttq.methods) ttq.setAndDefer(ttq, m);
    ttq.load = (id) => { ttq._i = ttq._i || {}; ttq._i[id] = []; ttq._t = ttq._t || {}; ttq._t[id] = +new Date(); loadScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${id}&lib=ttq`); };
    ttq.load(cfg.tiktok.pixelId);
  }
}

/** Dispara el evento en los pixels con el mismo event_id que usará el servidor. Sin datos de salud. */
async function firePixels(name, eventId, extra = {}) {
  if (!marketingConsent()) return;
  await ensurePixels();
  const custom = extra.value != null ? { value: extra.value, currency: extra.currency } : {};
  if (window.fbq && META[name]) window.fbq(META[name][0], META[name][1], custom, { eventID: eventId });
  if (window.ttq && TIKTOK[name]) window.ttq.track(TIKTOK[name], { ...custom }, { event_id: eventId });
}

// ---------------------------------------------------------------- API pública
/** Registra un evento del navegador. `props` nunca viaja a anuncios. */
export function track(name, props = {}, { pixel = true, id = uuid() } = {}) {
  pending.push({ id, name, props });
  if (!timer) timer = setTimeout(flush, 400);
  if (pixel) firePixels(name, id, { value: props.valueCents != null ? props.valueCents / 100 : undefined, currency: props.currency });
  return id;
}

/** Pixel del navegador para un evento que escribe el servidor (lead, checkout, compra) con su event_id. */
export function pixelFor(name, eventId, extra) { return firePixels(name, eventId, extra); }

/** Alta de lead tras el quiz. */
export async function submitLead({ email, program, marketingEmail }) {
  const res = await fetch('/api/lead', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, program, language: language(), page: location.pathname, visitorId: visitorId(),
      consents: { health_data: true, marketing_email: Boolean(marketingEmail), cookies_marketing: marketingConsent() } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'No se pudo guardar tu e-mail.'), { code: data.code ?? 'SERVER' });
  if (data.eventId) pixelFor('lead_created', data.eventId);
  return data;
}

/** Variante A/B estable de un experimento activo (o null). */
const VARIANTS = {};
export function variants() { return { ...VARIANTS }; }
export async function variant(key) {
  if (VARIANTS[key]) return VARIANTS[key];
  try {
    const r = await (await fetch(`/api/track/variant?visitor=${visitorId()}&key=${encodeURIComponent(key)}`, { credentials: 'same-origin' })).json();
    if (r.variant) VARIANTS[key] = r.variant;
    return r.variant ?? null;
  } catch { return null; }
}

// ---------------------------------------------------------------- banner de cookies (páginas de la app; la landing tiene el suyo)
function mountBanner() {
  if (store.get(CONSENT_KEY) || document.querySelector('.cookies')) return;
  const box = document.createElement('div');
  box.className = 'cookies-lite'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Cookies');
  const p = document.createElement('p');
  p.textContent = 'Usamos cookies para que Alento funcione y, si aceptas, para medir y mejorar nuestros anuncios. Tú eliges.';
  const row = document.createElement('div');
  const mk = (label, choice, cls) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.addEventListener('click', () => { setCookieConsent(choice); box.remove(); document.body.classList.remove('has-cookiebar'); }); return b; };
  row.append(mk('Solo las esenciales', 'min', 'btn btn--ghost btn--sm'), mk('Aceptar todas', 'all', 'btn btn--sm'));
  box.append(p, row);
  document.body.append(box);
  document.body.classList.add('has-cookiebar'); // deja espacio para que el banner no tape los botones
}

let started = false;
export function initTracking({ pageView = true, banner = true } = {}) {
  if (started) return; started = true;
  readAttribution();
  if (banner) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBanner); else mountBanner(); }
  window.addEventListener('alento-consent', () => {
    send([{ name: 'consent', props: { kind: 'cookies_marketing', granted: marketingConsent() } }]);
    if (pageView && marketingConsent()) firePixels('page_view', uuid());
  });
  window.addEventListener('pagehide', () => { if (pending.length) { const b = pending; pending = []; send(b, { beacon: true }); } });
  if (pageView) track('page_view', {});
}

// La landing y las páginas que importan este módulo arrancan solas.
if (!window.__alentoNoAutoTrack) initTracking();
