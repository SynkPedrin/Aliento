import { $, api, h, money, num, locale } from '../ui.js';
import { emptyState, errorState, initApp, loading, page, rangeTabs } from '../shell.js';
import { hbars, xyChart } from '../charts.js';
import { applyProgramNav, programSlug } from '../program/nav.js';

const SLUG = programSlug();
await initApp({ active: '/progreso' });
const root = $('[data-root]');
let days = 30;
const MOODS = { 5: 'Muy bien', 4: 'Bien', 3: 'Regular', 2: 'Mal', 1: 'Muy mal' };
const NAMES = { parar: 'Dejarlo en una fecha', gradual: 'Reducción progresiva', reducir: 'Reducir a la mitad' };

const stat = (label, value, sub) => h('div', { class: 'card card--flat stat' },
  h('p', { class: 'stat__label' }, label), h('p', { class: 'stat__value' }, value), sub ? h('p', { class: 'stat__sub' }, sub) : null);

async function load() {
  loading(root);
  let p;
  try { p = await api(`/api/app/progress?days=${days}`); } catch (err) { return errorState(root, err, load); }
  page(root, { eyebrow: 'Tu evolución', title: 'Mi progreso', intro: 'Todo sale de tus registros. Lo que es una estimación aparece marcado.',
    actions: rangeTabs(days, (v) => { days = v; load(); }) });

  const r = p.summary.recorded;
  const e = p.summary.estimated;
  const fmt = (v) => num(v, p.locale);
  const labelDay = (iso) => new Intl.DateTimeFormat(locale, days <= 30 ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));

  root.append(
    h('h2', { class: 'section-title' }, 'Datos registrados'),
    h('div', { class: 'stats' },
      stat('Cigarrillos registrados', fmt(r.cigarettes), `${r.trackedDays} días con registro`),
      stat('Promedio por día registrado', r.averagePerTrackedDay == null ? '—' : fmt(r.averagePerTrackedDay), `consumo inicial: ${p.baseline.perDay}/día`),
      stat('Días sin fumar', fmt(r.smokeFreeDays), 'marcados como «hoy no he fumado»'),
      stat('Ganas superadas', `${fmt(r.cravingsResisted)}/${fmt(r.cravings)}`, 'momentos de ganas registrados'),
      stat('Ejercicios de respiración', fmt(r.breathingSessions), 'completados'),
      stat('Lecciones completadas', fmt(r.lessonsCompleted), 'en este período')),
    h('div', { class: 'page-head', style: 'margin:28px 0 12px' }, h('h2', { class: 'section-title', style: 'margin:0' }, 'Estimaciones'), h('span', { class: 'pill pill--estimate' }, 'Estimación')),
    h('div', { class: 'stats' },
      stat('Dinero ahorrado', money(e.moneySaved, p.currency, p.locale, 2), 'frente a tu gasto inicial'),
      stat('Cigarrillos evitados', fmt(e.cigarettesAvoided), 'frente a tu consumo inicial'),
      stat('Reducción', e.reductionPercent == null ? '—' : `${e.reductionPercent}%`, 'promedio frente al consumo inicial')),
    h('p', { class: 'help u-mt-8' }, 'Las estimaciones solo usan los días con registro y el consumo y gasto que indicaste en el cuestionario.'));

  const tracked = p.series.some((d) => d.cigarettes !== null);
  root.append(h('div', { class: 'grid-2 u-mt-16' },
    h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Consumo diario'), h('p', { class: 'card__sub' }, 'Registrado frente a tu objetivo'),
      tracked ? xyChart({
        labels: p.series.map((d) => labelDay(d.day)), caption: 'Cigarrillos por día',
        format: (v) => fmt(Math.round(v)),
        series: [{ label: 'Registrados', kind: days <= 30 ? 'bars' : 'line', values: p.series.map((d) => d.cigarettes) },
          { label: 'Objetivo', kind: 'dashed', values: p.series.map((d) => d.target) }],
      }) : emptyState('Sin registros en este período', 'Registra tus cigarrillos o tus días sin fumar.', h('a', { class: 'btn btn--sm', href: '/registro' }, 'Registrar'))),
    h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Estado de ánimo'), h('p', { class: 'card__sub' }, 'De «Muy mal» (1) a «Muy bien» (5)'),
      p.series.some((d) => d.mood) ? xyChart({
        labels: p.series.map((d) => labelDay(d.day)), caption: 'Ánimo por día',
        format: (v, axis) => (axis ? String(Math.round(v)) : MOODS[Math.round(v)] ?? ''),
        series: [{ label: 'Ánimo', kind: 'line', values: p.series.map((d) => d.mood) }],
      }) : emptyState('Sin entradas en tu diario', null, h('a', { class: 'btn btn--sm', href: '/diario' }, 'Escribir en mi diario')))));

  root.append(h('div', { class: 'grid-2 u-mt-16' },
    h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Ganas de fumar'), h('p', { class: 'card__sub' }, 'Registradas y superadas por día'),
      p.series.some((d) => d.cravings) ? xyChart({
        labels: p.series.map((d) => labelDay(d.day)), caption: 'Ganas registradas y superadas',
        format: (v) => fmt(Math.round(v)),
        series: [{ label: 'Registradas', kind: 'line', values: p.series.map((d) => d.cravings) }, { label: 'Superadas', kind: 'dashed', values: p.series.map((d) => d.resisted) }],
      }) : emptyState('Sin ganas registradas', 'Usa «Tengo ganas de fumar» cuando aparezcan.')),
    h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Tus gatillos más frecuentes'), h('p', { class: 'card__sub' }, 'De cigarrillos y ganas registrados'),
      p.triggers.length ? hbars(p.triggers.slice(0, 6).map((t) => ({ label: t.label, value: Math.round((t.total / p.triggers.reduce((a, x) => a + x.total, 0)) * 100) })))
        : emptyState('Aún sin gatillos registrados', null))));

  root.append(h('div', { class: 'grid-2 u-mt-16' },
    h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Tu jornada'), h('p', { class: 'card__sub' }, `${p.journey.totals.completed} de ${p.journey.totals.lessons} lecciones`),
      h('ul', { class: 'list' }, p.journey.chapters.map((c) => h('li', {}, h('div', { class: 'list__main' },
        h('strong', {}, `${c.number}. `, h('span', {}, c.title)), // título em nó próprio: o tradutor da tela o encontra inteiro
        h('div', { class: 'progress-line' }, h('span', { style: `width:${(c.completedLessons / c.totalLessons) * 100}%` }))),
      h('span', { class: 'help' }, `${c.completedLessons}/${c.totalLessons}`))))),
    h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Evolución de tus objetivos'),
      h('ul', { class: 'list' }, p.goalHistory.slice().reverse().map((g) => h('li', {}, h('div', { class: 'list__main' },
        h('strong', {}, NAMES[g.strategy] ?? g.strategy, g.superseded_at ? '' : ' · actual'),
        h('p', { class: 'list__meta' }, `${g.max_daily != null ? `máximo ${g.max_daily}/día` : 'máximo según el plan'} · desde el ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(g.created_at))}`))))))));
}

if (SLUG) {
  const [{ mountProgramProgress }, meta] = await Promise.all([import('../program/progress-view.js'), applyProgramNav(SLUG)]);
  mountProgramProgress(root, SLUG, meta);
} else load();
