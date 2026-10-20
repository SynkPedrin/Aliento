// Panel de Operación y Growth: SPA por hash (#/overview, #/funnel, …). Solo equipo con 2FA.
import { $, ApiError, api, brandLink, h, localDay, toast } from '../ui.js';
import { act, errorEl, loadingEl, state, field } from '../growth/lib.js';
import { acquisition, creatives, funnel, overview, sales } from '../growth/screens1.js';
import { ai, emails, experiments, people } from '../growth/screens2.js';
import { settings } from '../growth/settings.js';

const root = $('[data-root]');

const ROUTES = [
  ['overview', 'Visión general', overview, true],
  ['funnel', 'Embudo', funnel, true],
  ['acquisition', 'Adquisición', acquisition, true],
  ['creatives', 'Creativos', creatives, true],
  ['sales', 'Ventas', sales, true],
  ['people', 'Personas', people, false],
  ['emails', 'E-mails', emails, true],
  ['experiments', 'Experimentos', experiments, false],
  ['ai', 'IA', ai, false],
  ['settings', 'Configuración', settings, false],
];
const FILTER_KEYS = ['from', 'to', 'language', 'country', 'device', 'source', 'variant'];

// ---- Hash: ruta + parámetros (los filtros globales viven en la URL).
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const route = ROUTES.find((r) => r[0] === name) ?? ROUTES[0];
  const filters = {};
  for (const k of FILTER_KEYS) if (params[k]) filters[k] = params[k];
  return { route, params, filters };
}
function buildHash(name, params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return `#/${name}${s ? `?${s}` : ''}`;
}

// ---- Acceso
function fullPage(...children) {
  root.replaceChildren(h('main', { class: 'gr-auth', id: 'gr-main' }, h('div', { class: 'card gr-auth__card' }, brandLink('/'), ...children)));
}

function twofaScreen(me) {
  const code = h('input', { class: 'input', id: 'otp', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6}', maxlength: '6', required: '', 'aria-describedby': 'otp-help' });
  const msg = h('p', { class: 'help is-high', role: 'alert' });
  const setupBox = h('div');
  const enabled = !!me?.twofa?.enabled;
  const submit = async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const c = code.value.trim();
    if (!/^\d{6}$/.test(c)) { msg.textContent = 'El código tiene 6 dígitos.'; return; }
    const r = await act(e.submitter, async () => {
      if (!enabled && !state.enabledNow) { await api('/api/growth/2fa/enable', { method: 'POST', body: { code: c } }); state.enabledNow = true; }
      const m = await api('/api/growth/me');
      if (m.twofa?.verified) return m;
      return api('/api/growth/2fa/verify', { method: 'POST', body: { code: c } });
    });
    if (r) start();
  };
  fullPage(h('h1', { class: 'gr-title' }, enabled ? 'Verificación en dos pasos' : 'Configura la verificación en dos pasos'),
    h('p', { class: 'muted' }, enabled ? 'Introduce el código de 6 dígitos de tu app de autenticación.' : 'El panel contiene datos sensibles y exige un segundo factor. Añade la clave a tu app de autenticación (Google Authenticator, 1Password, Authy…).'),
    setupBox,
    h('form', { class: 'stack', onsubmit: submit }, field('otp', 'Código de 6 dígitos', code, null), h('p', { id: 'otp-help', class: 'help' }, 'Se renueva cada 30 segundos.'), msg,
      h('button', { class: 'btn', type: 'submit' }, enabled ? 'Verificar' : 'Activar y entrar')));
  if (!enabled) {
    api('/api/growth/2fa/setup', { method: 'POST' }).then((s) => {
      const copy = (txt, label) => h('div', { class: 'copyrow' }, h('p', { class: 'help' }, label), h('div', { class: 'copyrow__box' },
        h('input', { class: 'input mono', readonly: '', value: txt, 'aria-label': label, onfocus: (e) => e.target.select() }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { navigator.clipboard?.writeText(txt).then(() => toast('Copiado'), () => toast('Selecciona y copia el texto')); } }, 'Copiar')));
      setupBox.replaceChildren(copy(s.secret, 'Clave secreta'), copy(s.otpauthUrl, 'Enlace otpauth (para apps que permiten pegar una URL)'));
    }).catch((err) => { msg.textContent = err.message; });
  }
}

// ---- Estructura
let me = null;
function shell() {
  const { route } = parseHash();
  const nav = h('nav', { class: 'gr-nav', 'aria-label': 'Secciones del panel' }, ROUTES.map(([key, label]) => h('a', { href: `#/${key}`, 'data-route': key, 'aria-current': key === route[0] ? 'page' : null }, label)));
  root.replaceChildren(
    h('header', { class: 'gr-top' }, h('div', { class: 'gr-wrap gr-top__inner' }, brandLink('/growth'), h('span', { class: 'pill' }, 'Growth'),
      h('span', { class: 'gr-top__user' }, me.user?.email, ' · ', ({ admin: 'Administrador', marketing: 'Marketing', readonly: 'Solo lectura' })[me.role] ?? me.role))),
    h('div', { class: 'gr-wrap' }, nav, h('div', { id: 'gr-filters' }), h('main', { id: 'gr-main', tabindex: '-1' })));
}

const LANGS = [['', 'Todos'], ['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués']];
const COUNTRIES = [['', 'Todos'], ['ES', 'España'], ['US', 'EE. UU.'], ['MX', 'México'], ['AR', 'Argentina'], ['CO', 'Colombia'], ['CL', 'Chile'], ['BR', 'Brasil'], ['PT', 'Portugal']];
const DEVICES = [['', 'Todos'], ['mobile', 'Móvil'], ['desktop', 'Escritorio'], ['tablet', 'Tablet']];
function filterBar(params, filters) {
  const days = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localDay(d); };
  const sel = (id, label, opts, v) => field(id, label, h('select', { class: 'select', id, name: id }, opts.map(([val, l]) => h('option', { value: val, selected: val === (v ?? '') ? '' : null }, l))));
  const txt = (id, label, v, ph) => field(id, label, h('input', { class: 'input', id, name: id, value: v ?? '', maxlength: '60', placeholder: ph }));
  const dates = (id, label, v) => field(id, label, h('input', { class: 'input', id, name: id, type: 'date', value: v ?? '', max: localDay() }));
  const preset = field('preset', 'Periodo', h('select', { class: 'select', id: 'preset' }, [['', 'Últimos 30 días'], ['7', 'Últimos 7 días'], ['90', 'Últimos 90 días'], ['custom', 'Personalizado']].map(([v, l]) =>
    h('option', { value: v, selected: (filters.from || filters.to ? 'custom' : '') === v ? '' : null }, l))));
  const form = h('form', { class: 'gr-filters', 'aria-label': 'Filtros globales', onsubmit: (e) => { e.preventDefault(); apply(); } },
    preset, dates('from', 'Desde', filters.from), dates('to', 'Hasta', filters.to), sel('language', 'Idioma', LANGS, filters.language), sel('country', 'País', COUNTRIES, filters.country),
    sel('device', 'Dispositivo', DEVICES, filters.device), txt('source', 'Fuente', filters.source, 'meta, tiktok…'), txt('variant', 'Variante', filters.variant, 'control'),
    h('div', { class: 'gr-filters__btns' }, h('button', { class: 'btn btn--sm', type: 'submit' }, 'Aplicar'), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { location.hash = buildHash(parseHash().route[0], {}); } }, 'Limpiar')));
  const val = (n) => form.elements[n].value;
  preset.querySelector('select').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v === '7' || v === '90' || v === '') { form.elements.from.value = v ? days(Number(v)) : ''; form.elements.to.value = v ? localDay() : ''; apply(); }
  });
  function apply() {
    const next = { ...params };
    for (const k of FILTER_KEYS) next[k] = val(k).trim();
    location.hash = buildHash(parseHash().route[0], next);
  }
  const active = FILTER_KEYS.filter((k) => filters[k]).length;
  const box = h('details', { class: 'gr-filterbox card card--flat', open: window.matchMedia('(min-width: 900px)').matches || active ? '' : null },
    h('summary', {}, 'Filtros', active ? h('span', { class: 'pill pill--ok' }, `${active} activos`) : null), form);
  return box;
}

let token = 0;
async function render() {
  if (!me) return;
  const { route, params, filters } = parseHash();
  const my = ++token;
  if (!$('#gr-main') || !$('.gr-nav')) shell();
  document.querySelectorAll('.gr-nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.route === route[0] ? 'page' : 'false'));
  const holder = $('#gr-filters');
  holder.replaceChildren(route[3] ? filterBar(params, filters) : '');
  const main = $('#gr-main');
  main.replaceChildren(loadingEl());
  document.title = `${route[1]} · Growth · Alento`;
  const view = h('div', { class: 'gr-view' });
  try {
    await route[2](view, filters, params);
    if (my !== token) return;
    main.replaceChildren(view);
    main.focus({ preventScroll: true });
  } catch (err) { if (my === token) handleAuth(err, main); }
}

function handleAuth(err, main) {
  if (err instanceof ApiError && err.status === 401) { location.replace('/acceso?next=/growth'); return; }
  if (err instanceof ApiError && err.status === 428) { me = null; twofaScreen({ twofa: { enabled: true } }); return; }
  main.replaceChildren(errorEl(err, render));
}

// Las pantallas capturan errores en `load`; 401/428 los relanzan y llegan aquí.
window.addEventListener('unhandledrejection', (e) => {
  const err = e.reason;
  if (err instanceof ApiError && (err.status === 401 || err.status === 428)) { e.preventDefault(); handleAuth(err, $('#gr-main') ?? root); }
});

async function start() {
  root.replaceChildren(loadingEl());
  try {
    me = await api('/api/growth/me');
  } catch (err) {
    if (err.status === 401) { location.replace('/acceso?next=/growth'); return; }
    if (err.status === 428) { twofaScreen({ twofa: { enabled: true } }); me = null; return; }
    root.replaceChildren(h('div', { class: 'gr-wrap' }, errorEl(err, start)));
    return;
  }
  if (me.twofa && !me.twofa.verified) { const m = me; me = null; twofaScreen(m); return; }
  state.canEdit = !!me.canEdit;
  state.role = me.role;
  shell();
  if (!location.hash) location.replace('#/overview');
  render();
}

window.addEventListener('hashchange', render);
start();
