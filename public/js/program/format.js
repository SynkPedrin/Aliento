// Formato de valores y fechas del companheiro de programa.

const nf1 = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });

export const fmtNum = (v) => (v == null ? '—' : nf1.format(v));
export const fmtNum2 = (v) => (v == null ? '—' : nf2.format(v));

/** 7.5 → «7 h 30 min» (axis=true → «7,5 h»). */
export function fmtHours(v, axis = false) {
  if (v == null) return '—';
  if (axis) return `${nf1.format(v)} h`;
  const total = Math.round(v * 60);
  const hh = Math.floor(total / 60), mm = total % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
}

/** Formateador según `weekMeta.format`. */
export function valueFormatter(format) {
  return format === 'hours' ? fmtHours : (v) => fmtNum(v);
}

export const dayShort = (iso) => new Intl.DateTimeFormat('es', { weekday: 'short' }).format(new Date(`${iso}T12:00:00`));
export const dayLong = (iso) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`));
export const whenShort = (iso) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

export const EXERCISES = {
  'calma-4-6': 'Calma 4·6',
  'caja-4-4': 'Respiración cuadrada',
  'pausa-4-2-6': 'Pausa consciente',
  'sueno-4-7-8': 'Respiración 4·7·8',
};

/** Fases de respiración (segundos) por ejercicio, para la guía dentro del flujo de momento difícil. */
export const BREATH_PATTERNS = {
  'calma-4-6': [['Inhala', 4, 'in'], ['Exhala', 6, 'out']],
  'caja-4-4': [['Inhala', 4, 'in'], ['Retén', 4, 'hold'], ['Exhala', 4, 'out'], ['Retén', 4, 'hold']],
  'pausa-4-2-6': [['Inhala', 4, 'in'], ['Retén', 2, 'hold'], ['Exhala', 6, 'out']],
  'sueno-4-7-8': [['Inhala', 4, 'in'], ['Retén', 7, 'hold'], ['Exhala', 8, 'out']],
};
