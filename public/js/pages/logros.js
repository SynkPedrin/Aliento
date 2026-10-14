// Mis logros: insignias conseguidas y pendientes.
import { $, api, h, longDate } from '../ui.js';
import { emptyState, errorState, initApp, loading, page } from '../shell.js';

await initApp({ active: '/logros' });
const root = $('[data-root]');

const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const BADGES = {
  sprout: svg('<path d="M12 21v-9"/><path d="M12 12c0-4-3-6-7-6 0 4 3 6 7 6Z"/><path d="M12 10c0-3.5 2.5-6 7-6 0 4-3 6-7 6Z"/><path d="M8 21h8"/>'),
  book: svg('<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5Z"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5.7 1.5 1.5Z"/>'),
  leaf: svg('<path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15"/><path d="M5 19l7-7"/>'),
  pen: svg('<path d="M4 20l1-4L16 5l3 3L8 19Z"/><path d="M14 7l3 3"/><path d="M4 20h6"/>'),
  calendar: svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/><path d="M9 15l2 2 4-4"/>'),
  wave: svg('<path d="M3 15c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M3 9c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>'),
  wind: svg('<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 14h15a3 3 0 1 1-3 3"/>'),
  sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>'),
  mountain: svg('<path d="M3 19l6-10 4 6 2-3 6 7Z"/><path d="M8 11l1.5 1.5L11 11"/>'),
  default: svg('<circle cx="12" cy="10" r="5"/><path d="M9 14.5L8 21l4-2 4 2-1-6.5"/>'),
};

async function load() {
  loading(root);
  try {
    const { achievements = [] } = await api('/api/app/achievements');
    render(achievements);
  } catch (err) {
    errorState(root, err, load);
  }
}

function render(list) {
  const unlocked = list.filter((a) => a.unlocked_at);
  page(root, {
    eyebrow: 'Logros',
    title: 'Mis logros',
    intro: 'Cada paso cuenta. Un tropiezo no borra tus logros.',
    actions: list.length ? h('span', { class: 'pill pill--ok' }, `${unlocked.length} de ${list.length} conseguidos`) : null,
  });
  if (!list.length) {
    root.append(emptyState('Aún no hay logros disponibles', 'Vuelve más tarde: aquí aparecerán tus insignias.'));
    return;
  }
  // Conseguidos primero (más recientes arriba), luego pendientes en su orden.
  const sorted = [...unlocked.sort((a, b) => String(b.unlocked_at).localeCompare(String(a.unlocked_at))),
    ...list.filter((a) => !a.unlocked_at)];
  root.append(h('ul', { class: 'grid-3c list-reset', role: 'list' }, sorted.map((a) => h('li', {
    class: `card achievement${a.unlocked_at ? ' is-unlocked' : ''}`,
  },
  h('span', { class: 'achievement__badge', html: BADGES[a.icon] ?? BADGES.default }),
  h('h2', { class: 'achievement__title' }, a.title),
  h('p', { class: 'muted small' }, a.description),
  a.unlocked_at
    ? h('span', { class: 'pill pill--ok' }, `Conseguido el ${longDate(a.unlocked_at)}`)
    : h('span', { class: 'pill' }, 'Pendiente')))));
}

load();
