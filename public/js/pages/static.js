import { $, renderFooter, renderHeader } from '../ui.js';

renderHeader($('[data-header]'), { links: [{ href: '/test', label: 'Hacer el test', cls: 'btn btn--sm' }] });
renderFooter($('[data-footer]'));
