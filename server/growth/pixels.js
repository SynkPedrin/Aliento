// Pixels nomeados por rede (ex.: «PIXEL PERFIL 10»). Cada um tem um código curto que vai no link do
// anúncio (?px=perfil10): o visitante fica marcado com esse código e o navegador e a API de conversões
// usam o pixel daquele perfil. Sem código, vale o pixel padrão da rede.
import { randomUUID } from 'node:crypto';

export const PLATFORMS = ['meta', 'tiktok', 'google'];
const slug = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 40);

export function createPixels({ db, settings }) {
  const q = db.service;

  /** Todos os pixels (tokens decifrados; uso interno). O pixel antigo de configuração única aparece como «Principal». */
  async function list({ platform } = {}) {
    const rows = await q.rows(`select key from growth.settings where key like 'pixel:%' order by key`);
    const out = [];
    for (const r of rows) out.push({ key: r.key, ...(await settings.get(r.key)) });
    for (const p of ['meta', 'tiktok']) {
      if (out.some((x) => x.platform === p)) continue;
      const legacy = await settings.get(`pixels.${p}`, null);
      if (legacy?.pixelId) out.push({ key: `pixels.${p}`, platform: p, name: 'Principal', code: 'principal', active: true, isDefault: true, ...legacy });
    }
    return out.filter((x) => !platform || x.platform === platform);
  }

  const byKey = async (key) => (await list()).find((x) => x.key === key) ?? null;

  /** Pixel de um visitante: o do código do anúncio; senão o padrão; senão o primeiro ativo. */
  async function pick(platform, code) {
    const all = (await list({ platform })).filter((x) => x.active !== false && x.pixelId);
    const c = slug(code);
    return (c && all.find((x) => x.code === c)) || all.find((x) => x.isDefault) || all[0] || null;
  }

  async function save(input, { by = null } = {}) {
    const platform = PLATFORMS.includes(input.platform) ? input.platform : null;
    if (!platform) throw Object.assign(new Error('Rede inválida.'), { status: 422 });
    const name = String(input.name ?? '').trim().slice(0, 60);
    if (!name) throw Object.assign(new Error('Dê um nome ao pixel.'), { status: 422 });
    const key = input.key?.startsWith('pixel:') ? input.key : `pixel:${randomUUID()}`;
    const code = slug(input.code || name);
    // O pixel antigo (pixels.<rede>) é apagado ao salvar, então não conta como «outro».
    const others = (await list({ platform })).filter((x) => x.key !== key && x.key.startsWith('pixel:'));
    if (others.some((x) => x.code === code)) throw Object.assign(new Error(`Já existe um pixel com o código «${code}».`), { status: 409 });
    const isDefault = input.isDefault === true || !others.some((x) => x.isDefault);
    if (isDefault) {
      for (const o of others.filter((x) => x.isDefault && x.key.startsWith('pixel:'))) await settings.set(o.key, { ...(await settings.getMasked(o.key)), isDefault: false }, { by });
    }
    await settings.set(key, {
      platform, name, code, pixelId: String(input.pixelId ?? '').trim().slice(0, 40), accessToken: input.accessToken,
      testEventCode: String(input.testEventCode ?? '').trim().slice(0, 40), active: input.active !== false, isDefault,
    }, { by });
    // O pixel antigo deixa de valer assim que a rede tem pixels nomeados.
    await q.exec('delete from growth.settings where key = $1', [`pixels.${platform}`]);
    return { key, code };
  }

  async function remove(key) {
    if (!String(key).startsWith('pixel:')) return;
    await q.exec('delete from growth.settings where key = $1', [key]);
  }

  /** Para o painel: sem tokens, com volume de eventos das últimas 24 h. */
  async function forPanel() {
    const stats = await q.rows(`select payload->>'pixel_key' as key, status, count(*)::int as n from growth.outbox
      where created_at > now() - interval '24 hours' and destination in ('meta', 'tiktok') group by 1, 2`);
    return (await list()).map(({ accessToken, ...p }) => ({
      ...p, hasToken: Boolean(accessToken),
      events24h: Object.fromEntries(stats.filter((s) => s.key === p.key).map((s) => [s.status, s.n])),
    }));
  }

  return { list, byKey, pick, save, remove, forPanel, slug };
}
