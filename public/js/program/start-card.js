// «Tu punto de partida»: el resultado del cuestionario (el embudo) también vive dentro de la app.
import { api, h } from '../ui.js';

/** Devuelve una tarjeta con la estrategia y las metas iniciales del resultado del quiz, o null si no hay quiz vinculado. */
export async function startCard(slug) {
  let data;
  try { data = await api(`/api/assessment/result?program=${encodeURIComponent(slug)}`); } catch { return null; }
  const plan = data?.result?.plan;
  if (!plan) return null;
  const goals = (plan.goals ?? []).slice(0, 3);
  return h('section', { class: 'card stack start-card' },
    h('p', { class: 'kicker' }, 'Tu punto de partida'),
    h('h2', { class: 'title-md' }, plan.strategy?.name ?? 'Tu resultado del cuestionario'),
    plan.strategy?.summary ? h('p', { class: 'muted' }, plan.strategy.summary) : null,
    goals.length ? h('ul', { class: 'list' }, goals.map((g) => h('li', {}, h('div', { class: 'list__main' }, h('span', {}, g.title), g.detail ? h('p', { class: 'list__meta' }, g.detail) : null)))) : null,
    h('a', { class: 'btn btn--ghost btn--sm', href: `/resultados?program=${encodeURIComponent(slug)}` }, 'Ver mi resultado completo'));
}
