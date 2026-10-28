// El enlace del correo de Supabase llega con los tokens en el fragmento (#access_token=…).
// El fragmento nunca viaja al servidor en la URL; lo enviamos una vez, por POST, al fijar la contraseña.
import { $, api, h, renderHeader, setBusy } from '../ui.js';

renderHeader($('[data-header]'));
const root = $('[data-root]');
const hash = new URLSearchParams(location.hash.slice(1));
const accessToken = hash.get('access_token');
const refreshToken = hash.get('refresh_token');
const tokenHash = new URLSearchParams(location.search).get('th'); // link do nosso e-mail: o token só é usado ao salvar
history.replaceState(null, '', location.pathname); // borra los tokens de la barra de direcciones

if (!tokenHash && (!accessToken || hash.get('type') !== 'recovery')) {
  root.replaceChildren(h('h1', { class: 'title-md' }, 'Enlace no válido'),
    h('p', { class: 'muted u-mt-8' }, hash.get('error_description') ?? 'El enlace ha caducado o ya se usó. Solicita uno nuevo.'),
    h('p', { class: 'u-mt-16' }, h('a', { class: 'btn', href: '/olvide' }, 'Solicitar un enlace nuevo')));
} else {
  const pw = h('input', { class: 'input', id: 'pw', type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const pw2 = h('input', { class: 'input', id: 'pw2', type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const btn = h('button', { class: 'btn btn--lg btn--block', type: 'submit' }, 'Guardar contraseña');
  const err = h('p', { class: 'form-error', role: 'alert' });
  root.replaceChildren(h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (pw.value !== pw2.value) { err.textContent = 'Las contraseñas no coinciden.'; return; }
    setBusy(btn, true);
    try {
      await api('/api/auth/reset', { method: 'POST', body: tokenHash ? { tokenHash, password: pw.value } : { accessToken, refreshToken, password: pw.value } });
      const me = await api('/api/me');
      location.assign(me.access ? '/dashboard' : '/perfil');
    } catch (e2) { setBusy(btn, false); err.textContent = e2.message; }
  } },
  h('h1', { class: 'title-md' }, 'Crea una nueva contraseña'),
  h('div', { class: 'field' }, h('label', { for: 'pw' }, 'Nueva contraseña'), pw, h('span', { class: 'help' }, 'Entre 8 y 72 caracteres.')),
  h('div', { class: 'field' }, h('label', { for: 'pw2' }, 'Repite la contraseña'), pw2), err, btn));
}
