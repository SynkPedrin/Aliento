// Captura de e-mail tras el quiz (embudo: quiz → e-mail → plan). Dos consentimientos separados:
//  · uso de las respuestas (datos de salud) — obligatorio para recibir el plan
//  · novedades y recordatorios por e-mail — opcional, desmarcado por defecto
import { api, h, setBusy, toast } from './ui.js';
import { submitLead, track } from './track.js';

const FLAG = 'alento-lead';
export const hasLead = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };
export const markLead = () => { try { localStorage.setItem(FLAG, '1'); } catch { /* modo privado */ } };

/** ¿Hay que pedir el e-mail antes de mostrar los planes? Solo a visitantes sin cuenta ni lead previo. */
export async function needsLead() {
  if (hasLead()) return false;
  try { const me = await api('/api/me'); if (me.user) return false; } catch { /* sin red: no bloquear */ return false; }
  return true;
}

export function renderLeadGate(root, { program, onDone }) {
  const email = h('input', { type: 'email', class: 'input', autocomplete: 'email', inputmode: 'email', required: true, placeholder: 'tu@correo.com', 'aria-label': 'Tu e-mail' });
  const health = h('input', { type: 'checkbox', id: 'lg-health' });
  const mkt = h('input', { type: 'checkbox', id: 'lg-mkt' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const cta = h('button', { type: 'submit', class: 'btn btn--lg btn--block' }, 'Ver mi plan');
  const form = h('form', { class: 'stack lead-gate', novalidate: true },
    h('h3', { class: 'title-md' }, 'Recibe tu plan personal'),
    h('p', { class: 'muted' }, 'Te lo enviamos también por e-mail para que no se pierda. Sin tarjeta.'),
    h('label', { class: 'field' }, h('span', { class: 'field__label' }, 'E-mail'), email),
    h('label', { class: 'check', for: 'lg-health' }, health,
      h('span', {}, 'Acepto que Alento use mis respuestas, incluidas las relativas a mi salud y mis hábitos, para crear mi plan. ', h('a', { href: '/privacidad', target: '_blank', rel: 'noopener' }, 'Política de privacidad'), '.')),
    h('label', { class: 'check', for: 'lg-mkt' }, mkt, h('span', {}, 'Quiero recibir consejos y recordatorios de Alento por e-mail (opcional; puedes darte de baja cuando quieras).')),
    err, cta);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    if (!health.checked) { err.textContent = 'Necesitamos tu consentimiento para usar tus respuestas en tu plan.'; return; }
    setBusy(cta, true, 'Guardando…');
    try {
      await submitLead({ email: email.value.trim(), program, marketingEmail: mkt.checked });
      try { localStorage.setItem(FLAG, '1'); } catch { /* modo privado */ }
      onDone();
    } catch (ex) {
      // Errores de validación se muestran; un fallo del servidor nunca debe bloquear la venta (se continúa).
      if (['INVALID', 'CONSENT_REQUIRED', 'RATE_LIMITED'].includes(ex.code)) {
        setBusy(cta, false);
        err.textContent = ex.message;
        toast(ex.message);
      } else {
        onDone();
      }
    }
  });
  root.replaceChildren(form);
  track('lead_form_shown', {}, { pixel: false });
}
