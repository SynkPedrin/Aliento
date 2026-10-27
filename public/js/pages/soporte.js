// Soporte: formulario público. El mensaje llega por correo al equipo y la respuesta vuelve al correo de la persona.
import { $, api, h, renderHeader, setBusy } from '../ui.js';

renderHeader($('[data-header]'));
const root = $('[data-root]');
const params = new URLSearchParams(location.search);
const input = (id, attrs) => h('input', { class: 'input', id, ...attrs });
const name = input('name', { autocomplete: 'name', maxlength: '80', required: true });
const email = input('email', { type: 'email', autocomplete: 'email', required: true, value: params.get('email') ?? '' });
const order = input('order', { maxlength: '80', placeholder: 'Opcional', autocomplete: 'off' });
const message = h('textarea', { class: 'input', id: 'message', rows: '6', minlength: '10', maxlength: '4000', required: true });
const trap = h('input', { name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true', class: 'sr-only' }); // campo-isca para robôs
const btn = h('button', { class: 'btn btn--lg btn--block', type: 'submit' }, 'Enviar mensaje');
const err = h('p', { class: 'form-error', role: 'alert' });
const field = (id, label, el, help) => h('div', { class: 'field' }, h('label', { for: id }, label), el, help ? h('p', { class: 'help' }, help) : null);

root.replaceChildren(h('form', { class: 'stack', onsubmit: async (e) => {
  e.preventDefault();
  err.textContent = '';
  setBusy(btn, true, 'Enviando…');
  try {
    await api('/api/support', { method: 'POST', body: { name: name.value, email: email.value, orderId: order.value, message: message.value, website: trap.value, page: document.referrer } });
    root.replaceChildren(h('h1', { class: 'title-md' }, '¡Mensaje enviado!'),
      h('p', { class: 'muted u-mt-8' }, `Te responderemos a ${email.value.trim()} lo antes posible (normalmente en menos de 24 horas). Revisa también la carpeta de spam.`),
      h('p', { class: 'u-mt-16' }, h('a', { href: '/' }, 'Volver al inicio')));
  } catch (e2) { setBusy(btn, false); err.textContent = e2.message; }
} },
h('h1', { class: 'title-md' }, '¿Cómo podemos ayudarte?'),
h('p', { class: 'muted' }, 'Escríbenos y te respondemos por correo electrónico.'),
field('name', 'Nombre', name),
field('email', 'Correo electrónico', email, 'Te responderemos a este correo.'),
field('order', 'Número de pedido', order, 'Lo encuentras en el recibo de tu compra (si lo tienes).'),
field('message', 'Tu mensaje', message), trap, err, btn));
