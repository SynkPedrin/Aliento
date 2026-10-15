// La activación la hace el webhook de Stripe. Esta página solo consulta el
// estado guardado en el servidor: la redirección por sí sola no activa nada.
import { $, api, brandLink, h, MARK_SVG } from '../ui.js';
import { installAction, installState } from '../install.js';

$('[data-brand-wrap]').append(brandLink('/'));
const root = $('[data-root]');
const sessionId = new URLSearchParams(location.search).get('session_id') ?? '';
const started = Date.now();

function showWelcome() {
  // Si ya se abre como app instalada, no se vuelve a ofrecer la instalación.
  const next = installState() === 'installed' ? () => location.assign('/configuracion') : showInstall;
  root.replaceChildren(
    h('div', { class: 'hero__mark', html: MARK_SVG }),
    h('h1', { class: 'title-xl' }, '¡Bienvenido a Aliento!'),
    h('p', { class: 'lead' }, 'Tu camino comienza hoy.'),
    h('p', { class: 'muted' }, 'Tu suscripción está activa y tu plan personalizado está listo.'),
    h('p', { class: 'u-mt-16' }, h('button', { class: 'btn btn--lg', onclick: next }, 'Continuar')),
  );
}

/** Ofrece instalar la app. Nunca es obligatorio: siempre se puede seguir en el navegador. */
function showInstall() {
  const help = h('div', { class: 'install-help', 'aria-live': 'polite' });
  const installBtn = h('button', { class: 'btn btn--lg btn--block' }, 'Instalar Aliento');
  installBtn.addEventListener('click', async () => {
    const result = await installAction((content) => help.replaceChildren(h('div', { class: 'card install-card' }, ...content),
      h('p', { class: 'u-mt-16' }, h('a', { class: 'btn btn--ghost', href: '/configuracion' }, 'Ya está, continuar'))));
    if (result === 'accepted' || result === 'installed') location.assign('/configuracion');
    if (result === 'dismissed') help.replaceChildren(h('p', { class: 'muted small' }, 'Sin problema: puedes instalar Aliento más tarde desde Mi perfil.'));
  });
  root.replaceChildren(
    h('div', { class: 'hero__mark', html: MARK_SVG }),
    h('h1', { class: 'title-lg' }, 'Ten Aliento siempre contigo.'),
    h('p', { class: 'lead' }, 'Instala la app en tu pantalla de inicio para abrirla con un toque, sin barra del navegador, y recibir tus recordatorios.'),
    h('div', { class: 'stack u-mt-16 install-actions' }, installBtn,
      h('a', { class: 'btn btn--ghost btn--block', href: '/configuracion' }, 'Continuar en el navegador')),
    help,
  );
}

function showMessage(title, text, actions) {
  root.replaceChildren(h('h1', { class: 'title-md' }, title), h('p', { class: 'muted' }, text), h('p', { style: 'margin-top:24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap' }, actions));
}

async function poll() {
  try {
    const { state } = await api(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`);
    if (state === 'active') return showWelcome();
    if (state === 'failed') {
      return showMessage('No se pudo completar el pago', 'No se ha activado ninguna suscripción. Tus resultados siguen guardados.',
        [h('a', { class: 'btn', href: '/planes' }, 'Volver a intentarlo')]);
    }
    if (state === 'unknown') {
      return showMessage('No encontramos este pago', 'Si acabas de pagar, revisa tu cuenta en unos minutos.',
        [h('a', { class: 'btn', href: '/suscripcion' }, 'Ver mi suscripción')]);
    }
    if (Date.now() - started > 90_000) {
      return showMessage('Tu pago se está procesando', 'Algunos métodos de pago tardan más en confirmarse. Te daremos acceso en cuanto Stripe lo confirme; puedes cerrar esta página.',
        [h('a', { class: 'btn', href: '/suscripcion' }, 'Ver mi suscripción'), h('button', { class: 'btn btn--ghost', onclick: () => location.reload() }, 'Comprobar de nuevo')]);
    }
    setTimeout(poll, 2000);
  } catch (err) {
    if (err.code === 'AUTH_REQUIRED') return window.location.replace(`/acceso?modo=entrar&next=${encodeURIComponent(location.pathname + location.search)}`);
    setTimeout(poll, 4000);
  }
}

poll();
