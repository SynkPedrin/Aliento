// Definición de cuestionarios por programa.
// El servidor la usa para validar respuestas y calcular resultados;
// el cliente recibe una copia sin puntuaciones internas.
// Si cambias preguntas u opciones, incrementa QUIZ_VERSION.

export const QUIZ_VERSION = 2;

// ============================================================
// 1. PROGRAMA SEM FUMO
// ============================================================

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
    title: '¿Cuántos años llevas fumando?',
    options: [
      { id: 'menos1', label: 'Menos de 1 año' },
      { id: '1a5', label: 'Entre 1 y 5 años' },
      { id: '6a10', label: 'Entre 6 y 10 años' },
      { id: '11a20', label: 'Entre 11 y 20 años' },
      { id: 'mas20', label: 'Más de 20 años' },
    ],
  },
  {
    id: 'q_primer',
    type: 'single',
    title: '¿Cuánto tardas en fumar el primer cigarrillo tras despertar?',
    subtitle: 'Es uno de los mejores indicadores del grado de dependencia física.',
    options: [
      { id: '5min', label: 'Menos de 5 minutos' },
      { id: '30min', label: 'Entre 6 y 30 minutos' },
      { id: '60min', label: 'Entre 31 y 60 minutos' },
      { id: 'mas60', label: 'Más de 60 minutos' },
    ],
  },
  {
    id: 'info_dependencia',
    type: 'info',
    title: 'Cada persona tiene su propio patrón',
    body: 'El tiempo hasta el primer cigarrillo y la cantidad diaria nos indican si tu mayor reto está en la dependencia física o en los hábitos adquiridos. Tu plan se adaptará a lo que tú necesitas.',
  },
  {
    id: 'q_gatillos',
    type: 'multi',
    title: '¿En qué momentos te cuesta más no fumar?',
    subtitle: 'Elige todos los que encajen contigo.',
    minSelected: 1,
    options: Object.entries(TRIGGERS).map(([id, t]) => ({ id, label: t.label })),
  },
  {
    id: 'q_dificil',
    type: 'single',
    title: 'De todos ellos, ¿cuál es el más difícil de evitar?',
    options: Object.entries(TRIGGERS).map(([id, t]) => ({ id, label: t.label })),
  },
  {
    id: 'info_gatillos',
    type: 'info',
    title: 'Saberlo es el 50 % del camino',
    body: 'Muchos cigarrillos se fuman por pura inercia. Cuando identificas con claridad en qué situaciones fumas sin pensar, podemos diseñar sustitutos concretos para esos momentos.',
  },
  {
    id: 'q_intentos',
    type: 'single',
    title: '¿Cuántas veces has intentado dejarlo antes?',
    options: [
      { id: '0', label: 'Es mi primera vez' },
      { id: '1', label: '1 vez' },
      { id: '2a3', label: '2 o 3 veces' },
      { id: '4mas', label: '4 veces o más' },
    ],
  },
  {
    id: 'q_preocupacion',
    type: 'single',
    title: '¿Qué es lo que más te preocupa de dejarlo?',
    options: [
      { id: 'ansiedad', label: 'La ansiedad y el estrés' },
      { id: 'peso', label: 'Ganar peso' },
      { id: 'social', label: 'Perder momentos con amigos o compañeros' },
      { id: 'recaer', label: 'No ser capaz y volver a recaer' },
      { id: 'vacio', label: 'Sentir un vacío o echarlo de menos' },
    ],
  },
  {
    id: 'q_motivos',
    type: 'multi',
    title: '¿Cuáles son tus principales motivos para dejar de fumar?',
    subtitle: 'Tus razones serán el ancla cuando las ganas aprieten.',
    minSelected: 1,
    options: [
      { id: 'salud', label: 'Mejorar mi salud y respirar mejor' },
      { id: 'dinero', label: 'Ahorrar dinero' },
      { id: 'familia', label: 'Estar bien para mi familia o dar ejemplo' },
      { id: 'libertad', label: 'No depender de un paquete para vivir mi día' },
      { id: 'energia', label: 'Tener más energía y mejor aspecto' },
    ],
  },
  {
    id: 'q_objetivo',
    type: 'single',
    title: '¿Qué ritmo encaja mejor contigo?',
    subtitle: 'Elige con honestidad. Las dos formas funcionan si se hacen con método.',
    options: [
      { id: 'parar', label: 'Fijar una fecha de corte y prepararme para ese día' },
      { id: 'gradual', label: 'Reducir poco a poco hasta llegar a cero' },
      { id: 'reducir', label: 'Bajar mi consumo a la mitad primero y luego decidir' },
    ],
  },
  {
    id: 'q_edad',
    type: 'single',
    title: '¿Cuál es tu rango de edad?',
    subtitle: 'Nos ayuda a comparar tus estimaciones con datos de personas en tu misma etapa.',
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
    durationMs: 4000,
  },
];

// ============================================================
// 2. PROGRAMA ALCOHOL (Educativo · Triaje AUDIT-C · Seguridad)
// ============================================================

export const ALCOHOL_STEPS = [
  {
    id: 'q_alc_frecuencia',
    type: 'single',
    title: '¿Con qué frecuencia consumes bebidas alcohólicas?',
    subtitle: 'Una estimación de tu ritmo habitual en los últimos meses.',
    options: [
      { id: 'nunca', label: '1 vez al mes o menos' },
      { id: 'mensual', label: '2 a 4 veces al mes' },
      { id: 'semanal', label: '2 a 3 veces por semana' },
      { id: 'diario', label: '4 o más veces por semana' },
    ],
  },
  {
    id: 'q_alc_cantidad',
    type: 'single',
    title: 'En un día normal en que bebes, ¿cuántas consumiciones tomas?',
    subtitle: '1 consumición = una cerveza, una copa de vino o un combinado suave.',
    options: [
      { id: '1-2', label: '1 o 2 consumiciones' },
      { id: '3-4', label: '3 o 4 consumiciones' },
      { id: '5-6', label: '5 o 6 consumiciones' },
      { id: '7-9', label: '7 a 9 consumiciones' },
      { id: '10mas', label: '10 o más consumiciones' },
    ],
  },
  {
    id: 'q_alc_atracones',
    type: 'single',
    title: '¿Con qué frecuencia tomas 6 o más bebidas en una sola ocasión?',
    options: [
      { id: 'nunca', label: 'Nunca' },
      { id: 'ocasional', label: 'Menos de una vez al mes' },
      { id: 'mensual', label: 'Mensualmente' },
      { id: 'semanal', label: 'Semanalmente o casi a diario' },
    ],
  },
  {
    id: 'q_alc_gasto',
    type: 'number',
    title: '¿Cuánto gastas aproximadamente en alcohol al mes?',
    subtitle: 'Incluye compras en supermercados, bares, salidas y restaurantes.',
    unit: 'currency',
    min: 0,
    max: 2000,
    default: 80,
  },
  {
    id: 'q_alc_gatillos',
    type: 'multi',
    title: '¿En qué situaciones sientes más ganas de beber?',
    subtitle: 'Elige todas las que formen parte de tu rutina.',
    minSelected: 1,
    options: [
      { id: 'desconexion', label: 'Al terminar el trabajo o para desconectar' },
      { id: 'social', label: 'Con amigos, fiestas o comidas de fin de semana' },
      { id: 'estres', label: 'Cuando siento estrés, agobio o problemas' },
      { id: 'aburrimiento', label: 'Por aburrimiento o soledad en casa' },
      { id: 'comidas', label: 'Acompañando siempre la cena o comida' },
    ],
  },
  {
    id: 'q_alc_seguridad',
    type: 'single',
    title: 'Evaluación de seguridad previa',
    subtitle: '¿Has sentido temblores en las manos por la mañana, sudoración fría o necesidad imperiosa de beber al despertar?',
    options: [
      { id: 'no', label: 'No, nunca he experimentado esos síntomas' },
      { id: 'si', label: 'Sí, los he sentido en algunas ocasiones' },
    ],
  },
  {
    id: 'q_alc_objetivo',
    type: 'single',
    title: '¿Cuál es tu meta con este programa?',
    options: [
      { id: 'dejarlo', label: 'Dejar de beber por completo' },
      { id: 'pausa', label: 'Hacer una pausa prolongada (ej. 30 o 90 días)' },
      { id: 'moderar', label: 'Aprender a moderar y reducir mis ocasiones de consumo' },
    ],
  },
  {
    id: 'q_alc_motivos',
    type: 'multi',
    title: '¿Qué beneficios buscas al transformar tu consumo?',
    minSelected: 1,
    options: [
      { id: 'claridad', label: 'Claridad mental y mejor energía por las mañanas' },
      { id: 'sueno', label: 'Dormir mejor y levantarme descansado' },
      { id: 'dinero', label: 'Ahorro económico significativo' },
      { id: 'control', label: 'Sentir que tengo el control de mis decisiones' },
      { id: 'relaciones', label: 'Mejorar mi presencia con mi familia y pareja' },
    ],
  },
  {
    id: 'analisis',
    type: 'analysis',
    title: 'Analizando tus respuestas',
    items: [
      'Evaluando perfil de consumo educativo',
      'Mapeando gatillos sociales y emocionales',
      'Revisando pautas de seguridad',
      'Diseñando tu plan de acompañamiento consciente',
    ],
    durationMs: 4000,
  },
];

// ============================================================
// 3. PROGRAMA AZÚCAR (Hábitos · Sin Dietas Extremas · Consciencia)
// ============================================================

export const AZUCAR_STEPS = [
  {
    id: 'q_az_tipo',
    type: 'single',
    title: '¿Dónde está tu mayor consumo de azúcar añadido?',
    options: [
      { id: 'bolleria', label: 'Dulces, galletas y bollería' },
      { id: 'refrescos', label: 'Refrescos, zumos envasados y bebidas energéticas' },
      { id: 'chocolate', label: 'Chocolate y golosinas' },
      { id: 'postres', label: 'Postre obligatorio tras la comida o cena' },
      { id: 'cafe', label: 'Azúcar añadido al café, té o infusiones' },
    ],
  },
  {
    id: 'q_az_frecuencia',
    type: 'number',
    title: '¿Cuántas veces al día tomas algo dulce o azucarado?',
    subtitle: 'Cuenta cafés con azúcar, refrescos, snacks o postres.',
    unit: 'al día',
    min: 1,
    max: 20,
    default: 3,
  },
  {
    id: 'q_az_momentos',
    type: 'multi',
    title: '¿En qué momentos del día suele aparecer más la necesidad de azúcar?',
    minSelected: 1,
    options: [
      { id: 'bajon', label: 'A media tarde con el bajón de energía' },
      { id: 'noche', label: 'Por la noche, viendo una serie o en el sofá' },
      { id: 'estres', label: 'En momentos de estrés, agobio o frustración' },
      { id: 'recompensa', label: 'Como premio o recompensa al terminar el día' },
      { id: 'aburrimiento', label: 'Por puro hábito o aburrimiento' },
    ],
  },
  {
    id: 'q_az_sensacion',
    type: 'single',
    title: '¿Cómo te sientes poco después de tomar mucho dulce?',
    options: [
      { id: 'cansancio', label: 'Con un bajón rápido de energía y pesadez' },
      { id: 'hambre', label: 'Con más ganas de seguir comiendo azúcar' },
      { id: 'culpa', label: 'Con culpa o frustración por haber comido de más' },
      { id: 'normal', label: 'Normal en el momento, pero me preocupa a largo plazo' },
    ],
  },
  {
    id: 'q_az_intentos',
    type: 'single',
    title: '¿Has intentado reducir el azúcar anteriormente?',
    options: [
      { id: 'primera', label: 'Es mi primera vez buscando un método' },
      { id: 'dietas', label: 'He probado dietas estrictas y he vuelto al mismo patrón' },
      { id: 'dias', label: 'Aguanto unos días y luego tengo un atracón' },
    ],
  },
  {
    id: 'q_az_objetivo',
    type: 'single',
    title: '¿Qué esperas lograr con este programa?',
    options: [
      { id: 'equilibrio', label: 'Equilibrio consciente sin dietas extremas ni culpa' },
      { id: 'energia', label: 'Energía estable durante todo el día sin bajones' },
      { id: 'desenganche', label: 'Desengancharme de la necesidad diaria de dulce' },
    ],
  },
  {
    id: 'analisis',
    type: 'analysis',
    title: 'Preparando tu guía de equilibrio',
    items: [
      'Identificando curvas de glucosa y energía diaria',
      'Mapeando patrones de hambre emocional',
      'Creando alternativas saludables sostenibles',
      'Configurando tu plan libre de restricciones extremas',
    ],
    durationMs: 4000,
  },
];

// ============================================================
// 4. PROGRAMA ANSIEDAD (Regulación Emocional · Psicoeducativo)
// ============================================================

export const ANSIEDAD_STEPS = [
  {
    id: 'q_ans_frecuencia',
    type: 'single',
    title: '¿Con qué frecuencia sientes que la tensión o la preocupación te sobrepasan?',
    options: [
      { id: 'diario', label: 'Casi todos los días' },
      { id: 'semanal', label: '2 o 3 veces por semana' },
      { id: 'puntual', label: 'Solo en situaciones específicas de alta presión' },
      { id: 'ocasional', label: 'Ocasionalmente, pero busco mejores herramientas' },
    ],
  },
  {
    id: 'q_ans_manifestaciones',
    type: 'multi',
    title: '¿Cómo notas la ansiedad o el estrés en tu cuerpo?',
    subtitle: 'Elige las sensaciones más frecuentes.',
    minSelected: 1,
    options: [
      { id: 'muscular', label: 'Tensión en hombros, mandíbula o cuello' },
      { id: 'pecho', label: 'Opresión en el pecho o respiración corta' },
      { id: 'cabeza', label: 'Pensamientos en bucle que no se apagan' },
      { id: 'estomago', label: 'Nudo o molestias en el estómago' },
      { id: 'inquietud', label: 'Inquietud constante y dificultad para parar' },
    ],
  },
  {
    id: 'q_ans_gatillos',
    type: 'multi',
    title: '¿Cuáles son tus mayores detonantes de tensión?',
    minSelected: 1,
    options: [
      { id: 'trabajo', label: 'Sobrecarga de trabajo, estudio o responsabilidades' },
      { id: 'futuro', label: 'Incertidumbre o anticipar problemas futuros' },
      { id: 'familia', label: 'Conflictos familiares o de pareja' },
      { id: 'exigencia', label: 'Autoexigencia y miedo a no llegar a todo' },
      { id: 'cansancio', label: 'Falta de descanso y saturación digital' },
    ],
  },
  {
    id: 'q_ans_recursos',
    type: 'multi',
    title: 'Cuando sientes mucha tensión, ¿qué sueles hacer hoy?',
    minSelected: 1,
    options: [
      { id: 'movil', label: 'Distraerme con el móvil, series o redes sociales' },
      { id: 'comida', label: 'Comer algo o picotear sin hambre' },
      { id: 'aislamiento', label: 'Encerrarme o evitar hablar con los demás' },
      { id: 'caminar', label: 'Salir a caminar o respirar un poco' },
      { id: 'aguantar', label: 'Aguantar en silencio hasta que pase' },
    ],
  },
  {
    id: 'q_ans_objetivo',
    type: 'single',
    title: '¿Qué herramienta necesitas desarrollar con más urgencia?',
    options: [
      { id: 'crisis', label: 'Técnicas inmediatas para calmarme en momentos agudos' },
      { id: 'bucle', label: 'Aprender a desactivar los pensamientos rumiativos' },
      { id: 'diario', label: 'Crear una rutina de calma y regulación diaria' },
    ],
  },
  {
    id: 'analisis',
    type: 'analysis',
    title: 'Diseñando tu brújula de calma',
    items: [
      'Mapeando respuestas somáticas y del sistema nervioso',
      'Identificando bucles de sobrepensamiento',
      'Seleccionando ejercicios de respiración y autorregulación',
      'Configurando tu plan de calma paso a paso',
    ],
    durationMs: 4000,
  },
];

// ============================================================
// 5. PROGRAMA SUEÑO (Higiene del Sueño · Rutina Nocturna)
// ============================================================

export const SUENO_STEPS = [
  {
    id: 'q_sue_horas',
    type: 'number',
    title: 'En una noche habitual, ¿cuántas horas sueles dormir?',
    subtitle: 'Un promedio de lo que duermes en los días laborables.',
    unit: 'horas',
    min: 3,
    max: 14,
    default: 6,
  },
  {
    id: 'q_sue_dificultad',
    type: 'single',
    title: '¿Cuál es tu mayor obstáculo para descansar bien?',
    options: [
      { id: 'conciliar', label: 'Tardo más de 30 o 45 minutos en quedarme dormido' },
      { id: 'despertares', label: 'Me despierto varias veces en medio de la noche' },
      { id: 'madrugar', label: 'Me despierto muy temprano y ya no puedo volver a dormir' },
      { id: 'cansancio', label: 'Duermo suficientes horas pero me levanto agotado' },
    ],
  },
  {
    id: 'q_sue_habitos',
    type: 'multi',
    title: '¿Cuáles de estos hábitos forman parte de tus noches?',
    minSelected: 1,
    options: [
      { id: 'pantallas', label: 'Móvil, tablet o tele en la cama antes de dormir' },
      { id: 'cafeina', label: 'Café, té o bebidas con cafeína por la tarde' },
      { id: 'cenas', label: 'Cenar tarde o comidas pesadas antes de acostarme' },
      { id: 'horarios', label: 'Horarios de acostarme muy distintos cada día' },
      { id: 'rumiacion', label: 'Pensar en los pendientes del día siguiente al apagar la luz' },
    ],
  },
  {
    id: 'q_sue_despertar',
    type: 'single',
    title: '¿Cómo te sientes en los primeros 20 minutos de la mañana?',
    options: [
      { id: 'agotado', label: 'Agotado, como si no hubiera dormido nada' },
      { id: 'aturdido', label: 'Aturdido, necesito cafeína para funcionar' },
      { id: 'descansado', label: 'Razonablemente descansado, pero con ganas de mejorar' },
    ],
  },
  {
    id: 'q_sue_objetivo',
    type: 'single',
    title: '¿Cuál es tu objetivo prioritario para tu descanso?',
    options: [
      { id: 'rutina', label: 'Crear un ritual nocturno que le avise a mi cuerpo que es hora de dormir' },
      { id: 'conciliacion', label: 'Reducir el tiempo que paso dando vueltas en la cama' },
      { id: 'regularidad', label: 'Tener un horario de sueño regular y despertar con energía' },
    ],
  },
  {
    id: 'analisis',
    type: 'analysis',
    title: 'Analizando tus noches',
    tone: 'dark',
    items: [
      'Calculando déficit de descanso y regularidad',
      'Identificando inhibidores de melatonina y descanso profundo',
      'Configurando tu rutina nocturna relajante',
      'Preparando tus pautas de higiene del sueño',
    ],
    durationMs: 4000,
  },
];

// Registro de pasos y preguntas por programa
export const PROGRAM_STEPS = {
  'sem-fumo': STEPS,
  alcohol: ALCOHOL_STEPS,
  azucar: AZUCAR_STEPS,
  ansiedad: ANSIEDAD_STEPS,
  sueno: SUENO_STEPS,
};

export const QUESTION_TYPES = new Set(['single', 'multi', 'number']);
export const QUESTIONS = STEPS.filter((s) => QUESTION_TYPES.has(s.type));

export const ALL_QUESTIONS = Object.values(PROGRAM_STEPS).flatMap((list) =>
  list.filter((s) => QUESTION_TYPES.has(s.type))
);

/** Valida y normaliza una respuesta de cualquier programa. Devuelve { ok, value } o { ok:false, error }. */
export function validateAnswer(questionId, value) {
  const q = ALL_QUESTIONS.find((s) => s.id === questionId);
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
    const exclusive = ids.filter((id) => q.options.find((o) => o.id === id)?.exclusive);
    if (exclusive.length && ids.length > 1) return { ok: false, error: 'Selección no válida.' };
    return { ok: true, value: ids };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < q.min || n > q.max) {
    return { ok: false, error: `Introduce un valor entre ${q.min} y ${q.max}.` };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** Comprueba qué preguntas faltan por responder en un programa dado (por defecto 'sem-fumo'). */
export function missingAnswers(answers, program = 'sem-fumo') {
  const stepList = PROGRAM_STEPS[program] || STEPS;
  const questions = stepList.filter((s) => QUESTION_TYPES.has(s.type));
  return questions.filter((q) => answers[q.id] === undefined).map((q) => q.id);
}

/** Versión pública del cuestionario para un programa: sin puntuaciones internas. */
export function publicQuiz(program = 'sem-fumo') {
  const stepList = PROGRAM_STEPS[program] || STEPS;
  return {
    program,
    version: QUIZ_VERSION,
    steps: stepList.map((s) => ({
      ...s,
      options: s.options?.map(({ id, label, exclusive }) => ({ id, label, ...(exclusive ? { exclusive } : {}) })),
    })),
  };
}
