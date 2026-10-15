// Dashboard de un programa (alcohol, azucar, ansiedad, sueno). Sem Fumo usa /dashboard.
import { $, api, h, mountSplash, splashReady, toast } from '../ui.js';
import { cravingFlow, emptyState, greeting } from '../shell.js';

mountSplash();
const root = $('[data-root]');
const slug = new URLSearchParams(location.search).get('p') ?? '';
if (!slug || slug === 'sem-fumo') location.replace('/dashboard');

const ACTIVITY = {
  alcohol: { kind: 'consumo', label: 'Registrar consumo', field: '¿Qué registras hoy?', placeholder: 'Ej.: una cerveza con amigos, copa de vino en la cena…' },
  azucar: { kind: 'habito', label: 'Registrar hábito', field: '¿Qué hábito quieres anotar?', placeholder: 'Ej.: refresco en la comida, postre después de cenar…' },
  ansiedad: { kind: 'emocion', label: 'Registrar cómo me siento', field: '¿Cómo te sientes en este momento?', placeholder: 'Ej.: tensión media por una reunión, más calmado tras pasear…' },
  sueno: { kind: 'sueno', label: 'Registrar mi descanso', field: '¿Cómo fue tu noche?', placeholder: 'Ej.: me dormí a las 23:30, desperté una vez, descansé bien…' },
};

function quickLog(p, onSaved) {
  const cfg = ACTIVITY[p.slug];
  if (!cfg) return null;
  const input = h('textarea', { class: 'input', rows: 2, maxlength: 500, placeholder: cfg.placeholder, 'aria-label': cfg.field });
  const status = h('p', { class: 'help', role: 'status' });
  const btn = h('button', { class: 'btn btn--sm', onclick: async () => {
    const v = input.value.trim();
    if (!v) { status.textContent = 'Escribe algo primero.'; return; }
    btn.disabled = true;
    try {
      await api(`/api/app/programs/${p.slug}/activity`, { method: 'POST', body: { kind: cfg.kind, value: { nota: v } } });
      input.value = ''; status.textContent = 'Guardado.';
      onSaved();
    } catch (e) { toast(e.message); } finally { btn.disabled = false; }
  } }, cfg.label);
  return h('section', { class: 'card stack' },
    h('h2', { class: 'title-md' }, 'Registro rápido'),
    h('label', { class: 'muted small' }, cfg.field), input, h('div', {}, btn), status);
}

async function recentEntries(p, box) {
  const { entries } = await api(`/api/app/programs/${p.slug}/activity`);
  box.replaceChildren(entries.length
    ? h('ul', { class: 'list' }, entries.slice(0, 7).map((e) => h('li', {},
        h('div', { class: 'list__main' },
          h('span', {}, String(e.value?.nota ?? e.kind)),
          h('p', { class: 'list__meta' }, new Date(e.occurred_at).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))),
        h('button', { class: 'link', onclick: async () => {
          await api(`/api/app/programs/${p.slug}/activity/${e.id}`, { method: 'DELETE' });
          recentEntries(p, box).catch(() => {});
        } }, 'Eliminar'))))
    : h('p', { class: 'muted small' }, 'Todavía no hay registros. El primero es solo para ti.'));
}

async function load() {
  let me;
  try { me = await api('/api/me'); } catch { me = { user: null }; }
  if (!me.user) { location.replace(`/acceso?modo=entrar&next=${encodeURIComponent(location.pathname + location.search)}`); return; }
  const cat = await api('/api/programs');
  const p = cat.programs.find((x) => x.slug === slug);
  if (!p) { location.replace('/programas'); return; }
  if (p.state !== 'active' && p.state !== 'canceled_but_active') { location.replace('/programas'); return; }
  document.title = `${p.name} · Alento`;
  if (p.theme === 'night') document.body.classList.add('program-night');

  const journey = await api(`/api/app/journey?program=${p.slug}`);
  const next = journey.nextLesson;
  const entriesBox = h('div', { class: 'card' });
  recentEntries(p, entriesBox).catch(() => {});

  root.replaceChildren(
    h('header', { class: 'program-hero', style: `--program:${p.color}` },
      h('img', { src: p.icon, alt: '', width: 56, height: 56, class: 'program-hero__icon' }),
      h('div', {},
        h('p', { class: 'eyebrow' }, `${greeting()} · ${p.name}`),
        h('h1', { class: 'title-lg' }, p.tagline),
        h('p', { class: 'muted' }, `${journey.totals.completed} de ${journey.totals.lessons} lecciones · Cada paso cuenta.`)),
      h('a', { class: 'link program-hero__catalog', href: '/programas' }, 'Mis programas')),
    next ? h('a', { class: 'card next-lesson', href: `/leccion?l=${next.slug}&p=${p.slug}` },
      h('p', { class: 'eyebrow' }, `Siguiente lección · Capítulo ${next.chapter.number}: ${next.chapter.title}`),
      h('h2', { class: 'title-md' }, next.title),
      h('p', { class: 'muted small' }, `${next.description} · ${next.minutes} min`),
      h('span', { class: 'btn btn--sm u-mt-8' }, 'Continuar'))
      : h('section', { class: 'card' }, h('h2', { class: 'title-md' }, 'Programa completado. ¡Enhorabuena!'),
        h('p', { class: 'muted' }, 'Puedes repasar cualquier lección cuando quieras.')),
    quickLog(p, () => recentEntries(p, entriesBox).catch(() => {})),
    h('div', { class: 'grid-2' },
      h('a', { class: 'card mini-card', href: `/jornada?program=${p.slug}` }, h('strong', {}, 'Mi jornada'), h('p', { class: 'muted small' }, 'Capítulos y lecciones')),
      p.slug === 'ansiedad' || p.slug === 'sueno'
        ? h('a', { class: 'card mini-card', href: '/respirar' }, h('strong', {}, 'Respirar'), h('p', { class: 'muted small' }, 'Ejercicios guiados, siempre opcionales'))
        : h('a', { class: 'card mini-card', href: '/diario' }, h('strong', {}, 'Mi diario'), h('p', { class: 'muted small' }, 'Cómo te sientes'))),
    h('section', {}, h('h2', { class: 'title-md catalog-section' }, 'Registros recientes'), entriesBox),
  );
  splashReady();
}

load().catch((e) => { splashReady(); root.replaceChildren(h('p', { class: 'form-error' }, e.message)); });
void cravingFlow; void emptyState;
