// Contexto de programa para las páginas secundarias (progreso, objetivos, logros, diario, notificaciones, respirar, jornada).
// Sin `?p=` (Sem Fumo) no hace nada. Con `?p=<slug>` conserva el programa en la navegación del shell
// (que no sabe de programas), aplica identidad visual y ofrece utilidades comunes.
import { api, h } from '../ui.js';
import { emptyState } from '../shell.js';

export const PROGRAM_SLUGS = ['alcohol', 'azucar', 'ansiedad', 'sueno'];
const PAGES_WITH_P = ['/jornada', '/progreso', '/respirar', '/objetivos', '/diario', '/logros', '/notificaciones'];

/** Slug del programa activo (`?p=` o `?program=`), o null para Sem Fumo / sin programa válido. */
export function programSlug() {
  const q = new URLSearchParams(location.search);
  const s = q.get('p') ?? q.get('program');
  return PROGRAM_SLUGS.includes(s) ? s : null;
}

/** Añade `p=<slug>` a una ruta interna (conserva otros parámetros). */
export function withProgram(path, slug = programSlug()) {
  if (!slug) return path;
  const u = new URL(path, location.origin);
  u.searchParams.set('p', slug);
  return u.pathname + u.search + u.hash;
}

/** Sufijo de consulta para endpoints genéricos: `?program=slug` / `&program=slug`. */
export const programQuery = (slug, first = true) => (slug ? `${first ? '?' : '&'}program=${slug}` : '');

let catalog;
export async function programMeta(slug) {
  try {
    catalog ??= (await api('/api/programs')).programs;
    return catalog.find((p) => p.slug === slug) ?? { slug, name: slug, color: '#3EE0B5', theme: 'light', icon: null };
  } catch {
    return { slug, name: slug, color: '#3EE0B5', theme: 'light', icon: null };
  }
}

function rewrite(a, slug) {
  const href = a.getAttribute('href');
  if (!href || !href.startsWith('/')) return;
  const path = new URL(href, location.origin).pathname;
  if (path === '/dashboard' || path === '/registro') a.setAttribute('href', `/programa?p=${slug}`);
  else if (PAGES_WITH_P.includes(path) && !/[?&]p=/.test(href)) a.setAttribute('href', withProgram(href, slug));
}

/**
 * Llamar tras `initApp`. Reescribe los enlaces del encabezado y la barra inferior, aplica el tema
 * del programa y devuelve su ficha ({slug,name,color,icon,theme,tagline}).
 */
export async function applyProgramNav(slug) {
  const links = () => document.querySelectorAll('.app-header a[href], .tabbar a[href], .brand[href]');
  links().forEach((a) => rewrite(a, slug));
  // Respaldo por si el shell vuelve a pintar enlaces.
  document.addEventListener('click', (e) => { const a = e.target.closest?.('a[href]'); if (a) rewrite(a, slug); }, true);
  const meta = await programMeta(slug);
  document.body.classList.add('program-ctx');
  document.body.style.setProperty('--program', meta.color);
  if (meta.theme === 'night') document.body.classList.add('program-night');
  return meta;
}

/** Cinta de identidad del programa (icono, nombre y vuelta al panel) para colocar sobre el título. */
export function programRibbon(meta) {
  return h('div', { class: 'pp-ribbon', style: `--program:${meta.color}` },
    meta.icon ? h('img', { class: 'pp-ribbon__icon', src: meta.icon, alt: '', width: 28, height: 28 }) : null,
    h('span', { class: 'pp-ribbon__name' }, meta.name),
    h('a', { class: 'pp-ribbon__back', href: `/programa?p=${meta.slug}` }, '← Volver al panel'));
}

/** Estado de error con salidas útiles para 409 (falta configurar) y 402 (sin suscripción). */
export function programError(root, err, slug, retry) {
  if (err.code === 'ONBOARDING_REQUIRED' || err.status === 409) {
    return root.replaceChildren(emptyState('Primero configura tu programa', 'Elige tu camino y tu objetivo para empezar a ver esta sección.',
      h('a', { class: 'btn', href: `/configuracion?p=${slug}` }, 'Configurar mi programa')));
  }
  if (err.status === 402) {
    return root.replaceChildren(emptyState('Este programa no está activo en tu cuenta', 'Puedes activarlo desde el catálogo.',
      h('a', { class: 'btn', href: '/programas' }, 'Ver programas')));
  }
  return root.replaceChildren(h('div', { class: 'empty-state' },
    h('p', { class: 'empty-state__title' }, 'No hemos podido cargar esta sección'),
    h('p', { class: 'muted' }, err.message),
    retry ? h('button', { class: 'btn btn--ghost', onclick: retry }, 'Reintentar') : null));
}

/** Formatea un valor de la métrica del programa ('hours' → «7 h 30 min», 'decimal1' → 1,5). */
export function fmtMetric(v, format, locale = 'es-US') {
  if (v == null) return '—';
  if (format === 'hours') {
    const mins = Math.round(v * 60);
    const hh = Math.floor(mins / 60); const mm = mins % 60;
    return mm ? `${hh} h ${String(mm).padStart(2, '0')} min` : `${hh} h`;
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);
}
