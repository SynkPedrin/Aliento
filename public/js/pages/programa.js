// Panel de un programa (alcohol, azucar, ansiedad, sueno). Sem Fumo usa /dashboard.
import { $, api, h, icon } from '../ui.js';
import { errorState, greeting, initApp, loading } from '../shell.js';
import { dayLong } from '../program/format.js';
import * as S from '../program/sections.js';

const slug = new URLSearchParams(location.search).get('p') ?? '';
const SLUGS = ['alcohol', 'azucar', 'ansiedad', 'sueno'];
if (slug === 'sem-fumo' || !SLUGS.includes(slug)) {
  location.replace(slug === 'sem-fumo' ? '/dashboard' : '/programas');
  await new Promise(() => {});
}
if (slug === 'sueno') document.body.classList.add('program-night');

const me = await initApp({ active: '/programas', access: 'account' });
const root = $('[data-root]');

async function render() {
  if (!root.children.length || root.querySelector('.loading')) loading(root);
  let d;
  try {
    d = await api(`/api/app/programs/${slug}/dashboard`);
  } catch (err) {
    if (err.code === 'ONBOARDING_REQUIRED') return location.replace(`/configuracion?p=${slug}`);
    if (err.code === 'SUBSCRIPTION_REQUIRED' || err.status === 402) return location.replace('/programas');
    if (err.status === 404) return location.replace('/programas');
    return errorState(root, err, render);
  }
  document.title = `${d.program.name} · Alento`;
  document.body.classList.toggle('program-night', d.program.theme === 'night');
  document.documentElement.style.setProperty('--program', d.program.color);

  const started = d.dayNumber >= 1;
  const first = (d.user?.name ?? me.user.name ?? '').split(' ')[0];
  const notice = d.subscription?.status === 'past_due'
    ? h('div', { class: 'notice notice--warn' }, icon('info', 'notice__icon'), h('div', {}, h('strong', {}, 'No pudimos renovar tu suscripción. '), 'Actualiza tu método de pago en ', h('a', { href: '/suscripcion' }, 'Mi suscripción'), '.'))
    : null;

  root.replaceChildren(...[
    h('div', { class: 'page-head pg-head' },
      h('div', { class: 'pg-head__main' },
        h('img', { src: d.program.icon, alt: '', width: 56, height: 56, class: 'pg-head__icon' }),
        h('div', {},
          h('p', { class: 'eyebrow' }, started ? `${d.program.name} · Día ${d.dayNumber} · ${d.strategy.name}` : `${d.program.name} · Empiezas el ${dayLong(d.startDate)}`),
          h('h1', { class: 'title-lg' }, first ? greeting(first) : 'Hola'),
          h('p', { class: 'muted page-intro' }, d.ui?.tagline ?? d.program.tagline))),
      h('a', { class: 'link', href: '/programas' }, 'Mis programas')),
    notice,
    h('div', { class: 'dash-hero' }, S.todayCard(d, render), S.urgeCard(d, render)),
    h('div', { class: 'grid-3c u-mt-16' }, S.lessonCard(d), S.exerciseCard(d), S.achievementsCard(d)),
    h('div', { class: 'grid-2 u-mt-16' }, S.weekCard(d), S.totalsCard(d)),
    h('div', { class: 'grid-2 u-mt-16' }, S.tasksCard(d), S.streakCard(d)),
    h('div', { class: 'grid-2 u-mt-16' }, S.recentCard(d, render), S.safetyCard(d)),
    h('div', { class: 'u-mt-16' }, S.quickLinks(d)),
  ].filter(Boolean));
  if (location.hash === '#ganas') { location.hash = ''; document.querySelector('#ganas button')?.click(); }
}

render();
