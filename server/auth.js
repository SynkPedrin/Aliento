import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const ACCESS_COOKIE = 'al_at';
export const REFRESH_COOKIE = 'al_rt';
export const ASSESSMENT_COOKIE = 'fg_aid';
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
  const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const pub = createClient(url, publishableKey, opts);
  const admin = createClient(url, secretKey, opts);
  const cache = new Map();

  async function profile(userId) {
    return db.service.one(`
      select p.user_id as id, u.email, p.name, p.stripe_customer_id, p.timezone, p.created_at,
             exists (select 1 from public.admin_users a where a.user_id = p.user_id) as is_admin
      from public.profiles p join auth.users u on u.id = p.user_id where p.user_id = $1`, [userId]);
  }

  async function register({ name, email, password, timezone }) {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name },
    });
    if (error) {
      if (error.code === 'email_exists' || /already been registered/i.test(error.message)) {
        throw new AuthError('EMAIL_EXISTS', 'Ya existe una cuenta con este correo. Inicia sesión.', 409, 'email');
      }
      if (error.code === 'weak_password') throw new AuthError('WEAK_PASSWORD', 'La contraseña es demasiado débil.', 422, 'password');
      throw error;
    }
    try {
      await db.service.exec(
        'insert into public.profiles (user_id, name, timezone, terms_accepted_at) values ($1, $2, $3, now())',
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
    if (error || !data.session) throw new AuthError('INVALID_LOGIN', 'Correo o contraseña incorrectos.', 401);
    return data.session;
  }

  /** Valida el token de acceso (con caché corta) y devuelve el usuario con su perfil. */
  async function userFromToken(token) {
    if (!token) return null;
    const hit = cache.get(token);
    if (hit && hit.at > Date.now() - USER_CACHE_MS) return hit.user;
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    const user = await profile(data.user.id);
    cache.set(token, { at: Date.now(), user });
    if (cache.size > 5000) cache.clear();
    return user;
  }

  async function refresh(refreshToken) {
    if (!refreshToken) return null;
    const { data, error } = await pub.auth.refreshSession({ refresh_token: refreshToken });
    return error ? null : data.session;
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
    return !error;
  }

  async function deleteUser(userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
    cache.clear();
  }

  return { register, signIn, userFromToken, refresh, signOut, sendRecovery, setPassword, verifyPassword, deleteUser, profile };
}

export function cookieOptions(config, maxAgeSeconds) {
  return { httpOnly: true, sameSite: 'lax', secure: config.isProduction, path: '/', maxAge: maxAgeSeconds * 1000 };
}

export function setSessionCookies(res, config, session) {
  res.cookie(ACCESS_COOKIE, session.access_token, cookieOptions(config, session.expires_in ?? 3600));
  res.cookie(REFRESH_COOKIE, session.refresh_token, cookieOptions(config, 60 * 60 * 24 * 30));
}

export function clearSessionCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
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

/** Limitador simple en memoria para frenar fuerza bruta. */
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
