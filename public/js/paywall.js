// Paywall: tres planes con precios reales de Stripe, condiciones visibles y
// botón principal "Comenzar mi transformación".
import { api, h, icon, moneyCents, setBusy, toast } from './ui.js';

export const FEATURES = [
  'Plan personalizado según tu estrategia y tus gatillos',
  'Objetivo diario de cigarrillos adaptado semana a semana',
  'Registro diario y gráficos de evolución',
  'Botón SOS y respiración guiada para los antojos',
  'Diario de gatillos para descubrir tus patrones',
  'Contador de dinero ahorrado y cigarrillos evitados',
  'Metas semanales y recordatorios configurables',
];

const PLAN_KEY = 'fg_plan';

export function rememberPlan(id) { try { sessionStorage.setItem(PLAN_KEY, id); } catch {} }
export function rememberedPlan() { try { return sessionStorage.getItem(PLAN_KEY); } catch { return null; } }

/** Lanza Stripe Checkout para el plan; si no hay sesión, pasa por la identificación. */
export async function goToCheckout(plan, btn, { exitOffer = false } = {}) {
  rememberPlan(plan);
  if (btn) setBusy(btn, true, 'Preparando el pago seguro…');
  try {
    const { url } = await api('/api/checkout', { method: 'POST', body: { plan, exitOffer } });
    window.location.assign(url);
  } catch (err) {
    if (btn) setBusy(btn, false);
    if (err.code === 'AUTH_REQUIRED') return window.location.assign(`/acceso?plan=${encodeURIComponent(plan)}${exitOffer ? '&oferta=1' : ''}`);
    if (err.code === 'ALREADY_SUBSCRIBED') return window.location.assign('/dashboard');
    if (err.code === 'NO_RESULT') return window.location.assign('/test');
    toast(err.message, 6000);
  }
}

/** Recomendado en el centro, como en una lista de precios clásica. */
export function displayOrder(plans) {
  const rec = plans.find((p) => p.recommended);
  if (!rec || plans.length !== 3) return plans;
  const rest = plans.filter((p) => p !== rec);
  return [rest[0], rec, rest[1]];
}

export const perDay = (p) => moneyCents(Math.round(p.amount / p.days), p.currency);

/** Lista de planes seleccionable (radio). Se usa en el paywall y en la identificación. */
export function planList(plans, selected, onSelect, { compact = false } = {}) {
  const rows = displayOrder(plans).map((p) => h('button', {
    type: 'button', role: 'radio', 'data-id': p.id, disabled: !p.available,
    class: `plan-row${p.recommended ? ' plan-row--recommended' : ''}${compact ? ' plan-row--compact' : ''}`,
    'aria-checked': String(p.id === selected),
    onclick: () => { rows.forEach((r) => r.setAttribute('aria-checked', String(r.dataset.id === p.id))); onSelect(p.id); },
  },
  p.recommended ? h('span', { class: 'plan-row__badge' }, 'Recomendado para ti') : null,
  h('span', { class: 'plan-row__radio', 'aria-hidden': 'true' }),
  h('span', { class: 'plan-row__main' },
    h('span', { class: 'plan-row__name' }, p.title),
    h('span', { class: 'plan-row__total' }, p.available ? `${moneyCents(p.amount, p.currency)} ${p.periodLabel}` : 'Precio no disponible')),
  p.available ? h('span', { class: 'plan-row__day' }, h('strong', {}, perDay(p)), h('span', {}, 'al día')) : null));
  return h('div', { class: 'plan-list', role: 'radiogroup', 'aria-label': 'Elige tu plan' }, rows);
}

/**
 * Oferta de salida: al intentar salir del paywall (ratón hacia fuera de la ventana o botón «atrás»)
 * se pide al servidor; solo existe una vez por cuestionario y es un cupón real del primer pago.
 */
function armExitOffer() {
  let armed = true;
  const trigger = async () => {
    if (!armed) return;
    armed = false;
    document.removeEventListener('mouseout', onMouseOut);
    let offer = null;
    try { ({ offer } = await api('/api/exit-offer', { method: 'POST' })); } catch { return; }
    if (offer) showExitOffer(offer);
  };
  const onMouseOut = (e) => { if (!e.relatedTarget && e.clientY <= 0) trigger(); };
  document.addEventListener('mouseout', onMouseOut);
  // Móvil: el primer «atrás» abre la oferta en lugar de salir.
  history.pushState({ paywall: true }, '');
  window.addEventListener('popstate', function onPop() {
    window.removeEventListener('popstate', onPop);
    if (armed) trigger(); else history.back();
  });
}

function showExitOffer(offer) {
  const price = moneyCents(offer.amount, offer.currency);
  const discounted = moneyCents(offer.discountedAmount, offer.currency);
  const card = h('div', { class: 'card modal__card', style: 'text-align:center' });
  const overlay = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'offer-title' }, card);
  const close = () => overlay.remove();
  const accept = h('button', { class: 'btn btn--lg btn--block' }, 'Aprovechar mi regalo');
  accept.addEventListener('click', () => goToCheckout(offer.plan, accept, { exitOffer: true }));
  card.append(
    h('h2', { class: 'title-md', id: 'offer-title' }, 'Un pequeño regalo antes de irte'),
    h('p', { class: 'muted u-mt-8' }, `Ya diste el primer paso. Para que empieces con buen pie, te regalamos un ${offer.percentOff ?? ''}% de descuento en tu primer pago.`),
    h('div', { class: 'offer-box' },
      h('p', { class: 'small' }, offer.title),
      h('p', { class: 'u-mt-8' }, h('s', {}, price), h('strong', {}, discounted)),
      h('p', { class: 'help u-mt-8' }, `Primer pago: ${discounted}. Después, ${price} ${offer.periodLabel} hasta que canceles.`)),
    h('p', { class: 'help' }, 'Esta oferta solo se muestra una vez.'),
    h('div', { class: 'stack u-mt-16' }, accept, h('button', { class: 'link', onclick: close }, 'No, gracias')));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  accept.focus();
}

export async function renderPaywall(root, { pendingCheckout } = {}) {
  root.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'skeleton', 'aria-label': 'Cargando planes' })));
  let data;
  try {
    data = await api('/api/plans');
  } catch (err) {
    root.replaceChildren(h('p', { class: 'notice' }, err.message));
    return;
  }
  const { plans, paymentsEnabled } = data;
  const fallback = plans.find((p) => p.recommended && p.available)?.id ?? plans.find((p) => p.available)?.id ?? plans[0].id;
  let selected = plans.find((p) => p.id === rememberedPlan() && p.available)?.id ?? fallback;

  const terms = h('div', { class: 'terms-box', 'aria-live': 'polite' });
  const cta = h('button', { type: 'button', class: 'btn btn--lg btn--block', onclick: () => goToCheckout(selected, cta) }, 'Comenzar mi transformación');
  if (!paymentsEnabled) cta.disabled = true;

  function renderTerms() {
    const p = plans.find((x) => x.id === selected);
    if (!p?.available) { terms.replaceChildren(h('p', {}, 'Los pagos no están disponibles ahora mismo. Tus resultados siguen guardados.')); return; }
    const price = moneyCents(p.amount, p.currency);
    terms.replaceChildren(h('dl', {},
      h('div', {}, h('dt', {}, 'Precio total'), h('dd', {}, `${price} por ${p.unit}. El primer cargo se realiza hoy al confirmar el pago.`)),
      h('div', {}, h('dt', {}, 'Renovación'), h('dd', {}, `Se renueva automáticamente ${p.periodLabel} por ${price} hasta que la canceles.`)),
      h('div', {}, h('dt', {}, 'Cancelación'), h('dd', {}, 'Cancela cuando quieras desde Mi cuenta. Conservas el acceso hasta el final del período ya pagado.')),
    ));
  }

  const resume = pendingCheckout
    ? h('div', { class: 'notice notice--wide' }, icon('info', 'notice__icon'),
      h('div', {}, h('strong', {}, 'Tu pago quedó pendiente. '), 'Tus respuestas y resultados están guardados; puedes retomarlo cuando quieras.'))
    : null;

  root.replaceChildren(...[
    resume,
    h('div', { class: 'paywall__choose' },
      planList(plans, selected, (id) => { selected = id; rememberPlan(id); renderTerms(); }),
      h('div', { class: 'paywall__cta' },
        cta,
        h('p', { class: 'tiny muted' }, 'Pago seguro procesado por Stripe. Al continuar aceptas los ',
          h('a', { href: '/terminos', target: '_blank' }, 'Términos de servicio'), ' y la ',
          h('a', { href: '/privacidad', target: '_blank' }, 'Política de privacidad'), '.')),
      terms),
    h('div', { class: 'paywall__features' },
      h('div', { class: 'card card--flat' },
        h('h3', {}, 'Todos los planes incluyen'),
        h('ul', { class: 'feature-list', style: 'margin-top:16px' }, FEATURES.map((f) => h('li', {}, icon('check'), h('span', {}, f))))),
      h('div', { class: 'card card--flat' },
        h('h3', {}, 'Siempre gratis y accesible'),
        h('ul', { class: 'feature-list', style: 'margin-top:16px' },
          ['Tus resultados del cuestionario y sus gráficos', 'Tus datos personales y su descarga', 'La gestión y cancelación de tu suscripción']
            .map((f) => h('li', {}, icon('shield'), h('span', {}, f)))))),
    h('p', { class: 'tiny muted u-text-center u-mt-16' }, 'Aliento es un programa de apoyo y no sustituye el consejo de un profesional sanitario.'),
  ].filter(Boolean));
  renderTerms();
  if (paymentsEnabled) armExitOffer();
}
