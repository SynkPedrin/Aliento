import { $, api, h, icon, money, num, renderFooter, renderHeader, revealOnScroll } from '../ui.js';
import { gauge, hbars, radarChart, xyChart } from '../charts.js';
import { renderPaywall } from '../paywall.js';
import { track } from '../track.js';

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

// ---------------------------------------------------------------- Embudo v3 (Sem Fumo, sin suscripción)
// Perfil → explicación → proyección → página de venta. Cada paso tiene su #hash para que «atrás» funcione.
const FUNNEL = ['perfil', 'explicacion', 'proyeccion', 'planes'];
const savedName = () => { try { return localStorage.getItem('alento-name') || ''; } catch { return ''; } };
const shortDate = (d) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(d);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

const FAQ = [
  ['¿Tengo que dejarlo el primer día?', 'No. La primera semana sigues con tu consumo normal mientras registras cuándo y por qué fumas. Con esos datos, Alento te propone el siguiente paso, a tu ritmo.'],
  ['¿Y si no quiero dejarlo del todo?', 'También puedes empezar reduciendo. Eliges tu objetivo y el plan se adapta: menos cigarrillos, retrasar el primero del día o dejarlo por completo.'],
  ['¿Qué pasa si tengo una recaída?', 'Es parte del proceso. El plan no se reinicia ni te juzga: registras lo que pasó, ves qué lo provocó y sigues desde donde estabas.'],
  ['¿Cuánto tiempo al día necesito?', 'Entre 5 y 10 minutos: una tarea breve, el registro de tu consumo y, cuando aprietan las ganas, un ejercicio de respiración de 2 minutos.'],
  ['¿Alento sustituye a un médico?', 'No. Alento es un programa de apoyo para cambiar el hábito. Si tienes dudas sobre tu salud o sobre medicación para dejar de fumar, consulta a un profesional sanitario.'],
];

// Recuperación del cuerpo tras el último cigarrillo (OMS).
const RECOVERY = [
  [0, '20 minutos', 'Bajan la frecuencia cardiaca y la presión arterial.'],
  [1, '12 horas', 'El monóxido de carbono en sangre vuelve a la normalidad.'],
  [14, '2 semanas', 'Mejoran la circulación y la función pulmonar.'],
  [30, '1 mes', 'Disminuyen la tos y la falta de aliento.'],
];

function funnelStep(...children) {
  return h('section', { class: 'funnel-step' }, h('div', { class: 'container narrow' }, ...children));
}

function semFumoFunnel(data, me) {
  const { result: r, currency, locale } = data;
  const fmt = (v, d) => money(v, currency, locale, d);
  const name = savedName();
  const p = r.projection;
  const next = (to) => h('div', { class: 'sticky-cta' }, h('a', { class: 'btn btn--lg', href: `#${to}` }, 'Continuar'));

  const screens = {
    perfil: () => funnelStep(
      h('p', { class: 'eyebrow' }, 'Tu tipo de fumador'),
      h('h1', { class: 'title-lg funnel-step__title' }, r.smokerType.name),
      h('p', { class: 'subtitle' }, 'Este gráfico muestra qué sostiene tu hábito. En la página siguiente verás qué significa tu perfil.'),
      h('div', { class: 'card funnel-radar' }, radarChart(r.radar, { caption: 'Tu perfil' })),
      next('explicacion')),
    explicacion: () => funnelStep(
      h('h1', { class: 'title-lg funnel-step__title' }, name ? `${name}, esto es lo que hace única tu situación` : 'Esto es lo que hace única tu situación'),
      h('p', { class: 'funnel-step__body' }, r.smokerType.body),
      next('proyeccion')),
    proyeccion: () => funnelStep(
      h('h1', { class: 'title-lg funnel-step__title' }, 'Lo que puede cambiar en 12 semanas'),
      h('p', {}, h('span', { class: 'estimate-tag' }, 'Estimación')),
      h('div', { class: 'stats u-mt-16' },
        p.reductionPercent >= 100 ? stat('En la semana 12', 'Sin fumar', 'si sigues tu plan') : stat('Menos consumo', `−${p.reductionPercent}%`, 'en la semana 12'),
        stat('Ahorro en 1 año', fmt(p.savingsYear, 0), r.labels?.q_ahorro ? `para «${r.labels.q_ahorro.toLowerCase()}»` : 'estimado')),
      h('div', { class: 'card u-mt-16' },
        h('h3', {}, 'Tu objetivo diario, semana a semana'),
        xyChart({
          labels: p.schedule.map((_, i) => (i === 0 ? 'Hoy' : `S${i}`)),
          caption: 'Objetivo diario por semana',
          format: (v) => num(Math.round(v), locale),
          series: [{ label: 'Objetivo de tu plan', kind: 'area', values: p.schedule }, { label: 'Consumo actual', kind: 'dashed', values: p.schedule.map(() => r.current.perDay) }],
        })),
      h('p', { class: 'tiny muted u-mt-16' }, 'Calculado con tus respuestas, suponiendo que sigues el objetivo diario de tu plan. No es una garantía: los resultados reales dependen de cada persona.'),
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

function salesPage(r, fmt, name, me) {
  const week = Array.from({ length: 7 }, (_, i) => addDays(i));
  const paywallRoot = h('div');
  const page = h('div', { class: 'sales' },
    funnelStep(
      h('h1', { class: 'title-xl sales__hook' }, 'No tienes que dejarlo hoy.'),
      h('p', { class: 'lead' }, 'Fumar es automático: la mano va sola antes de que lo pienses. Por eso, durante la primera semana sigues como siempre mientras Alento aprende tu patrón. Después te decimos cuándo y cómo dar cada paso.'),
      h('div', { class: 'card week-strip' },
        h('ol', {}, week.map((d) => h('li', {}, h('strong', {}, d.getDate()), h('span', {}, new Intl.DateTimeFormat('es', { weekday: 'short' }).format(d))))),
        h('p', { class: 'week-strip__stamp' }, 'Semana de observación')),
      h('div', { class: 'stats u-mt-16' },
        stat(r.current.product === 'vapeador' ? 'Sesiones al año' : 'Cigarrillos al año', num(r.current.perYear), 'a tu ritmo actual'),
        stat('Gasto al año', fmt(r.current.yearlySpend, 0), 'si sigues igual'))),
    funnelStep(
      h('p', { class: 'eyebrow' }, 'Tu objetivo principal'),
      h('h2', { class: 'title-lg' }, r.labels?.q_meta3m ?? 'Recuperar el control'),
      h('p', { class: 'lead' }, `${name ? `${name}, ` : ''}${(r.labels?.q_anios ?? '').toLowerCase()} fumando. Tu cuerpo empieza a recuperarse a los 20 minutos del último cigarrillo.`),
      h('ol', { class: 'timeline' }, RECOVERY.map(([days, when, what]) => h('li', {},
        h('p', { class: 'timeline__when' }, when, h('span', { class: 'muted' }, ` · ${days ? shortDate(addDays(days)) : 'hoy'}`)),
        h('p', {}, what)))),
      h('p', { class: 'tiny muted' }, 'Fuente: Organización Mundial de la Salud. Las fechas cuentan desde hoy como ejemplo.')),
    funnelStep(
      h('p', { class: 'eyebrow' }, 'Lo que ganas'),
      h('ul', { class: 'feature-list' }, [
        ['Menos motivos para fumar', 'Practicas cómo atravesar pausas, estrés y planes sociales sin cigarrillo.'],
        ['Más libertad en tu día', 'Tus pausas, tus tardes y tus planes dejan de girar alrededor del tabaco.'],
        ['Más dinero en el bolsillo', `Hasta ${fmt(r.projection.savingsYear, 0)} al año según tu plan.`],
      ].map(([t, d]) => h('li', {}, icon('check'), h('span', {}, h('strong', {}, t), h('br'), d))))),
    h('section', { class: 'r-section theme-deep sales__plans', id: 'planes' },
      h('div', { class: 'container narrow' },
        h('div', { class: 'sales__summary' },
          h('div', {}, h('p', { class: 'small' }, 'Tiempo fumando'), h('p', { class: 'sales__summary-v' }, r.labels?.q_anios ?? '—')),
          h('div', {}, h('p', { class: 'small' }, 'Dentro de 3 meses'), h('p', { class: 'sales__summary-v' }, r.labels?.q_meta3m ?? '—'))),
        me.access ? h('p', {}, h('a', { href: '/dashboard', class: 'btn btn--lg' }, 'Ir a mi panel')) : paywallRoot)),
    funnelStep(
      h('h2', { class: 'title-lg' }, 'Preguntas frecuentes'),
      h('div', { class: 'faq' }, FAQ.map(([q, a]) => h('details', { class: 'faq__item' }, h('summary', {}, q), h('p', {}, a))))));
  if (!me.access) renderPaywall(paywallRoot, { pendingCheckout: me.pendingCheckout });
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
