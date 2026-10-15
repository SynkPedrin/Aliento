// Habla con Alento: guía de apoyo con respuestas predefinidas y revisadas (no es un chat con IA).
import { $, api, h, icon, toast } from '../ui.js';
import { errorState, initApp, loading, page } from '../shell.js';

const me = await initApp({ active: '/ayuda' });
const root = $('[data-root]');
const firstName = String(me.user?.name ?? '').trim().split(/\s+/)[0];

const paragraphs = (text) => String(text ?? '').split(/\n{2,}|\n/).filter((p) => p.trim()).map((p) => h('p', {}, p.trim()));

function bubble({ role, content, links }) {
  if (role === 'user') return h('div', { class: 'bubble bubble--user' }, h('span', { class: 'sr-only' }, 'Tú: '), content);
  return h('div', { class: 'bubble bubble--guide' },
    h('span', { class: 'sr-only' }, 'Alento: '),
    paragraphs(content),
    links?.length ? h('div', { class: 'bubble__links' }, links.map((l) => h('a', { class: 'btn btn--sm btn--ghost', href: l.href }, l.label))) : null);
}

async function load() {
  loading(root);
  try {
    const data = await api('/api/app/support');
    render(data);
  } catch (err) {
    errorState(root, err, load);
  }
}

function render({ topics = [], messages = [] }) {
  page(root, {
    eyebrow: 'Apoyo',
    title: 'Habla con Alento',
    intro: 'Elige un tema y te mostraremos qué puedes hacer y dónde encontrarlo en Alento.',
  });

  const chat = h('div', { class: 'chat', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversación con la guía' });
  if (messages.length) chat.append(...messages.map(bubble));
  else {
    chat.append(bubble({
      role: 'guide',
      content: `Hola${firstName ? `, ${firstName}` : ''}. Elige un tema y te orientaré con lo que tienes disponible en Alento.`,
    }));
  }

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Temas' }, topics.map((t) => h('button', {
    type: 'button', class: 'chip', onclick: (e) => ask(t, e.currentTarget),
  }, t.label)));

  async function ask(topic, btn) {
    const all = [...chips.querySelectorAll('button')];
    all.forEach((b) => { b.disabled = true; });
    btn.setAttribute('aria-busy', 'true');
    try {
      const { reply } = await api('/api/app/support/messages', { method: 'POST', body: { topic: topic.id } });
      chat.append(bubble({ role: 'user', content: topic.label }));
      const guide = bubble({ role: 'guide', content: reply?.text, links: reply?.links });
      chat.append(guide);
      guide.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      toast(err.message);
    } finally {
      all.forEach((b) => { b.disabled = false; });
      btn.removeAttribute('aria-busy');
    }
  }

  root.append(h('div', { class: 'chat-wrap' },
    h('div', { class: 'notice' }, icon('info', 'notice__icon'),
      h('div', {}, 'Guía de apoyo con respuestas predefinidas. No es un chat con inteligencia artificial ni sustituye a un profesional sanitario.')),
    h('div', { class: 'u-mt-16' }, chat),
    h('section', { class: 'card topic-bar', 'aria-labelledby': 'topics-title' },
      h('h2', { class: 'section-title', id: 'topics-title' }, '¿Sobre qué quieres hablar?'),
      topics.length ? chips : h('p', { class: 'muted' }, 'No hay temas disponibles en este momento.')),
    h('p', { class: 'help u-mt-16' }, 'Si sientes que tu salud está en riesgo, contacta con los servicios de emergencia o con tu profesional sanitario.'),
  ));
}

load();
