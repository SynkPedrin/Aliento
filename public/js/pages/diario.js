// Mi diario: estado de ánimo diario con nota, calendario mensual y evolución de 30 días.
import { $, api, h, localDay, longDate, setBusy, toast, locale } from '../ui.js';
import { celebrate, errorState, initApp, loading, page } from '../shell.js';
import { xyChart } from '../charts.js';
import { applyProgramNav, programError, programQuery, programRibbon, programSlug } from '../program/nav.js';

const SLUG = programSlug();
await initApp({ active: '/diario' });
const root = $('[data-root]');
const META = SLUG ? await applyProgramNav(SLUG) : null;
const PQ = programQuery(SLUG);

const MOODS = [
  [5, 'Muy bien'], [4, 'Bien'], [3, 'Regular'], [2, 'Mal'], [1, 'Muy mal'],
];
const MOOD_LABEL = Object.fromEntries(MOODS);
const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DOW_FULL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const toDate = (iso) => new Date(`${iso}T12:00:00`);
const dayKey = (v) => String(v).slice(0, 10);
const addDays = (iso, n) => { const d = toDate(iso); d.setDate(d.getDate() + n); return localDay(d); };
const shortLabel = (iso) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(toDate(iso));
const monthTitle = (y, m) => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m, 1, 12));

const state = { entries: new Map(), today: localDay(), selected: null, month: null };

async function load() {
  loading(root);
  try {
    const data = await api(`/api/app/mood?days=90${programQuery(SLUG, false)}`);
    state.today = dayKey(data.today ?? localDay());
    state.entries = new Map((data.entries ?? []).map((e) => [dayKey(e.day), { ...e, day: dayKey(e.day) }]));
    state.selected = state.selected ?? state.today;
    if (!state.month) { const t = toDate(state.today); state.month = { y: t.getFullYear(), m: t.getMonth() }; }
    render();
  } catch (err) {
    if (SLUG) programError(root, err, SLUG, load); else errorState(root, err, load);
  }
}

function render() {
  page(root, {
    eyebrow: META ? `Diario · ${META.name}` : 'Diario',
    title: 'Mi diario',
    intro: 'Anota cómo te sientes cada día. Con el tiempo verás qué te ayuda y qué te cuesta más.',
  });
  if (META) root.prepend(programRibbon(META));
  root.append(
    h('div', { class: 'grid-2' }, formCard(), calendarCard()),
    chartCard(),
  );
}

function formCard() {
  const day = state.selected;
  const entry = state.entries.get(day);
  let mood = entry?.mood ?? null;
  const isToday = day === state.today;

  const options = h('div', { class: 'mood-options', role: 'group', 'aria-label': 'Estado de ánimo' });
  const drawOptions = () => options.replaceChildren(...MOODS.map(([v, label]) => h('button', {
    type: 'button', class: 'mood-option', 'aria-pressed': String(mood === v),
    onclick: () => { mood = v; drawOptions(); },
  }, h('span', { class: `mood-dot mood-${v}`, 'aria-hidden': 'true' }), h('span', {}, label))));
  drawOptions();

  const note = h('textarea', { class: 'input', id: 'mood-note', maxlength: 1000, rows: 4, placeholder: '¿Algo que quieras recordar de este día? (opcional)' });
  note.value = entry?.note ?? '';
  const counter = h('span', { class: 'help', 'aria-live': 'polite' }, `${note.value.length}/1000`);
  note.addEventListener('input', () => { counter.textContent = `${note.value.length}/1000`; });

  const btn = h('button', { type: 'submit', class: 'btn' }, entry ? 'Actualizar' : 'Guardar');
  const form = h('form', {
    class: 'card',
    onsubmit: async (e) => {
      e.preventDefault();
      if (!mood) { toast('Elige cómo te has sentido.'); return; }
      setBusy(btn, true, 'Guardando…');
      try {
        const r = await api(`/api/app/mood/${day}${PQ}`, { method: 'PUT', body: { mood, note: note.value.trim() || null } });
        state.entries.set(day, { day, mood, note: note.value.trim(), updated_at: new Date().toISOString() });
        toast('Entrada guardada.');
        celebrate(r.achievements);
        render();
      } catch (err) {
        toast(err.message);
        setBusy(btn, false);
      }
    },
  },
  h('p', { class: 'eyebrow' }, isToday ? 'Hoy' : longDate(day)),
  h('h2', { class: 'title-md' }, isToday ? '¿Cómo te has sentido hoy?' : '¿Cómo te sentiste ese día?'),
  h('div', { class: 'u-mt-16' }, options),
  h('div', { class: 'field u-mt-16' },
    h('label', { for: 'mood-note' }, 'Nota (opcional)'), note, counter),
  h('div', { class: 'field-row' },
    btn,
    isToday ? null : h('button', { type: 'button', class: 'link', onclick: () => { state.selected = state.today; render(); } }, 'Volver a hoy')),
  );
  return form;
}

function calendarCard() {
  const { y, m } = state.month;
  const first = new Date(y, m, 1, 12);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // lunes primero
  const todayD = toDate(state.today);
  const minD = toDate(addDays(state.today, -89));
  const canPrev = new Date(y, m, 0, 12) >= new Date(minD.getFullYear(), minD.getMonth(), 1, 12);
  const canNext = y < todayD.getFullYear() || (y === todayD.getFullYear() && m < todayD.getMonth());
  const shift = (n) => { const d = new Date(y, m + n, 1); state.month = { y: d.getFullYear(), m: d.getMonth() }; render(); };

  const cells = [];
  DOW.forEach((d, i) => cells.push(h('span', { class: 'calendar__dow', 'aria-hidden': 'true', title: DOW_FULL[i] }, d)));
  for (let i = 0; i < offset; i++) cells.push(h('span', { class: 'calendar__blank', 'aria-hidden': 'true' }));
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = localDay(new Date(y, m, d, 12));
    const entry = state.entries.get(iso);
    const future = iso > state.today;
    const label = `${longDate(iso)}${entry ? `: ${MOOD_LABEL[entry.mood]}` : future ? '' : ': sin registro'}`;
    cells.push(h('button', {
      type: 'button',
      class: `calendar__day${iso === state.selected ? ' is-selected' : ''}`,
      disabled: future,
      'aria-current': iso === state.today ? 'date' : null,
      'aria-pressed': String(iso === state.selected),
      'aria-label': label,
      title: label,
      onclick: () => { state.selected = iso; render(); $('#mood-note')?.closest('form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    }, String(d), entry ? h('span', { class: `mood-dot mood-${entry.mood}`, 'aria-hidden': 'true' }) : null));
  }

  return h('section', { class: 'card', 'aria-labelledby': 'cal-title' },
    h('div', { class: 'cal-head' },
      h('button', { type: 'button', class: 'icon-btn', disabled: !canPrev, 'aria-label': 'Mes anterior', onclick: () => shift(-1) }, '‹'),
      h('h2', { class: 'cal-head__title', id: 'cal-title', 'aria-live': 'polite' }, monthTitle(y, m)),
      h('button', { type: 'button', class: 'icon-btn', disabled: !canNext, 'aria-label': 'Mes siguiente', onclick: () => shift(1) }, '›')),
    h('div', { class: 'calendar' }, cells),
    h('div', { class: 'mood-legend', 'aria-hidden': 'true' },
      MOODS.map(([v, l]) => h('span', {}, h('i', { class: `mood-dot mood-${v}` }), l))),
    h('p', { class: 'help u-mt-8' }, 'Toca un día pasado para ver o editar su entrada.'));
}

function chartCard() {
  const days = Array.from({ length: 30 }, (_, i) => addDays(state.today, i - 29));
  const values = days.map((d) => state.entries.get(d)?.mood ?? null);
  const count = values.filter((v) => v != null).length;
  const card = h('section', { class: 'card u-mt-16', 'aria-labelledby': 'evo-title' },
    h('h2', { class: 'title-md', id: 'evo-title' }, 'Evolución'),
    h('p', { class: 'muted small' }, 'Tu estado de ánimo en los últimos 30 días (1 = muy mal, 5 = muy bien).'));
  if (count < 2) {
    card.append(h('p', { class: 'muted u-mt-16' }, count
      ? 'Ya tienes tu primera entrada. Cuando registres algunos días más verás aquí tu evolución.'
      : 'Aún no hay entradas en los últimos 30 días. Empieza hoy: solo te llevará unos segundos.'));
    return card;
  }
  card.append(h('div', { class: 'u-mt-16' }, xyChart({
    labels: days.map(shortLabel),
    series: [{ key: 'mood', label: 'Ánimo', kind: 'line', values }],
    format: (v, axis) => (axis ? (v >= 1 && Number.isInteger(v) ? String(v) : '') : `${MOOD_LABEL[v] ?? v} (${v})`),
    caption: 'Estado de ánimo de los últimos 30 días',
  })));
  return card;
}

load();
