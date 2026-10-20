// Progreso de un programa (alcohol, azúcar, ansiedad, sueño) a partir de GET /api/app/programs/:slug/progress.
import { api, h, longDate, num } from '../ui.js';
import { emptyState, loading, page, rangeTabs } from '../shell.js';
import { hbars, xyChart } from '../charts.js';
import { fmtMetric, programError, programRibbon, withProgram } from './nav.js';

const MOODS = { 5: 'Muy bien', 4: 'Bien', 3: 'Regular', 2: 'Mal', 1: 'Muy mal' };
const NAMES = {
  pausa: 'Pausa', reducir: 'Reducir poco a poco', moderar: 'Moderar', equilibrio: 'Equilibrio', 'sin-anadido': 'Sin azúcar añadido',
  herramientas: 'Herramientas para el día a día', rutina: 'Rutina de calma', profundo: 'Trabajo profundo',
  regularidad: 'Regularidad', descanso: 'Descanso reparador',
};
const URGE_TITLE = {
  alcohol: ['Ganas de beber', 'Registradas y superadas por día', 'Sin momentos difíciles registrados', 'Usa «Tengo ganas de beber» cuando aparezcan.'],
  azucar: ['Antojos', 'Registrados y superados por día', 'Sin antojos registrados', 'Usa «Tengo un antojo» cuando aparezcan.'],
  ansiedad: ['Momentos de ansiedad', 'Registrados y superados por día', 'Sin momentos registrados', 'Usa «Necesito calmarme» cuando lo necesites.'],
  sueno: ['Noches difíciles', 'Registradas y superadas por día', 'Sin momentos registrados', 'Usa «No logro dormir» cuando lo necesites.'],
};
const TIMELINE_ICON = { log: '●', urge: '◆', checkin: '✓', breathing: '○' };

const stat = (card) => h('div', { class: 'card card--flat stat' },
  h('p', { class: 'stat__label' }, card.label),
  h('p', { class: 'stat__value' }, card.id && card.unit === 'horas' && card.value != null && card.value < 24 ? fmtMetric(card.value, 'hours') : num(card.value ?? 0), card.unit && card.unit !== 'horas' ? h('small', { class: 'stat__unit' }, ` ${card.unit}`) : null),
  card.sub ? h('p', { class: 'stat__sub' }, card.sub) : null);

const labelDay = (iso) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));
const when = (iso) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export function mountProgramProgress(root, slug, meta) {
  let days = 30;
  const urgeCopy = URGE_TITLE[slug];

  async function load() {
    loading(root);
    let p;
    try { p = await api(`/api/app/programs/${slug}/progress?range=${days}`); } catch (err) { return programError(root, err, slug, load); }
    page(root, { eyebrow: `Tu evolución · ${meta.name}`, title: 'Mi progreso', intro: 'Todo sale de tus registros. Lo que es una estimación aparece marcado.',
      actions: rangeTabs(days, (v) => { days = v; load(); }) });
    root.prepend(programRibbon(meta));
    const fmt = (v) => fmtMetric(v, p.metric.format, p.locale);
    const hasData = p.series.some((d) => d.value !== null);

    const recorded = p.totals.cards.filter((c) => !c.estimate);
    const estimates = p.totals.cards.filter((c) => c.estimate);
    const streakCard = { label: 'Racha actual', value: p.streak.current, unit: '', sub: `${p.streak.label} · mejor: ${p.streak.best}` };
    root.append(
      h('h2', { class: 'section-title' }, 'Datos registrados'),
      h('div', { class: 'stats' }, [...recorded.map(stat), stat(streakCard),
        stat({ label: 'Ejercicios de respiración', value: p.totals.breathing, unit: '', sub: 'completados en este período' })]));
    if (estimates.length) {
      root.append(
        h('div', { class: 'page-head pp-subhead' }, h('h2', { class: 'section-title' }, 'Estimaciones'), h('span', { class: 'pill pill--estimate' }, 'Estimación')),
        h('div', { class: 'stats' }, estimates.map(stat)),
        h('p', { class: 'help u-mt-8' }, 'Las estimaciones usan solo los días con registro y lo que indicaste en el cuestionario. No son un diagnóstico.'));
    }

    if (p.insights.length) {
      root.append(h('section', { class: 'card u-mt-16 pp-insights' }, h('h2', { class: 'title-md' }, 'Lo que vemos en tus datos'),
        h('p', { class: 'card__sub' }, 'Observaciones sencillas a partir de tus registros'),
        h('ul', { class: 'list' }, p.insights.map((i) => h('li', {}, h('div', { class: 'list__main' }, i.text))))));
    }

    const kind = days <= 30 ? 'bars' : 'line';
    root.append(h('div', { class: 'grid-2 u-mt-16' },
      h('section', { class: 'card' }, h('h2', { class: 'title-md' }, p.metric.label), h('p', { class: 'card__sub' }, 'Registrado frente a tu objetivo'),
        hasData ? xyChart({
          labels: p.series.map((d) => labelDay(d.day)), caption: p.metric.label,
          format: (v, axis) => (axis && p.metric.format === 'hours' ? `${Math.round(v * 10) / 10} h` : fmt(v)),
          series: [{ label: 'Registrado', kind, values: p.series.map((d) => d.value) },
            { label: 'Objetivo', kind: 'dashed', values: p.series.map((d) => d.target) }],
        }) : emptyState('Sin registros en este período', 'Registra desde el panel de tu programa.', h('a', { class: 'btn btn--sm', href: `/programa?p=${slug}` }, 'Ir al panel'))),
      h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Estado de ánimo'), h('p', { class: 'card__sub' }, 'De «Muy mal» (1) a «Muy bien» (5)'),
        p.series.some((d) => d.mood) ? xyChart({
          labels: p.series.map((d) => labelDay(d.day)), caption: 'Ánimo por día',
          format: (v, axis) => (axis ? String(Math.round(v)) : MOODS[Math.round(v)] ?? ''),
          series: [{ label: 'Ánimo', kind: 'line', values: p.series.map((d) => d.mood) }],
        }) : emptyState('Sin entradas en tu diario', null, h('a', { class: 'btn btn--sm', href: withProgram('/diario', slug) }, 'Escribir en mi diario')))));

    const wd = p.byWeekday;
    root.append(h('div', { class: 'grid-2 u-mt-16' },
      h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Por día de la semana'), h('p', { class: 'card__sub' }, 'Promedio en los días con registro'),
        wd.some((d) => d.average != null) ? xyChart({
          labels: wd.map((d) => d.label), caption: 'Promedio por día de la semana', height: 200,
          format: (v, axis) => (axis && p.metric.format === 'hours' ? `${Math.round(v * 10) / 10} h` : fmt(v)),
          series: [{ label: 'Promedio', kind: 'bars', values: wd.map((d) => d.average) }],
        }) : emptyState('Aún sin datos suficientes', 'Con unos días de registro verás tu patrón semanal.')),
      h('section', { class: 'card' }, h('h2', { class: 'title-md' }, urgeCopy[0]), h('p', { class: 'card__sub' }, urgeCopy[1]),
        p.series.some((d) => d.urges) ? xyChart({
          labels: p.series.map((d) => labelDay(d.day)), caption: urgeCopy[0],
          format: (v) => num(Math.round(v)),
          series: [{ label: 'Registrados', kind: 'line', values: p.series.map((d) => d.urges) }, { label: 'Superados', kind: 'dashed', values: p.series.map((d) => d.urgesResolved) }],
        }) : emptyState(urgeCopy[2], urgeCopy[3]))));

    const totalTrig = p.topTriggers.reduce((a, x) => a + x.count, 0);
    root.append(h('div', { class: 'grid-2 u-mt-16' },
      h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Tus principales gatillos'), h('p', { class: 'card__sub' }, 'De tus registros y momentos difíciles'),
        p.topTriggers.length ? hbars(p.topTriggers.slice(0, 6).map((t) => ({ label: t.label, value: Math.round((t.count / totalTrig) * 100) })))
          : emptyState('Aún sin gatillos registrados', null)),
      h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Línea de tiempo'), h('p', { class: 'card__sub' }, 'Lo último que has hecho'),
        p.timeline.length ? h('ul', { class: 'list' }, p.timeline.slice(0, 8).map((t) => h('li', {},
          h('span', { class: `pp-tl pp-tl--${t.type}`, 'aria-hidden': 'true' }, TIMELINE_ICON[t.type] ?? '●'),
          h('div', { class: 'list__main' }, h('strong', {}, t.title), t.detail ? h('p', { class: 'list__meta' }, t.detail) : null,
            h('p', { class: 'list__meta' }, when(t.at)))))) : emptyState('Aún sin actividad', null))));

    root.append(h('div', { class: 'grid-2 u-mt-16' },
      h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Tu jornada'), h('p', { class: 'card__sub' }, `${p.journey.totals.completed} de ${p.journey.totals.lessons} lecciones`),
        h('ul', { class: 'list' }, p.journey.chapters.map((c) => h('li', {}, h('div', { class: 'list__main' },
          h('strong', {}, `${c.number}. ${c.title}`),
          h('div', { class: 'progress-line' }, h('span', { style: `width:${(c.completedLessons / c.totalLessons) * 100}%` }))),
        h('span', { class: 'help' }, `${c.completedLessons}/${c.totalLessons}`))))),
      h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Evolución de tus objetivos'),
        h('ul', { class: 'list' }, p.goalHistory.map((g) => h('li', {}, h('div', { class: 'list__main' },
          h('strong', {}, NAMES[g.strategy] ?? g.strategy, g.supersededAt ? '' : ' · actual'),
          h('p', { class: 'list__meta' }, `${g.target != null ? `objetivo ${fmtMetric(g.target, p.metric.format)} ${p.metric.format === 'hours' ? '' : p.metric.unit}`.trim() : 'según el plan'} · desde el ${longDate(g.createdAt)}`))))),
        h('a', { class: 'link', href: withProgram('/objetivos', slug) }, 'Ajustar mis objetivos'))));
  }
  load();
}
