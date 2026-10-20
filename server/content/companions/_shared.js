// Utilidades comunes a las definiciones de los programas acompañados (alcohol, azúcar, ansiedad, sueño).
// Solo funciones puras: nada de acceso a base de datos aquí.

export const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400_000);

export const round1 = (n) => Math.round(n * 10) / 10;
export const round2 = (n) => Math.round(n * 100) / 100;
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMinutes = (hhmm) => (TIME_RE.test(hhmm ?? '') ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : null);

/** Desviación típica en minutos. */
export function stdev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / xs.length);
}

/** Etiqueta de una opción de un campo del formulario. */
export const optionLabel = (fields, fieldId, value) =>
  fields.find((f) => f.id === fieldId)?.options?.find((o) => o.id === value)?.label ?? null;

/**
 * Objetivo diario que baja de `goal.start` a `goal.target` en `weeks` semanas (pasos de 0,5),
 * siempre redondeando hacia arriba: nunca se pide más de lo planificado.
 */
export function glideTarget(day, goal, weeks = 6) {
  const { target = 0, start = null, startDate } = goal;
  if (start == null || start <= target) return target;
  if (day < startDate) return start;
  const w = Math.floor(daysBetween(startDate, day) / 7);
  const frac = Math.min(1, w / weeks);
  return Math.max(target, Math.ceil((start - (start - target) * frac) * 2) / 2);
}

/** Mayor racha consecutiva de días que cumplen `pred` (días en orden cronológico, sin huecos). */
export function longestRun(days, pred) {
  let best = 0;
  let cur = 0;
  for (const d of days) {
    cur = pred(d) ? cur + 1 : 0;
    if (cur > best) best = cur;
  }
  return best;
}

export const EMERGENCY = { label: 'Emergencias', detail: '112 (España y Unión Europea). Si tu vida o la de otra persona está en peligro, llama ahora.', tel: '112' };
export const OUTSIDE_SPAIN = 'Fuera de España, contacta con los servicios de emergencia o de salud de tu país.';

/** Fábrica de logro: { slug, title, description, icon, rule(facts) }. Los slugs se prefijan por programa. */
export const achievement = (prefix, slug, title, description, icon, rule) => ({ slug: `${prefix}-${slug}`, title, description, icon, rule });
