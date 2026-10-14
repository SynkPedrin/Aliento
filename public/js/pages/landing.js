import { $, api, h, icon, MARK_SVG, renderFooter } from '../ui.js';
import { FEATURES } from '../paywall.js';

$('[data-brand]').innerHTML = `${MARK_SVG}<span class="brand__name">Aliento</span>`;
$('[data-mark]').innerHTML = MARK_SVG;
$('[data-features]').append(...FEATURES.map((f) => h('li', {}, icon('check'), h('span', {}, f))));
renderFooter($('[data-footer]'));

api('/api/me').then(({ user, access }) => {
  if (!user) return;
  $('[data-nav]').replaceChildren(
    h('a', { href: '/perfil', class: 'hide-sm' }, 'Mi perfil'),
    h('a', { href: access ? '/dashboard' : '/resultados', class: 'btn btn--sm' }, access ? 'Mi panel' : 'Mis resultados'),
  );
}).catch(() => {});
