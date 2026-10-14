// Definición del cuestionario. El servidor la usa para validar respuestas y
// calcular resultados; el cliente recibe una copia sin las puntuaciones.
// Si cambias preguntas u opciones, incrementa QUIZ_VERSION.

export const QUIZ_VERSION = 1;

export const TRIGGERS = {
  despertar: { label: 'Al despertar', group: 'automatico' },
  cafe: { label: 'Con el café', group: 'automatico' },
  comida: { label: 'Después de comer', group: 'automatico' },
  coche: { label: 'En el coche o de camino', group: 'automatico' },
  estres: { label: 'Estrés o ansiedad', group: 'emocional' },
  aburrimiento: { label: 'Aburrimiento', group: 'emocional' },
  alcohol: { label: 'Con alcohol o de fiesta', group: 'social' },
  amigos: { label: 'Con amigos que fuman', group: 'social' },
  trabajo: { label: 'Pausas de trabajo o estudio', group: 'concentracion' },
};

export const HABIT_GROUPS = [
  { id: 'automatico', label: 'Hábito automático' },
  { id: 'emocional', label: 'Regulación emocional' },
  { id: 'social', label: 'Entorno social' },
  { id: 'concentracion', label: 'Concentración' },
];

export const STEPS = [
  {
    id: 'q_producto',
    type: 'single',
    title: '¿Qué consumes principalmente?',
    options: [
      { id: 'cigarrillos', label: 'Cigarrillos de cajetilla' },
      { id: 'liar', label: 'Tabaco de liar' },
      { id: 'vapeador', label: 'Vapeador con nicotina' },
      { id: 'calentado', label: 'Tabaco calentado' },
      { id: 'puros', label: 'Puros o pipa' },
    ],
  },
  {
    id: 'q_cantidad',
    type: 'number',
    title: 'En un día normal, ¿cuántos cigarrillos fumas?',
    subtitle: 'Si vapeas o usas otro producto, cuenta cada sesión de consumo como uno.',
    unit: 'al día',
    min: 1,
    max: 80,
    default: 10,
  },
  {
    id: 'q_gasto',
    type: 'number',
    title: '¿Cuánto gastas en tabaco a la semana?',
    subtitle: 'Una cifra aproximada basta. La usamos para estimar tu ahorro.',
    unit: 'currency',
    min: 0,
    max: 1000,
    default: 25,
  },
  {
    id: 'q_anios',
    type: 'single',
    title: '¿Cuánto tiempo llevas fumando?',
    options: [
      { id: 'menos1', label: 'Menos de 1 año' },
      { id: '1-4', label: 'Entre 1 y 4 años' },
      { id: '5-9', label: 'Entre 5 y 9 años' },
      { id: '10-19', label: 'Entre 10 y 19 años' },
      { id: '20+', label: '20 años o más' },
    ],
  },
  {
    id: 'q_primer',
    type: 'single',
    title: 'Al despertar, ¿cuánto tardas en fumar el primero?',
    subtitle: 'Es uno de los indicadores más fiables de dependencia física.',
    options: [
      { id: '5min', label: 'Menos de 5 minutos', hsi: 3 },
      { id: '30min', label: 'Entre 6 y 30 minutos', hsi: 2 },
      { id: '60min', label: 'Entre 31 y 60 minutos', hsi: 1 },
      { id: 'mas', label: 'Más de una hora', hsi: 0 },
    ],
  },
  {
    id: 'q_gatillos',
    type: 'multi',
    title: '¿En qué momentos aparecen las ganas?',
    subtitle: 'Marca todos los que te ocurran.',
    minSelected: 1,
    options: Object.entries(TRIGGERS).map(([id, t]) => ({ id, label: t.label })),
  },
  {
    id: 'q_dificil',
    type: 'single',
    title: '¿Qué cigarrillo te costaría más dejar?',
    options: [
      { id: 'despertar', label: 'El primero de la mañana' },
      { id: 'cafe', label: 'El del café' },
      { id: 'comida', label: 'El de después de comer' },
      { id: 'estres', label: 'El de los momentos de tensión' },
      { id: 'alcohol', label: 'El de las salidas y fiestas' },
    ],
  },
  {
    id: 'info_camino',
    type: 'info',
    tone: 'dark',
    eyebrow: 'Vas por buen camino',
    title: 'Conocer tus hábitos es el primer paso',
    body: 'Fumar no es solo nicotina: también son rutinas y emociones. Por eso tu plan trabaja los tres frentes, con pasos pequeños y alcanzables.',
  },
  {
    id: 'q_intentos',
    type: 'multi',
    title: '¿Has intentado dejarlo o reducir antes?',
    minSelected: 1,
    options: [
      { id: 'nunca', label: 'Todavía no', exclusive: true },
      { id: 'solo', label: 'Sí, por mi cuenta' },
      { id: 'parches', label: 'Con parches o chicles de nicotina' },
      { id: 'medicacion', label: 'Con medicación prescrita' },
      { id: 'terapia', label: 'Con terapia o un grupo de apoyo' },
      { id: 'app', label: 'Con otra aplicación' },
    ],
  },
  {
    id: 'q_preocupacion',
    type: 'single',
    title: '¿Qué es lo que más te preocupa al dejarlo?',
    options: [
      { id: 'ansiedad', label: 'Sentir más ansiedad', group: 'emocional' },
      { id: 'peso', label: 'Ganar peso', group: 'automatico' },
      { id: 'social', label: 'Sentirme fuera de lugar con mis amigos', group: 'social' },
      { id: 'concentracion', label: 'Perder concentración', group: 'concentracion' },
      { id: 'recaida', label: 'Intentarlo y recaer', group: 'automatico' },
    ],
  },
  {
    id: 'q_motivos',
    type: 'multi',
    title: '¿Por qué quieres dejarlo?',
    subtitle: 'Marca todo lo que te mueve.',
    minSelected: 1,
    options: [
      { id: 'salud', label: 'Mi salud' },
      { id: 'dinero', label: 'Ahorrar dinero' },
      { id: 'familia', label: 'Mi familia' },
      { id: 'deporte', label: 'Rendir mejor haciendo deporte' },
      { id: 'libertad', label: 'Sentirme libre de la dependencia' },
      { id: 'imagen', label: 'Olor, piel y dientes' },
    ],
  },
  {
    id: 'q_objetivo',
    type: 'single',
    title: '¿Cómo prefieres hacerlo?',
    options: [
      { id: 'parar', label: 'Dejarlo del todo en una fecha concreta' },
      { id: 'gradual', label: 'Reducir poco a poco hasta dejarlo' },
      { id: 'reducir', label: 'Primero reducir y después decidir' },
    ],
  },
  {
    id: 'q_edad',
    type: 'single',
    title: '¿Qué edad tienes?',
    options: [
      { id: '18-24', label: 'De 18 a 24 años' },
      { id: '25-34', label: 'De 25 a 34 años' },
      { id: '35-44', label: 'De 35 a 44 años' },
      { id: '45-54', label: 'De 45 a 54 años' },
      { id: '55+', label: '55 años o más' },
    ],
  },
  {
    id: 'analisis',
    type: 'analysis',
    title: 'Preparando tus resultados',
    items: [
      'Analizando tu consumo actual',
      'Identificando tus gatillos',
      'Calculando tu índice de dependencia',
      'Diseñando tu plan personalizado',
    ],
    durationMs: 5000,
  },
];

export const QUESTION_TYPES = new Set(['single', 'multi', 'number']);
export const QUESTIONS = STEPS.filter((s) => QUESTION_TYPES.has(s.type));

/** Valida y normaliza una respuesta. Devuelve { ok, value } o { ok:false, error }. */
export function validateAnswer(questionId, value) {
  const q = QUESTIONS.find((s) => s.id === questionId);
  if (!q) return { ok: false, error: 'Pregunta desconocida.' };
  if (q.type === 'single') {
    if (typeof value !== 'string' || !q.options.some((o) => o.id === value)) {
      return { ok: false, error: 'Opción no válida.' };
    }
    return { ok: true, value };
  }
  if (q.type === 'multi') {
    if (!Array.isArray(value)) return { ok: false, error: 'Selección no válida.' };
    const ids = [...new Set(value)];
    if (ids.length < (q.minSelected ?? 1) || !ids.every((id) => q.options.some((o) => o.id === id))) {
      return { ok: false, error: 'Selección no válida.' };
    }
    const exclusive = ids.filter((id) => q.options.find((o) => o.id === id).exclusive);
    if (exclusive.length && ids.length > 1) return { ok: false, error: 'Selección no válida.' };
    return { ok: true, value: ids };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < q.min || n > q.max) {
    return { ok: false, error: `Introduce un valor entre ${q.min} y ${q.max}.` };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export function missingAnswers(answers) {
  return QUESTIONS.filter((q) => answers[q.id] === undefined).map((q) => q.id);
}

/** Versión pública: sin datos internos de puntuación. */
export function publicQuiz() {
  return {
    version: QUIZ_VERSION,
    steps: STEPS.map((s) => ({
      ...s,
      options: s.options?.map(({ id, label, exclusive }) => ({ id, label, ...(exclusive ? { exclusive } : {}) })),
    })),
  };
}
