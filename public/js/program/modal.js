// Diálogo accesible: foco atrapado, Escape, devuelve el foco al cerrar.
import { h } from '../ui.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openDialog(label, { onClose } = {}) {
  const opener = document.activeElement;
  const card = h('div', { class: 'card modal__card pg-modal' });
  const el = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': label }, card);
  const prevOverflow = document.body.style.overflow;
  const close = () => {
    el.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = prevOverflow;
    if (opener && opener.isConnected) opener.focus?.();
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...card.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  el.addEventListener('mousedown', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.append(el);
  /** Sustituye el contenido y enfoca el título (o el primer control). */
  const setContent = (...nodes) => {
    card.replaceChildren(...nodes.flat().filter(Boolean));
    const target = card.querySelector('[data-autofocus]') ?? card.querySelector('h2') ?? card.querySelector(FOCUSABLE);
    if (target) { if (!target.matches(FOCUSABLE)) target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
  };
  return { el, card, close, setContent };
}
