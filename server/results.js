import { HABIT_GROUPS, QUESTIONS, TRIGGERS } from './quiz.js';

const WEEKS_PER_MONTH = 52 / 12;
const PROJECTION_WEEKS = 12;

export const STRATEGIES = {
  parar: {
    id: 'parar',
    name: 'Fecha de corte con preparación',
    summary: 'Dos semanas de preparación reduciendo los cigarrillos más automáticos y, después, tu día sin tabaco.',
  },
  gradual: {
    id: 'gradual',
    name: 'Reducción progresiva hasta cero',
    summary: 'Bajas un poco cada semana, empezando por los cigarrillos que menos echarás de menos, hasta llegar a cero.',
  },
  reducir: {
    id: 'reducir',
    name: 'Reducir a la mitad primero',
    summary: 'En cuatro semanas reduces tu consumo a la mitad. Después decides, con datos, el siguiente paso.',
  },
};

const TOOLS = {
  respiracion: { id: 'respiracion', name: 'Respiración guiada', detail: 'Ejercicio de 2 minutos para atravesar un antojo sin fumar.' },
  sos: { id: 'sos', name: 'Botón SOS antojo', detail: 'Ayuda inmediata cuando las ganas aprietan, con registro del momento.' },
  rutinas: { id: 'rutinas', name: 'Sustitución de rutinas', detail: 'Alternativas concretas para el café, la comida y los trayectos.' },
  social: { id: 'social', name: 'Plan para situaciones sociales', detail: 'Frases y estrategias para salidas y reuniones con fumadores.' },
  pausas: { id: 'pausas', name: 'Pausas de enfoque', detail: 'Descansos de 3 minutos que sustituyen la pausa del cigarrillo.' },
  diario: { id: 'diario', name: 'Diario de gatillos', detail: 'Registra cada antojo para descubrir tus patrones.' },
};

const TOOLS_BY_GROUP = {
  emocional: ['respiracion', 'sos'],
  automatico: ['rutinas'],
  social: ['social'],
  concentracion: ['pausas'],
};

export const TRACKING_FEATURES = [
  'Registro diario de consumo en segundos',
  'Objetivo diario adaptado a tu estrategia',
  'Gráficos de evolución semana a semana',
  'Contador de dinero ahorrado y cigarrillos evitados',
  'Recordatorios configurables',
];

const round2 = (n) => Math.round(n * 100) / 100;

function hsiScore(perDay, firstOption) {
  const cigPoints = perDay <= 10 ? 0 : perDay <= 20 ? 1 : perDay <= 30 ? 2 : 3;
  const first = QUESTIONS.find((q) => q.id === 'q_primer').options.find((o) => o.id === firstOption);
  const score = cigPoints + (first?.hsi ?? 0);
  const level = score <= 1 ? 'baja' : score <= 4 ? 'moderada' : 'alta';
  return { score, max: 6, level };
}

function habitProfile(answers) {
  const weights = Object.fromEntries(HABIT_GROUPS.map((g) => [g.id, 0]));
  for (const t of answers.q_gatillos ?? []) weights[TRIGGERS[t].group] += 2;
  if (TRIGGERS[answers.q_dificil]) weights[TRIGGERS[answers.q_dificil].group] += 3;
  const worry = QUESTIONS.find((q) => q.id === 'q_preocupacion').options.find((o) => o.id === answers.q_preocupacion);
  if (worry) weights[worry.group] += 1;
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  // Reparto en porcentajes enteros que suman 100 (método del mayor resto).
  const raw = HABIT_GROUPS.map((g) => ({ ...g, exact: (weights[g.id] / total) * 100 }));
  raw.forEach((r) => { r.value = Math.floor(r.exact); });
  let rest = 100 - raw.reduce((a, r) => a + r.value, 0);
  [...raw].sort((a, b) => (b.exact - b.value) - (a.exact - a.value)).forEach((r) => { if (rest-- > 0) r.value += 1; });
  return raw.map(({ id, label, value }) => ({ id, label, value })).sort((a, b) => b.value - a.value);
}

function topTriggers(answers, profile) {
  const rank = Object.fromEntries(profile.map((g, i) => [g.id, i]));
  const selected = [...(answers.q_gatillos ?? [])];
  if (TRIGGERS[answers.q_dificil] && !selected.includes(answers.q_dificil)) selected.push(answers.q_dificil);
  return selected
    .sort((a, b) => (b === answers.q_dificil) - (a === answers.q_dificil) || rank[TRIGGERS[a].group] - rank[TRIGGERS[b].group])
    .slice(0, 3)
    .map((id) => ({ id, label: TRIGGERS[id].label }));
}

/** Objetivo diario de cigarrillos para cada semana (0 = semana actual). */
export function weeklySchedule(strategyId, perDay, weeks = PROJECTION_WEEKS) {
  const out = [];
  for (let w = 0; w <= weeks; w++) {
    let target;
    if (strategyId === 'parar') {
      target = w === 0 ? perDay : w === 1 ? perDay * 0.85 : w === 2 ? perDay * 0.7 : 0;
    } else if (strategyId === 'gradual') {
      const span = Math.min(10, Math.max(4, Math.ceil(perDay / 3)));
      target = w === 0 ? perDay : Math.max(0, perDay * (1 - w / span));
    } else {
      target = w === 0 ? perDay : Math.max(perDay * 0.5, perDay * (1 - (w / 4) * 0.5));
    }
    out.push(Math.round(target));
  }
  return out;
}

function initialGoals(strategyId, perDay, answers, triggers) {
  const schedule = weeklySchedule(strategyId, perDay);
  const goals = [
    { week: 1, title: 'Registra cada cigarrillo durante 7 días', detail: 'Solo anotar ya reduce el consumo automático y nos da datos para ajustar tu plan.' },
  ];
  if (answers.q_primer === '5min' || answers.q_primer === '30min') {
    goals.push({ week: 1, title: 'Retrasa 15 minutos el primer cigarrillo', detail: 'Bebe un vaso de agua y haz una respiración guiada antes de fumar.' });
  }
  if (schedule[1] < perDay) {
    goals.push({ week: 1, title: `Baja de ${perDay} a ${schedule[1]} cigarrillos al día`, detail: 'Empieza eliminando los que fumas sin darte cuenta.' });
  }
  if (triggers[0]) {
    goals.push({ week: 1, title: `Prepara una alternativa para «${triggers[0].label.toLowerCase()}»`, detail: 'Decide hoy qué harás en ese momento en lugar de fumar.' });
  }
  if (strategyId === 'parar') {
    goals.push({ week: 2, title: `Llega a ${schedule[2]} cigarrillos al día`, detail: 'Último paso antes de tu día sin tabaco.' });
    goals.push({ week: 2, title: 'Prepara tu entorno para el día sin tabaco', detail: 'Retira mecheros, ceniceros y tabaco de casa, coche y trabajo.' });
  } else {
    goals.push({ week: 2, title: `Llega a ${schedule[2]} cigarrillos al día`, detail: 'Mantén el registro para ver tu avance.' });
    if (triggers[1]) goals.push({ week: 2, title: `Desactiva el gatillo «${triggers[1].label.toLowerCase()}»`, detail: 'Cambia el orden o el lugar de esa rutina.' });
  }
  return goals;
}

/**
 * Calcula el resultado completo a partir de respuestas validadas.
 * `strategyOverride` permite regenerar el plan si el usuario cambia su meta.
 */
export function computeResult(answers, { strategyOverride } = {}) {
  const perDay = Number(answers.q_cantidad);
  const weeklySpend = Number(answers.q_gasto);
  const strategyId = strategyOverride ?? answers.q_objetivo;
  const strategy = STRATEGIES[strategyId];

  const dependence = hsiScore(perDay, answers.q_primer);
  const profile = habitProfile(answers);
  const triggers = topTriggers(answers, profile);
  const schedule = weeklySchedule(strategyId, perDay);

  // Estimación: ahorro proporcional a la reducción sobre el consumo actual.
  const pricePerCig = perDay > 0 ? weeklySpend / (perDay * 7) : 0;
  let cumulative = 0;
  let avoided = 0;
  const savingsByWeek = schedule.map((target, w) => {
    if (w > 0) {
      const less = Math.max(0, perDay - target) * 7;
      avoided += less;
      cumulative += less * pricePerCig;
    }
    return { week: w, value: round2(cumulative) };
  });
  const finalTarget = schedule[schedule.length - 1];
  const yearSavings = cumulative + Math.max(0, perDay - finalTarget) * 7 * pricePerCig * (52 - PROJECTION_WEEKS);

  const groups = new Set(profile.filter((g) => g.value > 0).slice(0, 3).map((g) => g.id));
  const toolIds = ['diario', ...[...groups].flatMap((g) => TOOLS_BY_GROUP[g])];
  if (dependence.level !== 'baja' && !toolIds.includes('respiracion')) toolIds.push('respiracion');
  const tools = [...new Set(toolIds)].map((id) => TOOLS[id]);

  return {
    current: {
      product: answers.q_producto,
      perDay,
      perWeek: perDay * 7,
      perYear: Math.round(perDay * 365),
      weeklySpend,
      monthlySpend: round2(weeklySpend * WEEKS_PER_MONTH),
      yearlySpend: round2(weeklySpend * 52),
      years: answers.q_anios,
    },
    dependence,
    profile,
    triggers,
    projection: {
      weeks: PROJECTION_WEEKS,
      schedule,
      savingsByWeek,
      savings12Weeks: round2(cumulative),
      savingsYear: round2(yearSavings),
      cigarettesAvoided12Weeks: Math.round(avoided),
      reductionPercent: perDay > 0 ? Math.round((1 - finalTarget / perDay) * 100) : 0,
    },
    plan: {
      strategy,
      triggers,
      goals: initialGoals(strategyId, perDay, answers, triggers),
      tools,
      tracking: TRACKING_FEATURES,
      motives: answers.q_motivos ?? [],
    },
  };
}
