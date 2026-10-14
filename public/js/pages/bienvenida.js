// La activación la hace el webhook de Stripe. Esta página solo consulta el
// estado guardado en el servidor: la redirección por sí sola no activa nada.
import { $, api, brandLink, h, MARK_SVG } from '../ui.js';

$('[data-brand-wrap]').append(brandLink('/'));
const root = $('[data-root]');
const sessionId = new URLSearchParams(location.search).get('session_id') ?? '';
const started = Date.now();

function showWelcome() {
  root.replaceChildren(
    h('div', { class: 'hero__mark', html: MARK_SVG }),
    h('h1', { class: 'title-xl' }, '¡Bienvenido a Aliento!'),
    h('p', { class: 'lead' }, 'Hoy comienza una nueva etapa.'),
    h('p', { class: 'muted' }, 'Tu suscripción está activa y tu plan personalizado está listo. Vamos a configurarlo en tres pasos.'),
    h('p', { style: 'margin-top:32px' }, h('a', { class: 'btn btn--lg', href: '/configuracion' }, 'Configurar mi plan')),
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
