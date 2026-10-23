import { $, api, h, icon, money, num, renderFooter, renderHeader, revealOnScroll } from '../ui.js';
import { gauge, hbars, radarChart, xyChart } from '../charts.js';
import { renderPaywall } from '../paywall.js';
import { track } from '../track.js';
import { FAQ, MEMBERS, RECENT_SIGNUPS } from '../content/sem-fumo-es.js';

const root = $('[data-root]');
renderFooter($('[data-footer]'));

const SLUGS = ['sem-fumo', 'alcohol', 'azucar', 'ansiedad', 'sueno'];

const LEVEL_TEXT = {
  baja: 'Tu dependencia física es baja. Tu consumo se apoya sobre todo en hábitos y emociones, y ahí es donde tu plan pondrá el foco.',
  moderada: 'Tu dependencia física es moderada. Tu plan combina técnicas para atravesar los antojos con cambios graduales de rutina.',
  alta: 'Tu dependencia física es alta. Tu plan avanza de forma gradual y te recomendamos hablar con un profesional sanitario sobre tratamientos de apoyo.',
};
const TOOL_ICONS = { respiracion: 'wind', sos: 'spark', rutinas: 'leaf', social: 'target', pausas: 'target', diario: 'chart' };

// Textos de nivel por programa: el eje cambia (dependencia, intensidad, descanso…).
const LEVEL_TEXT_BY_PROGRAM = {
  alcohol: {
    baja: 'Tu patrón de consumo se apoya, sobre todo, en rutinas y situaciones sociales. Ahí es donde tu plan pondrá el foco.',
    moderada: 'Tu consumo es más intensivo. El plan combina registro consciente, alternativas y pausas de autorregulación.',
    alta: 'Tus respuestas sugieren un consumo de alto impacto. Alento es educativo y de apoyo: antes de cualquier cambio drástico, consulta con un profesional sanitario.',
  },
  azucar: {
    baja: 'Tu hábito dulce se apoya en pocos momentos del día. Tu plan trabajará primero sobre esos momentos.',
    moderada: 'El azúcar aparece varias veces al día. El plan prioriza estabilizar tu energía y tus picos de antojo.',
    alta: 'El dulce estructura buena parte de tu día. Tu plan avanza por sustituciones sostenibles, sin dietas extremas y sin culpa.',
  },
  ansiedad: {
    baja: 'Tu tensión aparece en momentos concretos. El plan te dará herramientas puntuales para esos picos.',
    moderada: 'La tensión aparece varias veces por semana. El plan combina respiración, anclajes y registro emocional.',
    alta: 'La tensión forma parte de tu día a día. Alento es un espacio educativo: si te supera constantemente, hablar con un profesional de salud mental es el paso más importante.',
  },
  sueno: {
    baja: 'Tu descanso es razonable. El plan te ayudará a consolidar la regularidad y el ritual nocturno.',
    moderada: 'Tu descanso se nota comprometido. El plan prioriza el ritual nocturno y la regularidad de horarios.',
    alta: 'Tu descanso está muy comprometido. Si la falta de sueño se sostiene en el tiempo, comparte estas señales con un profesional sanitario.',
  },
};

// Textos de periodicidad según la definición del cuestionario (etiquetas reales, sin duplicar).
const FREQ_LABEL = {
  alcohol: { nunca: '1 vez al mes o menos', mensual: '2 a 4 veces al mes', semanal: '2 a 3 veces por semana', diario: '4 o más veces por semana' },
  alc_cantidad: { '1-2': '1 o 2 consumiciones', '3-4': '3 o 4 consumiciones', '5-6': '5 o 6 consumiciones', '7-9': '7 a 9 consumiciones', '10mas': '10 o más consumiciones' },
  alc_atracones: { nunca: 'Nunca', ocasional: 'Menos de una vez al mes', mensual: 'Mensualmente', semanal: 'Semanalmente o casi a diario' },
  ans_frecuencia: { diario: 'Casi todos los días', semanal: '2 o 3 veces por semana', puntual: 'Solo en situaciones de alta presión', ocasional: 'Ocasionalmente' },
  alc_objetivo: { dejarlo: 'Dejar de beber por completo', pausa: 'Hacer una pausa prolongada', moderar: 'Moderar y reducir gradualmente' },
  az_objetivo: { equilibrio: 'Equilibrio consciente sin dietas extremas', energia: 'Energía estable durante todo el día', desenganche: 'Desenganche de la necesidad diaria de dulce' },
};

// Tipos de consumo de azúcar del cuestionario (texto corto).
const AZ_TIPO = { bolleria: 'Dulces y bollería', refrescos: 'Refrescos y bebidas', chocolate: 'Chocolate y golosinas', postres: 'Postres tras las comidas', cafe: 'Azúcar en café o té' };

// Metas visibles del programa de alcohol (texto corto para las estadísticas).
const ALCOHOL_GOAL = { dejarlo: 'Cese completo', pausa: 'Pausa prolongada', moderar: 'Reducción gradual' };

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

const chips = (items) => h('div', { class: 'chips' }, items.map((t) => h('span', { class: 'chip' }, h('span', { class: 'chip__dot', 'aria-hidden': 'true' }), t.label)));

const dependCard = (r, levelText, hint) => h('div', { class: 'card' },
  h('h3', {}, 'Intensidad de tu punto de partida'),
  h('p', { class: 'card__sub' }, `${r.dependence.score} de ${r.dependence.max} · nivel ${r.dependence.level}`),
  gauge(r.dependence.score, r.dependence.max, ['Baja', 'Moderada', 'Alta']),
  h('p', { class: 'small', style: 'margin-top:16px;color:var(--ink-2)' }, levelText),
  h('p', { class: 'tiny muted', style: 'margin-top:10px' }, hint));

const profileCard = (title, sub, r) => h('div', { class: 'card' },
  h('h3', {}, title),
  h('p', { class: 'card__sub' }, sub),
  hbars(r.profile.filter((g) => g.value > 0)),
  h('p', { class: 'small', style: 'margin-top:20px;margin-bottom:10px;color:var(--ink-2)' }, 'Tus principales gatillos'),
  chips(r.triggers));

const safetyNotice = (text) => h('div', { class: 'notice notice--wide', style: 'border-color:#FF7A59' },
  icon('info', 'notice__icon'),
  h('div', {}, h('strong', {}, 'Aviso de calidad y seguridad. '), text));

const planIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';

const planSection = (r, intro) => section(3, 'Tu plan', 'Tu plan está preparado', intro ?? 'Lo hemos diseñado a partir de tus respuestas. Esto es lo que incluye:',
  h('div', { class: 'plan-grid' },
    h('div', { class: 'card' },
      h('p', { class: 'eyebrow' }, 'Estrategia elegida'),
      h('h3', { style: 'margin-top:10px;font-size:22px' }, r.plan.strategy.name),
      h('p', { style: 'margin-top:8px;color:var(--ink-2)' }, r.plan.strategy.summary),
      h('p', { class: 'eyebrow', style: 'margin-top:24px;margin-bottom:12px' }, 'Gatillos identificados'),
      chips(r.plan.triggers.length ? r.plan.triggers : r.triggers)),
    h('div', { class: 'card' },
      h('p', { class: 'eyebrow', style: 'margin-bottom:16px' }, 'Objetivos iniciales · semana 1'),
      r.plan.goals.filter((g) => g.week === 1 || g.week == null).map((g) => h('div', { class: 'plan-item' },
        h('span', { class: 'plan-item__icon', html: planIcon() }),
        h('div', {}, h('h4', {}, g.title), h('p', {}, g.detail))))),
    h('div', { class: 'card' },
      h('p', { class: 'eyebrow', style: 'margin-bottom:16px' }, 'Herramientas recomendadas'),
      r.plan.tools.map((t) => h('div', { class: 'plan-item' },
        icon(TOOL_ICONS[t.id] ?? 'leaf', 'plan-item__icon'),
        h('div', {}, h('h4', {}, t.name), h('p', {}, t.detail))))),
    h('div', { class: 'card' },
      h('p', { class: 'eyebrow', style: 'margin-bottom:16px' }, 'Seguimiento de tu progreso'),
      h('ul', { class: 'feature-list' }, r.plan.tracking.map((f) => h('li', {}, icon('check'), h('span', {}, f)))))));

const heroBlock = (me, program, name) => h('section', { class: 'results-hero theme-deep' },
  h('div', { class: 'container narrow' },
    h('p', { class: 'eyebrow' }, 'Tus resultados'),
    h('h1', { class: 'title-xl' }, 'Ya tienes tu punto de partida'),
    h('p', { class: 'lead' }, `Recorre tus resultados de ${name}: primero tu situación actual, después tu posible camino y, al final, tu plan.`),
    me.access
      ? h('p', { class: 'u-mt-16' }, h('a', { class: 'btn', href: '/programas?catalogo' }, 'Ir a Mis programas'))
      : h('p', { class: 'u-mt-16' }, h('a', { class: 'btn', href: '#planes' }, 'Ver mi plan y suscribirme')),
    h('p', { class: 'small muted' }, h('a', { href: `/quiz/${program}?nuevo` }, 'Repetir el test'))));

function programHome(slug) { return slug === 'sem-fumo' ? '/dashboard' : `/programa?p=${slug}`; }

// ---------------------------------------------------------------- resultados por programa
async function programResults(program, data, me) {
  const { result: r, currency, locale } = data;
  const fmt = (v, d) => money(v, currency, locale, d);
  let name = program;
  let tagline = '';
  try {
    const cat = await api('/api/catalog');
    const c = cat.programs.find((x) => x.slug === program);
    if (c) ({ name, tagline } = c);
  } catch { /* el catálogo es un complemento: sin él la página funciona igual */ }

  const s4root = h('div');
  const hero = heroBlock(me, program, name);
  let s1, s2;

  if (program === 'alcohol') {
    const level = LEVEL_TEXT_BY_PROGRAM.alcohol[r.dependence.level];
    s1 = section(1, 'Tu situación actual', 'Este es tu punto de partida',
      'Así es tu relación con el alcohol hoy, según tus respuestas.',
      r.safetyNotice ? safetyNotice(r.safetyNotice) : null,
      h('div', { class: 'stats', style: 'margin-top:16px' },
        stat('Tu meta con este programa', ALCOHOL_GOAL[r.plan.strategy.id] ?? 'Definir mi camino'),
        stat('Frecuencia de consumo', FREQ_LABEL.alcohol[r.current.frequency] ?? r.current.frequency),
        stat('En un día de consumo', FREQ_LABEL.alc_cantidad[r.current.quantityPerOccasion] ?? r.current.quantityPerOccasion),
        stat('Gasto al mes', fmt(r.current.monthlySpend, 0), `${fmt(r.current.yearlySpend, 0)} al año`)),
      h('div', { class: 'cards-2' }, dependCard(r, level, 'Índice orientativo basado en tus respuestas de frecuencia y cantidad. No es un diagnóstico.'), profileCard('Qué sostiene tu consumo', 'Peso de cada factor en tus respuestas', r)),
      h('p', { class: 'tiny muted', style: 'margin-top:16px' }, `En ocasiones de riesgo de atracones: ${FREQ_LABEL.alc_atracones[r.current.bingeFrequency] ?? r.current.bingeFrequency}.`));
    s2 = section(2, 'Tu potencial', 'Lo que puede cambiar si sigues tu plan',
      'Si mantienes el objetivo de tu plan, este es el cambio estimado.',
      h('p', {}, h('span', { class: 'estimate-tag' }, 'Estimación')),
      h('div', { class: 'stats', style: 'margin-top:16px' },
        stat('Ahorro estimado (12 semanas)', fmt(r.projection.savings12Weeks, 0), 'según tu gasto actual'),
        stat('Ahorro estimado (1 año)', fmt(r.projection.savingsYear, 0), 'según tu gasto actual'),
        stat('Objetivo del plan', `−${r.projection.reductionPercent}%`, 'en unidades de consumo al final del periodo de ajuste')),
      h('p', { class: 'tiny muted', style: 'margin-top:16px' },
        'Estimaciones calculadas con tu gasto declarado suponiendo que cumples el objetivo de tu plan. No son una garantía. Alento no recomienda suspender el alcohol de forma abrupta si existe posible dependencia física; en ese caso, busca valoración profesional.'));
  } else if (program === 'azucar') {
    const level = LEVEL_TEXT_BY_PROGRAM.azucar[r.dependence.level];
    s1 = section(1, 'Tu situación actual', 'Este es tu punto de partida',
      'Así es tu hábito con el azúcar hoy, según tus respuestas.',
      h('div', { class: 'stats' },
        stat('Veces al día algo dulce', num(r.current.perDay, locale), `Lugar principal: ${AZ_TIPO[r.current.product] ?? r.current.product}`),
        stat('Tu objetivo', { equilibrio: 'Equilibrio consciente', energia: 'Energía estable', desenganche: 'Desenganche diario' }[r.plan.strategy.id] ?? 'Definir mi camino'),
        stat('Patrón clave', 'Equilibrio', 'sin dietas extremas ni culpa')),
      h('div', { class: 'cards-2' }, dependCard(r, level, 'Índice orientativo a partir de tus respuestas. No es un diagnóstico.'), profileCard('Qué sostiene tu antojo', 'Peso de cada factor en tus respuestas', r)));
    s2 = section(2, 'Tu potencial', 'Lo que puede cambiar si sigues tu plan',
      'Si mantienes el objetivo de tu plan, este es el cambio estimado.',
      h('p', {}, h('span', { class: 'estimate-tag' }, 'Estimación')),
      h('div', { class: 'stats', style: 'margin-top:16px' },
        stat('Momentos dulces evitados', num(r.projection.sugarSpikesAvoided, locale), 'en 12 semanas, estimado'),
        stat('Objetivo del plan', `−${r.projection.reductionPercent}%`, 'en antojos diarios al final del periodo'),
        stat('Enfoque del plan', 'Sin culpa', 'sustituciones sostenibles, sin restricciones extremas')),
      h('p', { class: 'tiny muted', style: 'margin-top:16px' },
        'Estimación calculada con tu frecuencia actual suponiendo que cumples el objetivo de tu plan. No es una garantía.'));
  } else if (program === 'ansiedad') {
    const level = LEVEL_TEXT_BY_PROGRAM.ansiedad[r.dependence.level];
    const manifest = r.current.manifestations ?? [];
    s1 = section(1, 'Tu situación actual', 'Este es tu punto de partida',
      'Así es tu tensión hoy, según tus respuestas.',
      h('div', { class: 'stats' },
        stat('Frecuencia de la tensión', FREQ_LABEL.ans_frecuencia[r.current.frequency] ?? r.current.frequency),
        stat('Cómo la notas', String(manifest.length), manifest.slice(0, 2).join(' · ')),
        stat('Tu enfoque', 'Regulación', 'herramientas de autorregulación diaria')),
      h('div', { class: 'cards-2' }, dependCard(r, level, 'Índice orientativo a partir de tus respuestas. No es un diagnóstico.'), profileCard('Cómo vive la ansiedad tu cuerpo y tu mente', 'Peso de cada factor en tus respuestas', r)));
    s2 = section(2, 'Tu potencial', 'Lo que puede cambiar si sigues tu plan',
      'Con práctica constante, estos son los cambios que el plan trabaja contigo.',
      h('p', {}, h('span', { class: 'estimate-tag' }, 'Estimación')),
      h('div', { class: 'stats', style: 'margin-top:16px' },
        stat('Práctica inicial', '2 min', 'al día, según tu plan de la semana 1'),
        stat('Termómetro de calma', '0–10', 'dos registros al día para ver tu evolución'),
        stat('Objetivo del plan', `−${r.projection.reductionPercent}%`, 'nivel de activación al final del periodo')),
      h('p', { class: 'tiny muted', style: 'margin-top:16px' },
        'Alento no diagnostica ni trata trastornos mentales. Si tu ansiedad es intensa o constante, cuenta también con atención profesional.'));
  } else if (program === 'sueno') {
    const level = LEVEL_TEXT_BY_PROGRAM.sueno[r.dependence.level];
    const OBSTACLES = { conciliar: 'Tardas en quedarte dormido', despertares: 'Despertares nocturnos', madrugar: 'Despertar muy temprano', cansancio: 'Duermes pero te levantas agotado' };
    s1 = section(1, 'Tu situación actual', 'Este es tu punto de partida',
      'Así son tus noches hoy, según tus respuestas.',
      h('div', { class: 'stats' },
        stat('Horas de sueño', `${num(r.current.hoursSlept, locale)} h`, 'días laborables'),
        stat('Déficit de descanso', `${num(r.current.sleepDebtHours, locale)} h`, 'por noche, referido a 8 h'),
        stat('Tu mayor obstáculo', OBSTACLES[r.current.obstacle] ?? '—', 'según tu respuesta')),
      h('div', { class: 'cards-2' }, dependCard(r, level, 'Índice orientativo a partir de tus horas de sueño. No es un diagnóstico de trastornos.'), profileCard('Qué está influyendo en tus noches', 'Peso de cada factor en tus respuestas', r)));
    s2 = section(2, 'Tu potencial', 'Lo que puede cambiar si sigues tu plan',
      'Si mantienes el ritual de tu plan, este es el cambio estimado.',
      h('p', {}, h('span', { class: 'estimate-tag' }, 'Estimación')),
      h('div', { class: 'stats', style: 'margin-top:16px' },
        stat('Descanso recuperado', `${num(r.projection.recoveredRestHours, locale)} h`, 'en 12 semanas, estimado'),
        stat('Objetivo del plan', 'Regularidad', 'horario fijo de despertar durante 7 días'),
        stat('Ritual nocturno', '30 min', 'sin pantallas antes de dormir')),
      h('p', { class: 'tiny muted', style: 'margin-top:16px' },
        'Estimación calculada con tu déficit actual suponiendo que cumples el objetivo de tu plan. Si sospechas un trastorno del sueño, consulta con un profesional.'));
  } else {
    root.replaceChildren(h('div', { class: 'container section' }, h('p', { class: 'notice' }, 'Programa no disponible.')));
    return;
  }

  let s4;
  const activeHere = me.programs?.includes(program);
  if (me.access && activeHere) {
    s4 = h('section', { class: 'r-section theme-deep cta-band' },
      h('div', { class: 'container narrow' },
        h('p', { class: 'eyebrow' }, 'Tu suscripción está activa'),
        h('h2', { class: 'title-lg' }, `Sigue tu camino de ${name} desde tu panel`),
        h('p', {}, h('a', { href: programHome(program), class: 'btn btn--lg' }, 'Ir a mi panel'))));
  } else {
    s4 = h('section', { class: 'r-section paywall', id: 'planes' },
      h('div', { class: 'container' },
        h('div', { class: 'paywall__head' },
          h('p', { class: 'r-num' }, '04 · Tu suscripción'),
          h('h2', { class: 'title-lg' }, `Empieza hoy tu camino con ${name}`),
          h('p', { class: 'lead' }, tagline || 'Activa tu plan y todas las herramientas de seguimiento.')),
        s4root,
        h('p', { class: 'free-note' }, 'Tus resultados seguirán disponibles gratis aunque no te suscribas.')));
    renderPaywall(s4root, { program, pendingCheckout: me.pendingCheckout });
  }

  const view = [hero, s1, s2, planSection(r), s4];
  root.replaceChildren(...view);
  revealOnScroll(view);
  if (location.hash === '#planes') document.getElementById('planes')?.scrollIntoView();
}

// ---------------------------------------------------------------- Sem Fumo (flujo original)
function semFumoResults(data, me) {
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
        chips(r.triggers))));

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
        chips(r.plan.triggers)),
      h('div', { class: 'card' },
        h('p', { class: 'eyebrow', style: 'margin-bottom:16px' }, 'Objetivos iniciales · semana 1'),
        firstWeek.map((g) => h('div', { class: 'plan-item' },
          h('span', { class: 'plan-item__icon', html: planIcon() }),
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

  const view = [heroBlock(me, 'sem-fumo', 'Sem Fumo'), s1, s2, s3, s4];
  root.replaceChildren(...view);
  revealOnScroll(view);
  if (location.hash === '#planes') document.getElementById('planes')?.scrollIntoView();
}

// ---------------------------------------------------------------- Embudo Sem Fumo (contenido del embudo original)
// Perfil → significado → proyección → página de venta. Cada paso tiene su #hash para que «atrás» funcione.
const FUNNEL = ['perfil', 'explicacion', 'proyeccion', 'planes'];
const savedName = () => { try { const n = (localStorage.getItem('alento-name') || '').trim(); return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : ''; } catch { return ''; } };
const addDays = (n, d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtDay = (d) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(d);

// Respuestas por orden (1, 2, 3…), como las usa el embudo original.
const ORDER = {
  form: { cigarrillos: 1, vapeador: 2, calentado: 3, puros: 4, shisha: 5, snus: 6 },
  years: { menos1: 1, '1a2': 2, '3a5': 3, '6a9': 4, mas10: 5 },
  age: { '18-24': 1, '25-34': 2, '35-44': 3, '45-54': 4, '55-64': 5, '65+': 6 },
  fear: { peso: 1, ansiedad: 2, social: 3, vacio: 4, foco: 5 },
  goal: { dormir: 1, control: 2, social: 3, animo: 4, foco: 5 },
  freq: { '1a2': 1, '3a5': 2, '6a10': 3, '11a20': 4, '21mas': 5 },
};

/** Perfil para la página de venta a partir de las etiquetas guardadas en el resultado. */
function smokingProfile(r) {
  const a = r.answers ?? {};
  const form = ORDER.form[a.q_producto] ?? 1;
  const years = ORDER.years[a.q_anios];
  const freqLow = [1, 3, 6, 11, 21][(ORDER.freq[a.q_cantidad] ?? 1) - 1];
  const yearsLow = [0.5, 1, 3, 6, 10][(years ?? 1) - 1];
  const total = Math.floor(freqLow * 365 * yearsLow);
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, total)));
  return {
    form, years, age: ORDER.age[a.q_edad], female: a.q_genero === 'mujer', fear: ORDER.fear[a.q_preocupacion], goal: ORDER.goal[a.q_meta3m],
    burnsTobacco: [1, 4, 5].includes(form), vape: form === 2,
    repetitions: total >= 100 ? Math.floor(total / mag) * mag : null,
  };
}

const AGE_LABELS = ['18–24', '25–34', '35–44', '45–54', '55–64', '65+'];
const LIFE_GAIN = [10, 10, 9, 6, 4];
const YEARS_LABELS = ['Menos de un año', '1–2 años', '3 a 5 años', 'De 6 a 9 años', 'Más de 10 años'];
const SINCE_LABELS = ['Nuevo', '1–2 años', '3-5 años', '6–9 años', 'A partir de 10 años'];
const TARGET_LABELS = ['Duerme tranquilo', 'Siéntete en control', 'Social sin nicotina', 'Estado de ánimo equilibrado', 'Concentrado y productivo'];
const FEAR_GOALS = ['Deja de fumar sin engordar', 'Mantén la calma sin cigarrillos', 'No descuides tu vida social', 'Rellena el hueco que deja', 'Relájate y concéntrate sin eso'];

function funnelStep(...children) {
  return h('section', { class: 'funnel-step' }, h('div', { class: 'container narrow' }, ...children));
}

/** Medidor semicircular (0–100). */
function halfGauge(value) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 66'); svg.setAttribute('class', 'half-gauge'); svg.setAttribute('aria-hidden', 'true');
  const arc = (pct, cls) => { const p = document.createElementNS(NS, 'path'); const a = Math.PI * (1 - pct / 100); p.setAttribute('d', `M10 60 A50 50 0 0 1 ${60 + 50 * Math.cos(a)} ${60 - 50 * Math.sin(a)}`); p.setAttribute('class', cls); return p; };
  svg.append(arc(100, 'half-gauge__track'), arc(value, 'half-gauge__fill'));
  return svg;
}

function semFumoFunnel(data, me) {
  const { result: r, currency, locale } = data;
  const fmt = (v, d) => money(v, currency, locale, d);
  const name = savedName();
  const next = (to) => h('div', { class: 'sticky-cta' }, h('a', { class: 'btn btn--lg', href: `#${to}` }, 'Continuar'));
  const months = [1, 2, 3].map((m) => new Intl.DateTimeFormat('es', { month: 'short', year: 'numeric' }).format(new Date(new Date().getFullYear(), new Date().getMonth() + m, 1)));

  const screens = {
    perfil: () => funnelStep(
      h('h1', { class: 'title-lg funnel-step__title u-text-center' }, 'Tu tipo de fumador:', h('br'), h('span', { class: 'funnel-step__accent' }, r.smokerType.name)),
      h('p', { class: 'subtitle u-text-center' }, 'Este gráfico muestra cómo se relaciona tu hábito de fumar con tus emociones. En la página siguiente, verás el significado oculto que hay detrás de este perfil.'),
      h('div', { class: 'card funnel-radar' }, radarChart(r.radar, { caption: 'Tu perfil' })),
      next('explicacion')),
    explicacion: () => funnelStep(
      h('h1', { class: 'title-lg funnel-step__title' }, `${name ? `${name},` : ''} ¿qué hace que tu situación sea algo único?`.trim()),
      h('p', { class: 'funnel-step__body' }, r.smokerType.body),
      next('proyeccion')),
    proyeccion: () => funnelStep(
      h('div', { class: 'result-grid' },
        h('div', { class: 'card result-card' },
          h('h3', {}, 'Recuperarás el control antes'),
          h('div', { class: 'half-gauge-wrap' }, halfGauge(93), h('strong', {}, '93%')),
          h('p', { class: 'small muted', html: 'He recuperado la concentración, <br> y la estabilidad en mi día a día.' }),
          h('p', { class: 'result-card__axis' }, h('span', {}, '1 mes'), h('span', {}, '3 meses'), h('span', {}, '6 meses'))),
        h('div', { class: 'card result-card' },
          h('h3', {}, 'Te sentirás mejor'),
          h('div', { class: 'feel-bars' },
            h('p', { class: 'feel-bars__head' }, h('span', {}, 'Ahora'), h('span', {}, 'Después de Alento')),
            [['Antojos', 82], ['Culpa', 73], ['Tristeza', 65]].map(([label, down]) => h('div', { class: 'feel-bars__row' },
              h('span', {}, label),
              h('span', { class: 'feel-bars__pair' }, h('i', { class: 'feel-bars__now' }), h('i', { class: 'feel-bars__after', style: `width:${100 - down}%` })),
              h('strong', {}, `-${down}%`)))),
          h('p', { class: 'tiny muted' }, 'Según los comentarios de los usuarios tras más de 5 semanas.')),
        h('div', { class: 'card result-card' },
          h('h3', {}, 'Dormirás mejor'),
          xyChart({ labels: ['Hoy', months[0], '', months[1], months[2]], caption: 'Horas de sueño ganadas', format: (v) => `+${v}h`, height: 170,
            series: [{ label: 'Sueño', kind: 'bars', values: [0, 0.3, 0.7, 1.2, 2] }] }),
          h('p', { class: 'small' }, 'Aumento previsto: +1,2 horas en 3 meses')),
        h('div', { class: 'card result-card' },
          h('h3', {}, 'Así reducirás tu ansiedad'),
          xyChart({ labels: ['Hoy', '1 mes', '3 meses', '6 meses'], caption: 'Intensidad de la ansiedad', format: (v) => `${v}`, height: 170,
            series: [{ label: 'Patrón típico sin Alento', kind: 'dashed', values: [100, 96, 98, 95] }, { label: 'Menos momentos de ansiedad a lo largo del día', kind: 'area', values: [100, 55, 30, 17] }] }),
          h('p', { class: 'small' }, h('strong', {}, '−83%'), ' intensidad de la ansiedad'))),
      next('planes')),
    planes: () => salesPage(r, fmt, name, me),
  };

  const show = () => {
    const step = FUNNEL.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'perfil';
    root.replaceChildren(screens[step]());
    revealOnScroll([...root.querySelectorAll('.r-section')]);
    window.scrollTo({ top: 0 });
    track('results_step', { program: 'sem-fumo', step }, { pixel: false });
  };
  window.addEventListener('hashchange', show);
  show();
}

/** Pulmones y corazón: el vídeo avanza solo y la línea de tiempo marca cada hito con su fecha (como el original). */
function lungsTimeline(steps) {
  const v = h('video', { class: 'lungs__video', src: '/assets/quiz/heal.mp4', poster: '/assets/quiz/heal-start.webp', muted: true, playsinline: true, preload: 'metadata', 'aria-label': 'Cómo se recuperan con el tiempo los pulmones y el corazón de un fumador' });
  v.muted = true; // el atributo solo no basta en Safari para permitir autoplay
  const fill = h('span', { class: 'lungs__fill' });
  const labels = h('ol', { class: 'lungs__marks', style: `grid-template-columns:repeat(${steps.length},1fr)` }, steps.map((x) => h('li', {}, x.line)));
  const caption = h('p', { class: 'lungs__caption', 'aria-live': 'polite' });
  const show = (i) => {
    caption.replaceChildren(h('strong', {}, x(i).when), h('br'), x(i).what);
    [...labels.children].forEach((li, k) => { li.classList.toggle('is-active', k === i); li.classList.toggle('is-past', k < i); });
  };
  const x = (i) => steps[i];
  const ats = steps.map((s) => s.at ?? 0);
  v.addEventListener('timeupdate', () => {
    if (!v.duration) return;
    const r = v.currentTime / v.duration;
    let i = 0; while (i < ats.length - 1 && r >= ats[i + 1]) i++;
    fill.style.width = `${(i / (steps.length - 1)) * 100}%`;
    show(i);
  });
  show(0);
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { v.poster = '/assets/quiz/heal-end.webp'; show(steps.length - 1); }
  else {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { v.play().catch(() => {}); io.disconnect(); } }, { threshold: 0.4 });
    io.observe(v);
  }
  return h('div', { class: 'lungs__box' }, v, h('div', { class: 'lungs__track' }, fill), labels, caption);
}

function salesPage(r, fmt, name, me) {
  const pf = smokingProfile(r);
  const today = new Date();
  const week = Array.from({ length: 7 }, (_, i) => addDays(i));
  const yearsLabel = pf.years ? YEARS_LABELS[pf.years - 1] : null;
  const who = (() => {
    if (name) {
      if (!yearsLabel) return `${name} años fumando.`;
      return pf.vape ? `${name}, ${yearsLabel} de vapeo.` : pf.burnsTobacco ? `${name}, ${yearsLabel} fumando.` : `${name}, ${yearsLabel} de nicotina.`;
    }
    if (!yearsLabel) return 'Años de humo.';
    return pf.vape ? `${yearsLabel} de vapeo.` : pf.burnsTobacco ? `${yearsLabel} de humo.` : `${yearsLabel} de nicotina.`;
  })();
  const reps = pf.repetitions ? `${num(pf.repetitions)}+` : null;
  const timeline = pf.burnsTobacco
    ? [
      { at: 0, line: 'Ahora', when: 'Hoy', what: reps ? `${reps} ${pf.form === 4 ? 'puros' : pf.form === 5 ? 'sesiones' : 'cigarrillos'}` : 'Fumando como siempre' },
      { at: 0.03, line: '20 min', when: `20 min · ${fmtDay(today)}`, what: 'Baja la tensión arterial' },
      { at: 0.18, line: '12 h', when: '12 horas', what: 'El nivel de oxígeno ha vuelto a la normalidad' },
      { at: 0.34, line: '2 semanas', when: `Hace 2 semanas · ${fmtDay(addDays(14))}`, what: 'Respirar mejor' },
      { at: 0.52, line: '1 año', when: `Hace 1 año · ${today.getFullYear() + 1}`, what: 'El riesgo de padecer enfermedades cardíacas se reduce a la mitad' },
      { at: 0.7, line: '5 años', when: 'De 5 a 15 años', what: 'El riesgo de sufrir un ictus vuelve a la normalidad' },
      { at: 0.86, line: '10 años', when: `10 años · ${today.getFullYear() + 10}`, what: 'El riesgo de cáncer de pulmón se reduce a la mitad' },
    ]
    : [
      { at: 0, line: 'Ahora', when: 'Hoy', what: reps ? (pf.vape ? `${reps} sesiones de vapeo` : `${reps} veces`) : 'Nicotina, como siempre' },
      { at: 0.04, line: '20 min', when: `20 min · ${fmtDay(today)}`, what: 'Baja la tensión arterial' },
      { at: 0.3, line: '3 días', when: '3 días', what: 'Ya no hay nicotina' },
      { at: 0.56, line: '2 semanas', when: '2 semanas', what: 'Mejora la circulación' },
      { at: 0.8, line: '1 mes', when: '1 mes', what: 'Respirar mejor' },
    ];
  const ageLabel = pf.age ? AGE_LABELS[pf.age - 1] : null;
  const gain = pf.age ? LIFE_GAIN[pf.age - 1] : null;
  const benefitRows = [
    ...(gain && ageLabel ? [{ name: 'Esperanza de vida', value: `+${gain} años`, smoker: 78, free: Math.min(98, 78 + 2 * gain), note: `Ganancia media al dejarlo a los ${ageLabel} años`, source: 'Jha et al., NEJM 2013' }] : []),
    { name: 'Riesgo de padecer enfermedades cardíacas', value: '−50%', smoker: 100, free: 50, note: 'Después de 1 año sin fumar', source: 'American Cancer Society' },
    { name: 'Riesgo de ictus', value: 'Normal', smoker: 100, free: 52, note: 'Vuelves al nivel de un no fumador en un plazo de 5 a 15 años', source: 'American Cancer Society' },
    { name: 'Colesterol bueno (HDL)', value: 'Subidas', smoker: 62, free: 74, note: pf.female ? 'En el plazo de un año, sobre todo en las mujeres' : 'En el plazo de un año', source: 'Gepner et al., Am Heart J 2011' },
  ];
  const rel = new Intl.RelativeTimeFormat('es');
  const ticker = [RECENT_SIGNUPS.filter((_, i) => i % 2 === 0), RECENT_SIGNUPS.filter((_, i) => i % 2 === 1)];
  const paywallRoot = h('div');

  const page = h('div', { class: 'sales' },
    funnelStep(
      h('h1', { class: 'sales__hook' }, 'No puedes dejarlo. ', h('span', { class: 'mark' }, 'Todavía no.')),
      h('p', { class: 'lead' }, 'Fumar es algo que se hace sin pensar: la mano se te va sola antes de que te des cuenta. Así que, por ahora, fuma como siempre. Te diremos exactamente cuándo… y por qué.'),
      h('div', { class: 'card week-strip' },
        h('ol', {}, week.map((d, i) => {
          const delay = { style: `animation-delay:${(0.45 * i).toFixed(2)}s` };
          return h('li', {},
            h('div', { class: 'week-strip__item' },
              pf.vape ? h('div', { class: 'smk-vape', ...delay }) : [h('img', { src: '/assets/quiz/cigarette.webp', alt: '', class: 'week-strip__cig' }), h('span', { class: 'smk-glow', ...delay, 'aria-hidden': 'true' })],
              h('span', { class: 'smk-wisp', ...delay, 'aria-hidden': 'true' })),
            h('strong', {}, d.getDate()), h('span', {}, new Intl.DateTimeFormat('es', { weekday: 'short' }).format(d)));
        })),
        h('p', { class: 'week-strip__stamp smk-stamp' }, pf.vape ? 'Se permite vapear' : pf.burnsTobacco ? 'Se permite fumar' : 'Se permite la nicotina')),
      h('div', { class: 'sales__stats' },
        pf.repetitions ? h('div', {}, h('b', {}, `${num(pf.repetitions)}+`), h('span', {}, pf.vape ? 'sesiones de vapeo' : pf.burnsTobacco ? 'sesiones de fumar' : 'sesiones de nicotina')) : null,
        h('div', {}, h('b', {}, '5×'), h('span', {}, 'tienes más probabilidades de dejarlo si te das cuenta primero'))),
      pf.fear ? h('div', { class: 'sales__goal' }, h('span', {}, 'Objetivo principal'), h('b', {}, FEAR_GOALS[pf.fear - 1])) : null),
    h('section', { class: 'theme-deep lungs' },
      h('div', { class: 'container narrow' },
        h('h2', { class: 'lungs__title' }, who, h('br'), h('span', {}, 'Tu cuerpo aún puede recuperarse.')),
        lungsTimeline(timeline))),
    pf.burnsTobacco
      ? funnelStep(
        h('p', { class: 'eyebrow' }, 'Lo que obtienes a cambio'),
        h('h2', { class: 'title-lg' }, ageLabel ? `Dejar de fumar a los ${ageLabel} años` : 'Lo que te devuelve dejar de fumar'),
        h('p', { class: 'benefit-legend' }, h('span', {}, h('i', { class: 'is-smoker' }), 'Sigue fumando'), h('span', {}, h('i', { class: 'is-free' }), 'Sin humo')),
        h('ul', { class: 'benefit-bars' }, benefitRows.map((b) => h('li', {},
          h('p', { class: 'benefit-bars__row' }, h('span', {}, b.name), h('strong', {}, b.value)),
          h('span', { class: 'benefit-bars__track benefit-bars__track--smoker' }, h('span', { class: 'benefit-bars__fill', style: `width:${b.smoker}%` })),
          h('span', { class: 'benefit-bars__track' }, h('span', { class: 'benefit-bars__fill benefit-bars__fill--free', style: `width:${b.free}%` })),
          h('p', { class: 'tiny muted' }, b.note, h('span', {}, ` · ${b.source}`))))),
        pf.years === 5 ? h('p', { class: 'small' }, 'Después de más de 10 años, tus pulmones han envejecido rápidamente. ', h('span', { class: 'muted' }, 'Desde el primer día sin fumar, vuelven a envejecer a un ritmo normal.')) : null)
      : funnelStep(
        h('p', { class: 'eyebrow' }, 'Lo que obtienes a cambio'),
        h('h2', { class: 'title-lg' }, 'Lo que puede devolverte dejar la nicotina'),
        h('ul', { class: 'feature-list' }, [
          ['Menos motivos para recurrir a la nicotina', 'Practica cómo afrontar las pausas, el estrés y los momentos sociales sin recurrir a la nicotina.'],
          ['Más libertad en tu rutina', 'Disfruta de las pausas, las tardes y el tiempo con amigos sin organizarte en torno a la nicotina.'],
          ['Más dinero en el bolsillo', 'Conserva más del dinero que ahora gastas en productos con nicotina.'],
        ].map(([t, d]) => h('li', {}, icon('check'), h('span', {}, h('strong', {}, t), h('br'), d))))),
    funnelStep(
      h('p', { class: 'ticker__count' }, h('strong', {}, num(1123)), ' personas empezaron esta semana su camino para dejar de fumar'),
      h('div', { class: 'ticker', 'aria-hidden': 'true' }, ticker.map((row, k) => h('div', { class: `ticker__row${k ? ' ticker__row--rev' : ''}` },
        [...row, ...row].map((e) => h('span', { class: 'ticker__item' }, h('i'), e.email, h('em', {}, rel.format(-e.ago, e.unit)))))))),
    h('section', { class: 'r-section theme-deep sales__plans', id: 'planes' },
      h('div', { class: 'container narrow' },
        h('div', { class: 'sales__summary' },
          h('div', {}, h('p', { class: 'small' }, 'Antigüedad del hábito'), h('p', { class: 'sales__summary-v' }, pf.years ? SINCE_LABELS[pf.years - 1] : '—')),
          h('div', {}, h('p', { class: 'small' }, 'Dentro de 3 meses'), h('p', { class: 'sales__summary-v' }, pf.goal ? TARGET_LABELS[pf.goal - 1] : '—'))),
        me.access ? h('p', {}, h('a', { href: '/dashboard', class: 'btn btn--lg' }, 'Ir a mi panel')) : paywallRoot)),
    funnelStep(
      h('p', { class: 'eyebrow' }, 'De nuestra comunidad'),
      h('h2', { class: 'title-lg' }, 'No eres el único.'),
      h('div', { class: 'members' }, MEMBERS.map((m) => h('figure', { class: 'member' },
        h('img', { src: `/assets/quiz/members/card-${m.photo}.jpg`, alt: '', loading: 'lazy', width: 240, height: 320 }),
        h('blockquote', {}, m.quote), h('figcaption', {}, m.name)))),
      h('p', { class: 'tiny muted' }, 'Las citas son mensajes reales de los miembros, ligeramente editados para acortar su extensión. Se han cambiado los nombres y las fotos son ilustrativas para proteger su privacidad.')),
    funnelStep(
      h('h2', { class: 'title-lg' }, 'Preguntas frecuentes'),
      h('div', { class: 'faq' }, FAQ.map(([q, a]) => h('details', { class: 'faq__item' }, h('summary', {}, q), h('p', {}, a)))),
      h('div', { class: 'guarantee' },
        h('img', { src: '/assets/quiz/money-back-es.webp', alt: '100 % reembolso garantizado', class: 'guarantee__badge', loading: 'lazy' }),
        h('div', {}, h('h3', {}, 'Garantía de devolución del dinero'), h('p', {}, 'Si no ves resultados visibles, te devolveremos todo el dinero. ', h('a', { href: '/terminos' }, 'Más información.'))))));
  if (!me.access) renderPaywall(paywallRoot, { pendingCheckout: me.pendingCheckout, variant: 'sales' });
  return page;
}

async function init() {
  const params = new URLSearchParams(location.search);
  const program = SLUGS.includes(params.get('program')) ? params.get('program') : 'sem-fumo';
  let data, me;
  try {
    [data, me] = await Promise.all([api(`/api/assessment/result?program=${encodeURIComponent(program)}`), api('/api/me')]);
  } catch (err) {
    if (err.code === 'NO_RESULT') return window.location.replace(program === 'sem-fumo' ? '/test' : `/quiz/${program}`);
    root.replaceChildren(h('div', { class: 'container section' }, h('p', { class: 'notice' }, err.message)));
    return;
  }
  if (me.user) {
    renderHeader($('[data-header]'), {
      links: me.access
        ? [{ href: '/programas?catalogo', label: 'Mis programas', cls: 'btn btn--sm' }]
        : [{ href: '/perfil', label: 'Mi perfil', cls: 'hide-sm' }],
    });
  } else {
    renderHeader($('[data-header]'), { links: [{ href: '/acceso', label: 'Entrar' }] });
  }
  const programSlug = SLUGS.includes(data.program) ? data.program : program;
  if (programSlug === 'sem-fumo' && data.result.smokerType && !me.access) semFumoFunnel(data, me);
  else if (programSlug === 'sem-fumo') semFumoResults(data, me);
  else programResults(programSlug, data, me);
}

init();
