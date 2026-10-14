import { $, api, ICONS, renderFooter, renderHeader } from '../ui.js';
import { renderPaywall } from '../paywall.js';

renderFooter($('[data-footer]'));

async function init() {
  const [me, result] = await Promise.all([
    api('/api/me'),
    api('/api/assessment/result').catch((err) => (err.code === 'NO_RESULT' ? null : {})),
  ]);
  if (me.access) return window.location.replace('/dashboard');
  // Sin cuestionario completado no hay plan que ofrecer: primero el test.
  if (result === null) return window.location.replace('/test');
  renderHeader($('[data-header]'), {
    links: me.user ? [{ href: '/perfil', label: 'Mi perfil' }] : [{ href: '/acceso', label: 'Entrar' }],
  });
  if (new URLSearchParams(location.search).get('pago') === 'cancelado') {
    $('[data-cancelled]').hidden = false;
    $('[data-icon]').innerHTML = ICONS.info;
  }
  renderPaywall($('[data-paywall]'), { pendingCheckout: me.pendingCheckout });
}

init();
