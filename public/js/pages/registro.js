import { $, api, h, setBusy, toast, locale } from '../ui.js';
import { FEELING_LABELS, celebrate, cravingFlow, emptyState, errorState, initApp, loading, modal, page, rangeTabs, uuid } from '../shell.js';

await initApp({ active: '/registro' });
const root = $('[data-root]');
let days = 7;
let data;

const MOOD_LABELS = { 'muy-bien': 'Muy bien', bien: 'Bien', regular: 'Regular', mal: 'Mal', 'muy-mal': 'Muy mal', ...FEELING_LABELS };
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtTime = (iso) => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const fmtDay = (iso) => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));

/** Formulario de cigarrillo (nuevo o edición). Un único clientRequestId por formulario evita duplicados. */
function entryForm(entry, onSaved) {
  const requestId = uuid();
  return modal((close) => {
    const qty = h('input', { class: 'input', type: 'number', min: 1, max: 50, value: entry?.quantity ?? 1, id: 'qty', required: true });
    const at = h('input', { class: 'input', type: 'datetime-local', id: 'at', value: toLocalInput(entry ? new Date(entry.at) : new Date()), max: toLocalInput(new Date()) });
    const trig = h('select', { class: 'select', id: 'trig' }, h('option', { value: '' }, 'Sin especificar'),
      [...data.triggerOptions, { id: 'otro', label: 'Otra cosa' }].map((t) => h('option', { value: t.id, selected: entry?.trigger === t.id }, t.label)));
    const mood = h('select', { class: 'select', id: 'mood' }, h('option', { value: '' }, 'Sin especificar'),
      Object.entries(MOOD_LABELS).map(([id, label]) => h('option', { value: id, selected: entry?.mood === id }, label)));
    const note = h('textarea', { class: 'input', id: 'note', maxlength: 500, placeholder: 'Opcional: dónde estabas, con quién…' });
    note.value = entry?.note ?? '';
    const err = h('p', { class: 'form-error', role: 'alert' });
    const btn = h('button', { class: 'btn btn--block', type: 'submit' }, entry ? 'Guardar cambios' : 'Registrar');
    const form = h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      setBusy(btn, true, 'Guardando…');
      const body = { quantity: Number(qty.value), at: new Date(at.value).toISOString(), trigger: trig.value || null, mood: mood.value || null, note: note.value };
      try {
        const r = entry
          ? await api(`/api/app/smoking/${entry.id}`, { method: 'PATCH', body })
          : await api('/api/app/smoking', { method: 'POST', body: { ...body, clientRequestId: requestId } });
        celebrate(r.achievements);
        close();
        toast(entry ? 'Registro actualizado.' : 'Cigarrillo registrado. Sin juicios: cada dato te ayuda.');
        onSaved();
      } catch (e2) { setBusy(btn, false); err.textContent = e2.message; }
    } },
    h('h2', { class: 'title-md' }, entry ? 'Editar registro' : 'Registrar cigarrillo'),
    h('div', { class: 'form-grid' },
      h('div', { class: 'field' }, h('label', { for: 'qty' }, 'Cantidad'), qty),
      h('div', { class: 'field' }, h('label', { for: 'at' }, 'Hora'), at)),
    h('div', { class: 'field' }, h('label', { for: 'trig' }, '¿Qué lo provocó?'), trig),
    h('div', { class: 'field' }, h('label', { for: 'mood' }, '¿Cómo te sentías?'), mood),
    h('div', { class: 'field' }, h('label', { for: 'note' }, 'Observación'), note),
    err, btn, h('button', { type: 'button', class: 'link', onclick: close }, 'Cancelar'));
    return [form];
  }, { label: entry ? 'Editar registro' : 'Registrar cigarrillo' });
}

async function load() {
  loading(root);
  try {
    data = await api(`/api/app/smoking?days=${days}`);
    const cr = await api('/api/app/cravings');
    data.cravings = cr.cravings;
  } catch (err) { return errorState(root, err, load); }
  render();
}

function render() {
  page(root, { eyebrow: 'Registro diario', title: 'Registrar', intro: 'Anota cada cigarrillo y cada momento de ganas. Así tus gráficos y tu ahorro se basan en datos reales.',
    actions: h('div', { class: 'actions-row', style: 'margin:0' },
      h('button', { class: 'btn', onclick: () => entryForm(null, load) }, 'Registrar cigarrillo'),
      h('button', { class: 'btn btn--ghost', onclick: () => cravingFlow({ triggerOptions: data.triggerOptions, onDone: load }) }, 'Tengo ganas de fumar')) });

  const today = new Intl.DateTimeFormat('en-CA').format(new Date());
  const smokedToday = data.entries.some((e) => new Intl.DateTimeFormat('en-CA').format(new Date(e.at)) === today);
  const freeToday = data.smokeFreeDays.includes(today);
  root.append(h('section', { class: 'card' },
    h('div', { class: 'page-head', style: 'margin:0' },
      h('div', {}, h('h2', { class: 'title-md' }, 'Hoy'), h('p', { class: 'muted small' }, freeToday ? 'Has marcado hoy como día sin fumar.' : smokedToday ? 'Ya tienes cigarrillos registrados hoy.' : '¿Hoy no has fumado? Márcalo para que cuente en tu progreso.')),
      freeToday
        ? h('button', { class: 'btn btn--ghost btn--sm', onclick: async () => { try { await api(`/api/app/checkins/${today}`, { method: 'DELETE' }); load(); } catch (e) { toast(e.message); } } }, 'Deshacer')
        : !smokedToday ? h('button', { class: 'btn btn--sm', onclick: async (e) => {
          e.currentTarget.disabled = true;
          try { const r = await api('/api/app/checkins', { method: 'POST', body: { day: today } }); celebrate(r.achievements); toast('¡Día sin fumar registrado!'); load(); } catch (err) { toast(err.message); e.currentTarget.disabled = false; }
        } }, 'Hoy no he fumado') : null)));

  root.append(h('div', { class: 'page-head u-mt-16', style: 'margin-bottom:8px' }, h('h2', { class: 'section-title', style: 'margin:0' }, 'Historial de cigarrillos'),
    rangeTabs(days, (v) => { days = v; load(); })));

  if (!data.entries.length) {
    root.append(h('section', { class: 'card' }, emptyState('Sin cigarrillos registrados en este período', 'Cuando registres uno, aparecerá aquí con su hora y su gatillo.')));
  } else {
    const groups = new Map();
    for (const e of data.entries) {
      const k = new Intl.DateTimeFormat('en-CA').format(new Date(e.at));
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    const trigLabel = Object.fromEntries([...data.triggerOptions.map((t) => [t.id, t.label]), ['otro', 'Otra cosa']]);
    for (const [, list] of groups) {
      const total = list.reduce((a, e) => a + e.quantity, 0);
      root.append(h('section', { class: 'card u-mt-8' },
        h('p', { class: 'kicker' }, `${fmtDay(list[0].at)} · ${total} ${total === 1 ? 'cigarrillo' : 'cigarrillos'}`),
        h('ul', { class: 'list' }, list.map((e) => h('li', {},
          h('div', { class: 'list__main' },
            h('strong', {}, `${fmtTime(e.at)} · ${e.quantity} ${e.quantity === 1 ? 'cigarrillo' : 'cigarrillos'}`),
            h('p', { class: 'list__meta' }, [e.trigger ? trigLabel[e.trigger] : null, e.mood ? MOOD_LABELS[e.mood] : null].filter(Boolean).join(' · ') || 'Sin detalles'),
            e.note ? h('p', { class: 'small u-mt-8' }, e.note) : null),
          h('button', { class: 'icon-btn', onclick: () => entryForm(e, load) }, 'Editar'),
          h('button', { class: 'icon-btn', onclick: async () => {
            if (!confirm('¿Eliminar este registro?')) return;
            try { await api(`/api/app/smoking/${e.id}`, { method: 'DELETE' }); toast('Registro eliminado.'); load(); } catch (err) { toast(err.message); }
          } }, 'Eliminar'))))));
    }
  }

  root.append(h('h2', { class: 'section-title' }, 'Momentos de ganas'));
  const trigLabel = Object.fromEntries(data.triggerOptions.map((t) => [t.id, t.label]));
  root.append(h('section', { class: 'card' }, data.cravings.length
    ? h('ul', { class: 'list' }, data.cravings.slice(0, 20).map((c) => h('li', {},
      h('div', { class: 'list__main' },
        h('strong', {}, `${fmtDay(c.felt_at)}, ${fmtTime(c.felt_at)} · intensidad ${c.intensity}/5`),
        h('p', { class: 'list__meta' }, [c.feeling ? FEELING_LABELS[c.feeling] : null, c.trigger ? (trigLabel[c.trigger] ?? 'Otra cosa') : null].filter(Boolean).join(' · ') || 'Sin detalles')),
      h('span', { class: `pill ${c.outcome === 'resisted' ? 'pill--ok' : c.outcome === 'smoked' ? 'pill--warn' : ''}` },
        c.outcome === 'resisted' ? 'Superadas' : c.outcome === 'smoked' ? 'Fumé' : 'Sin resultado'))))
    : emptyState('Aún no has registrado ganas', 'Usa «Tengo ganas de fumar» cuando aparezcan: te guiamos y queda registrado.')));

  if (new URLSearchParams(location.search).has('nuevo')) {
    history.replaceState(null, '', '/registro');
    entryForm(null, load);
  }
}

load();
