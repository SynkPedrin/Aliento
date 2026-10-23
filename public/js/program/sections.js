// Tarjetas del panel de un programa. Cada función recibe el JSON de /dashboard.
import { api, h, icon, toast } from '../ui.js';
import { celebrate, emptyState } from '../shell.js';
import { xyChart } from '../charts.js';
import { EXERCISES, dayShort, fmtNum, valueFormatter, whenShort, fmtHours } from './format.js';
import { openLogModal } from './log.js';
import { openUrgeFlow } from './urge.js';

const base = (d) => `/api/app/programs/${d.program.slug}`;
const fmtValue = (d, v) => (v == null ? '—' : d.weekMeta.format === 'hours' ? fmtHours(v) : fmtNum(v));

function targetText(d) {
  const t = d.todayStatus;
  if (t.direction === 'min') return `Objetivo de hoy: al menos ${fmtValue(d, t.target)}`;
  return `Objetivo de hoy: ${t.target === 0 ? 'cero' : `máximo ${fmtValue(d, t.target)} ${t.unit}`}`;
}

function statusPill(d) {
  const t = d.todayStatus;
  const min = t.direction === 'min';
  if (t.checkedIn && t.value == null) return h('span', { class: 'pill pill--ok' }, d.checkinLabel);
  if (t.status === 'ok') return h('span', { class: 'pill pill--ok' }, min ? 'Objetivo cumplido' : 'Dentro de tu objetivo');
  if (t.status === 'warn') return h('span', { class: 'pill pill--warn' }, min ? 'Por debajo de tu objetivo' : 'Por encima del objetivo');
  return h('span', { class: 'pill' }, 'Sin registro todavía');
}

export function todayCard(d, refresh) {
  const t = d.todayStatus;
  const has = t.value != null;
  const pct = !t.target ? (has && t.value > 0 ? 100 : 0) : Math.min(100, ((t.value ?? 0) / t.target) * 100);
  const big = d.weekMeta.format === 'hours' ? fmtHours(t.value) : fmtNum(t.value);
  const canCheckin = !t.checkedIn && !t.entries.length;
  const checkin = canCheckin ? h('button', { type: 'button', class: 'btn btn--ghost', onclick: async (e) => {
    e.currentTarget.disabled = true;
    try {
      const r = await api(`${base(d)}/checkin`, { method: 'POST', body: {} });
      celebrate(r.achievements); toast(`${d.checkinLabel}. Gracias por anotarlo.`); refresh();
    } catch (err) { toast(err.message); e.currentTarget.disabled = false; }
  } }, d.checkinLabel) : null;
  const undo = t.checkedIn ? h('button', { type: 'button', class: 'link', onclick: async (e) => {
    e.currentTarget.disabled = true;
    try { await api(`${base(d)}/checkin/${d.today}`, { method: 'DELETE' }); refresh(); } catch (err) { toast(err.message); e.currentTarget.disabled = false; }
  } }, 'Deshacer el check-in de hoy') : null;
  return h('section', { class: 'card today-card', 'aria-labelledby': 'pg-today' },
    h('p', { class: 'kicker', id: 'pg-today' }, 'Hoy'),
    h('p', { class: 'help u-mt-8' }, t.label),
    h('p', { class: `big-number${has ? '' : ' is-empty'}` }, big,
      has && d.weekMeta.format !== 'hours' ? h('span', { class: 'pg-unit' }, t.unit) : null),
    !has ? h('p', { class: 'muted' }, d.ui?.emptyToday ?? 'Aún no hay registro hoy.') : null,
    h('p', { class: 'muted pg-target' }, `${targetText(d)} · `, statusPill(d)),
    h('div', { class: 'progress-line', role: 'img', 'aria-label': `${Math.round(pct)}% del objetivo de hoy` }, h('span', { style: `width:${pct}%` })),
    h('div', { class: 'actions-row' },
      h('button', { type: 'button', class: 'btn', onclick: () => openLogModal({ d, onSaved: refresh }) }, d.logForm.cta ?? d.logForm.label),
      checkin, undo));
}

export function urgeCard(d, refresh) {
  const uf = d.urgeForm, t = d.todayStatus;
  return h('section', { class: 'card ganas-card', id: 'ganas', 'aria-labelledby': 'pg-urge' },
    h('h2', { class: 'title-md', id: 'pg-urge' }, uf.title),
    h('p', { class: 'u-mt-8' }, uf.body),
    h('button', { type: 'button', class: 'btn btn--accent btn--block u-mt-16', onclick: () => openUrgeFlow({ d, onDone: refresh }) }, uf.cta),
    h('p', { class: 'small u-mt-16' }, `Hoy: ${t.urges} ${t.urges === 1 ? 'momento' : 'momentos'} · ${t.urgesResolved} ${t.urgesResolved === 1 ? 'superado' : 'superados'}`));
}

export function weekCard(d) {
  const m = d.weekMeta;
  const fmt = valueFormatter(m.format);
  const has = d.week.some((x) => x.value != null);
  const hint = m.direction === 'min' ? 'Las barras claras quedan por debajo de tu objetivo.' : 'Las barras claras superan tu objetivo.';
  return h('section', { class: 'card', 'aria-labelledby': 'pg-week' },
    h('h2', { class: 'title-md', id: 'pg-week' }, 'Tu semana'),
    h('p', { class: 'card__sub' }, `${m.label} frente a tu objetivo`),
    has ? [xyChart({
      labels: d.week.map((x) => dayShort(x.day)), caption: `${m.label}, últimos 7 días`, format: fmt,
      series: [
        { label: m.label, kind: 'bars', values: d.week.map((x) => x.value), muted: d.week.map((x) => x.status === 'warn') },
        { label: 'Objetivo', kind: 'dashed', values: d.week.map((x) => x.target) },
      ],
    }), h('p', { class: 'help u-mt-8' }, hint)]
      : emptyState('Aún no hay registros esta semana', 'Registra o haz tu check-in del día para ver tu evolución.'));
}

export function totalsCard(d) {
  const cards = d.totals?.cards ?? [];
  return h('section', { class: 'card', 'aria-labelledby': 'pg-tot' },
    h('h2', { class: 'title-md', id: 'pg-tot' }, d.totals?.periodLabel ? `Totales ${d.totals.periodLabel}` : 'Totales'),
    cards.length ? h('div', { class: 'stats pg-stats u-mt-16' }, cards.map((c) => h('div', { class: `pg-stat${c.estimate ? ' is-estimate' : ''}` },
      h('p', { class: 'stat__label' }, c.label, c.estimate ? h('span', { class: 'pill pill--estimate' }, 'Estimación') : null),
      h('p', { class: 'stat__value' }, c.value == null ? '—' : fmtNum(c.value), c.unit ? h('span', { class: 'pg-stat__unit' }, ` ${c.unit}`) : null),
      c.sub ? h('p', { class: 'stat__sub' }, c.sub) : null)))
      : emptyState('Todavía no hay totales', 'Aparecerán con tus primeros registros.'));
}

export function streakCard(d) {
  const s = d.streak;
  return h('section', { class: 'card pg-streak', 'aria-labelledby': 'pg-streak' },
    h('p', { class: 'kicker', id: 'pg-streak' }, 'Tu racha'),
    h('p', { class: 'big-number u-mt-8' }, String(s.current)),
    h('p', { class: 'muted' }, s.label),
    h('p', { class: 'help u-mt-8' }, s.best > s.current ? `Tu mejor racha: ${s.best}` : s.best ? 'Es tu mejor racha hasta ahora.' : 'Cada día cuenta: empieza cuando quieras.'));
}

export function tasksCard(d) {
  // Metas do sistema: o lead só acompanha, quem marca é o plano.
  const row = (g) => h('div', { class: `goal${g.done ? ' is-done' : ''}` },
    h('span', { class: 'goal__mark', 'aria-hidden': 'true' }, g.done ? '✓' : ''),
    h('span', {}, h('span', { class: 'goal__title' }, g.title, h('span', { class: 'sr-only' }, g.done ? ' (cumplida)' : '')),
      g.detail ? h('p', { class: 'goal__detail' }, g.detail) : null));
  const wk = d.weekNumber ?? 1;
  const current = d.tasks.filter((x) => x.week === wk);
  const others = d.tasks.filter((x) => x.week !== wk);
  const weeks = [...new Set(others.map((x) => x.week))].sort((a, b) => a - b);
  return h('section', { class: 'card', 'aria-labelledby': 'pg-tasks' },
    h('h2', { class: 'title-md', id: 'pg-tasks' }, `Metas de tu plan · semana ${wk}`),
    h('p', { class: 'card__sub' }, 'Se marcan solas a medida que avanzas en tu plan.'),
    current.length ? h('div', { class: 'u-mt-8' }, current.map(row)) : h('p', { class: 'muted u-mt-8' }, 'No hay metas para esta semana.'),
    weeks.length ? h('details', { class: 'pg-more' }, h('summary', {}, 'Ver otras semanas'),
      weeks.map((w) => h('div', {}, h('p', { class: 'kicker pg-week-title' }, `Semana ${w}`), others.filter((x) => x.week === w).map(row)))) : null);
}

export function lessonCard(d) {
  const j = d.journey, n = j?.nextLesson, slug = d.program.slug;
  if (!n) return h('a', { class: 'card card-link', href: `/jornada?program=${slug}` }, h('p', { class: 'kicker' }, 'Tu jornada'),
    h('h2', { class: 'title-md u-mt-8' }, j?.totals?.lessons ? '¡Has completado todas las lecciones!' : 'Tu jornada se está preparando'),
    h('p', { class: 'muted u-mt-8' }, 'Puedes repasar cualquier lección cuando quieras.'));
  const ch = j.currentChapter;
  return h('a', { class: 'card card-link', href: `/leccion?l=${encodeURIComponent(n.slug)}&p=${slug}` },
    h('p', { class: 'kicker' }, `Capítulo ${n.chapter.number} · ${n.chapter.title}`),
    h('h2', { class: 'title-md u-mt-8' }, n.title),
    h('p', { class: 'muted u-mt-8' }, `${n.description} · ${n.minutes} min`),
    ch ? h('div', { class: 'progress-line', 'aria-hidden': 'true' }, h('span', { style: `width:${(ch.completedLessons / ch.totalLessons) * 100}%` })) : null,
    h('p', { class: 'help u-mt-8' }, `${j.totals.completed} de ${j.totals.lessons} lecciones completadas`),
    h('span', { class: 'btn btn--sm u-mt-16' }, n.status === 'in_progress' ? 'Continuar lección' : 'Empezar lección'));
}

export function exerciseCard(d) {
  const e = d.exercises, id = d.recommendedExercise;
  return h('a', { class: 'card card-link', href: `/respirar?ejercicio=${encodeURIComponent(id)}&p=${d.program.slug}` },
    h('p', { class: 'kicker' }, 'Ejercicio recomendado'),
    h('h2', { class: 'title-md u-mt-8' }, EXERCISES[id] ?? 'Respiración'),
    h('p', { class: 'muted u-mt-8' }, `Esta semana: ${e.thisWeek} de ${e.goal} ejercicios`),
    h('div', { class: 'progress-line', 'aria-hidden': 'true' }, h('span', { style: `width:${e.goal ? Math.min(100, (e.thisWeek / e.goal) * 100) : 0}%` })),
    h('span', { class: 'btn btn--sm btn--ghost u-mt-16' }, 'Respirar ahora'));
}

export function achievementsCard(d) {
  const a = d.achievements;
  return h('a', { class: 'card card-link', href: `/logros?p=${d.program.slug}` },
    h('p', { class: 'kicker' }, 'Mis logros'),
    h('h2', { class: 'title-md u-mt-8' }, `${a.unlocked} de ${a.total} conseguidos`),
    h('div', { class: 'progress-line', 'aria-hidden': 'true' }, h('span', { style: `width:${a.total ? (a.unlocked / a.total) * 100 : 0}%` })),
    a.recent?.length ? h('p', { class: 'muted small u-mt-8' }, `Último: ${a.recent[0].title}`) : h('p', { class: 'muted small u-mt-8' }, 'Tu primer logro está cerca.'),
    h('span', { class: 'btn btn--sm btn--ghost u-mt-16' }, 'Ver logros'));
}

export function safetyCard(d) {
  const s = d.safety;
  if (!s) return null;
  return h('aside', { class: 'card pg-safety', 'aria-labelledby': 'pg-safety' },
    h('h2', { class: 'title-md pg-safety__title', id: 'pg-safety' }, icon('shield', 'pg-safety__icon'), 'Tu seguridad primero'),
    h('p', { class: 'u-mt-8' }, s.text),
    s.resources?.length ? h('ul', { class: 'pg-resources' }, s.resources.map((r) => h('li', {},
      h('strong', {}, r.tel ? h('a', { href: `tel:${r.tel.replace(/[^\d+]/g, '')}` }, `${r.label} · ${r.tel}`) : r.label),
      r.detail ? h('p', { class: 'small muted' }, r.detail) : null))) : null);
}

/** Registros recientes con editar / eliminar (confirmación en línea). */
export function recentCard(d, refresh) {
  const box = h('div', { class: 'u-mt-8' }, h('p', { class: 'muted small' }, 'Cargando…'));
  const card = h('section', { class: 'card', 'aria-labelledby': 'pg-recent' }, h('h2', { class: 'title-md', id: 'pg-recent' }, 'Registros recientes'), box);
  api(`${base(d)}/log?limit=8`).then(({ entries }) => {
    if (!entries.length) { box.replaceChildren(emptyState('Todavía no hay registros', 'El primero es solo para ti.')); return; }
    box.replaceChildren(h('ul', { class: 'list' }, entries.map((e) => {
      const actions = h('div', { class: 'pg-row-actions' });
      const drawActions = () => actions.replaceChildren(
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Editar registro del ${whenShort(e.at)}`, onclick: () => openLogModal({ d, entry: e, onSaved: refresh }) }, 'Editar'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Eliminar registro del ${whenShort(e.at)}`, onclick: () => {
          actions.replaceChildren(
            h('button', { type: 'button', class: 'icon-btn pg-danger', onclick: async (ev) => {
              ev.currentTarget.disabled = true;
              try { await api(`${base(d)}/log/${e.id}`, { method: 'DELETE' }); toast('Registro eliminado.'); refresh(); } catch (err) { toast(err.message); drawActions(); }
            } }, 'Sí, eliminar'),
            h('button', { type: 'button', class: 'icon-btn', onclick: drawActions }, 'No'));
          actions.querySelector('button')?.focus();
        } }, 'Eliminar'));
      drawActions();
      return h('li', {}, h('div', { class: 'list__main' }, h('span', {}, e.summary || d.logForm.label), h('p', { class: 'list__meta' }, whenShort(e.at))), actions);
    })));
  }).catch((err) => box.replaceChildren(h('p', { class: 'form-error' }, err.message),
    h('button', { type: 'button', class: 'link', onclick: refresh }, 'Reintentar')));
  return card;
}

export function quickLinks(d) {
  const slug = d.program.slug;
  const links = [['/progreso', 'Mi progreso', 'Gráficos y patrones'], ['/diario', 'Mi diario', 'Cómo te sientes'], ['/objetivos', 'Mis objetivos', 'Ajusta tu plan']];
  return h('nav', { class: 'pg-links', 'aria-label': 'Más de este programa' }, links.map(([href, t, s]) => h('a', { class: 'card card-link pg-link', href: `${href}?p=${slug}` }, h('strong', {}, t), h('span', { class: 'muted small' }, s))));
}

