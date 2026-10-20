// Companheiro del programa Azúcar. Equilibrio y hábitos, sin contar calorías, sin dietas extremas
// y sin culpa. Revisar editorialmente antes de publicar.
import { EMERGENCY, achievement as A, glideTarget, optionLabel, round1, sum } from './_shared.js';

const TRIGGERS = [
  { id: 'bajon', label: 'Bajón de energía' },
  { id: 'estres', label: 'Estrés o agobio' },
  { id: 'aburrimiento', label: 'Aburrimiento' },
  { id: 'recompensa', label: 'Como premio' },
  { id: 'cansancio', label: 'Cansancio o sueño' },
  { id: 'tristeza', label: 'Tristeza o desánimo' },
  { id: 'social', label: 'Plan social o comida en grupo' },
  { id: 'costumbre', label: 'Costumbre' },
  { id: 'hambre', label: 'Hambre de verdad' },
  { id: 'otro', label: 'Otro motivo' },
];

const LOG_FIELDS = [
  { id: 'porciones', label: 'Porciones dulces', type: 'number', min: 0.5, max: 20, step: 0.5, required: true, unit: 'porciones',
    help: 'Una porción es una unidad razonable: un café con azúcar, una galleta, un trozo de tarta, un refresco pequeño. No hace falta pesar nada ni contar calorías.' },
  { id: 'tipo', label: '¿Qué fue?', type: 'select', options: [
    { id: 'bolleria', label: 'Dulces, galletas o bollería' }, { id: 'refrescos', label: 'Refresco, zumo envasado o bebida energética' },
    { id: 'chocolate', label: 'Chocolate o golosinas' }, { id: 'postre', label: 'Postre' },
    { id: 'cafe', label: 'Azúcar en café, té o infusión' }, { id: 'otro', label: 'Otro' },
  ] },
  { id: 'hora', label: 'Hora aproximada', type: 'time' },
  { id: 'gatillo', label: '¿Qué lo motivó?', type: 'select', options: TRIGGERS },
  { id: 'hambre', label: '¿Cuánta hambre física tenías?', type: 'scale', min: 1, max: 5, help: '1 = ninguna, 5 = mucha. Ayuda a distinguir hambre de estómago de hambre emocional.' },
  { id: 'nota', label: 'Nota (opcional)', type: 'text', maxLength: 300, placeholder: 'Cómo te sentiste antes o después' },
];

const STRATEGIES = [
  { id: 'equilibrio', name: 'Equilibrio sin culpa', defaultTarget: 3,
    description: 'Te marcas un máximo razonable de porciones dulces al día. Nada está prohibido: se trata de elegir con atención.' },
  { id: 'reducir', name: 'Reducir poco a poco', defaultTarget: 2, usesStart: true,
    description: 'Bajas las porciones dulces de forma gradual, semana a semana, hasta el máximo que elijas.' },
  { id: 'sin-anadido', name: 'Sin azúcar añadido', fixedTarget: 0,
    description: 'Un experimento por días sin azúcar añadido para ver cómo te sientes. No es una dieta ni una promesa de resultados: si no te sienta bien, puedes cambiar de camino.' },
];

const WEEKLY_TASKS = [
  { week: 1, title: 'Observa tus dulces', detail: 'Registra cada vez que tomes algo dulce, sin cambiar nada todavía. Anota la hora y qué sentías.' },
  { week: 2, title: 'Aprende a leer etiquetas', detail: 'Mira la lista de ingredientes de tres productos que sueles comprar. El azúcar aparece con muchos nombres: jarabe, glucosa, dextrosa, miel…' },
  { week: 3, title: '¿Hambre de estómago o emocional?', detail: 'Antes de tomar algo dulce, pregúntate: ¿tengo hambre física o busco otra cosa (descanso, consuelo, premio)? Solo observa la respuesta.' },
  { week: 4, title: 'Comidas que te sostengan', detail: 'Intenta que tus comidas principales incluyan proteína y fibra (legumbres, huevos, verduras, cereales integrales). Suelen dar una energía más estable.' },
  { week: 5, title: 'Cambia una bebida', detail: 'Sustituye una bebida azucarada al día por agua, agua con gas o una infusión. Si te cuesta, hazlo en dos pasos.' },
  { week: 6, title: 'Rediseña tu entorno', detail: 'Deja lo dulce menos a la vista (en un armario, no en la mesa) y ten a mano alternativas que te gusten.' },
  { week: 7, title: 'Plan para el bajón de la tarde', detail: 'Elige tu plan para ese momento del día: una pausa, un paseo corto, agua, algo salado o fruta si te apetece. Pruébalo tres veces.' },
  { week: 8, title: 'Date permiso, con atención', detail: 'Elige un dulce que de verdad disfrutes y tómalo sentado, sin pantallas, saboreándolo. Permitirte sin culpa reduce los atracones.' },
  { week: 9, title: 'Revisa tu semana', detail: 'Mira tu gráfico: ¿cuándo aparecen más las porciones y qué te ayudó? Ajusta tu objetivo si lo necesitas, sin castigos.' },
  { week: 10, title: 'Quédate con lo que funciona', detail: 'Escribe tus tres estrategias más útiles y cómo mantenerlas. Si el tema te preocupa mucho, habla con un profesional de salud o nutrición.' },
];

export default {
  slug: 'azucar',
  strategies: STRATEGIES,
  setup: {
    intro: 'Elige cómo quieres empezar. Sin dietas extremas y sin contar calorías: lo importante es el equilibrio.',
    target: { label: 'Máximo de porciones dulces por día', help: 'Un objetivo realista para ti. Con «sin azúcar añadido» es cero.', unit: 'porciones', min: 0, max: 20, step: 0.5, default: 3 },
    start: { label: 'Cuántas porciones tomas hoy en un día normal', help: 'Punto de partida para bajar poco a poco.', unit: 'porciones', min: 1, max: 20, step: 0.5, default: 5 },
  },
  log: {
    kind: 'habito',
    cta: 'Registrar algo dulce',
    label: 'Registrar algo dulce',
    fields: LOG_FIELDS,
    summary(v) {
      const parts = [`${v.porciones} ${v.porciones === 1 ? 'porción' : 'porciones'}`];
      const t = optionLabel(LOG_FIELDS, 'tipo', v.tipo);
      if (t) parts.push(t.toLowerCase());
      if (v.hora) parts.push(v.hora);
      return parts.join(' · ');
    },
  },
  triggers: TRIGGERS,
  triggerField: 'gatillo',
  urge: {
    cta: 'Tengo antojo de dulce',
    title: 'Un antojo, sin drama',
    body: 'Los antojos suben y bajan. No son un fallo tuyo ni te obligan a nada. Elige qué te pasa y prueba una cosa pequeña antes de decidir.',
    intensity: { min: 1, max: 5, label: '¿Qué tan fuerte es el antojo?' },
    feelings: TRIGGERS,
    techniques: [
      { id: 'agua', label: 'Agua y esperar 10 minutos', detail: 'Bebe un vaso de agua despacio y deja pasar diez minutos. A veces es sed o cansancio.' },
      { id: 'hambre', label: 'Preguntarte por el hambre', detail: '¿Tienes hambre de estómago? Si es así, come algo con proteína o fibra, y si no, busca qué necesitas de verdad.' },
      { id: 'respiracion', label: 'Respirar con calma', detail: 'Dos minutos de respiración lenta para bajar la urgencia.', exerciseId: 'calma-4-6' },
      { id: 'moverte', label: 'Caminar 5 minutos', detail: 'Cambia de sitio y muévete un poco; el antojo suele perder fuerza.' },
      { id: 'permiso', label: 'Tomarlo con atención', detail: 'Si decides tomarlo, hazlo sentado, sin pantallas y saboreándolo. Es una elección, no un fallo.' },
    ],
    afterLabel: '¿Cómo está el antojo ahora?',
    resolvedLabel: 'Bajó o pasó',
    continuedLabel: 'Sigue ahí',
    supportText: 'Tomarlo también es válido. Lo que cuenta es que lo hayas notado y elegido.',
  },
  checkin: {
    label: 'Hoy cuidé mi equilibrio',
    doneLabel: 'Día en equilibrio registrado',
    value: 0,
    blockedMessage: 'Ese día ya tiene más porciones que tu objetivo.',
    blockedWhen: (day) => day.status === 'warn',
  },
  metric: {
    id: 'porciones', label: 'Porciones hoy', todayLabel: 'Porciones dulces de hoy', unit: 'porciones', unitSingular: 'porción',
    direction: 'max', aggregate: 'sum', format: 'decimal1', weekLabel: 'Porciones dulces por día',
    value: (v) => (Number.isFinite(Number(v?.porciones)) ? Number(v.porciones) : null),
    targetFor(day, goal) {
      const s = STRATEGIES.find((x) => x.id === goal.strategy);
      if (s?.fixedTarget != null) return s.fixedTarget;
      return goal.strategy === 'reducir' ? glideTarget(day, goal, 6) : goal.target;
    },
  },
  streakLabel: (goal) => (goal.strategy === 'sin-anadido' ? 'días seguidos sin azúcar añadido' : 'días seguidos dentro de tu objetivo'),
  baseline(a) {
    const perDay = Number(a.q_az_frecuencia);
    if (!Number.isFinite(perDay) || perDay <= 0) return null;
    return { perDay, start: perDay };
  },
  totals(c) {
    const tracked = c.period.filter((d) => d.tracked);
    const within = tracked.filter((d) => d.status === 'ok');
    const cards = [
      { id: 'dias-objetivo', label: 'Días dentro de tu objetivo', value: within.length, unit: 'días', sub: `de ${tracked.length} ${tracked.length === 1 ? 'día registrado' : 'días registrados'}`, estimate: false },
      { id: 'porciones-periodo', label: 'Porciones registradas', value: round1(sum(tracked.map((d) => d.value ?? 0))), unit: 'porciones', sub: c.periodLabel, estimate: false },
      { id: 'antojos-superados', label: 'Antojos atravesados', value: c.urgesResolved, unit: '', sub: `de ${c.urges} registrados`, estimate: false },
    ];
    if (c.baseline?.perDay > 0 && tracked.length) {
      cards.push({ id: 'porciones-menos', label: 'Porciones menos', value: round1(sum(tracked.map((d) => Math.max(0, c.baseline.perDay - (d.value ?? 0))))), unit: 'porciones', estimate: true,
        sub: 'Estimación: frente a lo que indicaste en el cuestionario, solo en los días registrados.' });
    }
    return cards;
  },
  insights(c) {
    const out = [];
    const slots = {};
    for (const e of c.entries) {
      if (!e.value?.hora) continue;
      const h = Number(e.value.hora.slice(0, 2));
      const slot = h < 12 ? 'por la mañana' : h < 17 ? 'a mediodía y por la tarde' : h < 21 ? 'a última hora de la tarde' : 'por la noche';
      slots[slot] = (slots[slot] ?? 0) + 1;
    }
    const top = Object.entries(slots).sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 3) out.push(`Sueles tomar dulce ${top[0]} (${top[1]} registros). Es un buen momento para preparar una alternativa.`);
    const hungry = c.entries.filter((e) => Number(e.value?.hambre) >= 1);
    if (hungry.length >= 5) {
      const low = hungry.filter((e) => Number(e.value.hambre) <= 2).length;
      out.push(`En ${low} de ${hungry.length} registros tenías poca hambre física: muchas veces el dulce busca otra cosa (descanso, premio, consuelo).`);
    }
    return out;
  },
  weeklyTasks: WEEKLY_TASKS,
  recommendedExercise: () => 'calma-4-6',
  defaultReminderTime: '17:30',
  ui: {
    tagline: 'Equilibrio con el azúcar, sin dietas extremas.',
    emptyToday: 'Todavía no has registrado nada hoy. Si cuidaste tu equilibrio, márcalo con un toque.',
    logSuccess: 'Registrado. Sin culpa: es información para ti.',
  },
  safety: {
    text: 'Alento es un programa educativo: no es una dieta, no cuenta calorías ni sustituye a un profesional. Si tienes diabetes u otra condición de salud, o notas que comes de forma descontrolada, con mucha culpa o atracones frecuentes, habla con un profesional de salud o de nutrición.',
    resources: [
      { label: 'Tu médico o centro de salud', detail: 'Pueden orientarte y derivarte a un profesional de nutrición o salud mental si lo necesitas.' },
      EMERGENCY,
    ],
  },
  achievements: [
    A('azu', 'plan-listo', 'Mi plan está listo', 'Elegiste tu camino y tu objetivo.', 'sprout', (f) => f.hasGoal),
    A('azu', 'primer-registro', 'Primer registro', 'Anotaste tu primer dulce o tu primer día en equilibrio.', 'pen', (f) => f.logs + f.checkins >= 1),
    A('azu', 'semana-seguimiento', 'Una semana de seguimiento', 'Registraste 7 días distintos.', 'calendar', (f) => f.trackedDays >= 7),
    A('azu', 'primer-dia-equilibrio', 'Primer día en equilibrio', 'Un día dentro de tu objetivo.', 'sun', (f) => f.okDays >= 1),
    A('azu', 'antojo-atravesado', 'Antojo atravesado', 'Notaste un antojo y lo atravesaste con una técnica.', 'wave', (f) => f.urgesResolved >= 1),
    A('azu', 'racha-3', 'Tres días en equilibrio', 'Tres días seguidos dentro de tu objetivo.', 'leaf', (f) => f.bestStreak >= 3),
    A('azu', 'racha-7', 'Una semana en equilibrio', 'Siete días seguidos dentro de tu objetivo.', 'mountain', (f) => f.bestStreak >= 7),
    A('azu', 'respiracion-5', 'Cinco respiraciones', 'Completaste 5 ejercicios de respiración.', 'wind', (f) => f.breathing >= 5),
    A('azu', 'primera-leccion', 'Primera lección', 'Completaste tu primera lección del programa.', 'book', (f) => f.lessons >= 1),
    A('azu', 'un-mes', 'Un mes de camino', 'Llevas 30 días con tu plan.', 'mountain', (f) => f.daysSinceStart >= 30),
  ],
};
