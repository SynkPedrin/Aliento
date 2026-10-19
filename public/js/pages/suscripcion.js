// Mi suscripción: siempre accesible con sesión, tenga o no acceso premium.
import { $, api, h, icon, longDate, moneyCents, setBusy, toast } from '../ui.js';
import { errorState, initApp, loading, page } from '../shell.js';
import { isNativeApp, nativeRestore } from '../native-iap.js';

await initApp({ active: '/perfil', access: 'account' });
const root = $('[data-root]');

const PLAN_NAMES = { semanal: 'Plan de 1 semana', mensual: 'Plan de 1 mes', trimestral: 'Plan de 3 meses', cortesia: 'Acceso de cortesía' };
const STATUS = {
  active: ['Activa', 'pill--ok'], trialing: ['Activa', 'pill--ok'], past_due: ['Pago pendiente', 'pill--warn'],
  canceled: ['Cancelada', ''], unpaid: ['Impagada', 'pill--warn'], incomplete: ['Incompleta', 'pill--warn'],
  incomplete_expired: ['Expirada', ''], paused: ['En pausa', ''],
};
const period = (s) => {
  const n = s.intervalCount ?? 1;
  if (s.interval === 'week') return n === 1 ? 'cada semana' : `cada ${n} semanas`;
  if (s.interval === 'month') return n === 1 ? 'cada mes' : `cada ${n} meses`;
  if (s.interval === 'year') return n === 1 ? 'cada año' : `cada ${n} años`;
  return '';
};

async function load() {
  loading(root);
  let d;
  try { d = await api('/api/subscription'); } catch (err) { return errorState(root, err, load); }
  page(root, { eyebrow: 'Facturación', title: 'Mis suscripciones' });
  const s = d.subscription;

  const portalBtn = h('button', { class: 'btn' }, 'Gestionar suscripción y facturas');
  portalBtn.addEventListener('click', async () => {
    setBusy(portalBtn, true, 'Abriendo…');
    try { location.assign((await api('/api/billing/portal', { method: 'POST' })).url); } catch (err) { setBusy(portalBtn, false); toast(err.message); }
  });

  const native = isNativeApp();
  const restoreBtn = h('button', { class: 'btn btn--ghost' }, 'Restaurar compras');
  restoreBtn.addEventListener('click', async () => {
    setBusy(restoreBtn, true, 'Restaurando…');
    try { const n = await nativeRestore(); toast(n ? 'Compras restauradas.' : 'No encontramos compras para restaurar.'); if (n) load(); } catch (err) { toast(err.message); }
    setBusy(restoreBtn, false);
  });

  const entries = Object.entries(d.subscriptions ?? (s ? { 'sem-fumo': s } : {}));
  if (!entries.length) {
    root.append(h('section', { class: 'card stack' },
      h('p', {}, 'No tienes ninguna suscripción.'),
      d.pendingCheckout ? h('div', { class: 'notice' }, icon('info', 'notice__icon'), h('div', {}, 'Tienes un pago sin terminar. Tus resultados siguen guardados.')) : null,
      h('div', { class: 'actions-row' }, h('a', { class: 'btn', href: '/programas' }, 'Ver programas'), native ? restoreBtn : null)));
    return;
  }
  const NAMES = { 'sem-fumo': 'Sem Fumo', alcohol: 'Alcohol', azucar: 'Azúcar', ansiedad: 'Ansiedad', sueno: 'Sueño' };
  for (const [program, sub] of entries) {
    const [label, cls] = STATUS[sub.status] ?? [sub.status, ''];
    const active = ['active', 'trialing', 'past_due'].includes(sub.status);
    root.append(h('section', { class: 'card stack' },
      h('div', { class: 'page-head', style: 'margin:0' },
        h('h2', { class: 'title-md' }, `${NAMES[program] ?? program} · ${PLAN_NAMES[sub.plan] ?? sub.plan}`),
        h('span', { class: `pill ${cls}` }, label)),
      h('dl', { class: 'terms-box', style: 'margin:0' },
        sub.amount != null ? h('div', {}, h('dt', {}, 'Precio'), h('dd', {}, `${moneyCents(sub.amount, sub.currency)} ${period(sub)}`)) : null,
        sub.currentPeriodEnd && active ? h('div', {}, h('dt', {}, sub.cancelAtPeriodEnd ? 'Acceso hasta' : 'Próximo cobro'), h('dd', {}, longDate(sub.currentPeriodEnd))) : null,
        h('div', {}, h('dt', {}, 'Renovación'), h('dd', {}, sub.cancelAtPeriodEnd ? 'Cancelada: no se volverá a cobrar.' : active ? 'Automática hasta que la canceles.' : 'Sin renovación activa.'))),
      sub.status === 'past_due' ? h('div', { class: 'notice notice--warn' }, icon('info', 'notice__icon'), h('div', {}, 'No pudimos cobrar la renovación. Actualiza tu método de pago para no perder el acceso.')) : null));
  }
  root.append(h('section', { class: 'card stack' },
    h('div', { class: 'actions-row', style: 'margin:0' }, native ? null : (d.hasBilling ? portalBtn : null),
      native ? h('a', { class: 'btn', href: 'https://apps.apple.com/account/subscriptions' }, 'Gestionar en App Store') : null,
      native ? restoreBtn : null,
      h('a', { class: 'btn btn--ghost', href: '/programas' }, 'Ver programas')),
    native ? h('p', { class: 'help' }, 'Las suscripciones contratadas en la app se gestionan y cancelan desde los ajustes de tu cuenta de Apple. Si cancelas, conservas el acceso hasta el final del período pagado.') : h('p', { class: 'help' }, 'Desde la gestión (Stripe) puedes cambiar de plan, actualizar tu método de pago, descargar facturas o cancelar cada suscripción de forma independiente. Si cancelas, conservas el acceso hasta el final del período pagado.')));
}

load();
