// Mi suscripción: siempre accesible con sesión, tenga o no acceso premium.
import { $, api, h, icon, longDate, moneyCents, setBusy, toast } from '../ui.js';
import { errorState, initApp, loading, page } from '../shell.js';

await initApp({ active: '/perfil', access: 'account' });
const root = $('[data-root]');

const PLAN_NAMES = { semanal: 'Plan de 1 semana', mensual: 'Plan de 1 mes', trimestral: 'Plan de 3 meses' };
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
  page(root, { eyebrow: 'Facturación', title: 'Mi suscripción' });
  const s = d.subscription;

  const portalBtn = h('button', { class: 'btn' }, 'Gestionar suscripción y facturas');
  portalBtn.addEventListener('click', async () => {
    setBusy(portalBtn, true, 'Abriendo…');
    try { location.assign((await api('/api/billing/portal', { method: 'POST' })).url); } catch (err) { setBusy(portalBtn, false); toast(err.message); }
  });

  if (!s) {
    root.append(h('section', { class: 'card stack' },
      h('p', {}, 'No tienes ninguna suscripción.'),
      d.pendingCheckout ? h('div', { class: 'notice' }, icon('info', 'notice__icon'), h('div', {}, 'Tienes un pago sin terminar. Tus resultados siguen guardados.')) : null,
      h('div', {}, h('a', { class: 'btn', href: d.hasResult ? '/planes' : '/test' }, d.hasResult ? (d.pendingCheckout ? 'Retomar el pago' : 'Ver planes') : 'Hacer el test'))));
    return;
  }
  const [label, cls] = STATUS[s.status] ?? [s.status, ''];
  root.append(h('section', { class: 'card stack' },
    h('div', { class: 'page-head', style: 'margin:0' }, h('h2', { class: 'title-md' }, PLAN_NAMES[s.plan] ?? s.plan), h('span', { class: `pill ${cls}` }, label)),
    h('dl', { class: 'terms-box', style: 'margin:0' },
      s.amount != null ? h('div', {}, h('dt', {}, 'Precio'), h('dd', {}, `${moneyCents(s.amount, s.currency)} ${period(s)}`)) : null,
      s.currentPeriodEnd && d.access ? h('div', {}, h('dt', {}, s.cancelAtPeriodEnd ? 'Acceso hasta' : 'Próximo cobro'), h('dd', {}, longDate(s.currentPeriodEnd))) : null,
      h('div', {}, h('dt', {}, 'Renovación'), h('dd', {}, s.cancelAtPeriodEnd ? 'Cancelada: no se volverá a cobrar.' : d.access ? 'Automática hasta que la canceles.' : 'Sin renovación activa.'))),
    s.status === 'past_due' ? h('div', { class: 'notice notice--warn' }, icon('info', 'notice__icon'), h('div', {}, 'No pudimos cobrar la renovación. Actualiza tu método de pago para no perder el acceso.')) : null,
    h('div', { class: 'actions-row', style: 'margin:0' }, d.hasBilling ? portalBtn : null, !d.access && d.hasResult ? h('a', { class: 'btn btn--ghost', href: '/planes' }, 'Volver a suscribirme') : null),
    h('p', { class: 'help' }, 'Desde la gestión de la suscripción (Stripe) puedes cambiar de plan, actualizar tu método de pago, descargar facturas o cancelar. Si cancelas, conservas el acceso hasta el final del período pagado.')));
}

load();
