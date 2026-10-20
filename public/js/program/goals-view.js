// Objetivos de un programa: GET/PUT /goals y metas semanales (PATCH /tasks/:id).
import { api, h, longDate, localDay, setBusy, toast } from '../ui.js';
import { celebrate, emptyState, loading, page } from '../shell.js';
import { fmtMetric, programError, programRibbon, withProgram } from './nav.js';

const weekOf = (startDate) => {
  const ms = new Date(`${localDay()}T12:00:00`) - new Date(`${startDate}T12:00:00`);
  return Math.max(1, Math.floor(ms / 864e5 / 7) + 1);
};

export function mountProgramGoals(root, slug, meta) {
  async function load() {
    loading(root);
    let g;
    try { g = await api(`/api/app/programs/${slug}/goals`); } catch (err) { return programError(root, err, slug, load); }
    const stratName = (id) => g.strategies.find((s) => s.id === id)?.name ?? id;
    const field = (id) => g.form.fields.find((f) => f.id === id);
    const c = g.current ?? g.goal ?? {};
    const hoursMode = field('target')?.unit === 'horas';
    const unit = field('target')?.unit ?? '';

    page(root, { eyebrow: `Tu plan · ${meta.name}`, title: 'Mis objetivos', intro: g.form.intro ?? 'Ajusta tu objetivo cuando lo necesites. Guardamos el historial: cambiar el plan no borra lo que ya has hecho.' });
    root.prepend(programRibbon(meta));

    let chosen = c.strategy;
    const strategy = h('div', { class: 'choice-list', role: 'radiogroup', 'aria-label': 'Tu camino' });
    const targetF = field('target'); const startF = field('start'); const exF = field('exercisePerWeek');
    const mkNum = (f, id, value) => h('input', { class: 'input', type: 'number', id, min: f.min, max: f.max, step: f.step ?? 1, value: value ?? f.default ?? '' });
    const target = targetF ? mkNum(targetF, 'target', c.target) : null;
    const start = startF ? mkNum(startF, 'start', c.start) : null;
    const ex = exF ? mkNum(exF, 'ex', c.exercisePerWeek) : null;
    const fieldBox = (f, input, id) => h('div', { class: 'field' }, h('label', { for: id }, f.unit && !hoursMode ? `${f.label} (${f.unit})` : f.label), input, f.help ? h('span', { class: 'help' }, f.help) : null);
    const targetBox = targetF ? fieldBox(targetF, target, 'target') : null;
    const startBox = startF ? fieldBox(startF, start, 'start') : null;
    const sync = () => {
      if (targetBox) targetBox.hidden = (targetF.hideFor ?? []).includes(chosen);
      if (startBox) startBox.hidden = !(startF.showFor ?? []).includes(chosen);
    };
    const drawStrategy = () => strategy.replaceChildren(...g.strategies.map((s) => h('button', {
      type: 'button', role: 'radio', class: `option${chosen === s.id ? ' is-selected' : ''}`, 'aria-checked': String(chosen === s.id),
      onclick: () => { chosen = s.id; drawStrategy(); sync(); },
    }, h('span', { class: 'option__label' }, h('strong', {}, s.name), h('br'), h('span', { class: 'small muted' }, s.description)), h('span', { class: 'option__radio' }))));
    drawStrategy(); sync();

    const err = h('p', { class: 'form-error', role: 'alert' });
    const btn = h('button', { class: 'btn', type: 'submit' }, 'Guardar objetivos');
    root.append(h('form', { class: 'card stack', onsubmit: async (e) => {
      e.preventDefault();
      err.textContent = '';
      const body = { strategy: chosen };
      if (target && !targetBox.hidden && target.value !== '') body.target = Number(target.value);
      if (start && !startBox.hidden && start.value !== '') body.start = Number(start.value);
      if (ex && ex.value !== '') body.exercisePerWeek = Number(ex.value);
      setBusy(btn, true, 'Guardando…');
      try {
        const r = await api(`/api/app/programs/${slug}/goals`, { method: 'PUT', body });
        toast(r.changed === false ? 'No había cambios que guardar.' : 'Objetivos guardados.');
        load();
      } catch (e2) { setBusy(btn, false); err.textContent = e2.message; }
    } },
    h('h2', { class: 'title-md' }, 'Tu camino'), strategy,
    h('div', { class: 'form-grid' }, targetBox, startBox, ex ? fieldBox(exF, ex, 'ex') : null),
    h('p', { class: 'help' }, 'Los recordatorios se configuran en ', h('a', { href: withProgram('/notificaciones', slug) }, 'Notificaciones'), '. Alento no sustituye el consejo de un profesional sanitario.'),
    err, h('div', {}, btn)));

    // Metas semanales del plan.
    const wk = weekOf(c.startDate ?? localDay());
    root.append(h('h2', { class: 'section-title' }, 'Metas semanales de tu plan'));
    root.append(g.tasks.length ? h('section', { class: 'card' },
      h('p', { class: 'card__sub' }, `Semana ${Math.min(wk, g.tasks.length)} de ${g.tasks.length}. Marca lo que vayas haciendo: no hay prisa.`),
      h('ul', { class: 'list pp-tasks' }, g.tasks.map((t) => {
        const box = h('input', { type: 'checkbox', id: `t-${t.id}`, checked: Boolean(t.done), 'aria-describedby': `t-${t.id}-d` });
        box.addEventListener('change', async () => {
          box.disabled = true;
          try {
            const r = await api(`/api/app/programs/${slug}/tasks/${t.id}`, { method: 'PATCH', body: { done: box.checked } });
            t.done = box.checked; celebrate(r.achievements);
          } catch (e) { box.checked = !box.checked; toast(e.message); } finally { box.disabled = false; }
        });
        return h('li', { class: t.week === wk ? 'is-current' : null },
          box,
          h('label', { class: 'list__main', for: `t-${t.id}` }, h('strong', {}, `Semana ${t.week} · ${t.title}`),
            t.week === wk ? h('span', { class: 'pill pill--ok pp-now' }, 'Esta semana') : null,
            h('span', { class: 'list__meta pp-detail', id: `t-${t.id}-d` }, t.detail)));
      }))) : emptyState('Aún sin metas semanales', null));

    root.append(h('h2', { class: 'section-title' }, 'Historial de cambios'));
    const fmtGoal = (x) => [x.target != null ? `objetivo ${fmtMetric(x.target, hoursMode ? 'hours' : 'decimal1')}${hoursMode ? '' : ` ${unit}`}` : null,
      x.start != null ? `punto de partida ${fmtMetric(x.start, 'decimal1')}` : null, `${x.exercisePerWeek} ejercicios/semana`].filter(Boolean).join(' · ');
    root.append(h('section', { class: 'card' }, g.history.length
      ? h('ul', { class: 'list' }, g.history.map((x) => h('li', {}, h('div', { class: 'list__main' },
        h('strong', {}, stratName(x.strategy)), h('p', { class: 'list__meta' }, fmtGoal(x)),
        h('p', { class: 'list__meta' }, `Vigente del ${longDate(x.createdAt)}${x.supersededAt ? ` al ${longDate(x.supersededAt)}` : ''}`)))))
      : h('p', { class: 'muted' }, 'Todavía no has cambiado tus objetivos.')));
  }
  load();
}
