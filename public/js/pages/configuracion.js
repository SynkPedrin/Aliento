import { $, api, h, localDay, longDate, renderHeader, setBusy, toast } from '../ui.js';

renderHeader($('[data-header]'), { links: [{ href: '/perfil', label: 'Mi perfil' }] });
const root = $('[data-root]');
const dots = [...document.querySelectorAll('[data-dots] span')];
let state;
let step = 0;

const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localDay(d); };
const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7)); return localDay(d); };

async function save(body, btn) {
  if (btn) setBusy(btn, true, 'Guardando…');
  try {
    state = await api('/api/app/onboarding', { method: 'PUT', body });
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  } finally {
    if (btn) setBusy(btn, false);
  }
}

const head = (n, title, text) => [
  h('p', { class: 'eyebrow' }, `Paso ${n} de 3`),
  h('h1', { class: 'title-md', style: 'margin-top:10px' }, title),
  h('p', { class: 'muted', style: 'margin-top:8px;margin-bottom:24px' }, text),
];

function stepGoal() {
  let goal = state.goal;
  const list = h('div', { class: 'choice-list', role: 'radiogroup' });
  const draw = () => list.replaceChildren(...state.strategies.map((s) => h('button', {
    type: 'button', role: 'radio', class: `option${goal === s.id ? ' is-selected' : ''}`, 'aria-checked': String(goal === s.id),
    onclick: () => { goal = s.id; draw(); },
  }, h('span', { class: 'option__label' }, h('strong', {}, s.name), h('br'), h('span', { class: 'small muted' }, s.summary)), h('span', { class: 'option__radio' }))));
  draw();
  const btn = h('button', { class: 'btn btn--lg btn--block', style: 'margin-top:24px', onclick: async () => { if (await save({ goal }, btn)) go(1); } }, 'Confirmar mi meta');
  return [...head(1, 'Confirma tu meta', 'Hemos preparado tu plan con la estrategia que elegiste. Puedes cambiarla ahora: tu plan se ajustará.'), list, btn];
}

function stepDate() {
  const input = h('input', { class: 'input', type: 'date', id: 'start', min: localDay(), max: addDays(60), value: state.startDate ?? localDay() });
  const quick = [['Hoy', localDay()], ['Mañana', addDays(1)], ['El lunes', nextMonday()]];
  const chips = h('div', { class: 'chips', style: 'margin-bottom:16px' }, quick.map(([label, v]) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(input.value === v),
    onclick: (e) => { input.value = v; chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget))); preview(); },
  }, label)));
  const out = h('p', { class: 'small muted', style: 'margin-top:10px' });
  const preview = () => { out.textContent = input.value ? `Tu plan empezará el ${longDate(input.value)}.` : ''; };
  input.addEventListener('input', () => { chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', 'false')); preview(); });
  preview();
  const btn = h('button', { class: 'btn btn--lg btn--block', style: 'margin-top:24px', onclick: async () => { if (await save({ startDate: input.value }, btn)) go(2); } }, 'Guardar fecha');
  return [...head(2, 'Elige tu fecha de inicio', 'Escoge un día en el que puedas prestar atención a tu plan. Puede ser hoy mismo.'),
    chips, h('div', { class: 'field' }, h('label', { for: 'start' }, 'Fecha de inicio'), input), out, btn,
    h('button', { class: 'link', style: 'margin-top:12px', onclick: () => go(0) }, 'Atrás')];
}

function stepNotifications() {
  const n = { enabled: state.notifications?.enabled ?? false, time: state.notifications?.time ?? '09:00' };
  const toggle = (key, title, text) => {
    const input = h('input', { type: 'checkbox', role: 'switch', checked: n[key] });
    input.addEventListener('change', () => { n[key] = input.checked; });
    return h('label', { class: 'toggle' }, h('span', {}, h('strong', {}, title), h('br'), h('span', { class: 'small muted' }, text)), input);
  };
  const time = h('input', { class: 'input', type: 'time', id: 'time', value: n.time });
  time.addEventListener('input', () => { n.time = time.value; });
  const browserBtn = 'Notification' in window && Notification.permission === 'default'
    ? h('button', { type: 'button', class: 'btn btn--ghost btn--sm', style: 'margin-top:16px', onclick: async (e) => {
      const p = await Notification.requestPermission();
      e.currentTarget.replaceWith(h('p', { class: 'small muted', style: 'margin-top:16px' }, p === 'granted' ? 'Notificaciones del navegador activadas.' : 'Puedes activarlas más tarde desde tu navegador.'));
    } }, 'Permitir notificaciones en este navegador')
    : null;
  const btn = h('button', { class: 'btn btn--lg btn--block', style: 'margin-top:24px', onclick: async () => {
    if (await save({ notifications: n }, btn)) go(3);
  } }, 'Guardar preferencias');
  return [...head(3, 'Configura tus recordatorios', 'Te ayudaremos a mantener el ritmo, sin agobios. Puedes cambiarlo cuando quieras.'),
    toggle('enabled', 'Quiero recibir recordatorios', 'Solo de lo que elijas. Puedes desactivarlos cuando quieras en Notificaciones.'),
    h('div', { class: 'field', style: 'margin:8px 0 8px' }, h('label', { for: 'time' }, 'Hora del recordatorio'), time),
    browserBtn, btn,
    h('button', { class: 'link', style: 'margin-top:12px', onclick: () => go(1) }, 'Atrás')];
}

function stepDone() {
  const btn = h('button', { class: 'btn btn--lg btn--block', style: 'margin-top:28px', onclick: async () => {
    if (await save({ complete: true }, btn)) window.location.assign('/dashboard');
  } }, 'Acceder a mi panel');
  const strategy = state.strategies.find((s) => s.id === state.goal);
  return [
    h('p', { class: 'eyebrow' }, 'Todo listo'),
    h('h1', { class: 'title-md', style: 'margin-top:10px' }, 'Tu plan está configurado'),
    h('ul', { class: 'feature-list', style: 'margin-top:20px' },
      h('li', {}, h('span', {}, h('strong', {}, 'Meta: '), strategy?.name ?? '')),
      h('li', {}, h('span', {}, h('strong', {}, 'Inicio: '), longDate(state.startDate))),
      h('li', {}, h('span', {}, h('strong', {}, 'Recordatorio: '), state.notifications?.enabled ? `cada día a las ${state.notifications.time}` : 'desactivado'))),
    btn,
  ];
}

function go(i) {
  step = i;
  dots.forEach((d, j) => d.classList.toggle('is-on', j <= i));
  root.replaceChildren(...[stepGoal, stepDate, stepNotifications, stepDone][i]().filter(Boolean));
  root.querySelector('h1')?.focus?.();
}

async function init() {
  try {
    state = await api('/api/app/onboarding');
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') return window.location.replace('/acceso?modo=entrar&next=/configuracion');
    if (err.code === 'SUBSCRIPTION_REQUIRED') return window.location.replace('/planes');
    root.replaceChildren(h('p', {}, err.message));
    return;
  }
  if (!state.planReady) {
    root.replaceChildren(h('p', {}, 'Estamos preparando tu plan. Vuelve a intentarlo en unos segundos.'));
    setTimeout(init, 3000);
    return;
  }
  go(state.completed ? 3 : 0);
}

init();
