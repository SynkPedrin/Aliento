// Companheiro del programa Alcohol. Educativo y de apoyo, en clave de reducción de daños:
// sin juicios, sin diagnóstico y sin pautas médicas. Revisar editorialmente antes de publicar.
import { EMERGENCY, OUTSIDE_SPAIN, achievement as A, glideTarget, mean, optionLabel, round1, round2, sum } from './_shared.js';

const TRIGGERS = [
  { id: 'estres', label: 'Estrés o agobio' },
  { id: 'desconexion', label: 'Desconectar tras el trabajo' },
  { id: 'social', label: 'Presión o ambiente social' },
  { id: 'celebracion', label: 'Celebración' },
  { id: 'aburrimiento', label: 'Aburrimiento o soledad' },
  { id: 'tristeza', label: 'Tristeza o desánimo' },
  { id: 'comidas', label: 'Con la comida o la cena' },
  { id: 'costumbre', label: 'Costumbre' },
  { id: 'otro', label: 'Otro motivo' },
];

const LOG_FIELDS = [
  { id: 'bebidas', label: 'Bebidas estándar', type: 'number', min: 0.5, max: 30, step: 0.5, required: true, unit: 'bebidas',
    help: 'Una bebida estándar es una caña o lata de cerveza, una copa de vino o un chupito. Los servidos en casa suelen ser más grandes: cuenta lo que sirves de verdad.' },
  { id: 'contexto', label: '¿Con quién o dónde?', type: 'select', options: [
    { id: 'solo', label: 'A solas en casa' }, { id: 'pareja-familia', label: 'Con pareja o familia' },
    { id: 'amigos', label: 'Con amigos' }, { id: 'trabajo', label: 'Evento de trabajo' },
    { id: 'bar', label: 'Bar o restaurante' }, { id: 'fiesta', label: 'Fiesta o celebración' },
  ] },
  { id: 'gatillo', label: '¿Qué lo motivó?', type: 'select', options: TRIGGERS },
  { id: 'ganas', label: '¿Cuántas ganas tenías?', type: 'scale', min: 1, max: 5, help: '1 = casi ninguna, 5 = muchísimas.' },
  { id: 'nota', label: 'Nota (opcional)', type: 'text', maxLength: 300, placeholder: 'Algo que quieras recordar de este momento' },
];

const STRATEGIES = [
  { id: 'pausa', name: 'Pausa', fixedTarget: 0,
    description: 'Un tiempo sin beber (por ejemplo 30 o 90 días) para ver cómo te sientes. Si bebes a diario o has notado temblores o malestar al pasar horas sin beber, habla antes con un profesional de salud: no es seguro parar de golpe sin orientación.' },
  { id: 'reducir', name: 'Reducir poco a poco', defaultTarget: 1, usesStart: true,
    description: 'Bajas la cantidad de forma gradual, semana a semana, hasta el máximo que elijas. Es un camino con menos sobresaltos.' },
  { id: 'moderar', name: 'Moderar', defaultTarget: 2,
    description: 'Te pones un máximo de bebidas por día y vigilas los días en los que sí bebes, sin prohibirte nada de forma rígida.' },
];

const WEEKLY_TASKS = [
  { week: 1, title: 'Observa sin juzgar', detail: 'Anota cada bebida de la semana: cuánto, con quién y por qué. Solo mirar; todavía no hace falta cambiar nada.' },
  { week: 2, title: 'Conoce tu medida', detail: 'Aprende qué es una bebida estándar y mide cuánto sirves en casa. Muchos vasos y copas son más grandes de lo que parecen.' },
  { week: 3, title: 'Tus tres situaciones de riesgo', detail: 'Elige las tres ocasiones en las que más bebes y escribe un plan B para cada una: llegar más tarde, pedir otra bebida, cambiar de plan.' },
  { week: 4, title: 'Días sin alcohol', detail: 'Reserva al menos dos días a la semana sin beber y cuéntaselo a alguien de confianza. Si te cuesta, anota qué lo hizo difícil.' },
  { week: 5, title: 'Tu frase lista', detail: 'Prepara una frase corta y tranquila para rechazar una bebida o pedir una sin alcohol, sin dar explicaciones. Ensáyala en voz alta.' },
  { week: 6, title: 'Cuida tus salidas', detail: 'Come antes de salir y alterna cada bebida con agua o una opción sin alcohol. Ve a tu ritmo: no hace falta seguir el de los demás.' },
  { week: 7, title: 'Planifica el fin de semana', detail: 'Decide antes cuánto vas a tomar como máximo, a qué hora te vas y cómo volverás a casa con seguridad.' },
  { week: 8, title: 'Revisa tu semana', detail: 'Mira tu gráfico: ¿qué días fueron más difíciles y qué te ayudó? Ajusta tu objetivo si lo necesitas. Cambiarlo no es retroceder.' },
  { week: 9, title: 'Placer sin alcohol', detail: 'Elige un plan agradable para tus momentos de desconexión (una ducha larga, un paseo, una serie con algo rico) y úsalo esta semana.' },
  { week: 10, title: 'Quédate con lo que funciona', detail: 'Escribe las tres estrategias que más te han servido y cómo mantenerlas. Si lo necesitas, pide apoyo a un profesional.' },
];

export default {
  slug: 'alcohol',
  strategies: STRATEGIES,
  setup: {
    intro: 'Elige el camino que mejor encaje contigo. Puedes cambiarlo cuando quieras: tu historial se conserva.',
    target: { label: 'Máximo de bebidas por día', help: 'El límite que quieres respetar en un día. En la pausa es cero.', unit: 'bebidas', min: 0, max: 20, step: 0.5, default: 2 },
    start: { label: 'Cuánto sueles tomar hoy, en un día que bebes', help: 'Punto de partida para bajar poco a poco.', unit: 'bebidas', min: 1, max: 30, step: 0.5, default: 4 },
  },
  log: {
    kind: 'consumo',
    cta: 'Registrar bebida',
    label: 'Registrar una bebida',
    fields: LOG_FIELDS,
    summary(v) {
      const parts = [`${v.bebidas} ${v.bebidas === 1 ? 'bebida' : 'bebidas'}`];
      const ctx = optionLabel(LOG_FIELDS, 'contexto', v.contexto);
      if (ctx) parts.push(ctx.toLowerCase());
      if (v.ganas) parts.push(`ganas ${v.ganas}/5`);
      return parts.join(' · ');
    },
  },
  triggers: TRIGGERS,
  triggerField: 'gatillo',
  urge: {
    cta: 'Tengo ganas de beber',
    title: 'Un momento difícil',
    body: 'Las ganas suben, llegan a un pico y después bajan, aunque ahora no lo parezca. No tienes que decidir nada todavía: solo atravesar este rato. Elige qué sientes y una cosa que puedas probar ahora mismo.',
    intensity: { min: 1, max: 5, label: '¿Qué tan fuertes son las ganas?' },
    feelings: TRIGGERS,
    techniques: [
      { id: 'respiracion', label: 'Respirar con calma', detail: 'Dos minutos de respiración lenta, con la exhalación más larga que la inhalación.', exerciseId: 'calma-4-6' },
      { id: 'agua', label: 'Beber agua y esperar 10 minutos', detail: 'Sirve un vaso de agua, tómalo despacio y deja pasar diez minutos antes de decidir.' },
      { id: 'moverte', label: 'Moverte un poco', detail: 'Da un paseo corto o estira. Cambiar de postura y de lugar baja la intensidad.' },
      { id: 'hablar', label: 'Escribir o llamar a alguien', detail: 'Cuéntale a alguien de confianza cómo te sientes, aunque sea con un mensaje.' },
      { id: 'posponer', label: 'Posponer 20 minutos', detail: 'Ponte una alarma. Si pasado ese tiempo sigues queriendo, decide con calma.' },
      { id: 'cambiar-plan', label: 'Cambiar de lugar o de plan', detail: 'Sal de la situación o haz otra cosa: ducha, cocinar, una llamada.' },
    ],
    afterLabel: '¿Cómo están las ganas ahora?',
    resolvedLabel: 'Pasaron o bajaron',
    continuedLabel: 'Siguen ahí',
    supportText: 'Que las ganas sigan no es un fracaso. Pide apoyo si lo necesitas: cada vez que las atraviesas aprendes algo.',
  },
  checkin: {
    label: 'Hoy no bebí',
    doneLabel: 'Día sin beber registrado',
    value: 0,
    blockedMessage: 'Ese día ya tiene bebidas registradas.',
    blockedWhen: (day) => (day.value ?? 0) > 0,
  },
  metric: {
    id: 'bebidas', label: 'Bebidas hoy', todayLabel: 'Bebidas de hoy', unit: 'bebidas', unitSingular: 'bebida',
    direction: 'max', aggregate: 'sum', format: 'decimal1', weekLabel: 'Bebidas por día',
    value: (v) => (Number.isFinite(Number(v?.bebidas)) ? Number(v.bebidas) : null),
    targetFor(day, goal) {
      const s = STRATEGIES.find((x) => x.id === goal.strategy);
      if (s?.fixedTarget != null) return s.fixedTarget;
      return goal.strategy === 'reducir' ? glideTarget(day, goal, 6) : goal.target;
    },
  },
  streakLabel: (goal) => (goal.strategy === 'pausa' ? 'días seguidos sin beber' : 'días seguidos dentro de tu objetivo'),
  /** Estimaciones a partir del cuestionario: siempre prudentes (extremo inferior de cada tramo). */
  baseline(a) {
    const daysPerWeek = { nunca: 0.25, mensual: 0.75, semanal: 2, diario: 4 }[a.q_alc_frecuencia];
    const perDrinkingDay = { '1-2': 1, '3-4': 3, '5-6': 5, '7-9': 7, '10mas': 10 }[a.q_alc_cantidad];
    if (!daysPerWeek || !perDrinkingDay) return null;
    const perWeek = daysPerWeek * perDrinkingDay;
    const monthly = Number(a.q_alc_gasto);
    const weeklySpend = Number.isFinite(monthly) && monthly > 0 ? (monthly * 12) / 52 : null;
    return { perDay: round2(perWeek / 7), perDrinkingDay, perWeek: round2(perWeek), weeklySpend: weeklySpend && round2(weeklySpend),
      pricePerUnit: weeklySpend ? round2(weeklySpend / perWeek) : null, start: perDrinkingDay };
  },
  totals(c) {
    const tracked = c.period.filter((d) => d.tracked);
    const zero = tracked.filter((d) => d.value === 0);
    const cards = [
      { id: 'dias-sin-beber', label: 'Días sin beber', value: zero.length, unit: 'días', sub: `de ${tracked.length} ${tracked.length === 1 ? 'día registrado' : 'días registrados'}`, estimate: false },
      { id: 'bebidas-periodo', label: 'Bebidas registradas', value: round1(sum(tracked.map((d) => d.value ?? 0))), unit: 'bebidas', sub: c.periodLabel, estimate: false },
      { id: 'momentos-superados', label: 'Momentos difíciles superados', value: c.urgesResolved, unit: '', sub: `de ${c.urges} registrados`, estimate: false },
    ];
    if (c.baseline?.perDay > 0 && tracked.length) {
      const avoided = round1(sum(tracked.map((d) => Math.max(0, c.baseline.perDay - (d.value ?? 0)))));
      cards.push({ id: 'bebidas-evitadas', label: 'Bebidas evitadas', value: avoided, unit: 'bebidas', estimate: true,
        sub: 'Estimación: frente a lo que indicaste en el cuestionario, solo en los días registrados.' });
      if (c.baseline.pricePerUnit) {
        cards.push({ id: 'dinero-ahorrado', label: 'Dinero no gastado', value: round2(avoided * c.baseline.pricePerUnit), unit: c.currency, estimate: true,
          sub: 'Estimación: bebidas evitadas por el gasto que indicaste. No incluye otros gastos.' });
      }
    }
    return cards;
  },
  insights(c) {
    const out = [];
    const tracked = c.days.filter((d) => d.tracked);
    const heavy = tracked.filter((d) => d.status === 'warn').length;
    if (tracked.length >= 7 && heavy) out.push(`${heavy} de tus ${tracked.length} días registrados superaron tu objetivo. Mirar esos días con curiosidad, sin culpa, te dice qué plan B preparar.`);
    const withCraving = c.entries.filter((e) => Number(e.value?.ganas) >= 4);
    if (withCraving.length >= 3) {
      const m = mean(withCraving.map((e) => Number(e.value.bebidas) || 0));
      out.push(`Cuando tenías muchas ganas (4 o 5) tomaste ${round1(m)} bebidas de media.`);
    }
    return out;
  },
  weeklyTasks: WEEKLY_TASKS,
  recommendedExercise: () => 'calma-4-6',
  defaultReminderTime: '20:00',
  ui: {
    tagline: 'Una relación más consciente con el alcohol, a tu ritmo.',
    emptyToday: 'Todavía no has registrado nada hoy. Si no bebiste, marca «Hoy no bebí».',
    logSuccess: 'Registrado. Gracias por contarlo con honestidad.',
  },
  safety: {
    text: 'Alento es un programa educativo y de apoyo: no sustituye a un profesional ni diagnostica. Si bebes a diario o has notado temblores, sudoración o malestar al pasar horas sin beber, no pares de golpe: consulta antes con un profesional de salud. Si crees que tu vida o la de otra persona corre peligro, pide ayuda urgente.',
    resources: [
      EMERGENCY,
      { label: 'Tu médico o centro de salud', detail: 'Pueden orientarte y derivarte a un servicio especializado en alcohol. ' + OUTSIDE_SPAIN },
    ],
  },
  achievements: [
    A('alc', 'plan-listo', 'Mi plan está listo', 'Elegiste tu camino y tu objetivo.', 'sprout', (f) => f.hasGoal),
    A('alc', 'primer-registro', 'Primer registro', 'Anotaste tu primera bebida o tu primer día sin beber.', 'pen', (f) => f.logs + f.checkins >= 1),
    A('alc', 'primer-dia-sin-beber', 'Un día sin beber', 'Registraste un día con cero bebidas.', 'sun', (f) => f.zeroDays >= 1),
    A('alc', 'ganas-superadas', 'Ganas atravesadas', 'Pasaste unas ganas de beber sin ceder a ellas.', 'wave', (f) => f.urgesResolved >= 1),
    A('alc', 'racha-3', 'Tres días seguidos', 'Tres días seguidos dentro de tu objetivo.', 'leaf', (f) => f.bestStreak >= 3),
    A('alc', 'racha-7', 'Una semana dentro del objetivo', 'Siete días seguidos dentro de tu objetivo.', 'calendar', (f) => f.bestStreak >= 7),
    A('alc', 'semana-sin-beber', 'Una semana sin beber', 'Siete días seguidos con cero bebidas.', 'mountain', (f) => f.bestZeroStreak >= 7),
    A('alc', 'respiracion-5', 'Cinco respiraciones', 'Completaste 5 ejercicios de respiración.', 'wind', (f) => f.breathing >= 5),
    A('alc', 'primera-leccion', 'Primera lección', 'Completaste tu primera lección del programa.', 'book', (f) => f.lessons >= 1),
    A('alc', 'un-mes', 'Un mes de camino', 'Llevas 30 días con tu plan.', 'mountain', (f) => f.daysSinceStart >= 30),
  ],
};
