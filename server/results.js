import { HABIT_GROUPS, QUESTIONS, STEPS, TRIGGERS } from './quiz.js';

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
  const first = QUESTIONS.find((q) => q.id === 'q_primer')?.options?.find((o) => o.id === firstOption);
  const hsiMap = { '5min': 3, '30min': 2, '60min': 1, 'mas60': 0 };
  const score = cigPoints + (first?.hsi ?? hsiMap[firstOption] ?? 0);
  const level = score <= 1 ? 'baja' : score <= 4 ? 'moderada' : 'alta';
  return { score, max: 6, level };
}

function habitProfile(answers) {
  const weights = Object.fromEntries(HABIT_GROUPS.map((g) => [g.id, 0]));
  for (const t of answers.q_gatillos ?? []) if (TRIGGERS[t]) weights[TRIGGERS[t].group] += 2;
  if (TRIGGERS[answers.q_dificil]) weights[TRIGGERS[answers.q_dificil].group] += 3;
  const worry = QUESTIONS.find((q) => q.id === 'q_preocupacion')?.options?.find((o) => o.id === answers.q_preocupacion);
  if (worry && worry.group) weights[worry.group] += 1;
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
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
    .filter((id) => TRIGGERS[id])
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

const optionLabel = (questionId, value) => STEPS.find((q) => q.id === questionId)?.options?.find((o) => o.id === value)?.label ?? null;

/** Respuesta por rangos (v3) o número (v2): devuelve el número que usa el cálculo. */
function numericAnswer(questionId, value, field) {
  if (typeof value === 'number') return value;
  return STEPS.find((q) => q.id === questionId)?.options?.find((o) => o.id === value)?.[field] ?? 0;
}

// Radar de 6 ejes: puntos por respuesta / máximo posible del eje (0–100).
const RADAR_AXES = [
  { id: 'ansia', label: 'Ansia' }, { id: 'habito', label: 'Hábito' }, { id: 'estres', label: 'Estrés' },
  { id: 'pertenecer', label: 'Pertenecer' }, { id: 'enfoque', label: 'Enfoque' }, { id: 'placer', label: 'Placer' },
];
const RADAR_MAX = { ansia: 11, habito: 11, estres: 10, pertenecer: 10, enfoque: 10, placer: 8 };

export function radarScores(a) {
  const pts = Object.fromEntries(RADAR_AXES.map((x) => [x.id, 0]));
  const has = (list, id) => (list ?? []).includes(id);
  const groupCount = (g) => (a.q_gatillos ?? []).filter((t) => TRIGGERS[t]?.group === g).length;
  pts.ansia += ({ '5min': 3, '30min': 2, '60min': 1 })[a.q_primer] ?? 0;
  pts.ansia += a.q_enfermo === 'si' ? 2 : 0;
  pts.ansia += ({ incomodo: 1, irritado: 2, tension: 3 })[a.q_prohibido] ?? 0;
  pts.ansia += ({ sustituir: 1, parches: 1, pedir: 2, cualquiera: 2, lejos: 3 })[a.q_sin24h] ?? 0;
  pts.habito += ({ programado: 3, automatico: 3, mixto: 2 })[a.q_patron] ?? 0;
  pts.habito += Math.min(4, groupCount('automatico'));
  pts.habito += ({ '1a5': 1, '6a10': 2, '11a20': 3, mas20: 3 })[a.q_anios] ?? 0;
  pts.habito += has(a.q_disfrute, 'gesto') ? 1 : 0;
  pts.estres += Math.min(4, groupCount('emocional') * 2);
  pts.estres += ({ ansiedad: 3, vacio: 2 })[a.q_preocupacion] ?? 0;
  pts.estres += has(a.q_disfrute, 'pausa') ? 2 : 0;
  pts.estres += a.q_meta3m === 'animo' ? 1 : 0;
  pts.pertenecer += Math.min(4, groupCount('social') * 2);
  pts.pertenecer += a.q_amigo === 'si' ? 3 : 0;
  pts.pertenecer += has(a.q_disfrute, 'social') ? 2 : 0;
  pts.pertenecer += a.q_preocupacion === 'social' ? 1 : 0;
  pts.enfoque += groupCount('concentracion') ? 3 : 0;
  pts.enfoque += has(a.q_disfrute, 'foco') ? 3 : 0;
  pts.enfoque += a.q_preocupacion === 'foco' ? 2 : 0;
  pts.enfoque += a.q_meta3m === 'foco' ? 2 : 0;
  pts.placer += (has(a.q_disfrute, 'gesto') ? 2 : 0) + (has(a.q_disfrute, 'sabor') ? 3 : 0) + (has(a.q_disfrute, 'inhalar') ? 3 : 0);
  return RADAR_AXES.map((x) => ({ ...x, value: Math.min(100, Math.round((pts[x.id] / RADAR_MAX[x.id]) * 100)) }));
}

// Tipo de fumador según el eje dominante.
export const SMOKER_TYPES = {
  habito: {
    name: 'El piloto automático',
    body: 'Tus cigarrillos siguen un guion: las mismas horas, los mismos sitios, las mismas señales. Por eso parece imposible romperlo, y por eso mismo tiene solución: lo que es predecible se puede reentrenar. Cambiar el orden de una rutina, mover un horario unos minutos o sustituir el primer cigarrillo del café son cambios pequeños que, repetidos, le enseñan a tu cerebro un guion nuevo. La constancia que creó este hábito es la misma que lo va a deshacer.',
  },
  ansia: {
    name: 'El impulso químico',
    body: 'En tu caso, la nicotina marca el ritmo: el primer cigarrillo llega pronto y la falta se nota rápido. No es falta de voluntad, es una dependencia física que tu cuerpo ha aprendido. La buena noticia es que el ansia sube, llega a un pico y baja en pocos minutos. Tu plan te enseña a atravesar esos minutos con técnicas concretas y a bajar la dosis de forma gradual, para que el cuerpo se adapte sin pasarlo mal.',
  },
  estres: {
    name: 'El refugio emocional',
    body: 'Para ti, fumar es una forma de bajar la tensión: un momento de calma cuando el día aprieta. El problema es que el alivio dura poco y, con el tiempo, la nicotina aumenta la sensación de estrés entre cigarrillo y cigarrillo. Tu plan te da otras salidas para esos momentos, como respiraciones cortas y pausas guiadas, para que conserves la calma sin depender del cigarrillo.',
  },
  pertenecer: {
    name: 'El conector social',
    body: 'Tu hábito vive en los demás: las salidas, los descansos compartidos, la complicidad de fumar juntos. Eso lo hace muy fuerte, porque dejarlo parece alejarte de tu gente. Pero esa conexión no depende del tabaco. Tu plan te prepara para cada situación social con frases y estrategias concretas, para que sigas en el grupo sin necesitar el cigarrillo.',
  },
  enfoque: {
    name: 'El combustible mental',
    body: 'Usas el cigarrillo para arrancar, concentrarte o cerrar una tarea. Sientes que te ayuda a pensar, pero en realidad calma la falta de nicotina que interrumpe tu concentración. Cuando la dependencia baja, el foco vuelve solo. Tu plan sustituye las pausas de cigarrillo por pausas de enfoque de pocos minutos que funcionan igual de bien.',
  },
  placer: {
    name: 'El ritual sensorial',
    body: 'Lo que más te engancha es la experiencia: el gesto, el sabor, la sensación al inhalar. Es un ritual que disfrutas, y por eso no basta con la fuerza de voluntad. Tu plan no te pide renunciar al placer de golpe: te ayuda a encontrar sustitutos para cada parte del ritual y a reducirlo de forma gradual, sin sensación de pérdida.',
  },
};

// ------------------------------------------------------------
// CÁLCULO PARA ALCOHOL
// ------------------------------------------------------------
function computeAlcoholResult(answers) {
  const freqScores = { nunca: 1, mensual: 2, semanal: 3, diario: 4 };
  const qtyScores = { '1-2': 1, '3-4': 2, '5-6': 3, '7-9': 4, '10mas': 5 };
  const auditScore = (freqScores[answers.q_alc_frecuencia] ?? 2) + (qtyScores[answers.q_alc_cantidad] ?? 2);
  const level = auditScore <= 3 ? 'baja' : auditScore <= 6 ? 'moderada' : 'alta';

  const monthlySpend = Number(answers.q_alc_gasto ?? 80);
  const weeklySpend = round2(monthlySpend / WEEKS_PER_MONTH);
  const yearlySpend = round2(monthlySpend * 12);

  const triggersMap = {
    desconexion: 'Al terminar el trabajo o para desconectar',
    social: 'Con amigos, fiestas o comidas de fin de semana',
    estres: 'Cuando siento estrés, agobio o problemas',
    aburrimiento: 'Por aburrimiento o soledad en casa',
    comidas: 'Acompañando siempre la cena o comida',
  };

  const selectedTriggers = (answers.q_alc_gatillos ?? ['desconexion']).map((id) => ({
    id, label: triggersMap[id] || id,
  }));

  const hasPhysicalDependenceSigns = answers.q_alc_seguridad === 'si';
  const safetyNotice = hasPhysicalDependenceSigns
    ? 'Aviso de seguridad clínica: Has indicado síntomas compatibles con posible dependencia física (temblores matutinos o necesidad al despertar). Alento es un programa educativo y NO recomienda suspender el consumo de alcohol de forma brusca sin supervisión médica. Te recomendamos consultar con un profesional de la salud antes de cualquier interrupción repentina.'
    : null;

  const targetReduction = answers.q_alc_objetivo === 'dejarlo' ? 100 : answers.q_alc_objetivo === 'pausa' ? 100 : 50;
  const savings12Weeks = round2(monthlySpend * 3 * (targetReduction / 100));

  return {
    program: 'alcohol',
    current: {
      product: 'alcohol',
      frequency: answers.q_alc_frecuencia,
      quantityPerOccasion: answers.q_alc_cantidad,
      bingeFrequency: answers.q_alc_atracones,
      weeklySpend,
      monthlySpend,
      yearlySpend,
    },
    dependence: {
      score: auditScore,
      max: 9,
      level,
      hasPhysicalRisk: hasPhysicalDependenceSigns,
    },
    profile: [
      { id: 'desconexion', label: 'Desconexión y pausa', value: 35 },
      { id: 'social', label: 'Entorno social', value: 30 },
      { id: 'emocional', label: 'Gestión emocional', value: 20 },
      { id: 'rutina', label: 'Hábito en comidas', value: 15 },
    ],
    triggers: selectedTriggers.slice(0, 3),
    safetyNotice,
    projection: {
      weeks: PROJECTION_WEEKS,
      savings12Weeks,
      savingsYear: round2(monthlySpend * 12 * (targetReduction / 100)),
      reductionPercent: targetReduction,
    },
    plan: {
      strategy: {
        id: answers.q_alc_objetivo || 'moderar',
        name: answers.q_alc_objetivo === 'dejarlo' ? 'Cese completo guiado' : answers.q_alc_objetivo === 'pausa' ? 'Pausa saludable de 90 días' : 'Consumo consciente y reducción gradual',
        summary: 'Acompañamiento reflexivo paso a paso para transformar tu relación con el alcohol, sin juicios y a tu ritmo.',
      },
      triggers: selectedTriggers,
      goals: [
        { week: 1, title: 'Registra tus ocasiones de consumo durante 7 días', detail: 'Conocer las situaciones exactas te da el control para elegir conscientemente.' },
        { week: 1, title: 'Diseña una alternativa para tu momento más delicado', detail: 'Sustituye la bebida de desconexión por una opción refrescante sin alcohol.' },
      ],
      tools: [
        { id: 'diario_consumo', name: 'Diario de consumo', detail: 'Anota cada ocasión y cómo te sentías en ese momento.' },
        { id: 'alternativas', name: 'Guía de sustitutos', detail: 'Opciones atractivas sin alcohol para reuniones y cenas.' },
        { id: 'respiracion', name: 'Pausa de autorregulación', detail: 'Respira 2 minutos antes de decidir servirte una bebida.' },
      ],
      tracking: [
        'Registro rápido de consumiciones o días sin alcohol',
        'Seguimiento de dinero ahorrado y calorías evitadas',
        'Gráficos de patrones por días de la semana',
      ],
      motives: answers.q_alc_motivos ?? [],
    },
  };
}

// ------------------------------------------------------------
// CÁLCULO PARA AZÚCAR
// ------------------------------------------------------------
function computeAzucarResult(answers) {
  const timesPerDay = Number(answers.q_az_frecuencia ?? 3);
  const moments = answers.q_az_momentos ?? ['bajon'];
  const momentsMap = {
    bajon: 'Bajón de energía a media tarde',
    noche: 'En el sofá o tras la cena',
    estres: 'Estrés y agobio',
    recompensa: 'Recompensa tras el esfuerzo',
    aburrimiento: 'Hábito o aburrimiento',
  };
  const triggers = moments.map((id) => ({ id, label: momentsMap[id] || id }));

  return {
    program: 'azucar',
    current: {
      product: answers.q_az_tipo ?? 'dulces',
      perDay: timesPerDay,
      estimatedMonthlySpend: 60,
    },
    dependence: {
      score: Math.min(8, timesPerDay * 2),
      max: 10,
      level: timesPerDay <= 2 ? 'baja' : timesPerDay <= 4 ? 'moderada' : 'alta',
    },
    profile: [
      { id: 'energia', label: 'Curva de energía y fatiga', value: 40 },
      { id: 'emocional', label: 'Recompensa y alivio emocional', value: 35 },
      { id: 'rutina', label: 'Hábito automático', value: 25 },
    ],
    triggers: triggers.slice(0, 3),
    projection: {
      weeks: PROJECTION_WEEKS,
      reductionPercent: 60,
      sugarSpikesAvoided: timesPerDay * 7 * 12,
    },
    plan: {
      strategy: {
        id: 'equilibrio',
        name: 'Equilibrio consciente sin dietas extremas',
        summary: 'Desactiva los picos de glucosa y el hambre emocional sustituyendo de forma deliciosa y sostenible.',
      },
      triggers,
      goals: [
        { week: 1, title: 'Registra tus momentos dulces del día', detail: 'Observa qué emoción o necesidad física precedió al dulce.' },
        { week: 1, title: 'Añade proteína o fibra antes del dulce habitual', detail: 'Estabiliza tu glucosa para no tener el bajón posterior.' },
      ],
      tools: [
        { id: 'mapa_antojos', name: 'Mapa de antojos', detail: 'Identifica hambre física vs. hambre emocional en 1 minuto.' },
        { id: 'despensa_consciente', name: 'Guía de snacks saciantes', detail: 'Combinaciones que calman el paladar sin provocar picos.' },
      ],
      tracking: [
        'Registro de momentos dulces y nivel de energía posterior',
        'Conteo de días en equilibrio glucémico',
      ],
    },
  };
}

// ------------------------------------------------------------
// CÁLCULO PARA ANSIEDAD
// ------------------------------------------------------------
function computeAnsiedadResult(answers) {
  const manifestations = answers.q_ans_manifestaciones ?? ['muscular', 'cabeza'];
  const manifestMap = {
    muscular: 'Tensión muscular y cervical',
    pecho: 'Opresión torácica o respiración superficial',
    cabeza: 'Pensamientos en bucle y sobrepensamiento',
    estomago: 'Molestias digestivas o nudo estomacal',
    inquietud: 'Inquietud psicomotriz',
  };
  const triggers = (answers.q_ans_gatillos ?? ['trabajo']).map((id) => ({
    id, label: id === 'trabajo' ? 'Sobrecarga laboral/estudio' : id === 'futuro' ? 'Incertidumbre' : id,
  }));

  return {
    program: 'ansiedad',
    current: {
      product: 'ansiedad',
      frequency: answers.q_ans_frecuencia ?? 'semanal',
      manifestations: manifestations.map((id) => manifestMap[id] || id),
    },
    dependence: {
      score: 5,
      max: 10,
      level: answers.q_ans_frecuencia === 'diario' ? 'alta' : 'moderada',
    },
    profile: [
      { id: 'somatico', label: 'Respuesta física (cuerpo y tensión)', value: 45 },
      { id: 'cognitivo', label: 'Bucle mental (rumiación)', value: 35 },
      { id: 'conductual', label: 'Respuestas de evitación', value: 20 },
    ],
    triggers: triggers.slice(0, 3),
    projection: {
      weeks: PROJECTION_WEEKS,
      reductionPercent: 50,
    },
    plan: {
      strategy: {
        id: 'calma_sistematica',
        name: 'Regulación del sistema nervioso',
        summary: 'Herramientas somáticas y cognitivas breves para desactivar la alerta física y recuperar la calma.',
      },
      triggers,
      goals: [
        { week: 1, title: 'Practica 2 minutos de respiración guiada al día', detail: 'Entrena tu nervio vago en momentos de calma para que funcione en tensión.' },
        { week: 1, title: 'Anota tu nivel de tensión de 1 a 10 dos veces al día', detail: 'Detecta la tensión antes de que se convierta en sobrecarga.' },
      ],
      tools: [
        { id: 'respiracion_caja', name: 'Respiración en caja (Box breathing)', detail: 'Técnica de 4 tiempos para bajar la activación fisiológica.' },
        { id: 'anclaje', name: 'Anclaje 5-4-3-2-1', detail: 'Devuelve tu mente al presente a través de los sentidos.' },
        { id: 'diario_emocional', name: 'Mi diario emocional', detail: 'Espacio seguro para volcar preocupaciones y ordenar la mente.' },
      ],
      tracking: [
        'Termómetro diario de calma (escala 0-10)',
        'Contador de ejercicios de respiración completados',
      ],
    },
  };
}

// ------------------------------------------------------------
// CÁLCULO PARA SUEÑO
// ------------------------------------------------------------
function computeSuenoResult(answers) {
  const hours = Number(answers.q_sue_horas ?? 6);
  const habits = answers.q_sue_habitos ?? ['pantallas'];
  const habitMap = {
    pantallas: 'Luz azul antes de dormir',
    cafeina: 'Cafeína por la tarde',
    cenas: 'Cenas pesadas',
    horarios: 'Horarios irregulares',
    rumiacion: 'Pensamientos sobre mañana',
  };
  const triggers = habits.map((id) => ({ id, label: habitMap[id] || id }));

  return {
    program: 'sueno',
    current: {
      product: 'sueno',
      hoursSlept: hours,
      sleepDebtHours: Math.max(0, 8 - hours),
      obstacle: answers.q_sue_dificultad ?? 'conciliar',
    },
    dependence: {
      score: Math.max(2, 10 - hours),
      max: 10,
      level: hours < 6 ? 'alta' : hours < 7 ? 'moderada' : 'baja',
    },
    profile: [
      { id: 'higiene', label: 'Factores de entorno y pantallas', value: 40 },
      { id: 'rumiacion', label: 'Activación mental nocturna', value: 35 },
      { id: 'ritmo', label: 'Regularidad de horarios', value: 25 },
    ],
    triggers: triggers.slice(0, 3),
    projection: {
      weeks: PROJECTION_WEEKS,
      reductionPercent: 75,
      recoveredRestHours: Math.round(Math.max(0, 8 - hours) * 7 * 12),
    },
    plan: {
      strategy: {
        id: 'higiene_nocturna',
        name: 'Ritual nocturno de desconexión',
        summary: 'Prepara tu entorno y tu biología para un descanso reparador sin presión ni exigencia.',
      },
      triggers,
      goals: [
        { week: 1, title: 'Apaga pantallas 30 minutos antes de acostarte', detail: 'Permite que tu cerebro empiece a liberar melatonina natural.' },
        { week: 1, title: 'Mantén una hora fija para levantarte durante 7 días', detail: 'El ancla de tu reloj circadiano es la hora a la que despiertas.' },
      ],
      tools: [
        { id: 'respiracion_sueno', name: 'Respiración 4-7-8', detail: 'Calma el ritmo cardíaco para inducir el descanso.' },
        { id: 'vaciado_mental', name: 'Vaciado mental en papel', detail: 'Apunta las tareas del día siguiente antes de entrar al dormitorio.' },
      ],
      tracking: [
        'Registro de horas y sensación de energía al despertar',
        'Contador de noches con ritual completado',
      ],
    },
  };
}

/**
 * Función universal de cálculo de resultados.
 * Detecta automáticamente el programa o utiliza el especificado.
 */
export function computeResult(answers, options = {}) {
  const program = options.program
    || (answers.q_alc_frecuencia ? 'alcohol'
      : answers.q_az_tipo ? 'azucar'
        : answers.q_ans_frecuencia ? 'ansiedad'
          : answers.q_sue_horas ? 'sueno'
            : 'sem-fumo');

  if (program === 'alcohol') return computeAlcoholResult(answers);
  if (program === 'azucar') return computeAzucarResult(answers);
  if (program === 'ansiedad') return computeAnsiedadResult(answers);
  if (program === 'sueno') return computeSuenoResult(answers);

  // Sem Fumo por defecto (mantiene 100 % fidelidad original)
  const perDay = numericAnswer('q_cantidad', answers.q_cantidad, 'n');
  const weeklySpend = numericAnswer('q_gasto', answers.q_gasto, 'weekly');
  const radar = radarScores(answers);
  const top = [...radar].sort((x, y) => y.value - x.value)[0];
  const strategyId = options.strategyOverride ?? answers.q_objetivo;
  const strategy = STRATEGIES[strategyId] || STRATEGIES.gradual;

  const dependence = hsiScore(perDay, answers.q_primer);
  const profile = habitProfile(answers);
  const triggers = topTriggers(answers, profile);
  const schedule = weeklySchedule(strategyId, perDay);

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
  const toolIds = ['diario', ...[...groups].flatMap((g) => TOOLS_BY_GROUP[g] || [])];
  if (dependence.level !== 'baja' && !toolIds.includes('respiracion')) toolIds.push('respiracion');
  const tools = [...new Set(toolIds)].map((id) => TOOLS[id]).filter(Boolean);

  return {
    program: 'sem-fumo',
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
    radar,
    smokerType: { id: top.id, ...SMOKER_TYPES[top.id] },
    // Textos de respuestas que la página de resultado repite («{años} fumando», «dentro de 3 meses…»).
    labels: Object.fromEntries(['q_anios', 'q_meta3m', 'q_ahorro', 'q_producto'].map((id) => [id, optionLabel(id, answers[id])])),
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

export const computeResultForProgram = (program, answers, options = {}) =>
  computeResult(answers, { ...options, program });
