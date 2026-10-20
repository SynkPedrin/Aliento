// Registro principal (alta y edición) generado desde logForm.fields.
import { api, h, setBusy, toast } from '../ui.js';
import { celebrate } from '../shell.js';
import { buildFields } from './fields.js';
import { openDialog } from './modal.js';

export function openLogModal({ d, entry = null, onSaved }) {
  const slug = d.program.slug;
  const lf = d.logForm;
  const dlg = openDialog(entry ? 'Editar registro' : lf.label);
  const form = buildFields(lf.fields, entry?.value ?? {});
  let when = 'hoy';
  const whenChips = entry ? null : h('div', { class: 'field pg-field' },
    h('p', { class: 'pg-label', id: 'pg-when' }, '¿Cuándo fue?'),
    (() => {
      const wrap = h('div', { class: 'chips', role: 'radiogroup', 'aria-labelledby': 'pg-when' });
      const draw = () => wrap.replaceChildren(...[['hoy', 'Hoy'], ['ayer', 'Ayer']].map(([id, label], idx) => h('button', {
        type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(when === id),
        onclick: () => { when = id; draw(); wrap.children[idx].focus({ preventScroll: true }); },
      }, label)));
      draw();
      return wrap;
    })());
  const status = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const save = h('button', { type: 'submit', class: 'btn btn--block' }, entry ? 'Guardar cambios' : (lf.cta ?? 'Guardar'));
  const el = h('form', { class: 'stack', novalidate: true },
    h('h2', { class: 'title-md', tabindex: '-1' }, entry ? 'Editar registro' : lf.label),
    form.el, whenChips, status,
    h('div', { class: 'modal__actions' },
      h('button', { type: 'button', class: 'link', onclick: dlg.close }, 'Cancelar'), save));
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.hidden = true;
    if (!form.validate()) return;
    const body = { value: form.getValue() };
    if (!entry && when === 'ayer') {
      const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(12, 0, 0, 0);
      body.at = y.toISOString();
    }
    setBusy(save, true, 'Guardando…');
    try {
      const r = entry
        ? await api(`/api/app/programs/${slug}/log/${entry.id}`, { method: 'PATCH', body })
        : await api(`/api/app/programs/${slug}/log`, { method: 'POST', body });
      dlg.close();
      toast(entry ? 'Registro actualizado.' : (d.ui?.logSuccess ?? 'Guardado. Gracias por anotarlo.'));
      celebrate(r.achievements);
      onSaved?.();
    } catch (err) {
      setBusy(save, false);
      if (!(err.data?.field && form.setError(err.data.field, err.message))) { status.textContent = err.message; status.hidden = false; }
    }
  });
  dlg.setContent(el);
  return dlg;
}
