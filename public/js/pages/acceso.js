import { $, api, h, renderHeader, setBusy } from '../ui.js';
import { goToCheckout, planList, rememberPlan } from '../paywall.js';

renderHeader($('[data-header]'));
const params = new URLSearchParams(location.search);
let plan = params.get('plan');
const next = params.get('next');
const form = $('[data-form]');
const errorEl = $('[data-error]');
const submit = $('[data-submit]');
let mode = params.get('modo') === 'entrar' ? 'login' : 'register';

function setMode(m) {
  mode = m;
  document.querySelectorAll('[data-tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === m)));
  document.querySelectorAll('[data-only]').forEach((el) => { el.hidden = el.dataset.only !== m; });
  $('[data-title]').textContent = m === 'register' ? 'Crea tu cuenta' : 'Inicia sesión';
  form.password.autocomplete = m === 'register' ? 'new-password' : 'current-password';
  errorEl.textContent = '';
}
document.querySelectorAll('[data-tab]').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.tab)));
setMode(mode);

async function afterAuth() {
  if (plan) return goToCheckout(plan, submit, { exitOffer: params.has('oferta') });
  if (next && next.startsWith('/') && !next.startsWith('//')) return window.location.assign(next);
  const me = await api('/api/me');
  window.location.assign(me.access ? (me.onboardingCompleted ? '/dashboard' : '/configuracion') : me.hasResult ? '/planes' : '/perfil');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  const body = mode === 'register'
    ? { name: form.name.value, email: form.email.value, password: form.password.value, acceptTerms: form.acceptTerms.checked, healthConsent: form.healthConsent.checked, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
    : { email: form.email.value, password: form.password.value };
  setBusy(submit, true);
  try {
    await api(mode === 'register' ? '/api/auth/register' : '/api/auth/login', { method: 'POST', body });
    await afterAuth();
  } catch (err) {
    setBusy(submit, false);
    errorEl.textContent = err.message;
    if (err.data?.field && form[err.data.field]) form[err.data.field].setAttribute('aria-invalid', 'true');
    if (err.code === 'EMAIL_EXISTS') setTimeout(() => { setMode('login'); form.password.focus(); }, 1200);
  }
});

if (plan) {
  $('[data-subtitle]').textContent = 'Último paso antes del pago seguro. Así guardamos tu plan y tus resultados.';
  api('/api/plans').then(({ plans }) => {
    if (!plans.some((x) => x.id === plan && x.available)) return;
    const box = $('[data-plan-summary]');
    box.hidden = false;
    if (params.has('oferta')) {
      const p = plans.find((x) => x.id === plan);
      box.replaceChildren(h('p', { class: 'plan-pick__label' }, 'Tu plan'), h('div', { class: 'notice' },
        h('div', {}, h('strong', {}, `${p.title} · regalo aplicado`), h('br'), 'Verás el descuento del primer pago en la página segura de Stripe.')));
      return;
    }
    // El plan sigue siendo editable aquí: se puede cambiar antes de pagar.
    box.replaceChildren(
      h('p', { class: 'plan-pick__label' }, 'Tu plan'),
      planList(plans, plan, (id) => {
        plan = id;
        rememberPlan(id);
        history.replaceState(null, '', `?plan=${encodeURIComponent(id)}`);
      }, { compact: true }),
    );
  }).catch(() => {});
  submit.textContent = 'Continuar al pago';
}
