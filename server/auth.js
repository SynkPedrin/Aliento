import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const ACCESS_COOKIE = 'al_at';
export const REFRESH_COOKIE = 'al_rt';
export const ASSESSMENT_COOKIE = 'fg_aid';
export const HINT_COOKIE = 'al_s';
const USER_CACHE_MS = 30_000;

export class AuthError extends Error {
  constructor(code, message, status = 400, field) {
    super(message);
    this.code = code;
    this.status = status;
    this.field = field;
  }
}

/**
 * Autenticación con Supabase Auth. El servidor guarda los tokens en cookies httpOnly
 * (el navegador nunca ve la clave secreta ni los tokens).
 */
export function createAuth({ config, db }) {
  const { url, publishableKey, secretKey } = config.supabase;
  if (!url || !publishableKey || !secretKey) {
    throw new Error('Faltan SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY o SUPABASE_SECRET_KEY.');
  }
  // Timeout en todas las llamadas a Supabase Auth: nunca más que el límite de la función.
  const fetchWithTimeout = (input, init = {}) => fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(8000) });
  const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: fetchWithTimeout } };
  const pub = createClient(url, publishableKey, opts);
  const admin = createClient(url, secretKey, opts);
  const cache = new Map();

  /** Distingue errores del servicio (429 / 5xx / red) de credenciales inválidas. */
  function serviceError(error) {
    const status = error?.status ?? 0;
    if (status === 429 || error?.code === 'over_request_rate_limit') {
      return new AuthError('RATE_LIMITED', 'Demasiados intentos en este momento. Espera un minuto y vuelve a intentarlo.', 429);
    }
    if (!status || status >= 500 || error?.name === 'AuthRetryableFetchError' || error?.name === 'TimeoutError') {
      return new AuthError('AUTH_UNAVAILABLE', 'No podemos verificar tu sesión ahora mismo. Inténtalo de nuevo en unos instantes.', 503);
    }
    return null;
  }

  async function profile(userId) {
    return db.service.one(`
      select p.user_id as id, u.email, p.name, p.stripe_customer_id, p.timezone, p.locale, p.created_at,
             exists (select 1 from public.admin_users a where a.user_id = p.user_id) as is_admin
      from public.profiles p join auth.users u on u.id = p.user_id where p.user_id = $1`, [userId]);
  }

  async function register({ name, email, password, timezone }) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (error) {
      const svc = serviceError(error);
      if (svc) throw svc;
      if (error.code === 'email_exists' || /already been registered/i.test(error.message)) {
        throw new AuthError('EMAIL_EXISTS', 'Ya existe una cuenta con este correo. Inicia sesión.', 409, 'email');
      }
      if (error.code === 'weak_password') throw new AuthError('WEAK_PASSWORD', 'La contraseña es demasiado débil.', 422, 'password');
      throw error;
    }
    try {
      await db.service.exec(
        'insert into public.profiles (user_id, name, timezone, terms_accepted_at, health_consent_at) values ($1, $2, $3, now(), now())',
        [data.user.id, name, timezone || 'UTC'],
      );
    } catch (err) {
      await admin.auth.admin.deleteUser(data.user.id).catch(() => {});
      throw err;
    }
    return signIn({ email, password });
  }

  async function signIn({ email, password }) {
    const { data, error } = await pub.auth.signInWithPassword({ email, password });
    if (error) throw serviceError(error) ?? new AuthError('INVALID_LOGIN', 'Correo o contraseña incorrectos.', 401);
    if (!data.session) throw new AuthError('INVALID_LOGIN', 'Correo o contraseña incorrectos.', 401);
    return data.session;
  }

  /** Valida el token de acceso (con caché corta) y devuelve el usuario con su perfil. */
  async function userFromToken(token) {
    if (!token) return null;
    const hit = cache.get(token);
    if (hit && hit.at > Date.now() - USER_CACHE_MS) return hit.user;
    const { data, error } = await admin.auth.getUser(token);
    if (error) {
      const svc = serviceError(error);
      if (svc) throw svc; // fallo del servicio: no es una sesión inválida
      return null;
    }
    if (!data?.user) return null;
    const user = await profile(data.user.id);
    cache.set(token, { at: Date.now(), user });
    if (cache.size > 5000) cache.clear();
    return user;
  }

  /**
   * Renueva la sesión. Devuelve la sesión, o null si el token de refresco es inválido de verdad.
   * Si el servicio falla (429 / 5xx / red) lanza un error: NO se cierra la sesión del usuario.
   */
  async function refresh(refreshToken) {
    if (!refreshToken) return null;
    const { data, error } = await pub.auth.refreshSession({ refresh_token: refreshToken });
    if (error) {
      const svc = serviceError(error);
      if (svc) throw svc;
      return null;
    }
    return data.session;
  }

  /** Claims del token (ya validado por userFromToken). */
  function claimsOf(token) {
    try { return JSON.parse(Buffer.from(String(token).split('.')[1], 'base64url').toString()); } catch { return null; }
  }

  /** Solo un token emitido por el enlace de recuperación (amr = otp/recovery, reciente) permite fijar contraseña. */
  function isRecoveryToken(token) {
    const amr = claimsOf(token)?.amr ?? [];
    return amr.some((m) => ['otp', 'recovery'].includes(m.method) && Date.now() / 1000 - m.timestamp < 3600);
  }

  async function signOut(token) {
    if (!token) return;
    cache.delete(token);
    await admin.auth.admin.signOut(token).catch(() => {});
  }

  async function sendRecovery(email) {
    // Respuesta idéntica exista o no la cuenta (no revela qué correos están registrados).
    await pub.auth.resetPasswordForEmail(email, { redirectTo: `${config.appUrl}/restablecer` }).catch(() => {});
  }

  /** Link de criar/redefinir senha para mandar no nosso e-mail (não dispara e-mail do Supabase). */
  async function recoveryLink(email) {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: `${config.appUrl}/restablecer` } });
    return error ? null : data?.properties?.action_link ?? null;
  }

  async function setPassword(userId, password) {
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) {
      if (error.code === 'weak_password') throw new AuthError('WEAK_PASSWORD', 'La contraseña es demasiado débil.', 422, 'password');
      throw error;
    }
    cache.clear();
  }

  async function verifyPassword(email, password) {
    const { error } = await pub.auth.signInWithPassword({ email, password });
    if (error) {
      const svc = serviceError(error);
      if (svc) throw svc;
      return false;
    }
    return true;
  }

  async function deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    cache.clear();
  }

  return { register, signIn, userFromToken, refresh, signOut, sendRecovery, recoveryLink, setPassword, verifyPassword, deleteUser, profile, isRecoveryToken };
}

export function cookieOptions(config, maxAgeSeconds) {
  return { httpOnly: true, sameSite: 'lax', secure: config.isProduction || config.appUrl.startsWith('https://'), path: '/', maxAge: maxAgeSeconds * 1000 };
}

export function setSessionCookies(res, config, session) {
  res.cookie(ACCESS_COOKIE, session.access_token, cookieOptions(config, session.expires_in ?? 3600));
  res.cookie(REFRESH_COOKIE, session.refresh_token, cookieOptions(config, 60 * 60 * 24 * 30));
  // Indicador sin datos (no es la sesión): permite a la landing saber si consultar /api/me.
  res.cookie(HINT_COOKIE, '1', { ...cookieOptions(config, 60 * 60 * 24 * 30), httpOnly: false });
}

export function clearSessionCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
  res.clearCookie(HINT_COOKIE, { path: '/' });
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k) {
      try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie corrupta: se ignora */ }
    }
  }
  return out;
}

export const newId = () => randomUUID();

export const isValidEmail = (v) => typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/**
 * Limitador compartido entre instancias (Postgres). `limit(key)` devuelve true si se permite.
 * Si la base falla, se permite (no bloquear a todos por un error de infraestructura).
 */
export function sharedRateLimiter(db, { windowSeconds, max }) {
  return async (key) => {
    try {
      return (await db.service.one('select public.hit_rate_limit($1, $2, $3) as ok', [key, max, windowSeconds])).ok;
    } catch {
      return true;
    }
  };
}

/** Limitador simple en memoria (solo para scripts y pruebas). */
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  return (key) => {
    const t = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < t) {
      hits.set(key, { count: 1, reset: t + windowMs });
      if (hits.size > 10000) hits.clear();
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}
