// Estructura común del área privada: protección de acceso, navegación y componentes compartidos.
import { $, api, h, ICONS, MARK_SVG, toast } from './ui.js';

export const NAV = [
  { href: '/dashboard', label: 'Inicio', icon: 'home' },
  { href: '/jornada', label: 'Jornada', icon: 'path' },
  { href: '/registro', label: 'Registrar', icon: 'plus' },
  { href: '/progreso', label: 'Progreso', icon: 'chart' },
  { href: '/perfil', label: 'Perfil', icon: 'user' },
];

export const MORE = [
  { href: '/respirar', label: 'Respirar' },
  { href: '/objetivos', label: 'Mis objetivos' },
  { href: '/diario', label: 'Mi diario' },
  { href: '/logros', label: 'Mis logros' },
  { href: '/ayuda', label: 'Habla con Aliento' },
];

const NAV_ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
  path: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
  chart: ICONS.chart,
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
};

/**
 * Comprueba sesión y acceso y pinta la estructura. Devuelve /api/me.
 *  - access: 'premium' (suscripción + configuración inicial) | 'account' (solo sesión).
 */
export async function initApp({ active, access = 'premium' } = {}) {
  const here = location.pathname + location.search;
  let me;
  try {
    me = await api('/api/me');
  } catch {
    me = { user: null };
  }
  if (!me.user) {
    location.replace(`/acceso?modo=entrar&next=${encodeURIComponent(here)}`);
    return new Promise(() => {});
  }
  if (access === 'premium') {
    if (!me.access) { location.replace(me.hasResult ? '/planes' : '/suscripcion'); return new Promise(() => {}); }
    if (!me.onboardingCompleted) { location.replace('/configuracion'); return new Promise(() => {}); }
  }
  renderShell(me, active);
  return me;
}

function renderShell(me, active) {
  const header = h('header', { class: 'site-header app-header' },
    h('div', { class: 'container site-header__inner' },
      h('a', { class: 'brand', href: me.access ? '/dashboard' : '/perfil', 'aria-label': 'Aliento, inicio', html: `${MARK_SVG}<span class="brand__name">Aliento</span>` }),
      h('nav', { class: 'app-nav', 'aria-label': 'Principal' },
        me.access ? NAV.map((n) => h('a', { href: n.href, 'aria-current': n.href === active ? 'page' : null }, n.label)) : null,
        me.user.isAdmin ? h('a', { href: '/admin' }, 'Admin') : null)));
  document.body.prepend(header);
  if (me.access) {
    document.body.classList.add('has-tabbar');
    document.body.append(h('nav', { class: 'tabbar', 'aria-label': 'Secciones' },
      NAV.map((n) => h('a', { href: n.href, 'aria-current': n.href === active ? 'page' : null },
        h('span', { class: 'tabbar__icon', html: NAV_ICONS[n.icon] }), h('span', {}, n.label)))));
  }
}

/** Contenedor principal de la página con título. */
export function page(root, { eyebrow, title, intro, actions } = {}) {
  root.replaceChildren(h('div', { class: 'page-head' },
    h('div', {}, eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null,
      h('h1', { class: 'title-lg' }, title), intro ? h('p', { class: 'muted page-intro' }, intro) : null),
    actions ?? null));
  return root;
}

export function loading(root) {
  root.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'skeleton', 'aria-label': 'Cargando' })));
}

export function errorState(root, err, retry) {
  root.replaceChildren(h('div', { class: 'empty-state' },
    h('p', { class: 'empty-state__title' }, 'No hemos podido cargar esta sección'),
    h('p', { class: 'muted' }, err.message),
    retry ? h('button', { class: 'btn btn--ghost', onclick: retry }, 'Reintentar') : null));
}

export function emptyState(title, text, action) {
  return h('div', { class: 'empty-state' },
    h('span', { class: 'empty-state__mark', html: MARK_SVG }),
    h('p', { class: 'empty-state__title' }, title),
    text ? h('p', { class: 'muted' }, text) : null,
    action ?? null);
}

/** Avisa de logros recién desbloqueados. */
export function celebrate(achievements) {
  for (const [i, a] of (achievements ?? []).entries()) {
    setTimeout(() => toast(`🏅 Nuevo logro: ${a.title}`, 4500), i * 1200);
  }
}

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

export const userTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function modal(content, { label, onClose } = {}) {
  const card = h('div', { class: 'card modal__card' });
  const el = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': label ?? '' }, card);
  const close = () => { el.remove(); document.removeEventListener('keydown', esc); onClose?.(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', esc);
  card.append(...[].concat(typeof content === 'function' ? content(close) : content));
  document.body.append(el);
  card.querySelector('button, input, select, textarea')?.focus();
  return { el, card, close };
}

export const FEELING_LABELS = {
  ansiedad: 'Ansiedad', estres: 'Estrés', aburrimiento: 'Aburrimiento', tristeza: 'Tristeza',
  enojo: 'Enojo', cansancio: 'Cansancio', alegria: 'Alegría', costumbre: 'Costumbre',
};

/**
 * Flujo "Tengo ganas de fumar": qué sientes → qué lo provocó → intensidad → estrategia → resultado.
 * Registra las ganas (no es consumo) y permite iniciar un ejercicio.
 */
export function cravingFlow({ triggerOptions, onDone } = {}) {
  const state = { feeling: null, trigger: null, intensity: 3, id: null };
  let step = 0;
  const requestId = uuid();
  const { card, close } = modal(() => [], { label: 'Tengo ganas de fumar' });

  const chips = (options, key) => h('div', { class: 'chips' }, options.map(([id, label]) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(state[key] === id),
    onclick: (e) => { state[key] = id; e.currentTarget.parentElement.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget))); },
  }, label)));

  async function save(outcome, strategy) {
    try {
      if (!state.id) {
        const r = await api('/api/app/cravings', { method: 'POST', body: {
          feeling: state.feeling, trigger: state.trigger, intensity: state.intensity, clientRequestId: requestId,
        } });
        state.id = r.craving.id;
        celebrate(r.achievements);
      }
      if (outcome) {
        const r = await api(`/api/app/cravings/${state.id}`, { method: 'PATCH', body: { outcome, strategy } });
        celebrate(r.achievements);
      }
      return true;
    } catch (err) {
      toast(err.message);
      return false;
    }
  }

  function render() {
    const steps = [
      () => [h('p', { class: 'eyebrow' }, 'Paso 1 de 3'), h('h2', { class: 'title-md' }, '¿Qué estás sintiendo?'),
        chips(Object.entries(FEELING_LABELS), 'feeling'),
        h('label', { class: 'field u-mt-16' }, h('span', {}, 'Intensidad de las ganas'),
          (() => { const r = h('input', { type: 'range', class: 'range', min: 1, max: 5, value: state.intensity, 'aria-valuetext': `${state.intensity} de 5` });
            r.addEventListener('input', () => { state.intensity = Number(r.value); }); return r; })(),
          h('span', { class: 'range-scale' }, h('span', {}, 'Leves'), h('span', {}, 'Muy fuertes')))],
      () => [h('p', { class: 'eyebrow' }, 'Paso 2 de 3'), h('h2', { class: 'title-md' }, '¿Qué provocó estas ganas?'),
        chips([...(triggerOptions ?? []).map((t) => [t.id, t.label]), ['otro', 'Otra cosa']], 'trigger')],
      () => [h('p', { class: 'eyebrow' }, 'Paso 3 de 3'), h('h2', { class: 'title-md' }, 'Déjalas pasar'),
        h('p', { class: 'muted' }, 'Las ganas suben, llegan a un pico y bajan, normalmente en pocos minutos. Elige qué hacer ahora:'),
        h('div', { class: 'stack u-mt-16' },
          h('a', { class: 'btn btn--block', href: '/respirar?ejercicio=calma-4-6&desde=ganas', onclick: async (e) => { e.preventDefault(); if (await save()) location.href = e.currentTarget.href; } }, 'Respirar 1 minuto'),
          h('button', { type: 'button', class: 'btn btn--ghost btn--block', onclick: () => { step = 3; render(); } }, 'Retrasar 5 minutos y beber agua'),
          h('a', { class: 'btn btn--ghost btn--block', href: '/ayuda', onclick: async (e) => { e.preventDefault(); if (await save()) location.href = '/ayuda'; } }, 'Ver mi estrategia personal'))],
      () => [h('h2', { class: 'title-md' }, '¿Cómo ha ido?'),
        h('p', { class: 'muted' }, 'Registrar el resultado te ayuda a conocer tus patrones. Sin juicios.'),
        h('div', { class: 'stack u-mt-16' },
          h('button', { class: 'btn btn--block', onclick: async () => { if (await save('resisted', 'retrasar')) { close(); toast('¡Bien hecho! Unas ganas menos.'); onDone?.(); } } }, 'Las he superado'),
          h('button', { class: 'btn btn--ghost btn--block', onclick: async () => { if (await save('smoked', 'retrasar')) { close(); location.href = '/registro?nuevo=1'; } } }, 'He fumado'),
          h('button', { class: 'link', onclick: async () => { if (await save()) { close(); toast('Ganas registradas.'); onDone?.(); } } }, 'Guardar sin resultado'))],
    ];
    const nav = step < 2 ? h('div', { class: 'modal__actions' },
      step > 0 ? h('button', { class: 'link', onclick: () => { step -= 1; render(); } }, 'Atrás') : h('button', { class: 'link', onclick: close }, 'Cerrar'),
      h('button', { class: 'btn', onclick: () => { step += 1; render(); } }, 'Continuar')) : h('button', { class: 'link u-mt-16', onclick: close }, 'Cerrar');
    card.replaceChildren(...steps[step](), nav);
  }
  render();
}

export function greeting(name) {
  const hour = new Date().getHours();
  const part = hour < 6 ? 'Buenas noches' : hour < 13 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
  return `${part}, ${name}`;
}

export function rangeTabs(current, onChange) {
  const opts = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [365, '1 año']];
  const el = h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Período' }, opts.map(([v, label]) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(v === current),
    onclick: () => { el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.textContent === label))); onChange(v); },
  }, label)));
  return el;
}

export { $ };
