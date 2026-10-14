// Páginas legales: rellena la identidad del responsable desde la configuración del servidor.
import { $, api, renderFooter, renderHeader } from '../ui.js';

renderHeader($('[data-header]'), { links: [{ href: '/test', label: 'Hacer el test', cls: 'btn btn--sm' }] });
renderFooter($('[data-footer]'));

const FALLBACK = { name: 'el responsable del servicio', taxId: 'disponible a solicitud', address: 'disponible a solicitud', email: 'el canal de contacto indicado en la app', country: 'Brasil' };
api('/api/legal').then((legal) => {
  document.querySelectorAll('[data-legal]').forEach((el) => {
    const key = el.dataset.legal;
    if (key === 'updatedAt') {
      el.textContent = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${legal.updatedAt}T12:00:00`));
      return;
    }
    const value = legal[key] || FALLBACK[key] || '';
    if (key === 'email' && legal.email) {
      const a = document.createElement('a');
      a.href = `mailto:${legal.email}`;
      a.textContent = legal.email;
      el.replaceChildren(a);
    } else {
      el.textContent = value;
    }
  });
}).catch(() => {});
