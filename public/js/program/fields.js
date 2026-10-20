// Genera controles de formulario desde `fields[]` (logForm). Devuelve { el, getValue, setError, clearErrors }.
import { h } from '../ui.js';
import { fmtNum } from './format.js';

let uid = 0;

function choiceChips({ options, multi, max, value, onChange, labelledBy }) {
  let sel = multi ? new Set(value ?? []) : (value ?? null);
  const wrap = h('div', { class: 'chips', role: multi ? 'group' : 'radiogroup', 'aria-labelledby': labelledBy });
  const draw = () => wrap.replaceChildren(...options.map((o, idx) => {
    const on = multi ? sel.has(o.id) : sel === o.id;
    return h('button', {
      type: 'button', class: 'chip', role: multi ? null : 'radio', 'aria-checked': multi ? null : String(on), 'aria-pressed': multi ? String(on) : null,
      onclick: () => {
        if (multi) {
          if (sel.has(o.id)) sel.delete(o.id); else if (!max || sel.size < max) sel.add(o.id);
        } else sel = sel === o.id ? null : o.id;
        draw(); onChange(multi ? [...sel] : sel);
        wrap.children[idx]?.focus?.({ preventScroll: true });
      },
    }, o.label);
  }));
  draw();
  return wrap;
}

function scaleButtons({ min, max, value, onChange, labelledBy }) {
  let sel = value ?? null;
  const wrap = h('div', { class: 'pg-scale', role: 'radiogroup', 'aria-labelledby': labelledBy });
  const draw = () => wrap.replaceChildren(...Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n, idx) => h('button', {
    type: 'button', class: 'pg-scale__btn', role: 'radio', 'aria-checked': String(sel === n),
    onclick: () => { sel = sel === n ? null : n; draw(); onChange(sel); wrap.children[idx]?.focus?.({ preventScroll: true }); },
  }, String(n))));
  draw();
  return wrap;
}

export function buildFields(fields, initial = {}) {
  const values = {};
  const errors = new Map();
  const nodes = [];
  const group = h('div', { class: 'pg-fields' });
  for (const f of fields) {
    const id = `pgf-${++uid}`;
    const labelId = `${id}-l`, errId = `${id}-e`, helpId = `${id}-h`;
    let control;
    const init = initial[f.id];
    values[f.id] = init ?? (f.type === 'multi' ? [] : null);
    if (f.type === 'number') {
      const input = h('input', { class: 'input', id, type: 'number', inputmode: 'decimal', min: f.min, max: f.max, step: f.step ?? 'any', value: init ?? '', 'aria-describedby': `${helpId} ${errId}` });
      input.addEventListener('input', () => { values[f.id] = input.value === '' ? null : Number(input.value); });
      control = h('div', { class: 'pg-number' }, input, f.unit ? h('span', { class: 'muted small' }, f.unit) : null);
    } else if (f.type === 'time') {
      const input = h('input', { class: 'input', id, type: 'time', value: init ?? '', 'aria-describedby': `${helpId} ${errId}` });
      input.addEventListener('input', () => { values[f.id] = input.value || null; });
      control = input;
    } else if (f.type === 'text') {
      const input = h('textarea', { class: 'input', id, rows: 2, maxlength: f.maxLength ?? 500, placeholder: f.placeholder ?? '', 'aria-describedby': `${helpId} ${errId}` });
      input.value = init ?? '';
      input.addEventListener('input', () => { values[f.id] = input.value; });
      control = input;
    } else if (f.type === 'scale') {
      control = scaleButtons({ min: f.min, max: f.max, value: init, labelledBy: labelId, onChange: (v) => { values[f.id] = v; } });
    } else if (f.type === 'multi' || (f.type === 'select' && f.options.length <= 8)) {
      control = choiceChips({ options: f.options, multi: f.type === 'multi', max: f.max, value: init, labelledBy: labelId, onChange: (v) => { values[f.id] = v; } });
    } else {
      const sel = h('select', { class: 'select', id, 'aria-describedby': `${helpId} ${errId}` }, h('option', { value: '' }, 'Elige…'), f.options.map((o) => h('option', { value: o.id }, o.label)));
      sel.value = init ?? '';
      sel.addEventListener('change', () => { values[f.id] = sel.value || null; });
      control = sel;
    }
    const range = f.type === 'scale' ? h('span', { class: 'range-scale' }, h('span', {}, f.min === 0 ? '0 · ninguna' : String(f.min)), h('span', {}, String(f.max))) : null;
    const hint = f.type === 'multi' && f.max ? `Elige hasta ${f.max}.` : null;
    const err = h('p', { class: 'form-error', id: errId, role: 'alert', hidden: true });
    errors.set(f.id, { err, control });
    const useLabelFor = ['number', 'time', 'text'].includes(f.type) || (f.type === 'select' && f.options.length > 8);
    nodes.push(h('div', { class: 'field pg-field', 'data-field': f.id },
      h(useLabelFor ? 'label' : 'p', { id: labelId, for: useLabelFor ? id : null, class: 'pg-label' }, f.label, f.required ? null : h('span', { class: 'muted small' }, ' · opcional')),
      f.help || hint ? h('p', { class: 'help', id: helpId }, [f.help, hint].filter(Boolean).join(' ')) : h('span', { id: helpId, hidden: true }),
      control, range, err));
  }
  group.append(...nodes);
  const getValue = () => {
    const out = {};
    for (const f of fields) {
      let v = values[f.id];
      if (typeof v === 'string') v = v.trim();
      if (v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'number' && Number.isNaN(v))) continue;
      out[f.id] = v;
    }
    return out;
  };
  const clearErrors = () => errors.forEach(({ err }) => { err.hidden = true; err.textContent = ''; });
  const setError = (fieldId, msg) => {
    const e = errors.get(fieldId);
    if (!e) return false;
    e.err.textContent = msg; e.err.hidden = false;
    (e.control.matches?.('input,select,textarea') ? e.control : e.control.querySelector('button'))?.focus?.();
    return true;
  };
  /** Validación de cliente (obligatorios). Devuelve true si todo está bien. */
  const validate = () => {
    clearErrors();
    const v = getValue();
    for (const f of fields) {
      if (f.required && v[f.id] == null) { setError(f.id, 'Completa este campo.'); return false; }
      if (f.type === 'number' && v[f.id] != null && ((f.min != null && v[f.id] < f.min) || (f.max != null && v[f.id] > f.max))) {
        setError(f.id, `Introduce un número entre ${fmtNum(f.min)} y ${fmtNum(f.max)}.`); return false;
      }
    }
    return true;
  };
  return { el: group, getValue, setError, clearErrors, validate };
}
