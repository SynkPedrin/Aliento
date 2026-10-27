import { $, api, ICONS, renderFooter, renderHeader } from '../ui.js';
import { renderPaywall } from '../paywall.js';

renderFooter($('[data-footer]'));

const PROGRAMS = ['sem-fumo', 'alcohol', 'azucar', 'ansiedad', 'sueno'];
/** Título del paywall por programa. Sem Fumo conserva su texto original (solo se cambia fuera). */
const TITLES = {
  'sem-fumo': 'Empieza hoy tu camino hacia una vida sin tabaco',
  alcohol: 'Empieza hoy tu camino hacia una relación más consciente con el alcohol',
  azucar: 'Empieza hoy tu camino hacia un equilibrio sin dietas extremas',
  ansiedad: 'Empieza hoy tu camino hacia una calma más cotidiana',
  sueno: 'Empieza hoy tu camino hacia un descanso reparador',
};

async function init() {
  const params = new URLSearchParams(location.search);
  const program = PROGRAMS.includes(params.get('program')) ? params.get('program') : 'sem-fumo';
  const [me, result] = await Promise.all([
    api('/api/me'),
    api(`/api/assessment/result?program=${encodeURIComponent(program)}`).catch((err) => (err.code === 'NO_RESULT' ? null : {})),
  ]);
  if (me.access) {
    // Ya hay algún programa activo: el pago del nuevo funil se hace desde el catálogo.
    if (!me.programs?.includes(program)) return window.location.replace('/dashboard');
    return window.location.replace(program === 'sem-fumo' ? '/dashboard' : `/programa?p=${program}`);
  }
  // Sin cuestionario completado no hay plan que ofrecer: primero el test del programa.
  if (result === null) return window.location.replace(program === 'sem-fumo' ? '/test' : `/quiz/${program}`);
  renderHeader($('[data-header]'), {
    links: me.user ? [{ href: '/perfil', label: 'Mi perfil' }] : [{ href: '/acceso', label: 'Entrar' }],
  });
  if (params.get('pago') === 'cancelado') {
    $('[data-cancelled]').hidden = false;
    $('[data-icon]').innerHTML = ICONS.info;
  }
  const title = $('[data-title]');
  if (title && TITLES[program]) title.textContent = TITLES[program];
  renderPaywall($('[data-paywall]'), { program, pendingCheckout: me.pendingCheckout });
}

init();
