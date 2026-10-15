// Utilidades compartidas por las rutas.

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class HttpError extends Error {
  constructor(status, message, code, extra) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const requireUser = (req, res, next) => (req.user
  ? next()
  : res.status(401).json({ error: 'Inicia sesión para continuar.', code: 'AUTH_REQUIRED' }));

/** Exige sesión y suscripción con acceso premium. */
export const requireAccess = (billing) => wrap(async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar.', code: 'AUTH_REQUIRED' });
  req.subscription = await billing.activeSubscription(req.user.id, req.program ?? null);
  if (!req.subscription) {
    return res.status(402).json({ error: 'Necesitas una suscripción activa de este programa.', code: 'SUBSCRIPTION_REQUIRED' });
  }
  next();
});

/** Administración: se consulta siempre la base (una revocación surte efecto al instante). */
export const requireAdmin = (db) => wrap(async (req, res, next) => {
  const ok = req.user && await db.service.one('select 1 from public.admin_users where user_id = $1', [req.user.id]);
  if (!ok) return res.status(req.user ? 403 : 401).json({ error: 'No autorizado.', code: 'FORBIDDEN' });
  next();
});

export function text(value, { max = 500, required = false, field } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (required && !v) throw new HttpError(422, 'Completa este campo.', 'INVALID', { field });
  if (v.length > max) throw new HttpError(422, `Máximo ${max} caracteres.`, 'INVALID', { field });
  return v || null;
}

export function int(value, { min, max, field }) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(422, `Introduce un número entre ${min} y ${max}.`, 'INVALID', { field });
  return n;
}

export function oneOf(value, list, field) {
  if (value == null || value === '') return null;
  if (!list.includes(value)) throw new HttpError(422, 'Valor no válido.', 'INVALID', { field });
  return value;
}

export function uuid(value, field = 'id') {
  if (!UUID_RE.test(String(value ?? ''))) throw new HttpError(422, 'Identificador no válido.', 'INVALID', { field });
  return value;
}
