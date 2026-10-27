import { $, api, h, icon, money, num, toast, locale } from '../ui.js';
import { celebrate, cravingFlow, emptyState, errorState, greeting, initApp, loading, modal } from '../shell.js';
import { installAction, installState } from '../install.js';
import { xyChart } from '../charts.js';
import { track } from '../track.js';

const me = await initApp({ active: '/dashboard' });
track('app_activated', { program: 'sem-fumo' }); // el servidor lo registra una sola vez por usuario
const root = $('[data-root]');

const EXERCISES = { 'calma-4-6': 'Calma 4·6', 'caja-4-4': 'Respiración cuadrada', 'pausa-4-2-6': 'Pausa consciente' };
const MOODS = { 5: 'Muy bien', 4: 'Bien', 3: 'Regular', 2: 'Mal', 1: 'Muy mal' };

async function render() {
  loading(root);
  let d;
  try {
    d = await api('/api/app/dashboard');
  } catch (err) {
    if (err.code === 'ONBOARDING_REQUIRED') return location.replace('/configuracion');
    if (err.code === 'PLAN_PENDING') { setTimeout(render, 3000); return; }
    return errorState(root, err, render);
  }
  const fmtMoney = (v) => money(v, d.currency, d.locale, 2);
  const t = d.todayStatus;
  const started = d.dayNumber >= 1;
  const within = t.cigarettes <= t.target;

  // ---- Hoy
  const today = h('section', { class: 'card today-card' },
    h('p', { class: 'kicker' }, 'Hoy'),
    h('p', { class: 'big-number' }, num(t.cigarettes, d.locale), h('span', { class: 'muted', style: 'font-size:18px;margin-left:8px' }, t.cigarettes === 1 ? 'cigarrillo' : 'cigarrillos')),
    h('p', { class: 'muted' }, `Objetivo de hoy: ${t.target === 0 ? 'cero' : `máximo ${t.target}`} · `,
      t.checkedIn ? h('span', { class: 'pill pill--ok' }, 'Día sin fumar registrado')
        : h('span', { class: `pill ${within ? 'pill--ok' : 'pill--warn'}` }, within ? 'Dentro de tu objetivo' : 'Por encima del objetivo')),
    h('div', { class: 'progress-line', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.min(100, t.target ? (t.cigarettes / t.target) * 100 : t.cigarettes ? 100 : 0)}%` })),
    h('div', { class: 'actions-row' },
      h('a', { class: 'btn', href: '/registro?nuevo=1' }, 'Registrar cigarrillo'),
      !t.checkedIn && t.cigarettes === 0 ? h('button', { class: 'btn btn--ghost', onclick: smokeFree }, 'Hoy no he fumado') : null));

  async function smokeFree(e) {
    e.currentTarget.disabled = true;
    try {
      const r = await api('/api/app/checkins', { method: 'POST', body: {} });
      celebrate(r.achievements);
      toast('¡Día sin fumar registrado!');
      render();
    } catch (err) { toast(err.message); e.currentTarget.disabled = false; }
  }

  // ---- Ganas
  const ganas = h('section', { class: 'card ganas-card', id: 'ganas' },
    h('h2', { class: 'title-md' }, '¿Tienes ganas de fumar?'),
    h('p', { class: 'u-mt-8' }, 'Respira, nómbralo y déjalo pasar. Te acompañamos en tres pasos.'),
    h('button', { class: 'btn btn--accent btn--block u-mt-16', onclick: () => cravingFlow({ triggerOptions: d.triggerOptions, onDone: render }) }, 'Tengo ganas de fumar'),
    h('p', { class: 'small u-mt-16' }, `Hoy: ${t.cravings} ${t.cravings === 1 ? 'momento' : 'momentos'} de ganas · ${t.resisted} superados`));

  // ---- Jornada
  const j = d.journey;
  const journey = j.nextLesson
    ? h('a', { class: 'card card-link', href: `/leccion?l=${encodeURIComponent(j.nextLesson.slug)}` },
      h('p', { class: 'kicker' }, `Capítulo ${j.nextLesson.chapter.number} · ${j.nextLesson.chapter.title}`),
      h('h2', { class: 'title-md u-mt-8' }, j.nextLesson.title),
      h('p', { class: 'muted u-mt-8' }, `${j.nextLesson.description} · ${j.nextLesson.minutes} min`),
      j.currentChapter ? h('div', { class: 'progress-line' }, h('span', { style: `width:${(j.currentChapter.completedLessons / j.currentChapter.totalLessons) * 100}%` })) : null,
      h('p', { class: 'help u-mt-8' }, `${j.totals.completed} de ${j.totals.lessons} lecciones completadas`),
      h('span', { class: 'btn btn--sm u-mt-16' }, j.nextLesson.status === 'in_progress' ? 'Continuar lección' : 'Empezar lección'))
    : h('a', { class: 'card card-link', href: '/jornada' }, h('p', { class: 'kicker' }, 'Tu jornada'),
      h('h2', { class: 'title-md u-mt-8' }, j.totals.lessons ? '¡Has completado todas las lecciones!' : 'Tu jornada se está preparando'),
      h('p', { class: 'muted u-mt-8' }, 'Puedes repasar cualquier lección cuando quieras.'));

  // ---- Ejercicio recomendado
  const ex = h('a', { class: 'card card-link', href: `/respirar?ejercicio=${d.recommendedExercise}` },
    h('p', { class: 'kicker' }, 'Ejercicio recomendado'),
    h('h2', { class: 'title-md u-mt-8' }, EXERCISES[d.recommendedExercise] ?? 'Respiración'),
    h('p', { class: 'muted u-mt-8' }, `Esta semana: ${d.exercises.thisWeek} de ${d.exercises.goal} ejercicios`),
    h('div', { class: 'progress-line' }, h('span', { style: `width:${d.exercises.goal ? Math.min(100, (d.exercises.thisWeek / d.exercises.goal) * 100) : 0}%` })),
    h('span', { class: 'btn btn--sm btn--ghost u-mt-16' }, 'Respirar ahora'));

  // ---- Totales (registrados vs estimados)
  const tot = d.totals;
  const totals = h('section', { class: 'card' },
    h('div', { class: 'page-head', style: 'margin-bottom:12px' }, h('h2', { class: 'title-md' }, 'Desde que empezaste'), h('span', { class: 'pill pill--estimate' }, 'Estimación')),
    h('div', { class: 'stats' },
      h('div', {}, h('p', { class: 'stat__label' }, 'Dinero ahorrado'), h('p', { class: 'stat__value' }, fmtMoney(tot.estimated.moneySaved))),
      h('div', {}, h('p', { class: 'stat__label' }, 'Cigarrillos evitados'), h('p', { class: 'stat__value' }, num(tot.estimated.cigarettesAvoided, d.locale))),
      h('div', {}, h('p', { class: 'stat__label' }, 'Días sin fumar'), h('p', { class: 'stat__value' }, num(tot.recorded.smokeFreeDays, d.locale)), h('p', { class: 'stat__sub' }, 'registrados'))),
    h('p', { class: 'help u-mt-16' }, `Estimado frente a tu consumo inicial del cuestionario, solo en los ${tot.recorded.trackedDays} días con registro.`));

  // ---- Semana
  const fmtDay = (iso) => new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(`${iso}T12:00:00`));
  const hasWeek = d.week.some((x) => x.cigarettes !== null);
  const week = h('section', { class: 'card' },
    h('h2', { class: 'title-md' }, 'Tu semana'),
    h('p', { class: 'card__sub' }, 'Cigarrillos registrados frente a tu objetivo diario'),
    hasWeek ? xyChart({
      labels: d.week.map((x) => fmtDay(x.day)), caption: 'Cigarrillos por día en los últimos 7 días',
      format: (v) => num(Math.round(v), d.locale),
      series: [{ label: 'Registrados', kind: 'bars', values: d.week.map((x) => x.cigarettes) }, { label: 'Objetivo', kind: 'dashed', values: d.week.map((x) => x.target) }],
    }) : emptyState('Aún no hay registros esta semana', 'Registra tus cigarrillos o marca «Hoy no he fumado» para ver tu evolución.'));

  // ---- Metas de la semana
  const weekNum = Math.max(1, Math.floor((d.dayNumber - 1) / 7) + 1);
  const tasks = d.tasks.filter((x) => x.week <= weekNum + 1);
  const goals = h('section', { class: 'card' },
    h('h2', { class: 'title-md' }, 'Metas de tu plan'),
    h('p', { class: 'card__sub' }, 'Se marcan solas a medida que avanzas en tu plan.'),
    tasks.length ? h('div', { class: 'u-mt-8' }, tasks.map((g) => h('div', { class: `goal${g.done ? ' is-done' : ''}` },
      h('span', { class: 'goal__mark', 'aria-hidden': 'true' }, g.done ? '✓' : ''),
      h('span', {}, h('span', { class: 'goal__title' }, g.title, h('span', { class: 'sr-only' }, g.done ? ' (cumplida)' : '')),
        h('p', { class: 'goal__detail' }, `Semana ${g.week} · ${g.detail ?? ''}`))))) : emptyState('Sin metas pendientes', null));

  // ---- Ánimo
  const mood = h('a', { class: 'card card-link', href: '/diario' },
    h('p', { class: 'kicker' }, 'Mi diario'),
    h('h2', { class: 'title-md u-mt-8' }, t.mood ? `Hoy te sientes: ${MOODS[t.mood]}` : '¿Cómo te has sentido hoy?'),
    h('p', { class: 'muted u-mt-8' }, t.mood ? 'Puedes editarlo cuando quieras.' : 'Anotarlo te ayuda a entender tus ganas.'));

  const notice = d.subscription?.status === 'past_due'
    ? h('div', { class: 'notice notice--warn' }, icon('info', 'notice__icon'), h('div', {}, h('strong', {}, 'No pudimos renovar tu suscripción. '), 'Actualiza tu método de pago en ', h('a', { href: '/suscripcion' }, 'Mi suscripción'), '.'))
    : null;

  // Sugerencia de instalación (solo si no está instalada y no se descartó).
  let dismissed = false;
  try { dismissed = localStorage.getItem('al_install_dismissed') === '1'; } catch { /* sin almacenamiento */ }
  const installCard = installState() !== 'installed' && !dismissed ? h('section', { class: 'card install-banner' },
    h('div', {}, h('strong', {}, 'Ten Alento siempre contigo'), h('p', { class: 'muted small' }, 'Instálalo en tu pantalla de inicio y ábrelo como una app.')),
    h('div', { class: 'actions-row', style: 'margin:0' },
      h('button', { class: 'btn btn--sm', onclick: async () => {
        const r = await installAction((content) => modal((close) => [...content, h('button', { class: 'btn btn--block u-mt-16', onclick: close }, 'Entendido')], { label: 'Instalar Alento' }));
        if (r === 'accepted') installCard.remove();
      } }, 'Instalar Alento'),
      h('button', { class: 'link', onclick: () => { try { localStorage.setItem('al_install_dismissed', '1'); } catch { /* */ } installCard.remove(); } }, 'Ahora no'))) : null;

  root.replaceChildren(...[
    installCard,
    h('div', { class: 'page-head' },
      h('div', {},
        h('p', { class: 'eyebrow' }, started ? `Día ${d.dayNumber} · ${d.strategy.name}` : `Empiezas el ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(`${d.startDate}T12:00:00`))}`),
        h('h1', { class: 'title-lg' }, greeting(me.user.name)),
        h('p', { class: 'muted page-intro' }, 'Cada paso cuenta.'))),
    notice,
    h('div', { class: 'dash-hero' }, today, ganas),
    h('div', { class: 'grid-3c u-mt-16' }, journey, ex, mood),
    h('div', { class: 'grid-2 u-mt-16' }, week, totals),
    h('div', { class: 'u-mt-16' }, goals),
  ].filter(Boolean));
  if (location.hash === '#ganas') cravingFlow({ triggerOptions: d.triggerOptions, onDone: render });
}

render();
