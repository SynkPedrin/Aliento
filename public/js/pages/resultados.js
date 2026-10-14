import { $, api, h, icon, money, num, renderFooter, renderHeader, revealOnScroll } from '../ui.js';
import { gauge, hbars, xyChart } from '../charts.js';
import { renderPaywall } from '../paywall.js';

const root = $('[data-root]');
renderFooter($('[data-footer]'));

const LEVEL_TEXT = {
  baja: 'Tu dependencia física es baja. Tu consumo se apoya sobre todo en hábitos y emociones, y ahí es donde tu plan pondrá el foco.',
  moderada: 'Tu dependencia física es moderada. Tu plan combina técnicas para atravesar los antojos con cambios graduales de rutina.',
  alta: 'Tu dependencia física es alta. Tu plan avanza de forma gradual y te recomendamos hablar con un profesional sanitario sobre tratamientos de apoyo.',
};
const TOOL_ICONS = { respiracion: 'wind', sos: 'spark', rutinas: 'leaf', social: 'target', pausas: 'target', diario: 'chart' };

function section(n, eyebrow, title, intro, ...body) {
  return h('section', { class: 'r-section' },
    h('div', { class: 'container' },
      h('div', { class: 'r-section__head' },
        h('p', { class: 'r-num' }, `${String(n).padStart(2, '0')} · ${eyebrow}`),
        h('h2', { class: 'title-lg' }, title),
        intro ? h('p', { class: 'lead' }, intro) : null),
      ...body));
}

const stat = (label, value, sub) => h('div', { class: 'card card--flat stat' },
  h('p', { class: 'stat__label' }, label), h('p', { class: 'stat__value' }, value), sub ? h('p', { class: 'stat__sub' }, sub) : null);

async function init() {
  let data, me;
  try {
    [data, me] = await Promise.all([api('/api/assessment/result'), api('/api/me')]);
  } catch (err) {
    if (err.code === 'NO_RESULT') return window.location.replace('/test');
    root.replaceChildren(h('div', { class: 'container section' }, h('p', { class: 'notice' }, err.message)));
    return;
  }
  renderHeader($('[data-header]'), {
    links: me.user
      ? [{ href: '/perfil', label: 'Mi perfil', cls: 'hide-sm' }, ...(me.access ? [{ href: '/dashboard', label: 'Mi panel', cls: 'btn btn--sm' }] : [])]
      : [{ href: '/acceso', label: 'Entrar' }],
  });

  const { result: r, currency, locale } = data;
  const fmt = (v, d) => money(v, currency, locale, d);
  const unit = r.current.product === 'vapeador' ? 'sesiones' : 'cigarrillos';
  const p = r.projection;

  // ----- Sección 1: punto de partida -----
  const s1 = section(1, 'Tu situación actual', 'Este es tu punto de partida',
    'Así es tu consumo hoy, según tus respuestas.',
    h('div', { class: 'stats' },
      stat(`${unit[0].toUpperCase()}${unit.slice(1)} al día`, num(r.current.perDay, locale), `${num(r.current.perWeek, locale)} a la semana`),
      stat('Al año', num(r.current.perYear, locale), unit),
      stat('Gasto al mes', fmt(r.current.monthlySpend, 0), `${fmt(r.current.weeklySpend)} a la semana`),
      stat('Gasto al año', fmt(r.current.yearlySpend, 0), 'si sigues igual')),
    h('div', { class: 'cards-2' },
      h('div', { class: 'card' },
        h('h3', {}, 'Índice de dependencia física'),
        h('p', { class: 'card__sub' }, `${r.dependence.score} de ${r.dependence.max} · dependencia ${r.dependence.level}`),
        gauge(r.dependence.score, r.dependence.max, ['Baja', 'Moderada', 'Alta']),
        h('p', { class: 'small', style: 'margin-top:16px;color:var(--ink-2)' }, LEVEL_TEXT[r.dependence.level]),
        h('p', { class: 'tiny muted', style: 'margin-top:10px' }, 'Basado en el Heaviness of Smoking Index (cantidad diaria y tiempo hasta el primer cigarrillo). Es orientativo, no un diagnóstico.')),
      h('div', { class: 'card' },
        h('h3', {}, 'Qué sostiene tu consumo'),
        h('p', { class: 'card__sub' }, 'Peso de cada factor en tus respuestas'),
        hbars(r.profile.filter((g) => g.value > 0)),
        h('p', { class: 'small', style: 'margin-top:20px;margin-bottom:10px;color:var(--ink-2)' }, 'Tus principales gatillos'),
        h('div', { class: 'chips' }, r.triggers.map((t) => h('span', { class: 'chip' }, h('span', { class: 'chip__dot', 'aria-hidden': 'true' }), t.label))))));

  // ----- Sección 2: proyección (estimaciones) -----
  const weeks = p.schedule.map((_, i) => (i === 0 ? 'Hoy' : `S${i}`));
  const s2 = section(2, 'Tu potencial', 'Imagina lo que podrías conseguir',
    'Si sigues tu plan, esto es lo que podría cambiar en las próximas 12 semanas.',
    h('p', {}, h('span', { class: 'estimate-tag' }, 'Estimación')),
    h('div', { class: 'stats', style: 'margin-top:16px' },
      stat('Ahorro en 12 semanas', fmt(p.savings12Weeks, 0), 'estimado'),
      stat('Ahorro en 1 año', fmt(p.savingsYear, 0), 'estimado'),
      stat(`${unit[0].toUpperCase()}${unit.slice(1)} evitados`, num(p.cigarettesAvoided12Weeks, locale), 'en 12 semanas, estimado'),
      stat('Reducción de consumo', `${p.reductionPercent}%`, 'al final de la semana 12')),
    h('div', { class: 'cards-2' },
      h('div', { class: 'card' },
        h('h3', {}, `${unit[0].toUpperCase()}${unit.slice(1)} al día`),
        h('p', { class: 'card__sub' }, 'Objetivo diario de tu plan frente a tu consumo actual'),
        xyChart({
          labels: weeks,
          caption: `${unit} al día por semana`,
          format: (v) => num(Math.round(v), locale),
          series: [
            { label: 'Objetivo de tu plan', kind: 'area', values: p.schedule },
            { label: 'Consumo actual', kind: 'dashed', values: p.schedule.map(() => r.current.perDay) },
          ],
        })),
      h('div', { class: 'card' },
        h('h3', {}, 'Ahorro acumulado'),
        h('p', { class: 'card__sub' }, 'Dinero que dejarías de gastar, semana a semana'),
        xyChart({
          labels: weeks,
          caption: 'Ahorro acumulado estimado por semana',
          format: (v, axis) => fmt(v, axis ? 0 : 2),
          series: [{ label: 'Ahorro acumulado', kind: 'area', values: p.savingsByWeek.map((x) => x.value) }],
          endLabel: fmt(p.savings12Weeks, 0),
        }))),
    h('p', { class: 'tiny muted', style: 'margin-top:16px' },
      'Estimaciones calculadas con tus respuestas (consumo y gasto semanal) suponiendo que cumples el objetivo diario de tu plan. No son una garantía: los resultados reales dependen de cada persona.'));

  // ----- Sección 3: plan personalizado -----
  const firstWeek = r.plan.goals.filter((g) => g.week === 1);
  const s3 = section(3, 'Tu plan', 'Tu plan personalizado está preparado',
    'Lo hemos diseñado a partir de tus respuestas. Esto es lo que incluye:',
    h('div', { class: 'plan-grid' },
      h('div', { class: 'card' },
        h('p', { class: 'eyebrow' }, 'Estrategia elegida'),
        h('h3', { style: 'margin-top:10px;font-size:22px' }, r.plan.strategy.name),
        h('p', { style: 'margin-top:8px;color:var(--ink-2)' }, r.plan.strategy.summary),
        h('p', { class: 'eyebrow', style: 'margin-top:24px;margin-bottom:12px' }, 'Gatillos identificados'),
        h('div', { class: 'chips' }, r.plan.triggers.map((t) => h('span', { class: 'chip' }, h('span', { class: 'chip__dot', 'aria-hidden': 'true' }), t.label)))),
      h('div', { class: 'card' },
        h('p', { class: 'eyebrow', style: 'margin-bottom:16px' }, 'Objetivos iniciales · semana 1'),
        firstWeek.map((g) => h('div', { class: 'plan-item' },
          h('span', { class: 'plan-item__icon', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>' }),
          h('div', {}, h('h4', {}, g.title), h('p', {}, g.detail))))),
      h('div', { class: 'card' },
        h('p', { class: 'eyebrow', style: 'margin-bottom:16px' }, 'Herramientas recomendadas'),
        r.plan.tools.map((t) => h('div', { class: 'plan-item' },
          icon(TOOL_ICONS[t.id] ?? 'leaf', 'plan-item__icon'),
          h('div', {}, h('h4', {}, t.name), h('p', {}, t.detail))))),
      h('div', { class: 'card' },
        h('p', { class: 'eyebrow', style: 'margin-bottom:16px' }, 'Seguimiento de tu progreso'),
        h('ul', { class: 'feature-list' }, r.plan.tracking.map((f) => h('li', {}, icon('check'), h('span', {}, f)))))));

  // ----- Sección 4: oferta -----
  let s4;
  if (me.access) {
    s4 = h('section', { class: 'r-section theme-deep cta-band' },
      h('div', { class: 'container narrow' },
        h('p', { class: 'eyebrow' }, 'Tu suscripción está activa'),
        h('h2', { class: 'title-lg' }, 'Sigue tu camino desde tu panel'),
        h('p', {}, h('a', { href: '/dashboard', class: 'btn btn--lg' }, 'Ir a mi panel'))));
  } else {
    const paywallRoot = h('div');
    s4 = h('section', { class: 'r-section paywall', id: 'planes' },
      h('div', { class: 'container' },
        h('div', { class: 'paywall__head' },
          h('p', { class: 'r-num' }, '04 · Tu suscripción'),
          h('h2', { class: 'title-lg' }, 'Empieza hoy tu camino hacia una vida sin tabaco'),
          h('p', { class: 'lead' }, 'Activa tu plan personalizado y todas las herramientas de seguimiento.')),
        paywallRoot,
        h('p', { class: 'free-note' }, 'Tus resultados seguirán disponibles gratis aunque no te suscribas.')));
    renderPaywall(paywallRoot, { pendingCheckout: me.pendingCheckout });
  }

  const hero = h('section', { class: 'results-hero theme-deep' },
    h('div', { class: 'container narrow' },
      h('p', { class: 'eyebrow' }, 'Tus resultados'),
      h('h1', { class: 'title-xl' }, 'Ya tienes tu punto de partida'),
      h('p', { class: 'lead' }, 'Recorre tus resultados: primero tu situación actual, después lo que podrías conseguir y, al final, tu plan.'),
      me.access ? null : h('p', { class: 'u-mt-16' }, h('a', { class: 'btn', href: '#planes' }, 'Ver mi plan y suscribirme')),
      h('p', { class: 'small muted' }, h('a', { href: '/test?nuevo' }, 'Repetir el test'))));

  root.replaceChildren(hero, s1, s2, s3, s4);
  revealOnScroll([s1, s2, s3, s4]);
  // El contenido se pinta tras cargar: el ancla #planes hay que aplicarla a mano.
  if (location.hash === '#planes') document.getElementById('planes')?.scrollIntoView();
}

init();
