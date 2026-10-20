// Companheiro del programa Sueño. Higiene del sueño y rutina nocturna: no diagnostica trastornos
// ni sustituye a un profesional. Revisar editorialmente antes de publicar.
import { EMERGENCY, achievement as A, mean, optionLabel, round1, round2, stdev, sum, toMinutes } from './_shared.js';

const TRIGGERS = [
  { id: 'mente', label: 'Mente acelerada' },
  { id: 'preocupacion', label: 'Preocupaciones o pendientes' },
  { id: 'ansiedad', label: 'Tensión o ansiedad' },
  { id: 'entorno', label: 'Calor, ruido o luz' },
  { id: 'pantallas', label: 'Pantallas hasta tarde' },
  { id: 'malestar', label: 'Malestar físico' },
  { id: 'madrugada', label: 'Me desperté de madrugada' },
  { id: 'otro', label: 'Otro motivo' },
];

const LOG_FIELDS = [
  { id: 'acostarse', label: '¿A qué hora te acostaste?', type: 'time', required: true, help: 'La hora a la que te metiste en la cama con intención de dormir.' },
  { id: 'despertar', label: '¿A qué hora te despertaste?', type: 'time', required: true, help: 'La hora a la que abriste los ojos por última vez.' },
  { id: 'calidad', label: '¿Cómo descansaste?', type: 'scale', min: 1, max: 5, required: true, help: '1 = muy mal, 5 = muy bien.' },
  { id: 'despertares', label: 'Despertares durante la noche', type: 'number', min: 0, max: 10, step: 1, integer: true, unit: 'veces' },
  { id: 'pantallas', label: 'Pantallas en la hora antes de dormir', type: 'select', options: [
    { id: 'no', label: 'No usé pantallas' }, { id: 'menos-30', label: 'Hasta 30 minutos' },
    { id: '30-60', label: 'Entre 30 y 60 minutos' }, { id: 'mas-60', label: 'Más de una hora' },
  ] },
  { id: 'cafeina', label: 'Cafeína ese día', type: 'select', options: [
    { id: 'no', label: 'Ninguna' }, { id: 'manana', label: 'Solo por la mañana' },
    { id: 'tarde', label: 'Hasta la tarde' }, { id: 'noche', label: 'También por la noche' },
  ] },
  { id: 'nota', label: 'Nota (opcional)', type: 'text', maxLength: 300, placeholder: 'Algo que influyó en tu noche' },
];

/** Horas dormidas entre acostarse y despertar (cruza la medianoche si hace falta). */
export function sleepHours(v) {
  const a = toMinutes(v?.acostarse);
  const b = toMinutes(v?.despertar);
  if (a == null || b == null) return null;
  return round2((((b - a) + 1440) % 1440) / 60);
}

/** Variación (desviación típica, en minutos) de la hora de acostarse; la noche empieza a las 18:00. */
export function bedtimeSpread(entries) {
  const mins = entries.map((e) => toMinutes(e.value?.acostarse)).filter((m) => m != null).map((m) => (m - 18 * 60 + 1440) % 1440);
  const s = stdev(mins);
  return s == null ? null : Math.round(s);
}

const STRATEGIES = [
  { id: 'rutina', name: 'Rutina nocturna', defaultTarget: 7.5,
    description: 'Creas un ritual breve y constante antes de dormir para que tu cuerpo entienda que es hora de descansar.' },
  { id: 'regularidad', name: 'Horario regular', defaultTarget: 7.5,
    description: 'Te levantas y te acuestas a horas parecidas cada día, también los fines de semana. La regularidad suele ayudar más que dormir mucho un día.' },
  { id: 'descanso', name: 'Más descanso', defaultTarget: 8,
    description: 'Ganas horas de sueño poco a poco, adelantando tu hora de acostarte en pasos pequeños.' },
];

const WEEKLY_TASKS = [
  { week: 1, title: 'Observa tus noches', detail: 'Cada mañana registra a qué hora te acostaste, cuándo despertaste y cómo descansaste. Sin cambiar nada todavía.' },
  { week: 2, title: 'Una hora fija para levantarte', detail: 'Elige una hora de despertar que puedas mantener todos los días, incluso el fin de semana (con una variación de una hora como máximo).' },
  { week: 3, title: 'Ritual de 20 minutos', detail: 'Prepara una rutina corta antes de acostarte: luz tenue, ducha tibia, estiramientos suaves o lectura tranquila. Repítela cada noche.' },
  { week: 4, title: 'Pantallas fuera antes de dormir', detail: 'Intenta dejar las pantallas 30 minutos antes de acostarte. Si no puedes, baja el brillo y evita contenido que te active.' },
  { week: 5, title: 'Revisa tu cafeína', detail: 'Observa cómo te afectan el café, el té y las bebidas energéticas, sobre todo por la tarde. Prueba a adelantar tu última toma y mira qué pasa.' },
  { week: 6, title: 'Tu dormitorio, un lugar para descansar', detail: 'Procura que esté oscuro, fresco y silencioso. Reserva la cama para dormir y evita trabajar en ella.' },
  { week: 7, title: 'Si no puedes dormir', detail: 'No mires el reloj. Si pasan unos 20 minutos despierto/a, levántate, ve a un sitio con luz tenue y haz algo tranquilo hasta sentir sueño.' },
  { week: 8, title: 'Luz y movimiento de día', detail: 'Busca luz natural por la mañana y mueve el cuerpo durante el día. Ayudan a que tu reloj interno marque mejor el día y la noche.' },
  { week: 9, title: 'Vacía la cabeza', detail: 'Antes de acostarte, anota en papel tus pendientes y preocupaciones y lo primero que harás mañana. Así no tienes que recordarlo en la cama.' },
  { week: 10, title: 'Consolida lo que funciona', detail: 'Mira tu gráfico y quédate con las tres costumbres que más te han ayudado. Si el mal sueño sigue semanas y afecta a tu día, consulta con un profesional.' },
];

export default {
  slug: 'sueno',
  strategies: STRATEGIES,
  setup: {
    intro: 'Pequeños cambios constantes mejoran el descanso. Alento no diagnostica trastornos del sueño: es una guía de hábitos.',
    target: { label: 'Horas de sueño que quieres lograr', help: 'Las necesidades cambian de una persona a otra. Muchos adultos descansan bien con 7 a 9 horas.', unit: 'horas', min: 5, max: 10, step: 0.5, default: 7.5 },
  },
  log: {
    kind: 'sueno',
    cta: 'Registrar mi noche',
    label: 'Registrar mi noche',
    fields: LOG_FIELDS,
    validate(v) {
      const h = sleepHours(v);
      if (h == null || h < 1 || h > 16) return { field: 'despertar', message: 'Revisa las horas: no parecen corresponder a una noche de sueño.' };
      return null;
    },
    summary(v) {
      const h = sleepHours(v);
      const parts = [`${Math.floor(h)} h ${String(Math.round((h % 1) * 60)).padStart(2, '0')} min`, `descanso ${v.calidad}/5`];
      if (v.despertares) parts.push(`${v.despertares} ${v.despertares === 1 ? 'despertar' : 'despertares'}`);
      return parts.join(' · ');
    },
  },
  triggers: TRIGGERS,
  triggerField: null,
  urge: {
    cta: 'No logro dormir',
    title: 'Una noche difícil',
    body: 'Cuanto más intentas dormir, más se aleja el sueño. No lo fuerces: cambia el foco y ayuda a tu cuerpo a bajar el ritmo. Elige qué te pasa y prueba una cosa.',
    intensity: { min: 1, max: 5, label: '¿Qué tan despierto/a te sientes?' },
    feelings: TRIGGERS,
    techniques: [
      { id: 'respiracion', label: 'Respiración para la noche', detail: 'Inhala 4 segundos, retén 7 y exhala 8. Si te mareas, respira con normalidad.', exerciseId: 'sueno-4-7-8' },
      { id: 'pendientes', label: 'Anotar los pendientes', detail: 'Escribe en papel lo que te ronda y lo primero que harás mañana. Después, déjalo ahí.' },
      { id: 'levantarte', label: 'Levantarte un rato', detail: 'Si llevas unos 20 minutos despierto/a, ve a un sitio con luz tenue y haz algo tranquilo hasta sentir sueño.' },
      { id: 'relajacion', label: 'Soltar los músculos', detail: 'Tensa y suelta cada grupo muscular, de los pies a la cara, sin prisa.' },
      { id: 'entorno', label: 'Ajustar el dormitorio', detail: 'Revisa luz, temperatura y ruido. Un poco más fresco y oscuro suele ayudar.' },
      { id: 'reloj', label: 'Dejar de mirar el reloj', detail: 'Gira el reloj o el móvil. Ver la hora aumenta la presión por dormir.' },
    ],
    afterLabel: '¿Cómo te sientes ahora?',
    resolvedLabel: 'Me relajé',
    continuedLabel: 'Sigo despierto/a',
    supportText: 'Una mala noche no arruina tu progreso. Mañana mantén tu hora de levantarte y sé amable contigo.',
  },
  checkin: {
    label: 'Noche registrada sin detalles',
    doneLabel: 'Noche anotada',
    value: null,
    status: 'none',
    blockedMessage: 'Ese día ya tiene una noche registrada con detalles.',
    blockedWhen: (day) => day.value != null,
  },
  metric: {
    id: 'horas', label: 'Horas dormidas', todayLabel: 'Horas dormidas anoche', unit: 'horas', unitSingular: 'hora',
    direction: 'min', aggregate: 'last', tolerance: 0.5, format: 'hours', weekLabel: 'Horas dormidas por noche',
    value: sleepHours,
    targetFor: (day, goal) => goal.target,
  },
  streakLabel: () => 'noches seguidas dentro de tu objetivo',
  baseline(a) {
    const h = Number(a.q_sue_horas);
    return Number.isFinite(h) && h > 0 ? { hours: h } : null;
  },
  totals(c) {
    const nights = c.period.filter((d) => d.value != null);
    const logs = c.entries;
    const quality = logs.map((e) => Number(e.value?.calidad)).filter((x) => Number.isFinite(x));
    const spread = bedtimeSpread(logs.slice(-14));
    const weekNights = c.week.filter((d) => d.value != null);
    const cards = [
      { id: 'horas-medias', label: 'Horas dormidas (media)', value: nights.length ? round2(mean(nights.map((d) => d.value))) : null, unit: 'horas', sub: c.periodLabel, estimate: false },
      { id: 'calidad-media', label: 'Descanso medio', value: quality.length ? round1(mean(quality)) : null, unit: 'de 5', sub: c.periodLabel, estimate: false },
      { id: 'noches', label: 'Noches registradas', value: nights.length, unit: 'noches', sub: c.periodLabel, estimate: false },
      { id: 'regularidad', label: 'Regularidad al acostarte', value: logs.length >= 3 ? spread : null, unit: 'min de variación', sub: 'Variación de tu hora de acostarte en tus últimos registros.', estimate: false },
    ];
    if (weekNights.length) {
      cards.push({ id: 'deuda-sueno', label: 'Deuda de sueño (7 días)', estimate: true, unit: 'horas',
        value: round1(sum(weekNights.map((d) => Math.max(0, d.target - d.value)))),
        sub: 'Estimación: horas que faltaron frente a tu objetivo en las noches registradas esta semana. No es un diagnóstico.' });
    }
    return cards;
  },
  insights(c) {
    const out = [];
    const logs = c.entries;
    const spread = bedtimeSpread(logs.slice(-14));
    if (logs.length >= 4 && spread != null) {
      out.push(spread <= 30 ? `Tu hora de acostarte es bastante regular (variación de unos ${spread} minutos). Eso suele ayudar.`
        : `Tu hora de acostarte varía unos ${spread} minutos entre noches. Acercarla un poco cada día puede ayudarte.`);
    }
    const scr = logs.filter((e) => e.value?.pantallas);
    const withScreens = scr.filter((e) => ['30-60', 'mas-60'].includes(e.value.pantallas));
    const without = scr.filter((e) => ['no', 'menos-30'].includes(e.value.pantallas));
    if (withScreens.length >= 3 && without.length >= 3) {
      const a = mean(withScreens.map((e) => Number(e.value.calidad)));
      const b = mean(without.map((e) => Number(e.value.calidad)));
      if (b - a >= 0.5) out.push(`Tu descanso medio fue ${round1(b)}/5 con poca pantalla y ${round1(a)}/5 con más de 30 minutos. Es una pista de tus datos, no una regla.`);
    }
    const caf = logs.filter((e) => e.value?.cafeina);
    const late = caf.filter((e) => ['tarde', 'noche'].includes(e.value.cafeina));
    const early = caf.filter((e) => ['no', 'manana'].includes(e.value.cafeina));
    if (late.length >= 3 && early.length >= 3) {
      const a = mean(late.map((e) => sumQuality(e)));
      const b = mean(early.map((e) => sumQuality(e)));
      if (b - a >= 0.5) out.push(`Los días con cafeína por la tarde o noche descansaste ${round1(b - a)} puntos menos de media. Prueba a adelantar tu última toma.`);
    }
    return out;
  },
  weeklyTasks: WEEKLY_TASKS,
  recommendedExercise: () => 'sueno-4-7-8',
  defaultReminderTime: '22:00',
  ui: {
    tagline: 'Descansa. Mañana es otro comienzo.',
    emptyToday: 'Todavía no has registrado tu noche. Cuéntanos a qué hora te acostaste y despertaste.',
    logSuccess: 'Noche registrada. Gracias por cuidar tu descanso.',
  },
  safety: {
    text: 'Alento ofrece hábitos de higiene del sueño y no diagnostica trastornos ni sustituye a un profesional. Si roncas mucho con pausas al respirar, tienes mucho sueño durante el día o el insomnio dura semanas y afecta a tu vida, consulta con un profesional de salud. Si sientes somnolencia al conducir, para y descansa.',
    resources: [
      { label: 'Tu médico o centro de salud', detail: 'Pueden valorar tu caso y derivarte a una unidad del sueño si hace falta.' },
      EMERGENCY,
    ],
  },
  extraFacts(f) {
    const last7 = f.entries.slice(-7);
    return {
      regularNights: last7.length >= 5 && (bedtimeSpread(last7) ?? 999) <= 45,
    };
  },
  achievements: [
    A('sue', 'plan-listo', 'Mi plan está listo', 'Elegiste tu camino y tus horas de descanso.', 'sprout', (f) => f.hasGoal),
    A('sue', 'primera-noche', 'Primera noche registrada', 'Registraste tu primera noche.', 'pen', (f) => f.logs >= 1),
    A('sue', 'semana-seguimiento', 'Una semana de noches', 'Registraste 7 noches distintas.', 'calendar', (f) => f.trackedDays >= 7),
    A('sue', 'racha-3', 'Tres noches en tu objetivo', 'Tres noches seguidas dentro de tu objetivo de horas.', 'leaf', (f) => f.bestStreak >= 3),
    A('sue', 'racha-7', 'Una semana de buen descanso', 'Siete noches seguidas dentro de tu objetivo de horas.', 'mountain', (f) => f.bestStreak >= 7),
    A('sue', 'horario-regular', 'Horario regular', 'Cinco noches de la última semana con una hora de acostarte parecida.', 'sun', (f) => f.regularNights),
    A('sue', 'noche-dificil', 'Una noche difícil atravesada', 'Usaste una técnica en una noche en la que no lograbas dormir.', 'wave', (f) => f.urgesResolved >= 1),
    A('sue', 'respiracion-5', 'Cinco respiraciones', 'Completaste 5 ejercicios de respiración.', 'wind', (f) => f.breathing >= 5),
    A('sue', 'primera-leccion', 'Primera lección', 'Completaste tu primera lección del programa.', 'book', (f) => f.lessons >= 1),
    A('sue', 'un-mes', 'Un mes de camino', 'Llevas 30 días con tu plan.', 'mountain', (f) => f.daysSinceStart >= 30),
  ],
};

function sumQuality(e) { return Number(e.value.calidad); }
