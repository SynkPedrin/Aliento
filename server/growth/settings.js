// Configuración del panel (growth.settings). Los campos secretos (tokens) se guardan cifrados con AES-256-GCM.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Campos que se cifran, por clave de configuración. */
export const SECRET_FIELDS = {
  'pixels.meta': ['accessToken'],
  'pixels.tiktok': ['accessToken'],
  'ads.meta': ['accessToken'],
  'ads.tiktok': ['accessToken'],
  customerio: ['apiKey', 'appApiKey'],
  anthropic: ['apiKey'],
  alerts: ['webhookUrl'],
};

const secretFieldsOf = (name) => SECRET_FIELDS[name] ?? (String(name).startsWith('pixel:') ? ['accessToken'] : []);

export function createSettings({ db, config }) {
  const secret = config.growth?.encryptionKey || config.supabase?.secretKey || config.cronSecret || 'alento-dev-only';
  const key = createHash('sha256').update(`growth:${secret}`).digest();

  const encrypt = (text) => {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
    return `enc:${Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64')}`;
  };
  const decrypt = (blob) => {
    if (typeof blob !== 'string' || !blob.startsWith('enc:')) return blob;
    try {
      const raw = Buffer.from(blob.slice(4), 'base64');
      const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      d.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
    } catch { return ''; }
  };

  const walk = (name, value, fn) => {
    const fields = secretFieldsOf(name);
    const out = { ...(value ?? {}) };
    for (const f of fields) if (out[f] != null && out[f] !== '') out[f] = fn(out[f]);
    return out;
  };

  /** Valor con secretos descifrados (uso interno del servidor). */
  async function get(name, fallback = {}) {
    const row = await db.service.one('select value from growth.settings where key = $1', [name]);
    return row ? walk(name, row.value, decrypt) : fallback;
  }

  /** Para la interfaz: los secretos nunca salen; solo se indica si existen. */
  async function getMasked(name, fallback = {}) {
    const row = await db.service.one('select value from growth.settings where key = $1', [name]);
    if (!row) return fallback;
    return walk(name, row.value, () => '********');
  }

  /** Un campo secreto vacío o '********' conserva el valor guardado. */
  async function set(name, value, { by = null } = {}) {
    const current = await db.service.one('select value from growth.settings where key = $1', [name]);
    const merged = { ...(value ?? {}) };
    for (const f of secretFieldsOf(name)) {
      if (merged[f] === undefined || merged[f] === '' || merged[f] === '********') {
        if (current?.value?.[f] !== undefined) merged[f] = current.value[f]; else delete merged[f];
      } else {
        merged[f] = encrypt(merged[f]);
      }
    }
    await db.service.exec(`
      insert into growth.settings (key, value, encrypted, updated_by, updated_at) values ($1, $2::jsonb, $3, $4, now())
      on conflict (key) do update set value = excluded.value, encrypted = excluded.encrypted, updated_by = excluded.updated_by, updated_at = now()`,
    [name, JSON.stringify(merged), secretFieldsOf(name).length > 0, by]);
  }

  async function all() {
    const rows = await db.service.rows('select key from growth.settings order by key');
    const out = {};
    for (const r of rows) out[r.key] = await getMasked(r.key);
    return out;
  }

  return { get, getMasked, set, all, encrypt, decrypt };
}
