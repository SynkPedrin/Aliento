// «Mis programas»: catálogo de los cinco programas con el estado de acceso del usuario.
import { $, api, h, money, mountSplash, splashReady, toast } from '../ui.js';
import { installAction, installState } from '../install.js';
import { isNativeApp, nativePurchase, nativeRestore, listenNativeUpdates } from '../native-iap.js';

listenNativeUpdates();

mountSplash();
const root = $('[data-root]');

const CTA = {
  active: { label: 'Continuar', cls: 'btn' },
  canceled_but_active: { label: 'Continuar', cls: 'btn' },
  locked: { label: 'Empezar', cls: 'btn btn--mint' },
  expired: { label: 'Renovar', cls: 'btn btn--mint' },
  pending_payment: { label: 'Ver estado', cls: 'btn btn--ghost' },
  coming_soon: { label: 'Próximamente', cls: 'btn btn--ghost' },
};

const STATE_PILL = {
  active: ['Activo', 'pill--ok'],
  canceled_but_active: ['Activo hasta el fin del período', 'pill--ok'],
  pending_payment: ['Confirmando pago', 'pill--warn'],
  expired: ['Suscripción terminada', 'pill--warn'],
  coming_soon: ['Próximamente', ''],
  locked: null,
};

function programHome(p) {
  return p.slug === 'sem-fumo' ? '/dashboard' : `/programa?p=${p.slug}`;
}

async function buy(p) {
  const plans = (await api(`/api/plans?program=${p.slug}`)).plans.filter((x) => x.available);
  if (!plans.length) { toast('Este programa no tiene planes disponibles ahora mismo.'); return; }
  const overlay = h('div', { class: 'modal-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Elegir plan de ${p.name}` });
  const close = () => overlay.remove();
  const card = h('div', { class: 'card plan-modal' },
    h('h2', { class: 'title-md' }, p.name),
    h('p', { class: 'muted small u-mt-8' }, 'Elige tu plan. Se renueva automáticamente y puedes cancelarlo cuando quieras desde «Mis suscripciones».'),
    h('div', { class: 'stack u-mt-16' }, plans.map((pl) => h('button', {
      class: 'plan-row', type: 'button',
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          if (isNativeApp()) {
            const r = await nativePurchase(p.slug, pl.id);
            if (r.status === 'success') return location.assign(programHome(p));
            if (r.status === 'pending') toast('Tu compra está pendiente de aprobación. Te avisaremos cuando se active.', 6000);
            e.currentTarget.disabled = false; return;
          }
          const { url } = await api('/api/checkout', { method: 'POST', body: { program: p.slug, plan: pl.id, fromCatalog: true } });
          location.assign(url);
        } catch (err) {
          if (err?.code === 'AUTH_REQUIRED') { close(); location.assign('/acceso'); }
          else if (err?.data?.code === 'ALREADY_SUBSCRIBED') { close(); toast('Ya tienes este programa activo.'); load(); }
          else { toast(err.message); e.currentTarget.disabled = false; }
        }
      },
    },
    h('span', { class: 'plan-row__name' }, pl.name),
    h('span', { class: 'plan-row__price' }, money(pl.amount, pl.currency), h('small', { class: 'muted' }, ` ${pl.periodLabel}`))))),
    h('p', { class: 'u-mt-16' }, h('button', { class: 'link', onclick: close }, 'Ahora no')));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.append(card);
  document.body.append(overlay);
}

async function checkPending(p) {
  toast('Estamos confirmando tu suscripción…');
  for (let i = 0; i < 6; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const cat = await api('/api/programs');
    const cur = cat.programs.find((x) => x.slug === p.slug);
    if (cur.state === 'active' || cur.state === 'canceled_but_active') { load(); return; }
  }
  toast('Todavía no llega la confirmación. Actualiza en unos minutos.');
}

function card(p, i) {
  const cta = CTA[p.state] ?? CTA.locked;
  const pill = STATE_PILL[p.state];
  const el = h('article', { class: `program-card${p.theme === 'night' ? ' program-card--night' : ''}`, style: `--program:${p.color}; --i:${i}` },
    h('div', { class: 'program-card__head' },
      h('img', { class: 'program-card__icon', src: p.icon, alt: '', width: 44, height: 44 }),
      pill ? h('span', { class: `pill ${pill[1]}` }, pill[0]) : null),
    h('h2', { class: 'program-card__name' }, p.name),
    h('p', { class: 'program-card__tagline' }, p.tagline),
    h('p', { class: 'program-card__desc' }, p.description),
    p.subscription?.amount != null ? h('p', { class: 'program-card__meta muted small' },
      `${money(p.subscription.amount, p.subscription.currency)} ${p.subscription.interval === 'week' ? 'a la semana' : p.subscription.intervalCount === 3 ? 'cada 3 meses' : p.subscription.interval === 'year' ? 'al año' : 'al mes'}${p.subscription.cancelAtPeriodEnd ? ' · se cancela al fin del período' : ''}`) : null,
    h('button', {
      class: `${cta.cls} btn--block program-card__cta`,
      disabled: p.state === 'coming_soon',
      onclick: async () => {
        if (p.state === 'active' || p.state === 'canceled_but_active') {
          await api(`/api/programs/${p.slug}/last`, { method: 'POST' }).catch(() => {});
          location.assign(programHome(p));
        } else if (p.state === 'locked' || p.state === 'expired') {
          buy(p).catch((e) => toast(e.message));
        } else if (p.state === 'pending_payment') {
          checkPending(p).catch(() => {});
        }
      },
    }, cta.label));
  return el;
}

async function load() {
  let me;
  try { me = await api('/api/me'); } catch { me = { user: null }; }
  if (!me.user) { location.replace(`/acceso?modo=entrar&next=${encodeURIComponent('/programas')}`); return; }
  const cat = await api('/api/programs');
  // Tras el primer acceso, la app abre el último programa usado; el catálogo
  // siempre queda a un toque con «Mis programas».
  const params = new URLSearchParams(location.search);
  if (!params.has('catalogo') && !params.has('pago') && cat.lastProgram) {
    const last = cat.programs.find((x) => x.slug === cat.lastProgram);
    if (last && (last.state === 'active' || last.state === 'canceled_but_active')) {
      location.replace(programHome(last));
      return;
    }
  }
  root.replaceChildren(
    h('header', { class: 'page-head catalog-head' },
      h('p', { class: 'eyebrow' }, 'Mis programas'),
      h('h1', { class: 'title-lg' }, 'Un espacio para cada nuevo comienzo.'),
      h('p', { class: 'muted' }, 'Elige el camino que quieres continuar.')),
    h('div', { class: 'program-grid' }, cat.programs.map(card)),
    installState() !== 'installed' ? h('p', { class: 'catalog-install muted small' },
      h('button', { class: 'link', onclick: () => installAction(() => {}) }, 'Instala Alento en tu pantalla de inicio')) : null,
    h('p', { class: 'catalog-account muted small' },
      h('a', { href: '/suscripcion' }, 'Mis suscripciones'), ' · ', h('a', { href: '/perfil' }, 'Mi cuenta')));
  splashReady();
}

load().catch((e) => { splashReady(); root.replaceChildren(h('p', { class: 'form-error' }, e.message)); });
