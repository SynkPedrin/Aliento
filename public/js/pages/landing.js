import { $, api, h, icon, LOGO_BRANCO_HTML, mountSplash, renderFooter, splashReady } from '../ui.js';
import { FEATURES } from '../paywall.js';

mountSplash();
$('[data-brand]').innerHTML = LOGO_BRANCO_HTML;
$('[data-mark]').innerHTML = LOGO_BRANCO_HTML;
$('[data-features]').append(...FEATURES.map((f) => h('li', {}, icon('check'), h('span', {}, f))));
renderFooter($('[data-footer]'));
splashReady();

// Solo si hay indicio de sesión: cada visita desde un anuncio no consulta la API.
if (document.cookie.includes('al_s=')) api('/api/me').then(({ user, access }) => {
  if (!user) return;
  $('[data-nav]').replaceChildren(
    h('a', { href: '/perfil', class: 'hide-sm' }, 'Mi perfil'),
    h('a', { href: access ? '/dashboard' : '/resultados', class: 'btn btn--sm' }, access ? 'Mi panel' : 'Mis resultados'),
  );
}).catch(() => {});
