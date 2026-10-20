import { $, api, h } from '../ui.js';
import { errorState, initApp, loading, page } from '../shell.js';
import { applyProgramNav, programError, programRibbon, programSlug } from '../program/nav.js';

const PROGRAM = programSlug() ?? 'sem-fumo';
await initApp({ active: '/jornada' });
const root = $('[data-root]');
const META = PROGRAM === 'sem-fumo' ? null : await applyProgramNav(PROGRAM);
const lessonHref = (slug) => `/leccion?l=${encodeURIComponent(slug)}${PROGRAM === 'sem-fumo' ? '' : `&p=${PROGRAM}`}`;

/** Planta original de Alento: una hoja por lección completada; florece al terminar la jornada. */
export function plant(completed, total) {
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => { const n = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
  const svg = el('svg', { viewBox: '0 0 200 200', class: 'plant', role: 'img', 'aria-label': `${completed} de ${total} lecciones completadas` });
  const ratio = total ? completed / total : 0;
  const top = 150 - 110 * Math.max(0.08, ratio);
  svg.append(el('path', { class: 'pot', d: 'M66 160 h68 l-8 32 h-52 z' }));
  svg.append(el('path', { class: 'stem', d: `M100 160 C 96 ${130 - ratio * 20}, 104 ${top + 30}, 100 ${top}` }));
  const leaves = Math.min(completed, 30);
  for (let i = 0; i < leaves; i++) {
    const y = 156 - (i + 1) * ((156 - top) / (leaves + 1));
    const side = i % 2 ? 1 : -1;
    const size = 9 + Math.min(6, i / 3);
    const leaf = el('ellipse', {
      class: `leaf${i === leaves - 1 ? ' leaf--new' : ''}`, cx: 100 + side * (size + 2), cy: y, rx: size, ry: size / 2.4,
      transform: `rotate(${side * -28} ${100 + side * (size + 2)} ${y})`,
    });
    leaf.style.animationDelay = `${i * 30}ms`;
    svg.append(leaf);
  }
  if (total && completed >= total) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      svg.append(el('circle', { class: 'bud', cx: 100 + Math.cos(a) * 8, cy: top - 6 + Math.sin(a) * 8, r: 6 }));
    }
    svg.append(el('circle', { cx: 100, cy: top - 6, r: 4, fill: 'var(--verde)' }));
  }
  return svg;
}

const STATE_LABEL = { completed: 'Completada', in_progress: 'En curso', available: 'Disponible', locked: 'Bloqueada' };
const CH_LABEL = { completed: 'Completado', in_progress: 'En curso', available: 'Disponible', locked: 'Bloqueado' };

async function render() {
  loading(root);
  let j;
  try { j = await api(`/api/app/journey?program=${PROGRAM}`); } catch (err) { return PROGRAM === 'sem-fumo' ? errorState(root, err, render) : programError(root, err, PROGRAM, render); }
  page(root, { eyebrow: META ? `Tu programa · ${META.name}` : 'Tu programa', title: 'Mi jornada', intro: 'Diez capítulos de lecciones cortas. Cada una desbloquea la siguiente y puedes repasarlas cuando quieras.' });
  if (META) root.prepend(programRibbon(META));
  const { completed, lessons } = j.totals;
  root.append(h('section', { class: 'card journey-hero' },
    plant(completed, lessons),
    h('div', {},
      h('p', { class: 'kicker' }, 'Tu progreso'),
      h('p', { class: 'big-number u-mt-8' }, `${completed}`, h('span', { class: 'muted', style: 'font-size:20px' }, ` / ${lessons} lecciones`)),
      h('div', { class: 'progress-line' }, h('span', { style: `width:${lessons ? (completed / lessons) * 100 : 0}%` })),
      j.nextLesson ? h('a', { class: 'btn u-mt-16', href: lessonHref(j.nextLesson.slug) },
        j.nextLesson.status === 'in_progress' ? 'Continuar: ' : 'Siguiente: ', j.nextLesson.title)
        : h('p', { class: 'u-mt-16' }, 'Has completado la jornada. ¡Enhorabuena!'))));

  for (const ch of j.chapters) {
    const open = ch.status === 'in_progress' || ch.status === 'available';
    root.append(h('details', { class: 'card chapter', 'data-status': ch.status, open },
      h('summary', {},
        h('span', { class: 'chapter__num', 'aria-hidden': 'true' }, ch.status === 'completed' ? '✓' : String(ch.number)),
        h('span', { class: 'list__main' },
          h('span', { class: 'chapter__title' }, `Capítulo ${ch.number} · ${ch.title}`),
          h('span', { class: 'list__meta', style: 'display:block' }, `${ch.completedLessons} de ${ch.lessons.length} lecciones · ${CH_LABEL[ch.status]}`))),
      h('p', { class: 'muted small', style: 'margin:12px 0 4px 54px' }, ch.description),
      ch.lessons.map((l) => (l.status === 'locked'
        ? h('div', { class: 'lesson-row', 'data-status': l.status, 'aria-disabled': 'true' },
          h('span', { class: 'lesson-row__state', 'aria-hidden': 'true' }, '🔒'),
          h('span', { class: 'lesson-row__main' }, l.title, h('span', { class: 'list__meta', style: 'display:block' }, `${l.minutes} min · Se desbloquea al completar la anterior`)))
        : h('a', { class: 'lesson-row', 'data-status': l.status, href: lessonHref(l.slug) },
          h('span', { class: 'lesson-row__state', 'aria-hidden': 'true' }, l.status === 'completed' ? '✓' : ''),
          h('span', { class: 'lesson-row__main' }, l.title, h('span', { class: 'list__meta', style: 'display:block' }, `${l.minutes} min · ${STATE_LABEL[l.status]}`)),
          h('span', { class: 'help' }, l.status === 'completed' ? 'Repasar' : 'Abrir'))))));
  }
}

render();
