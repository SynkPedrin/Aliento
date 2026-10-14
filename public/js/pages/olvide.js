import { $, api, h, renderHeader, setBusy } from '../ui.js';

renderHeader($('[data-header]'));
const root = $('[data-root]');
const email = h('input', { class: 'input', id: 'email', type: 'email', autocomplete: 'email', required: true });
const btn = h('button', { class: 'btn btn--lg btn--block', type: 'submit' }, 'Enviar enlace');
const err = h('p', { class: 'form-error', role: 'alert' });
root.replaceChildren(h('form', { class: 'stack', onsubmit: async (e) => {
  e.preventDefault();
  err.textContent = '';
  setBusy(btn, true);
  try {
    await api('/api/auth/forgot', { method: 'POST', body: { email: email.value } });
    root.replaceChildren(h('h1', { class: 'title-md' }, 'Revisa tu correo'),
      h('p', { class: 'muted u-mt-8' }, 'Si existe una cuenta con ese correo, te hemos enviado un enlace para crear una nueva contraseña. Puede tardar unos minutos; revisa también la carpeta de spam.'),
      h('p', { class: 'u-mt-16' }, h('a', { href: '/acceso?modo=entrar' }, 'Volver a iniciar sesión')));
  } catch (e2) { setBusy(btn, false); err.textContent = e2.message; }
} },
h('h1', { class: 'title-md' }, '¿Olvidaste tu contraseña?'),
h('p', { class: 'muted' }, 'Escribe tu correo y te enviaremos un enlace para crear una nueva.'),
h('div', { class: 'field' }, h('label', { for: 'email' }, 'Correo electrónico'), email), err, btn,
h('a', { class: 'link', href: '/acceso?modo=entrar' }, 'Volver')));
