// Equipo del panel, 2FA TOTP propio (RFC 6238) y middleware de acceso.
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError, wrap } from '../routes/util.js';
import { parseCookies } from '../auth.js';

export const TWOFA_COOKIE = 'al_gt';
export const TWOFA_TTL_S = 12 * 60 * 60;
export const ROLES = ['admin', 'marketing', 'readonly'];
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  let bits = 0; let value = 0; const out = [];
  for (const ch of String(str).toUpperCase().replace(/[=\s]/g, '')) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('base32 inválido');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226). `secret` es un Buffer; `algo` sha1 por defecto (RFC 6238 usa también sha256/sha512 en sus vectores). */
export function hotp(secret, counter, digits = 6, algo = 'sha1') {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac(algo, secret).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** TOTP (RFC 6238): `timeMs` en milisegundos, paso de 30 s. */
export function totp(secret, timeMs = Date.now(), { digits = 6, step = 30, algo = 'sha1' } = {}) {
  return hotp(secret, Math.floor(timeMs / 1000 / step), digits, algo);
}

const safeEq = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Código válido en la ventana ±`window` pasos (comparación en tiempo constante). */
export function checkTotp(secret, code, { now = Date.now(), window = 1 } = {}) {
  const c = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  let ok = false;
  const counter = Math.floor(now / 1000 / 30);
  for (let d = -window; d <= window; d++) {
    if (safeEq(hotp(secret, counter + d), c)) ok = true; // sin cortocircuito
  }
  return ok;
}

export function createStaff({ db, settings, config, log = console }) {
  const key = createHash('sha256')
    .update(`growth:2fa-cookie:${config?.growth?.encryptionKey || config?.supabase?.secretKey || config?.cronSecret || 'alento-dev-only'}`)
    .digest();
  const sign = (payload) => createHmac('sha256', key).update(payload).digest('base64url');

  // --- Papeles
  async function roleOf(userId) {
    if (!userId) return null;
    // Modo master: un único correo autorizado; el resto queda fuera aunque tenga fila en el equipo o sea admin del contenido.
    const master = config?.growth?.masterEmail;
    if (master) {
      const u = await db.service.one('select lower(email) as email from auth.users where id = $1', [userId]);
      return u?.email === master ? 'admin' : null;
    }
    const row = await db.service.one('select role from growth.staff where user_id = $1', [userId]);
    if (row) return row.role;
    const adm = await db.service.one('select 1 as ok from public.admin_users where user_id = $1', [userId]);
    return adm ? 'admin' : null;
  }

  async function adminIds() {
    const rows = await db.service.rows(`
      select user_id from growth.staff where role = 'admin'
      union select user_id from public.admin_users`);
    return rows.map((r) => r.user_id);
  }

  /** Nunca se deja el panel sin administradores. */
  async function assertNotLastAdmin(userId) {
    if ((await roleOf(userId)) !== 'admin') return;
    const others = (await adminIds()).filter((id) => id !== userId);
    if (others.length === 0) throw new HttpError(409, 'No puedes quitar al último administrador.', 'LAST_ADMIN');
  }

  async function list() {
    return db.service.rows(`
      with ids as (
        select user_id from growth.staff union select user_id from public.admin_users
      )
      select i.user_id, u.email,
             coalesce(s.role, 'admin') as role,
             coalesce(s.totp_enabled, false) as totp_enabled,
             s.created_at
      from ids i
      left join growth.staff s on s.user_id = i.user_id
      left join auth.users u on u.id = i.user_id
      order by u.email`);
  }

  async function grantUser(userId, role, actor = null) {
    if (!ROLES.includes(role)) throw new HttpError(422, 'Papel no válido.', 'INVALID', { field: 'role' });
    const user = await db.service.one('select id from auth.users where id = $1', [userId]);
    if (!user) throw new HttpError(404, 'No existe esa cuenta.', 'NOT_FOUND');
    if (role !== 'admin') await assertNotLastAdmin(userId);
    await db.service.exec(`
      insert into growth.staff (user_id, role) values ($1, $2)
      on conflict (user_id) do update set role = excluded.role`, [userId, role]);
    await db.service.exec(`insert into growth.audit_log (actor, action, entity, entity_id, details) values ($1, 'staff.grant', 'staff', $2, $3::jsonb)`,
      [actor, userId, JSON.stringify({ role })]);
    return { userId, role };
  }

  async function grantByEmail(email, role, actor = null) {
    const user = await db.service.one('select id from auth.users where lower(email) = lower($1)', [String(email ?? '').trim()]);
    if (!user) throw new HttpError(404, 'No existe una cuenta con ese correo.', 'NOT_FOUND');
    return grantUser(user.id, role, actor);
  }

  /** Contrato de rutas: grant({email, role}) -> {userId}. */
  async function grant({ email, role }, actor = null) {
    return grantByEmail(email, role, actor);
  }

  async function revoke(userId, actor = null) {
    await assertNotLastAdmin(userId);
    await db.service.exec('delete from growth.staff where user_id = $1', [userId]);
    await db.service.exec(`insert into growth.audit_log (actor, action, entity, entity_id) values ($1, 'staff.revoke', 'staff', $2)`, [actor, userId]);
    return { ok: true };
  }

  // --- 2FA
  async function secretOf(userId) {
    const row = await db.service.one('select totp_secret, totp_enabled from growth.staff where user_id = $1', [userId]);
    if (!row?.totp_secret) return null;
    const plain = settings.decrypt(row.totp_secret);
    if (!plain) return null;
    return { secret: base32Decode(plain), enabled: row.totp_enabled };
  }

  async function twofaEnabled(userId) {
    return (await twofaStatus(userId)).enabled;
  }

  /** Auditoría: actor = usuario de la petición. */
  async function audit(req, action, entity = null, entityId = null, details = {}) {
    await db.service.exec(`insert into growth.audit_log (actor, action, entity, entity_id, details) values ($1, $2, $3, $4, $5::jsonb)`,
      [req?.user?.id ?? null, action, entity, entityId == null ? null : String(entityId), JSON.stringify(details ?? {})]);
  }

  async function twofaStatus(userId) {
    const row = await db.service.one('select totp_enabled from growth.staff where user_id = $1', [userId]);
    return { enabled: !!row?.totp_enabled };
  }

  async function totpSetup(userId, email = null) {
    const role = await roleOf(userId);
    if (!role) throw new HttpError(403, 'No autorizado.', 'FORBIDDEN');
    const cur = await db.service.one('select totp_enabled from growth.staff where user_id = $1', [userId]);
    if (cur?.totp_enabled) throw new HttpError(409, 'El 2FA ya está activo.', 'TWOFA_ALREADY');
    const secret = base32Encode(randomBytes(20));
    await db.service.exec(`
      insert into growth.staff (user_id, role, totp_secret, totp_enabled) values ($1, $2, $3, false)
      on conflict (user_id) do update set totp_secret = excluded.totp_secret, totp_enabled = false`,
    [userId, role, settings.encrypt(secret)]);
    const u = email ? { email } : await db.service.one('select email from auth.users where id = $1', [userId]);
    const issuer = 'Alento';
    const label = encodeURIComponent(`${issuer}:${u?.email ?? userId}`);
    return { secret, otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30` };
  }

  /** Confirma el primer código y activa el 2FA. */
  async function totpEnable(userId, code, { now } = {}) {
    const s = await secretOf(userId);
    if (!s || !checkTotp(s.secret, code, { now })) return false;
    await db.service.exec('update growth.staff set totp_enabled = true where user_id = $1', [userId]);
    return true;
  }

  /** Verifica un código contra un 2FA ya activo. */
  async function verifyTotp(userId, code, { now } = {}) {
    const s = await secretOf(userId);
    return !!(s && s.enabled && checkTotp(s.secret, code, { now }));
  }

  /** Desactiva el 2FA de alguien (recuperación por un admin). */
  async function totpReset(userId, actor = null) {
    await db.service.exec('update growth.staff set totp_secret = null, totp_enabled = false where user_id = $1', [userId]);
    await db.service.exec(`insert into growth.audit_log (actor, action, entity, entity_id) values ($1, 'staff.totp_reset', 'staff', $2)`, [actor, userId]);
  }

  // --- Cookie de sesión 2FA
  const makeToken = (userId, nowMs = Date.now(), ttlS = TWOFA_TTL_S) => {
    const exp = Math.floor(nowMs / 1000) + ttlS;
    const payload = `${userId}.${exp}`;
    return `${payload}.${sign(payload)}`;
  };

  /** Devuelve el userId del token si la firma y la caducidad son válidas. */
  function readToken(token, nowMs = Date.now()) {
    const parts = String(token ?? '').split('.');
    if (parts.length !== 3) return null;
    const [userId, exp, sig] = parts;
    if (!safeEq(sign(`${userId}.${exp}`), sig)) return null;
    if (!/^\d+$/.test(exp) || Number(exp) <= Math.floor(nowMs / 1000)) return null;
    return userId;
  }

  function issue2fa(res, userId) {
    res.cookie(TWOFA_COOKIE, makeToken(userId), {
      httpOnly: true, sameSite: 'strict', secure: !!config?.isProduction, path: '/', maxAge: TWOFA_TTL_S * 1000,
    });
  }

  function clear2fa(res) { res.clearCookie(TWOFA_COOKIE, { path: '/' }); }

  /** ¿La petición trae una cookie 2FA válida (y, si se indica, de ese usuario)? */
  function has2fa(req, userId = null) {
    const cookies = req.cookies ?? parseCookies(req.headers?.cookie);
    const who = readToken(cookies?.[TWOFA_COOKIE]);
    return !!who && (userId == null || who === userId);
  }

  /** Verifica el código y emite la cookie; devuelve boolean. */
  async function login2fa(res, userId, code) {
    if (!(await verifyTotp(userId, code))) return false;
    issue2fa(res, userId);
    return true;
  }

  function requireStaff({ roles = ROLES } = {}) {
    return wrap(async (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar.', code: 'AUTH_REQUIRED' });
      const role = await roleOf(req.user.id);
      if (!role || !roles.includes(role)) return res.status(403).json({ error: 'No autorizado.', code: 'FORBIDDEN' });
      if (!has2fa(req, req.user.id)) {
        return res.status(428).json({ error: 'Verifica tu segundo factor.', code: 'TWOFA_REQUIRED' });
      }
      req.staff = { userId: req.user.id, role };
      next();
    });
  }

  return {
    roleOf, list, grant, grantUser, grantByEmail, audit, twofaEnabled, revoke, adminIds,
    twofaStatus, totpSetup, totpEnable, verifyTotp, totpReset,
    issue2fa, clear2fa, has2fa, login2fa, requireStaff,
    makeToken, readToken,
  };
}
