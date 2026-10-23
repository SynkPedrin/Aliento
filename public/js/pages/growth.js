// Panel de Operación y Growth: SPA por hash (#/overview, #/funnel, …). Solo equipo con 2FA.
import { $, ApiError, api, brandLink, h, localDay, setBusy, toast } from '../ui.js';
import { act, errorEl, loadingEl, state, field } from '../growth/lib.js';
import { ai, emails } from '../growth/screens2.js';
import { config as configScreen, funnel, funnels, home, sales, tracking } from '../growth/v2.js';

const root = $('[data-root]');

// [rota, rótulo no menu (null = fora do menu), tela, item do menu que fica marcado]
const ROUTES = [
  ['overview', 'Visão geral', home],
  ['funnels', 'Funis', funnels],
  ['funnel', null, funnel, 'funnels'],
  ['sales', 'Vendas', sales],
  ['emails', 'Funis de e-mail', emails],
  ['ai', 'Modo IA', ai],
  ['tracking', 'Traqueamento', tracking],
  ['settings', 'Configurações', configScreen],
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

// Login exclusivo do painel: só e-mail e senha. Contas novas são criadas lá dentro (Configurações → Equipe).
function loginScreen() {
  const email = h('input', { class: 'input', id: 'gr-email', type: 'email', autocomplete: 'username', required: '' });
  const pass = h('input', { class: 'input', id: 'gr-pass', type: 'password', autocomplete: 'current-password', required: '' });
  const msg = h('p', { class: 'help is-high', role: 'alert' });
  const submit = async (e) => {
    e.preventDefault();
    msg.textContent = '';
    const btn = e.submitter;
    setBusy(btn, true, 'Entrando…');
    try {
      await api('/api/auth/login', { method: 'POST', body: { email: email.value.trim(), password: pass.value } });
      start();
    } catch (err) {
      setBusy(btn, false);
      msg.textContent = err.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos.' : 'E-mail ou senha incorretos.';
    }
  };
  fullPage(h('h1', { class: 'gr-title' }, 'Painel de gestão'),
    h('form', { class: 'stack', onsubmit: submit }, field('gr-email', 'E-mail', email), field('gr-pass', 'Senha', pass), msg,
      h('button', { class: 'btn', type: 'submit' }, 'Entrar')));
  email.focus();
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
    if (!/^\d{6}$/.test(c)) { msg.textContent = 'O código tem 6 dígitos.'; return; }
    const r = await act(e.submitter, async () => {
      if (!enabled && !state.enabledNow) { await api('/api/growth/2fa/enable', { method: 'POST', body: { code: c } }); state.enabledNow = true; }
      const m = await api('/api/growth/me');
      if (m.twofa?.verified) return m;
      return api('/api/growth/2fa/verify', { method: 'POST', body: { code: c } });
    });
    if (r) start();
  };
  fullPage(h('h1', { class: 'gr-title' }, enabled ? 'Verificação em duas etapas' : 'Configure a verificação em duas etapas'),
    h('p', { class: 'muted' }, enabled ? 'Digite o código de 6 dígitos do seu app autenticador.' : 'O painel contém dados sensíveis e exige um segundo fator. Adicione a chave ao seu app autenticador (Google Authenticator, 1Password, Authy…).'),
    setupBox,
    h('form', { class: 'stack', onsubmit: submit }, field('otp', 'Código de 6 dígitos', code, null), h('p', { id: 'otp-help', class: 'help' }, 'Muda a cada 30 segundos.'), msg,
      h('button', { class: 'btn', type: 'submit' }, enabled ? 'Verificar' : 'Ativar e entrar')));
  if (!enabled) {
    api('/api/growth/2fa/setup', { method: 'POST' }).then((s) => {
      const copy = (txt, label) => h('div', { class: 'copyrow' }, h('p', { class: 'help' }, label), h('div', { class: 'copyrow__box' },
        h('input', { class: 'input mono', readonly: '', value: txt, 'aria-label': label, onfocus: (e) => e.target.select() }),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { navigator.clipboard?.writeText(txt).then(() => toast('Copiado'), () => toast('Selecione e copie o texto')); } }, 'Copiar')));
      setupBox.replaceChildren(copy(s.secret, 'Chave secreta'), copy(s.otpauthUrl, 'Link otpauth (para apps que permitem colar uma URL)'));
    }).catch((err) => { msg.textContent = err.message; });
  }
}

// ---- Estructura
let me = null;
function shell() {
  const nav = h('nav', { class: 'v2-nav', 'aria-label': 'Seções do painel' }, ROUTES.filter((r) => r[1]).map(([key, label]) => h('a', { href: `#/${key}`, 'data-route': key }, label)));
  root.replaceChildren(h('div', { class: 'v2-shell' },
    h('aside', { class: 'v2-side' }, h('div', { class: 'v2-logo' }, brandLink('/growth'), h('span', { class: 'v2-pill' }, 'Gestão')), nav,
      h('div', { class: 'v2-who' }, me.user?.email, h('br'), ({ admin: 'Administrador', marketing: 'Marketing', readonly: 'Somente leitura' })[me.role] ?? me.role,
        h('button', { type: 'button', class: 'v2-link', onclick: async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); } }, 'Sair'))),
    h('main', { id: 'gr-main', class: 'v2-main', tabindex: '-1' })));
}

let token = 0;
async function render() {
  if (!me) return;
  const { route, params, filters } = parseHash();
  const my = ++token;
  if (!$('#gr-main') || !$('.v2-nav')) shell();
  const active = route[3] ?? route[0];
  document.querySelectorAll('.v2-nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.route === active ? 'page' : 'false'));
  document.querySelector('.v2-drawer')?.classList.remove('open');
  const main = $('#gr-main');
  main.replaceChildren(loadingEl());
  document.title = `${route[1] ?? 'Funil'} · Gestão · Alento`;
  const view = h('div', { class: 'gr-view' });
  try {
    await route[2](view, filters, params);
    if (my !== token) return;
    main.replaceChildren(view);
    main.focus({ preventScroll: true });
  } catch (err) { if (my === token) handleAuth(err, main); }
}

function handleAuth(err, main) {
  if (err instanceof ApiError && err.status === 401) { me = null; loginScreen(); return; }
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
    if (err.status === 401) { loginScreen(); return; }
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
