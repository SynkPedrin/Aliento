// Companheiro del programa Ansiedad. Técnicas de regulación y autoconocimiento: no diagnostica,
// no promete curar y no sustituye la atención de un profesional. Revisar editorialmente antes de publicar.
import { EMERGENCY, OUTSIDE_SPAIN, achievement as A, mean, optionLabel, round1 } from './_shared.js';

const TRIGGERS = [
  { id: 'trabajo', label: 'Trabajo o estudios' },
  { id: 'relaciones', label: 'Relaciones o conflictos' },
  { id: 'salud', label: 'Preocupación por la salud' },
  { id: 'dinero', label: 'Dinero o responsabilidades' },
  { id: 'incertidumbre', label: 'Incertidumbre o futuro' },
  { id: 'multitudes', label: 'Lugares con mucha gente' },
  { id: 'sueno', label: 'Poco descanso' },
  { id: 'sin-motivo', label: 'Sin motivo claro' },
  { id: 'otro', label: 'Otro motivo' },
];

const TECHNIQUES = [
  { id: 'respiracion', label: 'Respiración lenta' },
  { id: 'anclaje', label: 'Anclaje 5-4-3-2-1' },
  { id: 'relajacion', label: 'Relajación muscular' },
  { id: 'caminar', label: 'Caminar o moverme' },
  { id: 'escribir', label: 'Escribir lo que siento' },
  { id: 'hablar', label: 'Hablar con alguien' },
  { id: 'ninguna', label: 'Ninguna' },
];

const LOG_FIELDS = [
  { id: 'nivel', label: '¿Cuánta ansiedad sientes ahora?', type: 'scale', min: 0, max: 10, required: true, help: '0 = ninguna, 10 = la máxima que has sentido. No hay respuestas buenas o malas.' },
  { id: 'gatillo', label: '¿Qué la despertó?', type: 'select', options: TRIGGERS },
  { id: 'sintomas', label: '¿Cómo la notas en el cuerpo?', type: 'multi', max: 6, options: [
    { id: 'tension', label: 'Tensión en hombros o mandíbula' }, { id: 'pecho', label: 'Presión en el pecho o respiración corta' },
    { id: 'estomago', label: 'Nudo en el estómago' }, { id: 'pensamientos', label: 'Pensamientos en bucle' },
    { id: 'inquietud', label: 'Inquietud' }, { id: 'cansancio', label: 'Cansancio' },
  ] },
  { id: 'tecnica', label: 'Técnica que usaste', type: 'select', options: TECHNIQUES },
  { id: 'despues', label: '¿Y después de la técnica?', type: 'scale', min: 0, max: 10, help: 'Si usaste una técnica, anota cómo te sentías al terminar.' },
  { id: 'nota', label: 'Nota (opcional)', type: 'text', maxLength: 400, placeholder: 'Qué pasó o qué te ayudó' },
];

const STRATEGIES = [
  { id: 'herramientas', name: 'Herramientas para el momento', defaultTarget: 4,
    description: 'Aprendes técnicas breves (respiración, anclaje, relajación) para usarlas cuando la ansiedad sube.' },
  { id: 'rutina', name: 'Rutina diaria de calma', defaultTarget: 4,
    description: 'Pequeñas pausas cada día para que la tensión no se acumule, además de las técnicas para los momentos difíciles.' },
  { id: 'profundo', name: 'Entender mis patrones', defaultTarget: 4,
    description: 'Registras qué la despierta y qué te ayuda para descubrir tus patrones. Ideal si quieres llevar datos a una consulta.' },
];

const WEEKLY_TASKS = [
  { week: 1, title: 'Observa cómo estás', detail: 'Registra tu nivel una vez al día, a la misma hora, sin intentar cambiar nada. Solo ponerle nombre ya ayuda.' },
  { week: 2, title: 'Practica la respiración lenta', detail: 'Haz dos minutos de respiración 4·6 cada día, mejor cuando estés tranquilo/a: así será más fácil usarla cuando la necesites.' },
  { week: 3, title: 'Mapa de gatillos', detail: 'Anota qué situaciones elevan tu nivel. Busca patrones: horas, lugares, personas, cansancio.' },
  { week: 4, title: 'Anclaje 5-4-3-2-1', detail: 'Cuando notes que vas rápido, nombra 5 cosas que ves, 4 que tocas, 3 que oyes, 2 que hueles y 1 que saboreas. Practícalo 3 veces.' },
  { week: 5, title: 'Relajación muscular breve', detail: 'Tensa y suelta cada grupo muscular durante unos segundos, de los pies a la cara. Cinco minutos, mejor por la tarde o la noche.' },
  { week: 6, title: 'Tres pausas al día', detail: 'Programa tres pausas de un minuto (sin pantallas) repartidas por el día: respira, estira, mira lejos.' },
  { week: 7, title: 'Cuida lo básico', detail: 'Revisa lo que influye en la tensión: horarios de comida y sueño, movimiento suave, cafeína y alcohol. Cambia solo una cosa esta semana.' },
  { week: 8, title: 'Mira tus pensamientos', detail: 'Escribe una preocupación y pregúntate: ¿qué parte depende de mí hoy? ¿Qué podría hacer en cinco minutos? Deja lo demás en el papel.' },
  { week: 9, title: 'Pide apoyo', detail: 'Cuéntale a alguien de confianza cómo te sientes. Si la ansiedad interfiere con tu vida diaria, considera hablar con un profesional.' },
  { week: 10, title: 'Tu plan de calma', detail: 'Escribe tus tres técnicas favoritas, tus señales de aviso y a quién acudir. Guárdalo donde lo encuentres fácil.' },
];

const CRISIS = 'Si sientes que no puedes con esto, tienes pensamientos de hacerte daño o crees que tu vida corre peligro, pide ayuda ahora: llama al 024 (línea de atención a la conducta suicida, gratuita y 24 h, en España) o al 112. ' + OUTSIDE_SPAIN;

export default {
  slug: 'ansiedad',
  strategies: STRATEGIES,
  setup: {
    intro: 'Alento te da herramientas de autorregulación y no sustituye la atención de un profesional. Elige por dónde quieres empezar.',
    target: { label: 'Nivel con el que te sientes cómodo/a', help: 'Un día se considera de calma si tu nivel medio queda en este valor o por debajo. Puedes cambiarlo cuando quieras.', unit: 'de 10', min: 0, max: 9, step: 1, default: 4 },
  },
  log: {
    kind: 'emocion',
    cta: 'Registrar cómo estoy',
    label: 'Registrar cómo estoy',
    fields: LOG_FIELDS,
    summary(v) {
      const parts = [`nivel ${v.nivel}/10`];
      const t = optionLabel(LOG_FIELDS, 'gatillo', v.gatillo);
      if (t) parts.push(t.toLowerCase());
      if (v.tecnica && v.tecnica !== 'ninguna') parts.push(`${optionLabel(LOG_FIELDS, 'tecnica', v.tecnica).toLowerCase()}${v.despues != null ? ` (${v.nivel}→${v.despues})` : ''}`);
      return parts.join(' · ');
    },
  },
  triggers: TRIGGERS,
  triggerField: 'gatillo',
  urge: {
    cta: 'Necesito calma ahora',
    title: 'Vamos paso a paso',
    body: 'Lo que sientes es incómodo, pero puede pasar. Elige qué notas y prueba una técnica: no tienes que resolver nada ahora, solo bajar un poco el ritmo.',
    intensity: { min: 1, max: 10, label: '¿Qué nivel de ansiedad sientes?' },
    feelings: [
      { id: 'corazon', label: 'Corazón acelerado' }, { id: 'pecho', label: 'Presión en el pecho o respiración corta' },
      { id: 'pensamientos', label: 'Pensamientos en bucle' }, { id: 'tension', label: 'Tensión en el cuerpo' },
      { id: 'inquietud', label: 'Inquietud, no puedo parar' }, { id: 'agobio', label: 'Agobio o sensación de bloqueo' },
      { id: 'otro', label: 'Otra sensación' },
    ],
    techniques: [
      { id: 'respiracion', label: 'Respiración lenta 4·6', detail: 'Inhala 4 segundos y exhala 6. La exhalación larga ayuda a bajar el ritmo.', exerciseId: 'calma-4-6' },
      { id: 'caja', label: 'Respiración cuadrada', detail: 'Cuatro tiempos iguales: inhala, retén, exhala, retén. Si te incomoda retener, hazlo sin pausas.', exerciseId: 'caja-4-4' },
      { id: 'anclaje', label: 'Anclaje 5-4-3-2-1', detail: 'Nombra 5 cosas que ves, 4 que tocas, 3 que oyes, 2 que hueles y 1 que saboreas.' },
      { id: 'relajacion', label: 'Soltar los músculos', detail: 'Aprieta con fuerza los puños 5 segundos y suéltalos. Repite con hombros, mandíbula y piernas.' },
      { id: 'caminar', label: 'Moverme un poco', detail: 'Camina o estira unos minutos. El movimiento ayuda a gastar la energía de la tensión.' },
      { id: 'escribir', label: 'Escribir lo que pienso', detail: 'Vuelca en papel lo que te preocupa y marca qué depende de ti ahora mismo.' },
      { id: 'hablar', label: 'Hablar con alguien', detail: 'Escribe o llama a una persona de confianza. No tienes que estar solo/a con esto.' },
    ],
    afterLabel: '¿Cómo te sientes ahora?',
    resolvedLabel: 'Estoy algo mejor',
    continuedLabel: 'Sigo igual',
    supportText: 'Seguir igual no significa que lo hagas mal. Prueba otra técnica o pide apoyo. ' + CRISIS,
    crisis: CRISIS,
  },
  checkin: {
    label: 'Hoy fue un día de calma',
    doneLabel: 'Día de calma registrado',
    value: null,
    blockedMessage: 'Ese día ya tiene registros por encima de tu objetivo.',
    blockedWhen: (day) => day.status === 'warn',
  },
  metric: {
    id: 'nivel', label: 'Nivel medio', todayLabel: 'Nivel medio de hoy', unit: 'de 10', unitSingular: 'de 10',
    direction: 'max', aggregate: 'avg', format: 'decimal1', weekLabel: 'Nivel medio de ansiedad por día',
    value: (v) => (v?.nivel != null && Number.isFinite(Number(v.nivel)) ? Number(v.nivel) : null),
    targetFor: (day, goal) => goal.target,
  },
  streakLabel: () => 'días de calma seguidos',
  baseline: () => null,
  totals(c) {
    const tracked = c.period.filter((d) => d.tracked);
    const calm = tracked.filter((d) => d.status === 'ok');
    const levels = tracked.map((d) => d.value).filter((v) => v != null);
    const drops = c.entries.filter((e) => e.value?.despues != null && e.value?.nivel != null && e.value.tecnica && e.value.tecnica !== 'ninguna')
      .map((e) => Number(e.value.nivel) - Number(e.value.despues));
    const cards = [
      { id: 'dias-calma', label: 'Días de calma', value: calm.length, unit: 'días', sub: `de ${tracked.length} ${tracked.length === 1 ? 'día registrado' : 'días registrados'}`, estimate: false },
      { id: 'nivel-medio', label: 'Nivel medio', value: levels.length ? round1(mean(levels)) : null, unit: 'de 10', sub: c.periodLabel, estimate: false },
      { id: 'momentos-superados', label: 'Momentos difíciles atravesados', value: c.urgesResolved, unit: '', sub: `de ${c.urges} registrados`, estimate: false },
      { id: 'respiraciones', label: 'Ejercicios de respiración', value: c.breathing, unit: '', sub: c.periodLabel, estimate: false },
    ];
    if (drops.length >= 3) {
      cards.push({ id: 'bajada-media', label: 'Cambio medio tras una técnica', value: round1(mean(drops)), unit: 'puntos', estimate: false,
        sub: `En ${drops.length} registros con «antes» y «después». Es un promedio de tus datos, no un resultado clínico.` });
    }
    return cards;
  },
  insights(c) {
    const out = [];
    const byTech = {};
    for (const e of c.entries) {
      const v = e.value ?? {};
      if (!v.tecnica || v.tecnica === 'ninguna' || v.despues == null || v.nivel == null) continue;
      (byTech[v.tecnica] ??= []).push(Number(v.nivel) - Number(v.despues));
    }
    const ranked = Object.entries(byTech).filter(([, xs]) => xs.length >= 3).map(([id, xs]) => [id, mean(xs), xs.length]).sort((a, b) => b[1] - a[1]);
    if (ranked.length && ranked[0][1] > 0) {
      out.push(`Tras «${optionLabel(LOG_FIELDS, 'tecnica', ranked[0][0])}» tu nivel bajó de media ${round1(ranked[0][1])} puntos (${ranked[0][2]} veces). Puede ser una buena aliada para ti.`);
    }
    const high = c.days.filter((d) => d.value != null && d.value >= 7).length;
    if (high >= 3) out.push(`Hubo ${high} días con un nivel medio de 7 o más. Si esto se repite o te cuesta hacer tu vida con normalidad, hablar con un profesional puede ayudarte.`);
    return out;
  },
  weeklyTasks: WEEKLY_TASKS,
  recommendedExercise: (c) => ((c.todayValue ?? 0) >= 6 || c.exercisesThisWeek % 2 === 0 ? 'calma-4-6' : 'caja-4-4'),
  defaultReminderTime: '19:00',
  ui: {
    tagline: 'Un espacio para recuperar la calma, paso a paso.',
    emptyToday: 'Todavía no has registrado nada hoy. Puedes anotar cómo estás o marcar un día de calma.',
    logSuccess: 'Registrado. Notar cómo estás ya es parte del cuidado.',
  },
  safety: {
    text: 'Alento ofrece herramientas de apoyo y no sustituye la atención de un profesional ni diagnostica. ' + CRISIS,
    resources: [
      { label: 'Línea 024', detail: 'Atención a la conducta suicida. Gratuita, 24 horas (España).', tel: '024' },
      EMERGENCY,
      { label: 'Profesional de salud mental', detail: 'Si la ansiedad interfiere con tu día a día, tu médico o centro de salud puede orientarte.' },
    ],
  },
  achievements: [
    A('ans', 'plan-listo', 'Mi plan está listo', 'Elegiste tu camino y tu objetivo de calma.', 'sprout', (f) => f.hasGoal),
    A('ans', 'primer-registro', 'Primer registro', 'Anotaste cómo estabas por primera vez.', 'pen', (f) => f.logs + f.checkins >= 1),
    A('ans', 'semana-seguimiento', 'Una semana de seguimiento', 'Registraste 7 días distintos.', 'calendar', (f) => f.trackedDays >= 7),
    A('ans', 'primer-momento', 'Primer momento atravesado', 'Usaste una técnica en un momento difícil y te sentiste algo mejor.', 'wave', (f) => f.urgesResolved >= 1),
    A('ans', 'tres-tecnicas', 'Tres técnicas distintas', 'Probaste tres técnicas de regulación diferentes.', 'leaf', (f) => f.techniques >= 3),
    A('ans', 'racha-3', 'Tres días de calma', 'Tres días seguidos dentro de tu objetivo de calma.', 'sun', (f) => f.bestStreak >= 3),
    A('ans', 'racha-7', 'Una semana de calma', 'Siete días seguidos dentro de tu objetivo de calma.', 'mountain', (f) => f.bestStreak >= 7),
    A('ans', 'respiracion-5', 'Cinco respiraciones', 'Completaste 5 ejercicios de respiración.', 'wind', (f) => f.breathing >= 5),
    A('ans', 'primera-leccion', 'Primera lección', 'Completaste tu primera lección del programa.', 'book', (f) => f.lessons >= 1),
    A('ans', 'un-mes', 'Un mes de camino', 'Llevas 30 días con tu plan.', 'mountain', (f) => f.daysSinceStart >= 30),
  ],
};
