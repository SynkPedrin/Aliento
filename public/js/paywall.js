// Paywall: tres planes con precios reales de Stripe, condiciones visibles y
// botón principal "Comenzar mi transformación".
import { api, h, icon, moneyCents, setBusy, toast } from './ui.js';
import { isNativeApp, nativePurchase, loadNativePlans } from './native-iap.js';
import { pixelFor, track } from './track.js';
import { needsLead, renderLeadGate } from './lead-gate.js';

export const FEATURES = [
  'Jornada de 10 capítulos y 30 lecciones con ejercicios prácticos',
  'Plan personalizado según tu estrategia y tus gatillos',
  'Registro de cigarrillos y del botón «Tengo ganas de fumar»',
  'Ejercicios de respiración guiada',
  'Mis objetivos, Mi diario de ánimo y Mis logros',
  'Gráficos de progreso y estimación del dinero ahorrado',
  'Recordatorios opcionales en tu dispositivo',
];

const FEATURES_BY_PROGRAM = {
  alcohol: [
    'Jornada de capítulos y lecciones con ejercicios prácticos',
    'Diario de consumo y registro de contextos',
    'Identificación de tus gatillos recursivos',
    'Ejercicios de respiración guiada',
    'Metas semanales a tu ritmo',
    'Gráficos de progreso y ahorro estimado',
    'Recordatorios opcionales en tu dispositivo',
  ],
  azucar: [
    'Jornada de capítulos y lecciones con ejercicios prácticos',
    'Diario de hábitos dulces y nivel de energía',
    'Mapa de antojos: hambre física vs. emocional',
    'Metas sencillas sin dietas extremas',
    'Gráficos de regularidad y avances',
    'Recordatorios opcionales en tu dispositivo',
  ],
  ansiedad: [
    'Jornada de capítulos y lecciones con ejercicios prácticos',
    'Diario emocional con registro de gatillos',
    'Respiración guiada y anclajes para el día a día',
    'Termómetro de calma y actividades',
    'Gráficos de tu evolución',
    'Recordatorios opcionales en tu dispositivo',
  ],
  sueno: [
    'Jornada de capítulos y lecciones con ejercicios prácticos',
    'Diario del sueño con horarios y calidad percibida',
    'Rutina nocturna paso a paso',
    'Ejercicios de respiración para dormir',
    'Gráficos de regularidad y descanso',
    'Recordatorios opcionales en tu dispositivo',
  ],
};
const programFeatures = (program) => FEATURES_BY_PROGRAM[program] ?? FEATURES;

const PLAN_KEY = 'fg_plan';
const LEFT_KEY = 'alento_checkout_left';
let busyBtn = null;

export function rememberPlan(id) { try { sessionStorage.setItem(PLAN_KEY, id); } catch {} }
export function rememberedPlan() { try { return sessionStorage.getItem(PLAN_KEY); } catch { return null; } }

/** Lanza Stripe Checkout para el plan; si no hay sesión, pasa por la identificación. */
export async function goToCheckout(plan, btn, { exitOffer = false, program = 'sem-fumo', fromCatalog = false } = {}) {
  rememberPlan(plan);
  track('plan_selected', { plan, program });
  if (btn) setBusy(btn, true, 'Preparando el pago seguro…');
  try {
    if (isNativeApp()) { // app iOS: compra con StoreKit, nunca Stripe
      const r = await nativePurchase(program, plan);
      if (btn) setBusy(btn, false);
      if (r.status === 'success') return window.location.assign(program === 'sem-fumo' ? '/bienvenida' : `/programa?p=${program}`);
      if (r.status === 'pending') toast('Tu compra está pendiente de aprobación. Te avisaremos cuando se active.', 6000);
      return;
    }
    const { url, eventId } = await api('/api/checkout', { method: 'POST', body: { plan, exitOffer, program, fromCatalog } });
    if (eventId) await Promise.race([pixelFor('checkout_started', eventId), new Promise((r) => setTimeout(r, 400))]); // mismo event_id que la API de conversiones
    if (!exitOffer) { try { sessionStorage.setItem(LEFT_KEY, JSON.stringify({ plan, program })); } catch {} }
    busyBtn = btn;
    window.location.assign(url);
  } catch (err) {
    if (btn) setBusy(btn, false);
    if (err.code === 'AUTH_REQUIRED') {
      return window.location.assign(`/acceso?plan=${encodeURIComponent(plan)}&program=${encodeURIComponent(program)}${exitOffer ? '&oferta=1' : ''}`);
    }
    if (err.code === 'ALREADY_SUBSCRIBED') return window.location.assign(program === 'sem-fumo' ? '/dashboard' : `/programa?p=${program}`);
    if (err.code === 'NO_RESULT') return window.location.assign(program === 'sem-fumo' ? '/test' : `/quiz/${program}`);
    toast(err.message, 6000);
  }
}

/** Recomendado en el centro, como en una lista de precios clásica. */
export function displayOrder(allPlans) {
  // Solo se muestran los planes realmente configurados en Stripe.
  const plans = allPlans.some((p) => p.available) ? allPlans.filter((p) => p.available) : allPlans;
  const rec = plans.find((p) => p.recommended);
  if (!rec || plans.length !== 3) return plans;
  const rest = plans.filter((p) => p !== rec);
  return [rest[0], rec, rest[1]];
}

export const perDay = (p) => moneyCents(Math.round(p.amount / p.days), p.currency);

/** Lista de planes seleccionable (radio). Se usa en el paywall y en la identificación. */
export function planList(plans, selected, onSelect, { compact = false, titles = {}, discountBadge = false } = {}) {
  const pctOff = (p) => (p.renewalAmount ? Math.round((1 - p.amount / p.renewalAmount) * 100) : 0);
  const rows = displayOrder(plans).map((p) => h('button', {
    type: 'button', role: 'radio', 'data-id': p.id, disabled: !p.available,
    class: `plan-row${p.recommended ? ' plan-row--recommended' : ''}${compact ? ' plan-row--compact' : ''}`,
    'aria-checked': String(p.id === selected),
    onclick: () => { rows.forEach((r) => r.setAttribute('aria-checked', String(r.dataset.id === p.id))); onSelect(p.id); },
  },
  p.recommended ? h('span', { class: 'plan-row__badge' }, discountBadge && pctOff(p) ? `¡${pctOff(p)} % de descuento!` : 'Recomendado para ti') : null,
  h('span', { class: 'plan-row__radio', 'aria-hidden': 'true' }),
  h('span', { class: 'plan-row__main' },
    h('span', { class: 'plan-row__name' }, titles[p.id] ?? p.title),
    h('span', { class: 'plan-row__total' }, !p.available ? 'Precio no disponible'
      : p.renewalAmount ? [h('s', {}, moneyCents(p.renewalAmount, p.currency)), ' ', h('strong', {}, p.displayPrice ?? moneyCents(p.amount, p.currency)), ' el primer período']
        : `${(p.displayPrice ?? moneyCents(p.amount, p.currency))} ${p.periodLabel}`)),
  p.available && !p.native ? h('span', { class: 'plan-row__day' }, h('strong', {}, perDay(p)), h('span', {}, 'al día')) : null));
  return h('div', { class: 'plan-list', role: 'radiogroup', 'aria-label': 'Elige tu plan' }, rows);
}

/**
 * Oferta de salida: al intentar salir del paywall (ratón hacia fuera de la ventana o botón «atrás»)
 * se pide al servidor; solo existe una vez por cuestionario y es un cupón real del primer pago.
 */
function armExitOffer(program) {
  let armed = true;
  const trigger = async () => {
    if (!armed) return;
    armed = false;
    document.removeEventListener('mouseout', onMouseOut);
    let offer = null;
    try { ({ offer } = await api('/api/exit-offer', { method: 'POST', body: { program } })); } catch { return; }
    if (offer) showExitOffer(offer, program);
  };
  const onMouseOut = (e) => { if (!e.relatedTarget && e.clientY <= 0) trigger(); };
  // Solo intención de salida en escritorio. No se intercepta el botón «atrás» del móvil.
  document.addEventListener('mouseout', onMouseOut);
}

// Stripe Checkout no tiene botón «volver»: quien vuelve con el «atrás» del navegador ve la oferta,
// con el plan que había elegido. El servidor decide si aún le corresponde (una vez por cuestionario).
window.addEventListener('pageshow', async () => {
  let left = null;
  try { left = JSON.parse(sessionStorage.getItem(LEFT_KEY)); sessionStorage.removeItem(LEFT_KEY); } catch { return; }
  if (!left) return;
  if (busyBtn) { setBusy(busyBtn, false); busyBtn = null; } // página restaurada desde la caché del navegador
  let offer = null;
  try { ({ offer } = await api('/api/exit-offer', { method: 'POST', body: left })); } catch { return; }
  if (offer) showExitOffer(offer, left.program);
});

function showExitOffer(offer, program = 'sem-fumo') {
  const price = moneyCents(offer.amount, offer.currency);
  const discounted = moneyCents(offer.discountedAmount, offer.currency);
  const card = h('div', { class: 'card modal__card', style: 'text-align:center' });
  const overlay = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'offer-title' }, card);
  const close = () => overlay.remove();
  const accept = h('button', { class: 'btn btn--lg btn--block' }, 'Aprovechar mi regalo');
  accept.addEventListener('click', () => goToCheckout(offer.plan, accept, { exitOffer: true, program }));
  card.append(
    h('h2', { class: 'title-md', id: 'offer-title' }, 'Un pequeño regalo antes de irte'),
    h('p', { class: 'muted u-mt-8' }, `Ya diste el primer paso. Para que empieces con buen pie, te regalamos un ${offer.percentOff ?? ''}% de descuento en tu primer pago.`),
    h('div', { class: 'offer-box' },
      h('p', { class: 'small' }, offer.title),
      h('p', { class: 'u-mt-8' }, h('s', {}, price), h('strong', {}, discounted)),
      h('p', { class: 'help u-mt-8' }, `Primer pago: ${discounted}. Después, ${offer.renewalAmount ? moneyCents(offer.renewalAmount, offer.currency) : price} ${offer.periodLabel} hasta que canceles.`)),
    h('p', { class: 'help' }, 'Esta oferta solo se muestra una vez.'),
    h('div', { class: 'stack u-mt-16' }, accept, h('button', { class: 'link', onclick: close }, 'No, gracias')));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // mantiene el foco dentro del diálogo
      const f = [...card.querySelectorAll('button, a[href]')];
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.body.append(overlay);
  accept.focus();
}

export async function renderPaywall(root, { pendingCheckout, program = 'sem-fumo', purchasable = true, variant = 'default' } = {}) {
  // Embudo: quiz → e-mail → plan. A quien aún no dejó su e-mail se lo pedimos antes de mostrar los precios.
  if (!isNativeApp() && await needsLead()) {
    return renderLeadGate(root, { program, onDone: () => renderPaywall(root, { pendingCheckout, program, purchasable }) });
  }
  track('plan_viewed', { program });
  root.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'skeleton', 'aria-label': 'Cargando planes' })));
  let data;
  try {
    data = isNativeApp() ? await loadNativePlans(program) : await api(`/api/plans?program=${encodeURIComponent(program)}`);
  } catch (err) {
    root.replaceChildren(h('p', { class: 'notice' }, err.message));
    return;
  }
  const { plans, paymentsEnabled } = data;
  if (!plans.length) {
    root.replaceChildren(h('p', { class: 'notice' }, 'No hay suscripciones disponibles para este programa en este momento.'));
    return;
  }
  const canPurchase = purchasable !== false && (data.purchasable ?? true) && paymentsEnabled;
  const fallback = plans.find((p) => p.recommended && p.available)?.id ?? plans.find((p) => p.available)?.id ?? plans[0].id;
  let selected = plans.find((p) => p.id === rememberedPlan() && p.available)?.id ?? fallback;

  const terms = h('div', { class: 'terms-box', 'aria-live': 'polite' });
  const cta = h('button', { type: 'button', class: 'btn btn--lg btn--block', onclick: () => goToCheckout(selected, cta, { program }) }, 'Comenzar mi transformación');
  if (!canPurchase) cta.disabled = true;

  function renderTerms() {
    const p = plans.find((x) => x.id === selected);
    if (!p?.available) { terms.replaceChildren(h('p', {}, 'Los pagos no están disponibles ahora mismo. Tus resultados siguen guardados.')); return; }
    if (!canPurchase) {
      terms.replaceChildren(h('p', {}, purchasable
        ? 'Los pagos no están disponibles ahora mismo. Tus resultados siguen guardados.'
        : 'Este programa todavía no está disponible para comprar. Sus resultados se guardan y te avisaremos cuando abra.'));
      return;
    }
    const price = (p.displayPrice ?? moneyCents(p.amount, p.currency));
    terms.replaceChildren(h('dl', {},
      h('div', {}, h('dt', {}, 'Precio total'), h('dd', {}, `${price} por ${p.unit}. El primer cargo se realiza hoy al confirmar el pago.`)),
      h('div', {}, h('dt', {}, 'Renovación'), h('dd', {}, p.renewalAmount
        ? `Precio de introducción solo en el primer período. Después se renueva automáticamente por ${moneyCents(p.renewalAmount, p.currency)} ${p.periodLabel} hasta que la canceles.`
        : `Se renueva automáticamente ${p.periodLabel} por ${price} hasta que la canceles.`)),
      h('div', {}, h('dt', {}, 'Cancelación'), h('dd', {}, 'Cancela cuando quieras desde Mi cuenta. Conservas el acceso hasta el final del período ya pagado.')),
    ));
  }

  if (variant === 'sales') return renderSalesPlans(root, { plans, selected, canPurchase, program, pendingCheckout });

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
        h('p', { class: 'tiny muted' }, isNativeApp() ? 'Pago gestionado por App Store. Al continuar aceptas los ' : 'Pago seguro procesado por Stripe. Al continuar aceptas los ',
          h('a', { href: '/terminos', target: '_blank' }, 'Términos de servicio'), ' y la ',
          h('a', { href: '/privacidad', target: '_blank' }, 'Política de privacidad'), '.')),
      terms),
    h('div', { class: 'paywall__features' },
      h('div', { class: 'card card--flat' },
        h('h3', {}, 'Todos los planes incluyen'),
        h('ul', { class: 'feature-list', style: 'margin-top:16px' }, programFeatures(program).map((f) => h('li', {}, icon('check'), h('span', {}, f))))),
      h('div', { class: 'card card--flat' },
        h('h3', {}, 'Siempre gratis y accesible'),
        h('ul', { class: 'feature-list', style: 'margin-top:16px' },
          ['Tus resultados del cuestionario y sus gráficos', 'Tus datos personales y su descarga', 'La gestión y cancelación de tu suscripción']
            .map((f) => h('li', {}, icon('shield'), h('span', {}, f)))))),
    h('p', { class: 'tiny muted u-text-center u-mt-16' }, 'Alento es un programa de apoyo y no sustituye el consejo de un profesional sanitario.'),
  ].filter(Boolean));
  renderTerms();
  if (paymentsEnabled && !isNativeApp()) armExitOffer(program);
}

// Bloque de planes de la página de venta (mismo contenido que el embudo original).
const SALES_TITLES = { semanal: 'Prueba de una semana', trimestral: 'Plan de 3 meses', mensual: 'Plan de 1 mes' };
const FIRST_PERIOD = { semanal: 'por la primera semana', mensual: 'por el primer mes', trimestral: 'por los primeros 3 meses', anual: 'por el primer año' };
const SALES_CTA = 'Empieza sin ningún riesgo';

function renderSalesPlans(root, { plans, selected, canPurchase, program, pendingCheckout }) {
  const legal = h('p', { class: 'sales-plans__legal' });
  const terms = h('input', { type: 'checkbox', id: 'sales-terms' });
  const cta = h('button', { type: 'button', class: 'btn btn--lg btn--block sales-plans__cta', disabled: true, onclick: () => goToCheckout(selected, cta, { program }) }, SALES_CTA);
  const update = () => {
    const p = plans.find((x) => x.id === selected);
    cta.disabled = !canPurchase || !terms.checked || !p?.available;
    if (!p?.available) { legal.textContent = ''; return; }
    const first = p.displayPrice ?? moneyCents(p.amount, p.currency);
    const renewal = moneyCents(p.renewalAmount ?? p.amount, p.currency);
    legal.textContent = `Al hacer clic en «${SALES_CTA}», acepto pagar ${first} ${FIRST_PERIOD[p.id] ?? ''}. Si no cancelo antes de que termine este periodo introductorio, Alento me cobrará automáticamente ${renewal} ${p.periodLabel} a través de mi método de pago a partir de entonces, hasta que cancele. Puedo cancelar en cualquier momento a través de la web, entrando en la página de suscripción de mi cuenta.`;
  };
  terms.addEventListener('change', update);
  root.replaceChildren(
    pendingCheckout ? h('div', { class: 'notice notice--wide' }, h('strong', {}, 'Tu pago quedó pendiente. '), 'Puedes retomarlo cuando quieras.') : '',
    planList(plans, selected, (id) => { selected = id; rememberPlan(id); update(); }, { titles: SALES_TITLES, discountBadge: true }),
    h('p', { class: 'sales-plans__cancel' }, icon('check'), 'Puedes darte de baja cuando quieras'),
    legal,
    h('label', { class: 'check sales-plans__terms', for: 'sales-terms' }, terms,
      h('span', {}, 'Al marcar esta casilla, acepto los ', h('a', { href: '/terminos', target: '_blank' }, 'Términos y condiciones'), ' de Alento.')),
    cta,
    h('p', { class: 'sales-plans__refund' }, 'Solo se pueden solicitar reembolsos dentro del plazo de garantía de devolución del dinero de 14 días, siempre y cuando el producto se haya utilizado de forma activa durante al menos 7 días (o 4 días en el caso de los planes semanales) y se pueda demostrar su uso con pruebas verificables.'),
    h('div', { class: 'sales-plans__pay', 'aria-label': 'Métodos de pago' }, ['paypal', 'applepay', 'visa', 'mastercard', 'maestro', 'discover', 'amex'].map((n) => h('img', { src: `/assets/quiz/pay/${n}.svg`, alt: n, width: 32, height: 20 }))));
  update();
  if (canPurchase && !isNativeApp()) armExitOffer(program);
}
