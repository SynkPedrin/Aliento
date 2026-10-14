// "Habla con Aliento": guía de apoyo con respuestas predefinidas y revisadas.
// No hay proveedor de IA configurado, así que NO se simula un chat inteligente:
// el usuario elige un tema y recibe orientación fija con enlaces a las herramientas reales.

export const SUPPORT_TOPICS = [
  {
    id: 'ganas-ahora',
    label: 'Tengo ganas de fumar ahora',
    reply: 'Las ganas suelen subir, llegar a un pico y bajar en pocos minutos. Prueba esto ahora: retrasa la decisión 5 minutos, haz una respiración lenta (exhala más largo de lo que inhalas), bebe un vaso de agua y cambia de actividad o de lugar. Si quieres, registra lo que sientes con «Tengo ganas de fumar»: te ayudará a reconocer tus patrones.',
    links: [{ href: '/respirar', label: 'Respirar ahora' }, { href: '/dashboard#ganas', label: 'Tengo ganas de fumar' }],
  },
  {
    id: 'he-fumado',
    label: 'He fumado y me siento mal',
    reply: 'Un tropiezo no borra lo que has avanzado. Lo útil ahora es mirarlo con curiosidad, no con culpa: ¿qué pasó justo antes?, ¿dónde estabas?, ¿qué sentías? Regístralo, decide qué harás distinto la próxima vez en esa situación y vuelve a tu plan hoy mismo, no el lunes.',
    links: [{ href: '/registro', label: 'Registrar el cigarrillo' }, { href: '/jornada', label: 'Lección: aprender de los tropiezos' }],
  },
  {
    id: 'gatillos',
    label: 'Quiero entender mis gatillos',
    reply: 'Tus gatillos son las situaciones, emociones o rutinas que suelen ir unidas al cigarrillo. La forma más fiable de descubrirlos es registrar cada cigarrillo y cada momento de ganas con el gatillo que lo provocó. En «Mi progreso» verás cuáles se repiten más, y en la jornada aprenderás a preparar un plan «si… entonces…» para cada uno.',
    links: [{ href: '/progreso', label: 'Ver mi progreso' }, { href: '/registro', label: 'Registrar' }],
  },
  {
    id: 'objetivos',
    label: 'Quiero ajustar mis objetivos',
    reply: 'Puedes cambiar tu estrategia, tu máximo diario, tu fecha para dejar de fumar y tus metas de ejercicios y de ahorro cuando quieras. Guardamos el historial de cambios, así que ajustar el plan no borra lo que ya has hecho.',
    links: [{ href: '/objetivos', label: 'Mis objetivos' }],
  },
  {
    id: 'ayuda-profesional',
    label: '¿Debería pedir ayuda profesional?',
    reply: 'Hablar con un profesional sanitario suele ser una muy buena idea, sobre todo si fumas mucho, si ya lo has intentado varias veces, si estás embarazada o en periodo de lactancia, o si tienes alguna condición de salud física o mental. Pueden valorar contigo tratamientos de apoyo aprobados. Aliento te acompaña, pero no sustituye ese consejo.',
    links: [{ href: '/jornada', label: 'Lección: apoyo y ayuda profesional' }],
  },
  {
    id: 'como-funciona',
    label: '¿Cómo funciona Aliento?',
    reply: 'Aliento combina una jornada de lecciones cortas, el registro de cigarrillos y de ganas, ejercicios de respiración, un diario de ánimo y objetivos personalizados. Tu panel te muestra qué toca hoy. Todo lo que ves en tus gráficos sale de tus registros; lo que es una estimación (como el dinero ahorrado) aparece marcado como tal.',
    links: [{ href: '/dashboard', label: 'Ir a mi panel' }],
  },
  {
    id: 'urgencia',
    label: 'Me siento muy mal / es una urgencia',
    reply: 'Si sientes dolor en el pecho, dificultad para respirar o crees que tu vida o la de otra persona está en riesgo, llama ahora al número de emergencias de tu país. Si estás pasando por un momento emocional muy difícil, busca ayuda inmediata en los servicios de emergencia o de salud mental de tu zona. Aliento no puede atender urgencias.',
    links: [],
  },
];
