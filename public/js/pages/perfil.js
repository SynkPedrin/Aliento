// Mi perfil: accesible con o sin suscripción activa.
import { $, api, h, longDate, setBusy, toast } from '../ui.js';
import { MORE, errorState, initApp, loading, modal, page, userTimezone } from '../shell.js';
import { installAction, installState } from '../install.js';

const me = await initApp({ active: '/perfil', access: 'account' });
const root = $('[data-root]');

const ZONES = ['America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires',
  'America/Caracas', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid', 'Atlantic/Canary', 'UTC'];

async function load() {
  loading(root);
  let p;
  try { p = await api('/api/profile'); } catch (err) { return errorState(root, err, load); }
  page(root, { eyebrow: 'Tu cuenta', title: 'Mi perfil' });

  // ---- Datos personales
  const zones = [...new Set([p.timezone, userTimezone(), ...ZONES])];
  const name = h('input', { class: 'input', id: 'name', value: p.name, maxlength: 80, autocomplete: 'given-name', required: true });
  const tz = h('select', { class: 'select', id: 'tz' }, zones.map((z) => h('option', { value: z, selected: z === p.timezone }, z.replace(/_/g, ' '))));
  const lang = h('select', { class: 'select', id: 'lang', disabled: true }, h('option', { value: 'es' }, 'Español'));
  const saveBtn = h('button', { class: 'btn btn--sm', type: 'submit' }, 'Guardar');
  const personal = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault();
    setBusy(saveBtn, true);
    try { await api('/api/profile', { method: 'PATCH', body: { name: name.value, timezone: tz.value } }); toast('Datos guardados.'); } catch (err) { toast(err.message); } finally { setBusy(saveBtn, false); }
  } },
  h('h2', { class: 'title-md' }, 'Datos personales'),
  h('div', { class: 'form-grid' },
    h('div', { class: 'field' }, h('label', { for: 'name' }, 'Nombre'), name),
    h('div', { class: 'field' }, h('label', {}, 'Correo electrónico'), h('p', { class: 'muted' }, p.email))),
  h('div', { class: 'form-grid' },
    h('div', { class: 'field' }, h('label', { for: 'tz' }, 'Zona horaria'), tz, h('span', { class: 'help' }, 'Define qué cuenta como «hoy» en tus registros.')),
    h('div', { class: 'field' }, h('label', { for: 'lang' }, 'Idioma'), lang)),
  h('p', { class: 'help' }, `Cuenta creada el ${longDate(p.createdAt)}.`),
  h('div', {}, saveBtn));

  // ---- Contraseña
  const cur = h('input', { class: 'input', type: 'password', id: 'cur', autocomplete: 'current-password', required: true });
  const next = h('input', { class: 'input', type: 'password', id: 'next', autocomplete: 'new-password', minlength: 8, required: true });
  const pwBtn = h('button', { class: 'btn btn--sm', type: 'submit' }, 'Actualizar contraseña');
  const pwErr = h('p', { class: 'form-error', role: 'alert' });
  const password = h('form', { class: 'card stack', onsubmit: async (e) => {
    e.preventDefault();
    pwErr.textContent = '';
    setBusy(pwBtn, true);
    try { await api('/api/profile/password', { method: 'POST', body: { current: cur.value, next: next.value } }); cur.value = ''; next.value = ''; toast('Contraseña actualizada.'); } catch (err) { pwErr.textContent = err.message; } finally { setBusy(pwBtn, false); }
  } },
  h('h2', { class: 'title-md' }, 'Contraseña'),
  h('div', { class: 'form-grid' },
    h('div', { class: 'field' }, h('label', { for: 'cur' }, 'Contraseña actual'), cur),
    h('div', { class: 'field' }, h('label', { for: 'next' }, 'Nueva contraseña'), next, h('span', { class: 'help' }, 'Entre 8 y 72 caracteres.'))),
  pwErr, h('div', {}, pwBtn));

  // ---- Accesos
  const links = h('section', { class: 'card' },
    h('h2', { class: 'title-md' }, 'Ajustes y más'),
    h('ul', { class: 'list' },
      [{ href: '/suscripcion', label: 'Mi suscripción' }, { href: '/notificaciones', label: 'Notificaciones' }, ...(me.access ? MORE : []),
        { href: '/terminos', label: 'Términos de servicio' }, { href: '/privacidad', label: 'Política de privacidad' }]
        .map((l) => h('li', {}, h('a', { class: 'list__main', href: l.href }, l.label), h('span', { class: 'help', 'aria-hidden': 'true' }, '›')))));

  // ---- Datos y cuenta
  const data = h('section', { class: 'card stack' },
    h('h2', { class: 'title-md' }, 'Tus datos'),
    h('p', { class: 'muted small' }, 'Puedes descargar todos tus datos o eliminar tu cuenta. Tus resultados del cuestionario siempre son gratuitos.'),
    h('div', { class: 'actions-row', style: 'margin:0' },
      me.hasResult ? h('a', { class: 'btn btn--ghost btn--sm', href: '/resultados' }, 'Ver mis resultados') : null,
      h('a', { class: 'btn btn--ghost btn--sm', href: '/api/account/export' }, 'Descargar mis datos'),
      h('button', { class: 'btn btn--ghost btn--sm', onclick: deleteAccount }, 'Eliminar mi cuenta')),
    h('button', { class: 'link', onclick: async () => { await api('/api/auth/logout', { method: 'POST' }); location.assign('/'); } }, 'Cerrar sesión'));

  const app = installState() === 'installed'
    ? h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'App instalada'), h('p', { class: 'muted small u-mt-8' }, 'Estás usando Aliento como app en este dispositivo.'))
    : h('section', { class: 'card stack' }, h('h2', { class: 'title-md' }, 'Instalar la app'),
      h('p', { class: 'muted small' }, 'Añade Aliento a tu pantalla de inicio para abrirlo como una app y recibir recordatorios.'),
      h('div', {}, h('button', { class: 'btn btn--sm', onclick: () => installAction((content) => modal((close) => [...content, h('button', { class: 'btn btn--block u-mt-16', onclick: close }, 'Entendido')], { label: 'Instalar Aliento' })) }, 'Instalar Aliento')));
  root.append(h('div', { class: 'stack' }, personal, password, app, links, data));
}

function deleteAccount() {
  modal((close) => {
    const pw = h('input', { class: 'input', type: 'password', id: 'delpw', autocomplete: 'current-password' });
    const confirmIn = h('input', { class: 'input', id: 'delconf', placeholder: 'ELIMINAR' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const btn = h('button', { class: 'btn btn--block', type: 'submit' }, 'Eliminar definitivamente');
    return [h('form', { class: 'stack', onsubmit: async (e) => {
      e.preventDefault();
      setBusy(btn, true);
      try {
        await api('/api/account', { method: 'DELETE', body: { password: pw.value, confirm: confirmIn.value.trim() } });
        location.assign('/?cuenta=eliminada');
      } catch (e2) {
        setBusy(btn, false);
        err.replaceChildren(e2.message, e2.code === 'ACTIVE_SUBSCRIPTION' ? h('span', {}, ' ', h('a', { href: '/suscripcion' }, 'Ir a Mi suscripción')) : '');
      }
    } },
    h('h2', { class: 'title-md' }, 'Eliminar mi cuenta'),
    h('p', { class: 'muted small' }, 'Se borrarán tu perfil, tus registros, tu progreso y tus respuestas. No se puede deshacer. Si tienes una suscripción que se renueva, cancélala antes.'),
    h('div', { class: 'field' }, h('label', { for: 'delpw' }, 'Tu contraseña'), pw),
    h('div', { class: 'field' }, h('label', { for: 'delconf' }, 'Escribe ELIMINAR para confirmar'), confirmIn),
    err, btn, h('button', { type: 'button', class: 'link', onclick: close }, 'Cancelar'))];
  }, { label: 'Eliminar mi cuenta' });
}

load();
