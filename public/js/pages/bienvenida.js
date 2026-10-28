// La activación la hace el webhook de Stripe. Esta página solo consulta el
// estado guardado en el servidor: la redirección por sí sola no activa nada.
import { $, api, brandLink, h, LOGO_BRANCO_HTML, setBusy } from '../ui.js';
import { installAction, installState } from '../install.js';
import { pixelFor } from '../track.js';

$('[data-brand-wrap]').append(brandLink('/', { dark: true }));
const root = $('[data-root]');
const sessionId = new URLSearchParams(location.search).get('session_id') ?? '';
const started = Date.now();
let PROGRAM = 'sem-fumo';
let PROGRAM_NAME = 'Sem Fumo';

/** Destino tras la bienvenida: Sem Fumo va a su configuración; los demás, a su programa. */
const destination = () => (PROGRAM === 'sem-fumo' ? '/configuracion' : `/programa?p=${PROGRAM}&nuevo=1`);

let needsPassword = false;
let accountEmail = '';

function showWelcome() {
  // Compra sin registro previo: primero crea la contraseña; después, instalar la app.
  const afterPassword = installState() === 'installed' ? () => location.assign(destination()) : showInstall;
  const next = needsPassword ? () => showPassword(afterPassword) : afterPassword;
  root.replaceChildren(
    h('div', { class: 'hero__mark', html: LOGO_BRANCO_HTML }),
    h('h1', { class: 'title-xl' }, '¡Tu camino comienza aquí!'),
    h('p', { class: 'lead' }, 'Gracias por dar este primer paso.'),
    h('p', { class: 'welcome-program' }, h('strong', {}, PROGRAM_NAME), h('br'), h('span', { class: 'muted' }, 'Tu programa está listo.')),
    h('p', { class: 'u-mt-16' }, h('button', { class: 'btn btn--lg', onclick: next }, 'Continuar')),
  );
}

/** Crea la contraseña de acceso a la app (la cuenta nació en el checkout con el e-mail del pago). */
function showPassword(next) {
  // E-mail del pago, bloqueado; «Corregir» lo libera por si hubo un error al escribirlo en Stripe.
  const email = h('input', { class: 'input', id: 'em', type: 'email', autocomplete: 'email', value: accountEmail, readonly: true, required: true });
  const fix = h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { email.readOnly = false; email.focus(); email.select(); fix.remove(); } }, 'Corregir');
  const pass = h('input', { class: 'input', id: 'pw', type: 'password', autocomplete: 'new-password', minlength: '8', required: true });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const cta = h('button', { class: 'btn btn--lg btn--block', type: 'submit' }, 'Guardar y continuar');
  const form = h('form', { class: 'stack welcome-form' },
    h('label', { class: 'field', for: 'em' }, h('span', { class: 'field__label' }, 'Correo de tu cuenta'), email),
    h('p', { class: 'help' }, 'Es el correo que usaste al pagar. Con él entrarás en la app.', ' ', fix),
    h('label', { class: 'field', for: 'pw' }, h('span', { class: 'field__label' }, 'Crea tu contraseña'), pass),
    h('p', { class: 'help' }, 'Mínimo 8 caracteres. La usarás para entrar en la app.'), err, cta);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    setBusy(cta, true, 'Guardando…');
    try {
      if (email.value.trim().toLowerCase() !== accountEmail.toLowerCase()) {
        accountEmail = (await api('/api/auth/first-email', { method: 'POST', body: { email: email.value } })).email;
      }
      await api('/api/auth/first-password', { method: 'POST', body: { password: pass.value } }); needsPassword = false; next();
    } catch (ex) { setBusy(cta, false); err.textContent = ex.message; }
  });
  root.replaceChildren(
    h('div', { class: 'hero__mark', html: LOGO_BRANCO_HTML }),
    h('h1', { class: 'title-lg' }, 'Crea tu acceso'),
    h('p', { class: 'lead' }, 'Así podrás entrar en la app desde cualquier dispositivo.'),
    form);
  pass.focus();
}

/** Ofrece instalar la app. Nunca es obligatorio: siempre se puede seguir en el navegador. */
function showInstall() {
  const help = h('div', { class: 'install-help', 'aria-live': 'polite' });
  const installBtn = h('button', { class: 'btn btn--lg btn--block' }, 'Instalar Alento');
  installBtn.addEventListener('click', async () => {
    const result = await installAction((content) => help.replaceChildren(h('div', { class: 'card install-card' }, ...content),
      h('p', { class: 'u-mt-16' }, h('a', { class: 'btn btn--ghost', href: destination() }, 'Ya está, continuar'))));
    if (result === 'accepted' || result === 'installed') location.assign(destination());
    if (result === 'dismissed') help.replaceChildren(h('p', { class: 'muted small' }, 'Sin problema: puedes instalar Alento más tarde desde Mi perfil.'));
  });
  root.replaceChildren(
    h('div', { class: 'hero__mark', html: LOGO_BRANCO_HTML }),
    h('h1', { class: 'title-lg' }, 'Lleva Alento contigo.'),
    h('p', { class: 'lead' }, 'Un pequeño espacio para ti, siempre que lo necesites.'),
    h('div', { class: 'stack u-mt-16 install-actions' }, installBtn,
      h('a', { class: 'btn btn--ghost btn--block', href: destination() }, 'Continuar sin instalar')),
    help,
  );
}

function showMessage(title, text, actions) {
  root.replaceChildren(h('h1', { class: 'title-md' }, title), h('p', { class: 'muted' }, text), h('p', { style: 'margin-top:24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap' }, actions));
}

async function poll() {
  try {
    const st = await api(`/api/checkout/status?session_id=${encodeURIComponent(sessionId)}`);
    if (st.program) {
      PROGRAM = st.program;
      const cat = await api('/api/catalog').catch(() => null);
      PROGRAM_NAME = cat?.programs?.find((x) => x.slug === PROGRAM)?.name ?? PROGRAM;
    }
    if (st.state === 'active') {
      const me = await api('/api/me').catch(() => ({}));
      needsPassword = Boolean(me.needsPassword);
      accountEmail = me.user?.email ?? '';
      // Pixel de compra con el mismo event_id que la API de conversiones (una sola vez por pago).
      let firedKey = `al_px_${sessionId}`, fired = false;
      try { fired = sessionStorage.getItem(firedKey) === '1'; } catch { /* modo privado */ }
      if (!fired && st.purchaseEventId) {
        try { sessionStorage.setItem(firedKey, '1'); } catch { /* modo privado */ }
        pixelFor('purchase', st.purchaseEventId, { value: st.valueCents != null ? st.valueCents / 100 : undefined, currency: st.currency });
      }
      return showWelcome();
    }
    if (st.state === 'failed') {
      return showMessage('No se pudo completar el pago', 'No se ha activado ninguna suscripción. Tus resultados siguen guardados.',
        [h('a', { class: 'btn', href: '/planes' }, 'Volver a intentarlo')]);
    }
    if (st.state === 'unknown') {
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
