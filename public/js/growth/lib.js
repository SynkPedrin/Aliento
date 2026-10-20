// Utilidades del panel Growth: formato, tablas, CSV, definiciones de métricas y estados.
import { api, h, setBusy, toast } from '../ui.js';

export const state = { currency: 'EUR', canEdit: false, role: 'readonly' };

const nf = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, useGrouping: 'always' });
export const int = (n) => (n == null ? '—' : nf.format(n));
export const dec = (n) => (n == null ? '—' : nf1.format(n));
export const pct = (n) => (n == null ? '—' : `${nf1.format(n)} %`);
export const mult = (n) => (n == null ? '—' : `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n)}×`);
export function eur(cents, currency = state.currency) {
  if (cents == null) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency, useGrouping: 'always', maximumFractionDigits: Math.abs(cents) >= 100000 ? 0 : 2 }).format(cents / 100);
}
export const dt = (iso) => (iso ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—');
export const day = (iso) => (iso ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : '—');

// Definiciones visibles (tooltip + leyenda).
export const DEFS = {
  capture: ['Tasa de captura', 'Leads creados ÷ cuestionarios iniciados.'],
  funnel: ['Conversión del embudo', 'Compras ÷ visitas únicas en el periodo.'],
  cac: ['CAC', 'Coste de adquisición: gasto publicitario ÷ compras nuevas.'],
  roas0: ['ROAS D0', 'Ingresos del mismo día de la compra ÷ gasto.'],
  roas30: ['ROAS D30', 'Ingresos acumulados a 30 días de la compra ÷ gasto.'],
  ltv: ['LTV', 'Ingreso neto acumulado por pagador de una cohorte (menos reembolsos).'],
  cart: ['Carrito abandonado', 'Checkout iniciado sin compra posterior.'],
  mrr: ['MRR', 'Ingreso recurrente mensual normalizado de las suscripciones activas.'],
  hook: ['Hook rate', 'Vistas de 3 s ÷ impresiones del vídeo.'],
  ctr: ['CTR', 'Clics ÷ impresiones.'],
  cpl: ['CPL', 'Coste por lead: gasto ÷ leads.'],
  match: ['Calidad de coincidencia', 'Campos de usuario enviados al píxel (0 a 10); más alto mejora la atribución.'],
  fatigue: ['Cansancio', 'CTR de los últimos 7 días cae frente a los 7 anteriores.'],
  signif: ['Significancia', 'Test z de dos proporciones al 95 % con muestra mínima.'],
};
export function term(key, label) {
  const [name, text] = DEFS[key];
  return h('span', { class: 'tip', tabindex: '0', title: `${name}: ${text}`, 'aria-label': `${label ?? name}. ${text}` }, label ?? name);
}
export function legend(keys) {
  return h('details', { class: 'defs' }, h('summary', {}, 'Definiciones de métricas'),
    h('dl', {}, keys.flatMap((k) => [h('dt', {}, DEFS[k][0]), h('dd', {}, DEFS[k][1])])));
}

/** Parámetros de filtros globales (hash), sin vacíos. */
export function qs(filters, extra = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v !== '' && v != null) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
export const csvHref = (path, filters, extra = {}) => `/api/growth${path}${qs(filters, { ...extra, format: 'csv' })}`;
export const csvButton = (path, filters, extra) => h('a', { class: 'btn btn--ghost btn--sm', href: csvHref(path, filters, extra), download: '' }, 'Exportar CSV');

export function table(headers, rows, caption, { cls = '' } = {}) {
  return h('div', { class: 'table-wrap' }, h('table', { class: `table ${cls}` },
    h('caption', { class: 'sr-only' }, caption),
    h('thead', {}, h('tr', {}, headers.map((x) => h('th', { scope: 'col', class: x?.num ? 'num' : null }, x?.label ?? x)))),
    h('tbody', {}, rows.map((r) => h('tr', { class: r.cls }, (r.cells ?? r).map((c, i) => {
      const hd = headers[i];
      return h('td', { class: hd?.num ? 'num' : null, 'data-label': hd?.label ?? hd }, c?.nodeType ? c : (c ?? '—'));
    }))))));
}
export const N = (label) => ({ label, num: true });

export const stat = (label, value, sub, tone) => h('div', { class: `card stat${tone ? ` stat--${tone}` : ''}` },
  h('p', { class: 'stat__label' }, label), h('p', { class: 'stat__value' }, value), sub ? h('p', { class: 'stat__sub' }, sub) : null);

export const pill = (text, tone) => h('span', { class: `pill${tone === 'ok' ? ' pill--ok' : tone === 'warn' ? ' pill--warn' : tone === 'bad' ? ' pill--bad' : ''}` }, text);

export const loadingEl = () => h('div', { class: 'loading', role: 'status' }, h('div', { class: 'skeleton' }), h('span', { class: 'sr-only' }, 'Cargando'));
export const emptyEl = (title, text) => h('div', { class: 'empty-state' }, h('p', { class: 'empty-state__title' }, title), text ? h('p', { class: 'muted' }, text) : null);
export function errorEl(err, retry) {
  return h('div', { class: 'empty-state', role: 'alert' },
    h('p', { class: 'empty-state__title' }, 'No hemos podido cargar esta sección'),
    h('p', { class: 'muted' }, err.message),
    retry ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: retry }, 'Reintentar') : null);
}

/** Carga datos en `target` con estados cargando/error. */
export async function load(target, fn) {
  target.replaceChildren(loadingEl());
  try { await fn(); } catch (err) {
    if (err.status === 401 || err.status === 428) throw err;
    target.replaceChildren(errorEl(err, () => load(target, fn)));
  }
}

export const gapi = (path, opts) => api(`/api/growth${path}`, opts);

/** Acción con botón ocupado y aviso. */
export async function act(btn, fn, okMsg, after) {
  if (btn) setBusy(btn, true, 'Un momento…');
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    await after?.(r);
    return r;
  } catch (err) {
    if (err.status === 401 || err.status === 428) { location.reload(); return null; }
    toast(err.message);
    return null;
  } finally { if (btn?.isConnected) setBusy(btn, false); }
}

export const field = (id, label, control, help) => h('div', { class: 'field' }, h('label', { for: id }, label), control, help ? h('p', { class: 'help' }, help) : null);
export const head = (title, intro, ...actions) => h('div', { class: 'gr-head' }, h('div', {}, h('h1', { class: 'gr-title' }, title), intro ? h('p', { class: 'muted' }, intro) : null), h('div', { class: 'gr-actions' }, actions));

/** Barra horizontal simple (valor 0..100). */
export function bar(value, label, tone) {
  const w = Math.max(0, Math.min(100, value ?? 0));
  return h('span', { class: `bar${tone ? ` bar--${tone}` : ''}`, role: 'img', 'aria-label': label ?? `${dec(w)} %` },
    h('span', { class: 'bar__fill', 'data-w': String(Math.round(w)) }));
}
/** Aplica anchos vía CSSOM (la CSP bloquea style inline pero no estas propiedades). */
export function applyBars(root) {
  root.querySelectorAll('.bar__fill[data-w]').forEach((f) => { f.style.width = `${f.dataset.w}%`; });
}

const LABELS = { id: 'ID', email: 'Correo', status: 'Estado', plan: 'Plan', currency: 'Moneda', country: 'País', source: 'Fuente', created_at: 'Fecha', day: 'Día', date: 'Fecha',
  orders: 'Pedidos', amount_cents: 'Importe', net_cents: 'Neto', gross_cents: 'Bruto', refunded_cents: 'Reembolsado', interval: 'Intervalo', language: 'Idioma', canceled_at: 'Cancelada', current_period_end: 'Renovación' };
const label = (k) => LABELS[k] ?? k.replace(/_cents$/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
function cell(k, v, row) {
  if (v == null || v === '') return '—';
  if (k.endsWith('_cents')) return eur(v, String(row.currency || state.currency).toUpperCase());
  if (k.endsWith('_at')) return dt(v);
  if (k === 'day' || k === 'date') return day(v);
  if (k.endsWith('_pct')) return pct(v);
  if (typeof v === 'number') return int(v);
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
/** Tabla genérica a partir de filas con claves arbitrarias (el contrato deja las columnas abiertas). */
export function genericTable(rows, caption, skip = []) {
  if (!rows?.length) return emptyEl('Sin datos', 'No hay registros en este periodo.');
  const keys = Object.keys(rows[0]).filter((k) => !skip.includes(k) && typeof rows[0][k] !== 'object');
  return table(keys.map((k) => (typeof rows[0][k] === 'number' ? N(label(k)) : label(k))), rows.map((r) => keys.map((k) => cell(k, r[k], r))), caption);
}

// replaceChildren(null) pintaría «null»: se ignoran los hijos vacíos en este panel.
const _rc = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...kids) { return _rc.apply(this, kids.flat().filter((k) => k != null && k !== false && k !== '')); };
