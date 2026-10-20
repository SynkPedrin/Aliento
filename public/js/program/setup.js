// Configuración inicial de un programa (alcohol, azucar, ansiedad, sueno), generada de GET /setup.
import { api, h, localDay, longDate, setBusy, toast } from '../ui.js';

const PLACE = { alcohol: 'Alcohol', azucar: 'Azúcar', ansiedad: 'Ansiedad', sueno: 'Sueño' };

export async function runProgramSetup({ root, slug, dots }) {
  dots?.forEach((d) => { d.parentElement.hidden = true; });
  root.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'skeleton', 'aria-label': 'Cargando' })));
  let st;
  try {
    st = await api(`/api/app/programs/${slug}/setup`);
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') return location.replace(`/acceso?modo=entrar&next=${encodeURIComponent(location.pathname + location.search)}`);
    if (err.status === 402 || err.status === 404 || err.status === 422) return location.replace('/programas');
    root.replaceChildren(h('p', { class: 'form-error' }, err.message), h('button', { class: 'btn btn--ghost u-mt-16', onclick: () => runProgramSetup({ root, slug, dots }) }, 'Reintentar'));
    return;
  }
  document.title = `Configura ${PLACE[slug]} · Alento`;
  if (slug === 'sueno') document.body.classList.add('program-night');

  const fields = st.form.fields;
  const get = (id) => fields.find((f) => f.id === id);
  const g = st.goal ?? {};
  const v = {
    strategy: g.strategy ?? null,
    startDate: g.startDate ?? get('startDate')?.default ?? localDay(),
    target: g.target ?? get('target')?.default ?? null,
    start: g.start ?? get('start')?.default ?? null,
    exercisePerWeek: g.exercisePerWeek ?? get('exercisePerWeek')?.default ?? 3,
    reminder: { enabled: st.notifications?.enabled ?? false, time: st.notifications?.time ?? get('notifications')?.default?.time ?? '20:00' },
  };
  const visible = (f) => (!f.hideFor || !f.hideFor.includes(v.strategy)) && (!f.showFor || f.showFor.includes(v.strategy));
  const form = h('form', { class: 'stack pg-setup', novalidate: true });
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { type: 'submit', class: 'btn btn--lg btn--block' }, st.completed ? 'Guardar cambios' : 'Empezar mi plan');
  let n = 0;

  function strategyField(f) {
    const list = h('div', { class: 'choice-list', role: 'radiogroup', 'aria-labelledby': 'su-strategy' });
    const draw = () => list.replaceChildren(...f.options.map((o, idx) => h('button', {
      type: 'button', role: 'radio', class: `option${v.strategy === o.id ? ' is-selected' : ''}`, 'aria-checked': String(v.strategy === o.id),
      onclick: () => { v.strategy = o.id; draw(); list.children[idx].focus({ preventScroll: true }); paint(); },
    }, h('span', { class: 'option__label' }, h('strong', {}, o.label), h('br'), h('span', { class: 'small muted' }, o.help)), h('span', { class: 'option__radio' }))));
    draw();
    return h('div', { class: 'field' }, h('p', { class: 'pg-label', id: 'su-strategy' }, f.label), list);
  }

  function dateField(f) {
    const id = 'su-date';
    const input = h('input', { class: 'input', type: 'date', id, min: f.min, max: f.max, value: v.startDate });
    const out = h('p', { class: 'help', role: 'status' });
    const addDays = (k) => { const d = new Date(); d.setDate(d.getDate() + k); return localDay(d); };
    const quick = [['Hoy', localDay()], ['Mañana', addDays(1)]].filter(([, val]) => (!f.min || val >= f.min) && (!f.max || val <= f.max));
    const chips = h('div', { class: 'chips' });
    const sync = () => {
      chips.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === input.value)));
      out.textContent = input.value ? `Tu plan empezará el ${longDate(input.value)}.` : '';
    };
    quick.forEach(([label, val]) => chips.append(h('button', { type: 'button', class: 'chip', 'data-v': val, onclick: () => { input.value = val; v.startDate = val; sync(); } }, label)));
    input.addEventListener('input', () => { v.startDate = input.value; sync(); });
    sync();
    return h('div', { class: 'field' }, h('label', { for: id, class: 'pg-label' }, f.label), chips, input, out);
  }

  function numberField(f) {
    const id = `su-n-${++n}`;
    const input = h('input', { class: 'input', type: 'number', id, inputmode: 'decimal', min: f.min, max: f.max, step: f.step ?? 'any', value: v[f.id] ?? '', 'aria-describedby': `${id}-h` });
    input.addEventListener('input', () => { v[f.id] = input.value === '' ? null : Number(input.value); });
    return h('div', { class: 'field', 'data-id': f.id }, h('label', { for: id, class: 'pg-label' }, f.label),
      f.help ? h('p', { class: 'help', id: `${id}-h` }, f.help) : null,
      h('div', { class: 'pg-number' }, input, f.unit ? h('span', { class: 'muted small' }, f.unit) : null));
  }

  function reminderField(f) {
    const cb = h('input', { type: 'checkbox', role: 'switch', checked: v.reminder.enabled, 'aria-describedby': 'su-rem-h' });
    const time = h('input', { class: 'input', type: 'time', id: 'su-time', value: v.reminder.time, disabled: !v.reminder.enabled, 'aria-label': 'Hora del recordatorio' });
    cb.addEventListener('change', () => { v.reminder.enabled = cb.checked; time.disabled = !cb.checked; });
    time.addEventListener('input', () => { v.reminder.time = time.value; });
    return h('div', { class: 'field' },
      h('label', { class: 'toggle' }, h('span', {}, h('strong', {}, f.label), h('br'), h('span', { class: 'small muted', id: 'su-rem-h' }, 'Un aviso suave a la hora que elijas. Puedes cambiarlo o quitarlo cuando quieras.')), cb),
      h('div', { class: 'field' }, h('label', { for: 'su-time', class: 'pg-label' }, 'Hora del recordatorio'), time));
  }

  const body = h('div', { class: 'stack pg-setup__fields' });
  function paint() {
    body.replaceChildren(...fields.filter((f) => f.id !== 'strategy' ? visible(f) : true).map((f) => {
      if (f.id === 'strategy') return strategyField(f);
      if (f.id === 'startDate') return dateField(f);
      if (f.type === 'reminder') return reminderField(f);
      if (f.type === 'number') return numberField(f);
      return null;
    }).filter(Boolean));
  }
  paint();

  form.append(body, err, submit);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (!v.strategy) { err.textContent = 'Elige tu camino para continuar.'; err.hidden = false; return; }
    const payload = { strategy: v.strategy, startDate: v.startDate, exercisePerWeek: v.exercisePerWeek, notifications: { enabled: v.reminder.enabled, time: v.reminder.time || '20:00' } };
    const tf = get('target'), sf = get('start');
    if (tf && visible(tf) && v.target != null) payload.target = v.target;
    if (sf && visible(sf) && v.start != null) payload.start = v.start;
    setBusy(submit, true, 'Guardando…');
    try {
      await api(`/api/app/programs/${slug}/setup`, { method: 'PUT', body: payload });
      location.assign(`/programa?p=${slug}`);
    } catch (ex) {
      setBusy(submit, false);
      err.textContent = ex.message; err.hidden = false;
      toast(ex.message);
    }
  });

  root.replaceChildren(
    h('p', { class: 'eyebrow' }, `${PLACE[slug]} · tu plan`),
    h('h1', { class: 'title-md', tabindex: '-1', style: 'margin-top:10px' }, st.completed ? 'Ajusta tu plan' : 'Configura tu plan'),
    h('p', { class: 'muted', style: 'margin-top:8px;margin-bottom:24px' }, st.form.intro),
    form);
  root.querySelector('h1')?.focus?.({ preventScroll: true });
}
