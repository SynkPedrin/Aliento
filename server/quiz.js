// Definición de cuestionarios por programa.
// El servidor la usa para validar respuestas y calcular resultados;
// el cliente recibe una copia sin puntuaciones internas.
// Si cambias preguntas u opciones, incrementa QUIZ_VERSION.

import { INSERTS as FUNNEL_INSERTS } from './content/funnels/sem-fumo-es.js';

export const QUIZ_VERSION = 4;

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

const YES_NO = [{ id: 'si', label: 'Sí' }, { id: 'no', label: 'No' }];
const opts = (...list) => list.map(([id, label, extra]) => ({ id, label, ...extra }));
const byGender = (male, female) => ({ image: `/assets/quiz/${male}`, imageByGender: { mujer: `/assets/quiz/${female}` } });

// Embudo Sem Fumo (ES): mismas preguntas, textos y orden que el embudo original del propietario.
// Las pantallas intermedias se personalizan por el ORDEN de la opción elegida (1, 2, 3…), como en el original.
// Textos largos en server/content/funnels/sem-fumo-es.js.
export const STEPS = [
  {
    id: 'q_diario', type: 'single', layout: 'hero',
    subtitle: 'Empieza el análisis de tus hábitos de tabaquismo',
    title: 'El 82 % de los usuarios lo dejan sin ningún', titleMark: 'estrés',
    question: '¿Fumas todos los días?',
    options: YES_NO,
  },
  { id: 'q_genero', type: 'single', layout: 'cards', title: 'Tu género', options: opts(['hombre', 'Hombre', { icon: 'male' }], ['mujer', 'Mujer', { icon: 'female' }]) },
  { id: 'q_edad', type: 'single', title: '¿Cuántos años tienes?', options: opts(['18-24', '18–24'], ['25-34', '25–34'], ['35-44', '35–44'], ['45-54', '45–54'], ['55-64', '55–64'], ['65+', '65+']) },
  { id: 'q_medico', type: 'single', title: '¿Te lo ha recomendado un médico?', subtitle: 'Cada vez son más los médicos que recomiendan Alento.', options: YES_NO },
  { id: 'info_notalone', type: 'notalone', tone: 'dark' },
  {
    id: 'q_producto', type: 'single', title: '¿Cuál es tu forma principal de nicotina?',
    options: opts(['cigarrillos', 'Cigarrillos'], ['vapeador', 'Cigarrillo electrónico / Vape'], ['calentado', 'Tabaco calentado (p. ej., IQOS)'], ['puros', 'Puros'], ['shisha', 'Shisha / Narguile'], ['snus', 'Sobres / Snus']),
  },
  { id: 'q_anios', type: 'single', title: '¿Cuántos años llevas fumando de forma habitual?', options: opts(['menos1', '<1 año'], ['1a2', '1-2 años'], ['3a5', '3-5 años'], ['6a9', 'De 6 a 9 años'], ['mas10', 'Más de 10 años']) },
  { id: 'info_duracion', type: 'info', tone: 'dark', personalize: 'duration', ...byGender('male-smoking.webp', 'women-smoking.webp') },
  {
    id: 'q_cantidad', type: 'single', title: 'En un día normal, ¿cuántas veces fumas?',
    // n: cigarrillos al día que usa el cálculo de resultados.
    options: opts(['1a2', '1–2', { n: 2 }], ['3a5', '3–5', { n: 4 }], ['6a10', '6–10', { n: 8 }], ['11a20', '11–20', { n: 15 }], ['21mas', '21+', { n: 25 }]),
  },
  { id: 'q_primer', type: 'single', title: 'Cuando te levantas, ¿cuándo te tomas tu primera dosis de nicotina?', options: opts(['5min', 'En 5 minutos'], ['30min', 'De 5 a 30 minutos'], ['60min', '31–60 minutos'], ['mas60', 'Pasados 60 minutos']) },
  { id: 'q_enfermo', type: 'single', title: '¿Sigues consumiendo nicotina cuando te enfermas?', options: YES_NO },
  {
    id: 'q_prohibido', type: 'single', title: '¿Cómo te sientes normalmente en los sitios donde no se puede fumar?',
    options: opts(['calma', 'Con calma, no me importa esperar'], ['incomodo', 'Me siento un poco a disgusto, pero me las arreglo'], ['irritado', 'Me irrito o me desconcentro hasta que fumo'], ['tension', 'Siento mucha tensión o inquietud: de verdad lo necesito']),
  },
  {
    id: 'q_sin24h', type: 'single', title: 'Si no pudieras conseguir tu dosis habitual de nicotina durante 24 horas, ¿qué harías?',
    options: opts(['aguantar', 'Aguantarme y pasar sin ella'], ['cualquiera', 'Comprar cualquier marca o dispositivo disponible'], ['pedir', 'Pedirle a algún amigo'], ['sustituir', 'Tomar café, comer algo o mascar chicle en su lugar'], ['parches', 'Usar sustitutos de nicotina (parche, chicle o pastillas) ese día'], ['lejos', 'Ir más lejos para conseguirlo']),
  },
  {
    id: 'info_cerebro', type: 'info', tone: 'dark',
    html: 'Cuando entiendes tu <b>tipo de fumador</b>, dejas de culparte a ti mismo y empiezas a trabajar con tu mente, <b>no contra ella</b>.<br><br>Alento activa las conexiones neuronales que están detrás del ansia y la recompensa, reeducando la forma en que tu mente responde a los impulsos y recuperando el control a través de <b>acciones tranquilas y seguras</b>.',
  },
  { id: 'q_patron', type: 'single', title: '¿Tu consumo es sobre todo…', options: opts(['programado', 'Programado (horarios fijos)'], ['automatico', 'Automático (sin pensarlo)'], ['mixto', 'Mixto']) },
  {
    id: 'q_gatillos', type: 'multi', title: '¿Qué es lo que suele llevar a consumir nicotina?', minSelected: 1,
    options: opts(['estres', 'Estrés o ansiedad'], ['aburrimiento', 'Aburrimiento o bajón'], ['alcohol', 'Planes sociales o salidas nocturnas'], ['comida', 'Después de comer / con el café'], ['trabajo', 'Descanso del trabajo o de los estudios, o para concentrarte mejor']),
  },
  {
    id: 'q_preocupacion', type: 'single', title: '¿Qué es lo que más te daría miedo si dejaras de fumar?',
    options: opts(['peso', 'Engordar o comer más'], ['ansiedad', 'Sentir más estrés o ansiedad', { group: 'emocional' }], ['social', 'Perder momentos de convivencia o de conexión', { group: 'social' }], ['vacio', 'Sentir aburrimiento o vacío sin ello', { group: 'emocional' }], ['foco', 'No poder relajarte ni concentrarte', { group: 'concentracion' }]),
  },
  { id: 'q_secreto', type: 'single', title: 'Si nadie supiera que fumas, ¿te resultaría más fácil dejarlo?', options: opts(['facil', 'Más fácil'], ['dificil', 'Más difícil'], ['igual', 'Lo mismo']) },
  { id: 'q_amigo', type: 'single', title: 'Si tu amigo fumador más cercano deja de fumar, ¿aumentan tus posibilidades?', options: opts(['si', 'Sí'], ['no', 'No'], ['igual', 'Sin efecto']) },
  {
    id: 'q_disfrute', type: 'multi', title: '¿Qué es lo que más te gusta de eso?', minSelected: 1,
    options: opts(['gesto', 'El gesto de llevarse la mano a la boca'], ['sabor', 'Sabor o sensación en la garganta'], ['inhalar', 'La sensación al inhalar / exhalar'], ['pausa', 'Un descanso / una pausa'], ['social', 'Relaciones sociales'], ['foco', 'Mejor concentración']),
  },
  { id: 'info_amigo', type: 'info', tone: 'dark', personalize: 'friend', ...byGender('male-coffee.webp', 'women-coffee.webp') },
  {
    id: 'q_metodos', type: 'multi', title: '¿Qué has probado para reducir o dejar de fumar?', minSelected: 1,
    options: opts(['nada', 'De momento nada', { exclusive: true }], ['golpe', 'De golpe'], ['terapia', 'Coaching / terapia'], ['hipnosis', 'Hipnosis'], ['medicacion', 'Medicamentos'], ['programa', 'Rehabilitación / programa']),
  },
  { id: 'q_objetivo', type: 'single', title: '¿Cuál es tu objetivo ahora mismo?', options: opts(['parar', 'Dejarlo por completo'], ['reducir', 'Reducir el consumo'], ['gradual', 'Sin tabaco, se permite la nicotina (terapia de sustitución de nicotina)']) },
  {
    id: 'q_gasto', type: 'single', title: '¿Cuánto te gastas más o menos al mes en nicotina?',
    // annual: ahorro anual que muestra la pantalla siguiente; weekly = annual / 52 para el cálculo.
    options: opts(['0a49', '$0–49', { annual: 588, weekly: 11.31 }], ['50a149', '$50–149', { annual: 1788, weekly: 34.38 }], ['150a299', '$150–299', { annual: 3588, weekly: 69 }], ['300mas', '$300+', { annual: 4944, weekly: 95.08 }]),
  },
  { id: 'info_ahorro', type: 'savings', tone: 'dark', from: 'q_gasto', title: 'Con Alento podrías ahorrarte unos {amount} al año', body: 'En función de tu gasto mensual.' },
  {
    id: 'q_ahorro', type: 'single', title: '¿Qué harías con el dinero que ahorras?',
    options: opts(['ahorrar', 'Ahorra o invierte ese dinero'], ['viajar', 'Viajes o escapadas de fin de semana'], ['cuidarme', 'Gasto en salud o en el cuidado personal'], ['familia', 'Dale una sorpresa a tu familia o a tus seres queridos'], ['deudas', 'Pagar las deudas']),
  },
  {
    id: 'q_meta3m', type: 'single', title: '¿Dónde te gustaría estar dentro de tres meses?',
    options: opts(['dormir', 'Dormir mejor y tener la mente despejada'], ['control', 'Con más confianza y más control'], ['social', 'Más sociable sin necesidad de nicotina'], ['animo', 'Más feliz y con equilibrio emocional'], ['foco', 'Con más productividad y concentración']),
  },
  { id: 'info_metas', type: 'info', tone: 'dark', personalize: 'goal', ...byGender('man-breathes.webp', 'woman-breathes.webp') },
  {
    id: 'info_ciencia', type: 'science', tone: 'dark',
    title: 'Tus respuestas las revisarán unos expertos',
    subtitle: 'La ciencia que hay detrás de tu proceso personalizado para dejar de fumar',
    logos: [
      ['World Health Organization (WHO)', 'who'], ['Psychological Science', 'psychological-science'], ['WebMD', 'webmd'],
      ['Harvard Medical School', 'harvard'], ['National Institute of Mental Health', 'nih'], ['Journal of the American Medical Association (JAMA)', 'jama'],
    ],
  },
  {
    id: 'analisis', type: 'analysis', title: 'Analizando tus respuestas',
    items: ['Información básica y contexto diario', 'Patrones de uso y desencadenantes', 'Repercusiones e intentos anteriores', 'Objetivos y plan personalizado'],
    popups: [
      { at: 0.3, question: '¿Estás listo para tomar las riendas, a partir de hoy?' },
      { at: 0.55, question: '¿Quieres trucos rápidos para combatir los antojos?' },
      { at: 0.8, question: '¿Te apetece un plan claro y paso a paso?' },
    ],
    testimonial: { name: 'Laura M.', text: 'Hice la evaluación y dio en el clavo con mis hábitos. Gracias a los ejercicios diarios de Alento, pude controlar mejor los antojos y volví a disfrutar de mis mañanas.' },
    supportingText: 'Más de 17 000 usuarios han cambiado sus hábitos de forma significativa gracias a Alento.',
    durationMs: 9000,
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
  const texts = program === 'sem-fumo' ? {
    duration: { byForm: FUNNEL_INSERTS.durationByForm, fallback: FUNNEL_INSERTS.durationFallback },
    friend: { friend: FUNNEL_INSERTS.friend, pleasure: FUNNEL_INSERTS.pleasure },
    goal: { tried: FUNNEL_INSERTS.tried, goal: FUNNEL_INSERTS.goal, fallback: FUNNEL_INSERTS.triedFallback },
  } : null;
  const stepList = PROGRAM_STEPS[program] || STEPS;
  return {
    program,
    version: QUIZ_VERSION,
    steps: stepList.map((s) => ({
      ...s,
      ...(texts && s.personalize ? { texts: texts[s.personalize] } : {}),
      options: s.options?.map(({ id, label, exclusive, icon, annual }) => ({ id, label, ...(exclusive ? { exclusive } : {}), ...(icon ? { icon } : {}), ...(annual ? { annual } : {}) })),
    })),
  };
}
