// Definición de cuestionarios por programa.
// El servidor la usa para validar respuestas y calcular resultados;
// el cliente recibe una copia sin puntuaciones internas.
// Si cambias preguntas u opciones, incrementa QUIZ_VERSION.

export const QUIZ_VERSION = 3;

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

// Estructura del embudo (v3): una pregunta por pantalla, apertura con radar, pantalla informativa
// personalizada, análisis con micro-compromisos y e-mail antes del resultado. Ver docs/QUIZ_REFERENCIA.md.
// layout: 'hero' (apertura), 'cards' (tarjetas con icono), 'pair' (Sí/No grandes). Sin layout: lista.
export const STEPS = [
  {
    id: 'q_diario',
    type: 'single',
    layout: 'hero',
    eyebrow: 'Test gratuito · 3 minutos',
    title: 'Descubre qué sostiene tu hábito de fumar',
    lead: 'Tu hábito tiene seis caras. Este test te muestra cuál pesa más en ti y cómo trabajarla.',
    question: '¿Fumas o vapeas a diario?',
    options: YES_NO,
  },
  {
    id: 'q_genero',
    type: 'single',
    layout: 'cards',
    title: '¿Cómo te identificas?',
    options: [
      { id: 'hombre', label: 'Hombre', icon: 'male' },
      { id: 'mujer', label: 'Mujer', icon: 'female' },
      { id: 'otro', label: 'Prefiero no decirlo', icon: 'dot' },
    ],
  },
  {
    id: 'q_edad',
    type: 'single',
    title: '¿Qué edad tienes?',
    options: [
      { id: '18-24', label: '18–24' },
      { id: '25-34', label: '25–34' },
      { id: '35-44', label: '35–44' },
      { id: '45-54', label: '45–54' },
      { id: '55-64', label: '55–64' },
      { id: '65+', label: '65 o más' },
    ],
  },
  {
    id: 'q_medico',
    type: 'single',
    layout: 'pair',
    title: '¿Algún profesional de la salud te ha aconsejado dejarlo?',
    subtitle: 'Alento se basa en técnicas de cambio de hábito que se usan en programas para dejar de fumar.',
    options: YES_NO,
  },
  {
    id: 'q_producto',
    type: 'single',
    title: '¿Qué consumes principalmente?',
    options: [
      { id: 'cigarrillos', label: 'Cigarrillos de cajetilla' },
      { id: 'liar', label: 'Tabaco de liar' },
      { id: 'vapeador', label: 'Vapeador con nicotina' },
      { id: 'calentado', label: 'Tabaco calentado (tipo IQOS)' },
      { id: 'puros', label: 'Puros o pipa' },
      { id: 'shisha', label: 'Cachimba o shisha' },
      { id: 'snus', label: 'Bolsas de nicotina o snus' },
    ],
  },
  {
    id: 'q_anios',
    type: 'single',
    title: '¿Cuánto tiempo llevas fumando con regularidad?',
    options: [
      { id: 'menos1', label: 'Menos de 1 año' },
      { id: '1a5', label: 'Entre 1 y 5 años' },
      { id: '6a10', label: 'Entre 6 y 10 años' },
      { id: '11a20', label: 'Entre 11 y 20 años' },
      { id: 'mas20', label: 'Más de 20 años' },
    ],
  },
  {
    id: 'q_cantidad',
    type: 'single',
    title: 'En un día normal, ¿cuántas veces fumas o vapeas?',
    subtitle: 'Cuenta cada cigarrillo o cada sesión de vapeo.',
    // n: valor que usa el cálculo de resultados (cigarrillos al día).
    options: [
      { id: '1a2', label: '1–2', n: 2 },
      { id: '3a5', label: '3–5', n: 4 },
      { id: '6a10', label: '6–10', n: 8 },
      { id: '11a20', label: '11–20', n: 15 },
      { id: '21mas', label: 'Más de 20', n: 25 },
    ],
  },
  {
    id: 'q_primer',
    type: 'single',
    title: 'Al despertar, ¿cuánto tardas en fumar el primero?',
    options: [
      { id: '5min', label: 'Menos de 5 minutos' },
      { id: '30min', label: 'Entre 6 y 30 minutos' },
      { id: '60min', label: 'Entre 31 y 60 minutos' },
      { id: 'mas60', label: 'Más de una hora' },
    ],
  },
  {
    id: 'q_enfermo',
    type: 'single',
    layout: 'pair',
    title: '¿Sigues fumando aunque estés enfermo o en cama?',
    options: YES_NO,
  },
  {
    id: 'q_prohibido',
    type: 'single',
    title: '¿Cómo te sientes en sitios donde no se puede fumar?',
    options: [
      { id: 'calma', label: 'Tranquilo, puedo esperar' },
      { id: 'incomodo', label: 'Algo incómodo, pero lo llevo bien' },
      { id: 'irritado', label: 'Irritable o distraído hasta que fumo' },
      { id: 'tension', label: 'Con mucha tensión: lo necesito de verdad' },
    ],
  },
  {
    id: 'q_sin24h',
    type: 'single',
    title: 'Si te quedaras 24 horas sin tabaco, ¿qué harías?',
    options: [
      { id: 'aguantar', label: 'Aguantaría sin más' },
      { id: 'cualquiera', label: 'Compraría lo primero que encontrara' },
      { id: 'pedir', label: 'Se lo pediría a alguien' },
      { id: 'sustituir', label: 'Café, comida o chicle para compensar' },
      { id: 'parches', label: 'Usaría parches o chicles de nicotina' },
      { id: 'lejos', label: 'Iría donde hiciera falta para conseguirlo' },
    ],
  },
  {
    id: 'q_patron',
    type: 'single',
    title: 'Tu consumo es, sobre todo…',
    options: [
      { id: 'programado', label: 'Programado: a horas y en sitios fijos' },
      { id: 'automatico', label: 'Automático: sin darme cuenta' },
      { id: 'mixto', label: 'Una mezcla de los dos' },
    ],
  },
  {
    id: 'q_gatillos',
    type: 'multi',
    title: '¿Qué te lleva a encender un cigarrillo?',
    subtitle: 'Elige todos los que encajen contigo.',
    minSelected: 1,
    options: Object.entries(TRIGGERS).map(([id, t]) => ({ id, label: t.label })),
  },
  {
    id: 'q_preocupacion',
    type: 'single',
    title: '¿Qué es lo que más miedo te da de dejarlo?',
    options: [
      { id: 'peso', label: 'Engordar o comer más' },
      { id: 'ansiedad', label: 'Sentir más estrés o ansiedad', group: 'emocional' },
      { id: 'social', label: 'Perder momentos con otras personas', group: 'social' },
      { id: 'vacio', label: 'Sentir un vacío o aburrirme', group: 'emocional' },
      { id: 'foco', label: 'No poder relajarme ni concentrarme', group: 'concentracion' },
    ],
  },
  {
    id: 'q_secreto',
    type: 'single',
    title: 'Si nadie supiera que fumas, ¿te costaría más o menos dejarlo?',
    options: [
      { id: 'facil', label: 'Me costaría menos' },
      { id: 'dificil', label: 'Me costaría más' },
      { id: 'igual', label: 'Daría igual' },
    ],
  },
  {
    id: 'q_amigo',
    type: 'single',
    title: 'Si tu amigo fumador más cercano lo dejara, ¿te ayudaría a ti?',
    options: [
      { id: 'si', label: 'Sí, mucho' },
      { id: 'no', label: 'No' },
      { id: 'igual', label: 'No cambiaría nada' },
    ],
  },
  {
    id: 'q_disfrute',
    type: 'multi',
    title: '¿Qué es lo que más disfrutas del momento de fumar?',
    subtitle: 'Elige todo lo que te pase.',
    minSelected: 1,
    options: [
      { id: 'gesto', label: 'El gesto de llevarlo a la boca' },
      { id: 'sabor', label: 'El sabor o la sensación en la garganta' },
      { id: 'inhalar', label: 'Inhalar y soltar el aire' },
      { id: 'pausa', label: 'La pausa: un momento para mí' },
      { id: 'social', label: 'Compartirlo con otras personas' },
      { id: 'foco', label: 'Me ayuda a concentrarme' },
    ],
  },
  {
    id: 'info_disfrute',
    type: 'info',
    personalizedBy: 'q_disfrute',
    image: '/assets/images/IMG_012_SMALL_WINS.jpg', // shortcut: foto provisional, sustituir por la imagen generada del quiz
    title: 'Lo que disfrutas tiene explicación',
    body: 'Cada cigarrillo te da algo concreto. Cuando sabes qué es, puedes conseguirlo de otra forma, sin la nicotina.',
    // Un párrafo por cada opción elegida (máximo dos), en el orden de la pregunta.
    variants: {
      gesto: 'El gesto de la mano a la boca es una rutina que tu cuerpo repite cientos de veces al mes. No necesitas eliminarlo de golpe: lo vas a sustituir por otro gesto que ocupe su lugar.',
      sabor: 'Esa sensación intensa en la garganta gusta porque la nicotina llega al cerebro en segundos. Es normal echarla de menos al principio; tu plan la reduce poco a poco para que el cerebro deje de buscarla.',
      inhalar: 'Inhalar hondo y soltar el aire despacio relaja de verdad, pero no por el humo: es la respiración. Vas a aprender a hacer lo mismo sin cigarrillo y con el mismo alivio.',
      pausa: 'Lo que buscas en realidad es la pausa. El cigarrillo solo es la excusa para parar. Tu plan te da pausas igual de buenas, sin tener que salir a fumar.',
      social: 'Fumar con otros crea complicidad. Esa conexión no depende del tabaco: vas a practicar cómo mantener esos momentos aunque el resto siga fumando.',
      foco: 'La sensación de concentración aparece porque calmas la falta de nicotina, no porque fumar te haga pensar mejor. Cuando baja la dependencia, la concentración vuelve sola.',
    },
  },
  {
    id: 'q_metodos',
    type: 'multi',
    title: '¿Qué has probado ya para fumar menos o dejarlo?',
    subtitle: 'Elige todo lo que hayas intentado.',
    minSelected: 1,
    options: [
      { id: 'nada', label: 'Nada todavía', exclusive: true },
      { id: 'golpe', label: 'Dejarlo de golpe' },
      { id: 'parches', label: 'Parches, chicles o pastillas' },
      { id: 'medicacion', label: 'Medicación' },
      { id: 'terapia', label: 'Terapia o coaching' },
      { id: 'hipnosis', label: 'Hipnosis' },
      { id: 'apps', label: 'Otras apps o programas' },
    ],
  },
  {
    id: 'q_objetivo',
    type: 'single',
    title: '¿Qué quieres conseguir ahora?',
    options: [
      { id: 'parar', label: 'Dejarlo por completo, con una fecha' },
      { id: 'gradual', label: 'Ir reduciendo hasta llegar a cero' },
      { id: 'reducir', label: 'Fumar bastante menos, de momento' },
    ],
  },
  {
    id: 'q_gasto',
    type: 'single',
    title: '¿Cuánto gastas más o menos al mes en tabaco o vapeo?',
    // weekly: gasto semanal que usa el cálculo (mitad del rango ÷ 4,33).
    options: [
      { id: '0a49', label: 'Menos de $50', weekly: 6 },
      { id: '50a149', label: '$50 – $149', weekly: 23 },
      { id: '150a299', label: '$150 – $299', weekly: 52 },
      { id: '300mas', label: 'Más de $300', weekly: 81 },
    ],
  },
  {
    id: 'q_ahorro',
    type: 'single',
    title: '¿Qué harías con el dinero que vas a ahorrar?',
    options: [
      { id: 'ahorrar', label: 'Ahorrarlo o invertirlo' },
      { id: 'viajar', label: 'Viajes y escapadas' },
      { id: 'cuidarme', label: 'Cuidarme: salud, deporte, bienestar' },
      { id: 'familia', label: 'Darme un capricho con mi gente' },
      { id: 'deudas', label: 'Pagar deudas' },
    ],
  },
  {
    id: 'q_meta3m',
    type: 'single',
    title: '¿Cómo te gustaría estar dentro de 3 meses?',
    options: [
      { id: 'dormir', label: 'Durmiendo mejor y con la mente despejada' },
      { id: 'control', label: 'Con más confianza y más control' },
      { id: 'social', label: 'Disfrutando de planes sin depender del tabaco' },
      { id: 'animo', label: 'Más tranquilo y con mejor ánimo' },
      { id: 'foco', label: 'Más productivo y concentrado' },
    ],
  },
  {
    id: 'analisis',
    type: 'analysis',
    title: 'Analizando tus respuestas…',
    items: [
      'Perfil y contexto diario',
      'Patrones y desencadenantes',
      'Intentos anteriores y obstáculos',
      'Objetivo y plan personalizado',
    ],
    // Micro-compromisos: la barra se detiene hasta que la persona responde.
    popups: [
      { at: 0.3, question: '¿Estás listo para tomar el control a partir de hoy?' },
      { at: 0.55, question: '¿Te vendrían bien trucos rápidos para los antojos?' },
      { at: 0.8, question: '¿Quieres un plan claro, paso a paso?' },
    ],
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
  const stepList = PROGRAM_STEPS[program] || STEPS;
  return {
    program,
    version: QUIZ_VERSION,
    steps: stepList.map((s) => ({
      ...s,
      options: s.options?.map(({ id, label, exclusive, icon }) => ({ id, label, ...(exclusive ? { exclusive } : {}), ...(icon ? { icon } : {}) })),
    })),
  };
}
