// Utilidades compartidas: API, formato, marca e iconos.

import { locale, t } from './lang/index.js';

export { locale, t };
// Números e moedas no formato do idioma da tela (em espanhol, o formato que o servidor indicar).
const numLocale = (fallback) => (locale === 'es' ? fallback : locale);

// ---- App instalable (PWA): service worker y diálogo de instalación (se captura lo antes posible).
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__alientoInstallPrompt = e;
    document.dispatchEvent(new Event('aliento:installable'));
  });
  window.addEventListener('appinstalled', () => { window.__alientoInstallPrompt = null; });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.code = data?.code;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Alento-Lang': locale, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Sin conexión: se avisa claramente y no se simula ningún guardado.
    throw new ApiError(navigator.onLine === false
      ? 'Sin conexión. No se ha guardado nada; inténtalo de nuevo cuando vuelvas a tener internet.'
      : 'No hemos podido conectar con Alento. No se ha guardado nada; inténtalo de nuevo.', 0, { code: 'OFFLINE' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'No hemos podido conectar. Revisa tu conexión.', res.status, data);
  return data;
}

/** Crea un elemento: h('div', { class: 'x', onclick }, ...hijos) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    // Vía CSSOM: la CSP bloquea atributos style, pero no las propiedades de estilo.
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function money(value, currency = 'EUR', locale = 'es-US', decimals) {
  const opts = { style: 'currency', currency };
  if (decimals !== undefined) Object.assign(opts, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return new Intl.NumberFormat(numLocale(locale), opts).format(value);
}

/** Importe en céntimos (Stripe) → texto. */
export const moneyCents = (cents, currency, locale = 'es-US') => money(cents / 100, currency, locale);

export const num = (n, locale = 'es-US') => new Intl.NumberFormat(numLocale(locale)).format(n);

export function longDate(iso, locale = 'es-US') {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function localDay(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const MARK_SVG = '<img class="brand__mark" src="/assets/brand/alento-simbolo.svg" alt="" aria-hidden="true">';
export const LOGO_BRANCO_HTML = '<img class="brand__logo" src="/assets/brand/alento-logo-branco.svg" alt="Alento">';

export function brandLink(href = '/', { dark = false } = {}) {
  if (dark) return h('a', { class: 'brand', href, 'aria-label': 'Alento, inicio', html: LOGO_BRANCO_HTML });
  return h('a', { class: 'brand', href, 'aria-label': 'Alento, inicio', html: `${MARK_SVG}<span class="brand__name">Alento</span>` });
}

/* ---- Splash de entrada: fundo Azul Fôlego + logotipo oficial branco.
   Some quando a página avisa (splashReady) ou em 1,1 s, o que vier primeiro. Nunca bloqueia. */
let splashEl = null;
let splashTimer = null;

export function mountSplash() {
  if (splashEl || typeof document === 'undefined' || !document.body) return;
  splashEl = h('div', { class: 'splash', 'aria-hidden': 'true' },
    h('img', { class: 'splash__logo', src: '/assets/brand/alento-logo-branco.svg', alt: '' }));
  document.body.append(splashEl);
  splashTimer = setTimeout(splashReady, 1100);
}

export function splashReady() {
  if (!splashEl) return;
  clearTimeout(splashTimer);
  const el = splashEl;
  splashEl = null;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.remove(); return; }
  el.classList.add('is-done');
  setTimeout(() => el.remove(), 260);
}

export const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".8" fill="currentColor"/></svg>',
  wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 14h15a3 3 0 1 1-3 3"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3Z"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
};

export const icon = (name, cls = '') => h('span', { class: cls, html: ICONS[name] });

export function toast(message, ms = 3500) {
  const el = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export function setBusy(btn, busy, label) {
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), label ?? 'Un momento…');
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label ?? btn.textContent;
  }
}

/** Cabecera común. `links`: [{href,label,cls}] */
export function renderHeader(target, { links = [], clear = false } = {}) {
  const header = h('header', { class: `site-header${clear ? ' site-header--clear' : ''}` },
    h('div', { class: 'container site-header__inner' },
      brandLink('/'),
      h('nav', { 'aria-label': 'Principal' }, links.map((l) => h('a', { href: l.href, class: l.cls }, l.label))),
    ));
  target.replaceWith(header);
  return header;
}

export function renderFooter(target) {
  const year = new Date().getFullYear();
  target.replaceWith(h('footer', { class: 'site-footer' },
    h('div', { class: 'container site-footer__inner' },
      h('span', {}, `© ${year} Alento. Alento no sustituye el consejo médico profesional.`),
      h('nav', { 'aria-label': 'Legal' },
        h('a', { href: '/terminos' }, 'Términos'),
        h('a', { href: '/privacidad' }, 'Privacidad'),
        h('a', { href: '/perfil' }, 'Mi perfil')),
    )));
}

/** Revela secciones al entrar en pantalla (presentación progresiva). */
export function revealOnScroll(elements) {
  if (!('IntersectionObserver' in window)) {
    elements.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  elements.forEach((el) => io.observe(el));
}

