import { $, api, h, longDate, money, setBusy, toast } from '../ui.js';
import { errorState, initApp, loading, page } from '../shell.js';

await initApp({ active: null });
const root = $('[data-root]');
const NAMES = { parar: 'Dejarlo en una fecha', gradual: 'Reducción progresiva', reducir: 'Reducir a la mitad primero' };

async function load() {
  loading(root);
  let g;
  try { g = await api('/api/app/goals'); } catch (err) { return errorState(root, err, load); }
  page(root, { eyebrow: 'Tu plan', title: 'Mis objetivos', intro: 'Ajusta tu objetivo cuando lo necesites. Guardamos el historial: cambiar el plan no borra lo que ya has hecho.' });
  const c = g.current ?? {};
  const strategy = h('div', { class: 'choice-list', role: 'radiogroup', 'aria-label': 'Objetivo principal' });
  let chosen = c.strategy;
  const drawStrategy = () => strategy.replaceChildren(...g.strategies.map((s) => h('button', {
    type: 'button', role: 'radio', class: `option${chosen === s.id ? ' is-selected' : ''}`, 'aria-checked': String(chosen === s.id),
    onclick: () => { chosen = s.id; drawStrategy(); quitWrap.hidden = chosen !== 'parar'; },
  }, h('span', { class: 'option__label' }, h('strong', {}, s.name), h('br'), h('span', { class: 'small muted' }, s.summary)), h('span', { class: 'option__radio' }))));
  const today = new Intl.DateTimeFormat('en-CA').format(new Date());
  const maxDaily = h('input', { class: 'input', type: 'number', id: 'max', min: 0, max: 200, value: c.max_daily ?? '', placeholder: 'Según tu plan' });
  const quit = h('input', { class: 'input', type: 'date', id: 'quit', min: today, value: c.quit_date ?? '' });
  const quitWrap = h('div', { class: 'field', hidden: c.strategy !== 'parar' }, h('label', { for: 'quit' }, 'Fecha para dejar de fumar'), quit,
    h('span', { class: 'help' }, 'A partir de esa fecha tu objetivo diario será cero.'));
  const ex = h('input', { class: 'input', type: 'number', id: 'ex', min: 0, max: 21, value: c.exercise_per_week ?? 3 });
  const moneyGoal = h('input', { class: 'input', type: 'number', id: 'money', min: 0, step: '0.01', value: c.money_goal ?? '', placeholder: 'Opcional' });
  const moneyLabel = h('input', { class: 'input', id: 'mlabel', maxlength: 80, value: c.money_goal_label ?? '', placeholder: 'Ej.: un viaje, unas zapatillas…' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Guardar objetivos');
  drawStrategy();

  root.append(h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    setBusy(btn, true, 'Guardando…');
    try {
      await api('/api/app/goals', { method: 'PUT', body: {
        strategy: chosen, maxDaily: maxDaily.value, quitDate: chosen === 'parar' ? quit.value || null : null,
        exercisePerWeek: Number(ex.value), moneyGoal: moneyGoal.value, moneyGoalLabel: moneyLabel.value,
      } });
      toast('Objetivos guardados.');
      load();
    } catch (e2) { setBusy(btn, false); err.textContent = e2.message; }
  } },
  h('h2', { class: 'title-md' }, 'Objetivo principal'), strategy, quitWrap,
  h('div', { class: 'form-grid' },
    h('div', { class: 'field' }, h('label', { for: 'max' }, 'Consumo máximo diario'), maxDaily, h('span', { class: 'help' }, 'Vacío: lo marca tu plan semana a semana.')),
    h('div', { class: 'field' }, h('label', { for: 'ex' }, 'Ejercicios de respiración por semana'), ex)),
  h('div', { class: 'form-grid' },
    h('div', { class: 'field' }, h('label', { for: 'money' }, `Meta de ahorro (${g.currency})`), moneyGoal),
    h('div', { class: 'field' }, h('label', { for: 'mlabel' }, '¿Para qué ahorras?'), moneyLabel)),
  h('p', { class: 'help' }, 'Los horarios de recordatorio se configuran en ', h('a', { href: '/notificaciones' }, 'Notificaciones'), '. Aliento no sustituye el consejo de un profesional sanitario.'),
  err, h('div', {}, btn)));

  root.append(h('h2', { class: 'section-title' }, 'Historial de cambios'));
  root.append(h('section', { class: 'card' }, g.history.length
    ? h('ul', { class: 'list' }, g.history.map((x) => h('li', {}, h('div', { class: 'list__main' },
      h('strong', {}, NAMES[x.strategy] ?? x.strategy),
      h('p', { class: 'list__meta' }, [
        x.max_daily != null ? `máximo ${x.max_daily}/día` : 'máximo según el plan',
        x.quit_date ? `dejarlo el ${longDate(x.quit_date)}` : null,
        `${x.exercise_per_week} ejercicios/semana`,
        x.money_goal != null ? `ahorro: ${money(x.money_goal, g.currency)}${x.money_goal_label ? ` (${x.money_goal_label})` : ''}` : null,
      ].filter(Boolean).join(' · ')),
      h('p', { class: 'list__meta' }, `Vigente del ${longDate(x.created_at)} al ${longDate(x.superseded_at)}`)))))
    : h('p', { class: 'muted' }, 'Todavía no has cambiado tus objetivos.')));
}

load();
