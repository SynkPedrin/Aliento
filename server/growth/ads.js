// Importación de gasto y ejecución de acciones en Meta Ads y TikTok Ads.
// El ad_id guardado es el id del anuncio en la plataforma (es lo que lleva utm_content: Meta {{ad.id}}, TikTok __CID__).

const META = 'https://graph.facebook.com/v21.0';
const TIKTOK = 'https://business-api.tiktok.com/open_api/v1.3';
const PURCHASE_TYPES = ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase'];
const MAX_PAGES = 50;

const cents = (v) => Math.round(Number(v || 0) * 100) || 0;
const int = (v) => Math.round(Number(v || 0)) || 0;
const pick = (list, types) => {
  for (const t of types) { const f = (list ?? []).find((a) => a.action_type === t); if (f) return Number(f.value || 0); }
  return 0;
};

/** Día 'YYYY-MM-DD' en una zona horaria. */
export function dayIn(tz, date = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
  catch { return date.toISOString().slice(0, 10); }
}
const addDays = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function createAds({ db, settings, config, fetchImpl = globalThis.fetch, log = console } = {}) {
  async function creds(platform) {
    if (!settings) return null;
    if (platform === 'meta') {
      const s = await settings.get('ads.meta', {});
      return s.accountId && s.accessToken ? { accountId: String(s.accountId).replace(/^act_/, ''), token: s.accessToken } : null;
    }
    const s = await settings.get('ads.tiktok', {});
    return s.advertiserId && s.accessToken ? { advertiserId: String(s.advertiserId), token: s.accessToken } : null;
  }

  async function configured() {
    return { meta: !!(await creds('meta')), tiktok: !!(await creds('tiktok')) };
  }

  async function http(url, init = {}) {
    let res;
    try { res = await fetchImpl(url, init); } catch (e) { throw new Error(`Sin conexión con la plataforma de anuncios: ${e.message}`); }
    let body = null;
    try { body = await res.json(); } catch { /* cuerpo vacío */ }
    return { res, body };
  }
  const metaGet = async (url) => {
    const { res, body } = await http(url);
    if (!res.ok || body?.error) throw new Error(`Meta: ${body?.error?.message ?? `HTTP ${res.status}`}`);
    return body;
  };
  const metaPost = async (path, token, fields) => {
    const { res, body } = await http(`${META}/${path}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...fields, access_token: token }).toString(),
    });
    if (!res.ok || body?.error) throw new Error(`Meta: ${body?.error?.message ?? `HTTP ${res.status}`}`);
    return body;
  };
  const tkGet = async (path, token, params) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) qs.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    const { res, body } = await http(`${TIKTOK}${path}?${qs}`, { headers: { 'Access-Token': token } });
    if (!res.ok || (body && body.code !== 0)) throw new Error(`TikTok: ${body?.message ?? `HTTP ${res.status}`}`);
    return body?.data ?? {};
  };
  const tkPost = async (path, token, payload) => {
    const { res, body } = await http(`${TIKTOK}${path}`, {
      method: 'POST', headers: { 'Access-Token': token, 'content-type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!res.ok || (body && body.code !== 0)) throw new Error(`TikTok: ${body?.message ?? `HTTP ${res.status}`}`);
    return body?.data ?? {};
  };

  // ------------------------------------------------------------------ persistencia (upsert idempotente)
  async function upsertAds(platform, accountId, list) {
    const m = new Map();
    for (const a of list) if (a.ad_id) m.set(a.ad_id, { ...(m.get(a.ad_id) ?? {}), ...Object.fromEntries(Object.entries(a).filter(([, v]) => v != null)) });
    const rows = [...m.values()];
    if (!rows.length) return 0;
    const col = (k) => rows.map((r) => r[k] ?? null);
    await db.service.exec(`
      insert into growth.ads (platform, ad_id, account_id, campaign_id, campaign_name, adset_id, adset_name, ad_name, thumbnail_url, status, daily_budget_cents, updated_at)
      select $1::text, *, now() from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::bigint[])
      on conflict (platform, ad_id) do update set
        account_id = coalesce(excluded.account_id, growth.ads.account_id),
        campaign_id = coalesce(excluded.campaign_id, growth.ads.campaign_id), campaign_name = coalesce(excluded.campaign_name, growth.ads.campaign_name),
        adset_id = coalesce(excluded.adset_id, growth.ads.adset_id), adset_name = coalesce(excluded.adset_name, growth.ads.adset_name),
        ad_name = coalesce(excluded.ad_name, growth.ads.ad_name), thumbnail_url = coalesce(excluded.thumbnail_url, growth.ads.thumbnail_url),
        status = coalesce(excluded.status, growth.ads.status), daily_budget_cents = coalesce(excluded.daily_budget_cents, growth.ads.daily_budget_cents),
        updated_at = now()`,
    [platform, col('ad_id'), rows.map(() => accountId), col('campaign_id'), col('campaign_name'), col('adset_id'), col('adset_name'),
      col('ad_name'), col('thumbnail_url'), col('status'), col('daily_budget_cents')]);
    return rows.length;
  }

  async function upsertSpend(platform, list) {
    const m = new Map();
    for (const r of list) m.set(`${r.ad_id}|${r.day}`, r);
    const rows = [...m.values()];
    if (!rows.length) return 0;
    const col = (k) => rows.map((r) => r[k]);
    await db.service.exec(`
      insert into growth.ad_spend_daily (platform, ad_id, day, spend_cents, impressions, clicks, reported_conversions, reported_value_cents, video_3s_views, updated_at)
      select $1::text, *, now() from unnest($2::text[], $3::date[], $4::bigint[], $5::bigint[], $6::bigint[], $7::numeric[], $8::bigint[], $9::bigint[])
      on conflict (platform, ad_id, day) do update set spend_cents = excluded.spend_cents, impressions = excluded.impressions, clicks = excluded.clicks,
        reported_conversions = excluded.reported_conversions, reported_value_cents = excluded.reported_value_cents,
        video_3s_views = excluded.video_3s_views, updated_at = now()`,
    [platform, col('ad_id'), col('day'), col('spend_cents'), col('impressions'), col('clicks'), col('reported_conversions'), col('reported_value_cents'), col('video_3s_views')]);
    return rows.length;
  }

  // ------------------------------------------------------------------ Meta
  async function syncMeta(c, since, until) {
    const base = `${META}/act_${c.accountId}`;
    // Estructura
    const structure = [];
    let url = `${base}/ads?${new URLSearchParams({
      fields: 'id,name,effective_status,adset{id,name,daily_budget},campaign{id,name},creative{thumbnail_url}', limit: '200', access_token: c.token })}`;
    for (let i = 0; url && i < MAX_PAGES; i++) {
      const body = await metaGet(url);
      for (const a of body.data ?? []) {
        structure.push({
          ad_id: String(a.id), ad_name: a.name, status: a.effective_status ?? null,
          adset_id: a.adset?.id ?? null, adset_name: a.adset?.name ?? null,
          daily_budget_cents: a.adset?.daily_budget != null ? int(a.adset.daily_budget) : null,
          campaign_id: a.campaign?.id ?? null, campaign_name: a.campaign?.name ?? null, thumbnail_url: a.creative?.thumbnail_url ?? null,
        });
      }
      url = body.paging?.next ?? null;
    }
    // Gasto diario por anuncio
    const spend = []; const fromInsights = [];
    url = `${base}/insights?${new URLSearchParams({
      level: 'ad', time_increment: '1', limit: '500', access_token: c.token,
      time_range: JSON.stringify({ since, until }),
      fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,actions,action_values' })}`;
    for (let i = 0; url && i < MAX_PAGES; i++) {
      const body = await metaGet(url);
      for (const r of body.data ?? []) {
        const ad_id = String(r.ad_id);
        fromInsights.push({ ad_id, ad_name: r.ad_name, adset_id: r.adset_id, adset_name: r.adset_name, campaign_id: r.campaign_id, campaign_name: r.campaign_name });
        spend.push({
          ad_id, day: r.date_start, spend_cents: cents(r.spend), impressions: int(r.impressions), clicks: int(r.clicks),
          reported_conversions: pick(r.actions, PURCHASE_TYPES), reported_value_cents: cents(pick(r.action_values, PURCHASE_TYPES)),
          video_3s_views: int(pick(r.actions, ['video_view'])),
        });
      }
      url = body.paging?.next ?? null;
    }
    // La estructura (más completa) pisa a los datos de insights
    const ads = await upsertAds('meta', c.accountId, [...fromInsights, ...structure]);
    return { ads, rows: await upsertSpend('meta', spend) };
  }

  // ------------------------------------------------------------------ TikTok
  async function tkPages(path, token, params) {
    const out = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await tkGet(path, token, { ...params, page, page_size: 200 });
      out.push(...(data.list ?? []));
      if (page >= (data.page_info?.total_page ?? 1)) break;
    }
    return out;
  }
  async function syncTikTok(c, since, until) {
    const adv = c.advertiserId;
    const groups = await tkPages('/adgroup/get/', c.token, { advertiser_id: adv });
    const budgets = new Map(groups.map((g) => [String(g.adgroup_id), g.budget != null ? cents(g.budget) : null]));
    const structure = (await tkPages('/ad/get/', c.token, { advertiser_id: adv })).map((a) => ({
      ad_id: String(a.ad_id), ad_name: a.ad_name, status: a.operation_status ?? a.secondary_status ?? null,
      adset_id: a.adgroup_id != null ? String(a.adgroup_id) : null, adset_name: a.adgroup_name ?? null,
      campaign_id: a.campaign_id != null ? String(a.campaign_id) : null, campaign_name: a.campaign_name ?? null,
      thumbnail_url: a.video_cover_url ?? a.image_urls?.[0] ?? null,
      daily_budget_cents: budgets.get(String(a.adgroup_id)) ?? null,
    }));
    const rowsRaw = await tkPages('/report/integrated/get/', c.token, {
      advertiser_id: adv, report_type: 'BASIC', data_level: 'AUCTION_AD', dimensions: ['ad_id', 'stat_time_day'],
      metrics: ['spend', 'impressions', 'clicks', 'conversion', 'video_play_actions'], start_date: since, end_date: until,
    });
    const spend = rowsRaw.map((r) => ({
      ad_id: String(r.dimensions?.ad_id), day: String(r.dimensions?.stat_time_day ?? '').slice(0, 10),
      spend_cents: cents(r.metrics?.spend), impressions: int(r.metrics?.impressions), clicks: int(r.metrics?.clicks),
      reported_conversions: Number(r.metrics?.conversion || 0), reported_value_cents: 0, video_3s_views: int(r.metrics?.video_play_actions),
    })).filter((r) => r.ad_id !== 'undefined' && /^\d{4}-\d{2}-\d{2}$/.test(r.day));
    const ads = await upsertAds('tiktok', adv, structure);
    return { ads, rows: await upsertSpend('tiktok', spend) };
  }

  /** Importa estructura y gasto. hourly = solo el día en curso. */
  async function sync({ scope = 'daily', days = 7 } = {}) {
    const tz = (await settings?.get('timezone', {}))?.tz || 'Europe/Madrid';
    const until = dayIn(tz);
    const since = scope === 'hourly' ? until : addDays(until, -(Math.max(1, days) - 1));
    const out = { scope, since, until };
    const meta = await creds('meta'); const tiktok = await creds('tiktok');
    for (const [name, c, fn] of [['meta', meta, syncMeta], ['tiktok', tiktok, syncTikTok]]) {
      if (!c) { out[name] = { skipped: true }; continue; }
      try { out[name] = await fn(c, since, until); } catch (e) { log.warn?.(`[ads] sync ${name}: ${e.message}`); out[name] = { error: e.message }; }
    }
    if (!meta && !tiktok) out.skipped = true;
    return out;
  }

  // ------------------------------------------------------------------ acciones
  async function limits() {
    const ai = (await settings?.get('ai', {})) ?? {};
    return { step: Number(ai.limits?.budget_max_step_pct ?? 20), cap: ai.limits?.daily_cap_cents != null ? Number(ai.limits.daily_cap_cents) : null };
  }

  /** Ejecuta una acción aprobada. Devuelve { ok, result, undo_data }. */
  async function execute(action) {
    const platform = action?.platform;
    if (!['meta', 'tiktok'].includes(platform)) throw new Error('Plataforma de anuncios no soportada');
    const c = await creds(platform);
    if (!c) throw new Error(`${platform === 'meta' ? 'Meta' : 'TikTok'} Ads no está configurado`);
    const data = action.data ?? {};
    const id = String(action.target_id ?? '');
    if (!id) throw new Error('Falta el identificador del objetivo');

    if (action.kind === 'pause_ad') {
      const prev = await db.service.one('select status from growth.ads where platform = $1 and ad_id = $2', [platform, id]);
      if (platform === 'meta') await metaPost(id, c.token, { status: 'PAUSED' });
      else await tkPost('/ad/status/update/', c.token, { advertiser_id: c.advertiserId, ad_ids: [id], operation_status: 'DISABLE' });
      await db.service.exec("update growth.ads set status = 'PAUSED', updated_at = now() where platform = $1 and ad_id = $2", [platform, id]);
      return { ok: true, result: { paused: id }, undo_data: { platform, ad_id: id, previous_status: prev?.status ?? null } };
    }

    if (action.kind === 'scale_budget') {
      const next = int(data.new_budget_cents);
      let current = data.current_budget_cents != null ? int(data.current_budget_cents) : null;
      if (current == null) current = (await db.service.one('select max(daily_budget_cents) as b from growth.ads where platform = $1 and adset_id = $2', [platform, id]))?.b ?? null;
      if (!current) throw new Error('No se conoce el presupuesto actual del conjunto; sincroniza los anuncios antes');
      if (next <= current) throw new Error('El nuevo presupuesto debe ser mayor que el actual');
      const lim = await limits();
      if (next > Math.floor(current * (1 + lim.step / 100)) + 1) throw new Error(`El aumento supera el máximo del ${lim.step}% diario`);
      if (lim.cap != null && next > lim.cap) throw new Error('El presupuesto supera el tope diario configurado');
      const today = await db.service.one(`select count(*)::int as n from growth.ai_actions where kind = 'scale_budget' and platform = $1 and target_id = $2
        and status = 'executed' and executed_at >= date_trunc('day', now()) and id is distinct from $3::uuid`, [platform, id, action.id ?? null]);
      if (today.n > 0) throw new Error('Este conjunto ya subió de presupuesto hoy (máximo un aumento al día)');
      if (platform === 'meta') await metaPost(id, c.token, { daily_budget: String(next) });
      else await tkPost('/adgroup/update/', c.token, { advertiser_id: c.advertiserId, adgroup_id: id, budget: next / 100 });
      await db.service.exec('update growth.ads set daily_budget_cents = $3, updated_at = now() where platform = $1 and adset_id = $2', [platform, id, next]);
      return { ok: true, result: { adset_id: id, budget_cents: next }, undo_data: { platform, adset_id: id, previous_budget_cents: current } };
    }
    throw new Error(`Acción no soportada por la plataforma: ${action.kind}`);
  }

  /** Revierte una acción ejecutada con su undo_data. */
  async function undo(action) {
    const u = action?.undo_data;
    if (!u?.platform) throw new Error('Esta acción no se puede deshacer');
    const c = await creds(u.platform);
    if (!c) throw new Error(`${u.platform === 'meta' ? 'Meta' : 'TikTok'} Ads no está configurado`);
    if (action.kind === 'pause_ad') {
      if (u.platform === 'meta') await metaPost(u.ad_id, c.token, { status: 'ACTIVE' });
      else await tkPost('/ad/status/update/', c.token, { advertiser_id: c.advertiserId, ad_ids: [u.ad_id], operation_status: 'ENABLE' });
      await db.service.exec("update growth.ads set status = 'ACTIVE', updated_at = now() where platform = $1 and ad_id = $2", [u.platform, u.ad_id]);
      return { ok: true, result: { reactivated: u.ad_id } };
    }
    if (action.kind === 'scale_budget') {
      const prev = int(u.previous_budget_cents);
      if (u.platform === 'meta') await metaPost(u.adset_id, c.token, { daily_budget: String(prev) });
      else await tkPost('/adgroup/update/', c.token, { advertiser_id: c.advertiserId, adgroup_id: u.adset_id, budget: prev / 100 });
      await db.service.exec('update growth.ads set daily_budget_cents = $3, updated_at = now() where platform = $1 and adset_id = $2', [u.platform, u.adset_id, prev]);
      return { ok: true, result: { adset_id: u.adset_id, budget_cents: prev } };
    }
    throw new Error(`No se puede deshacer: ${action.kind}`);
  }

  return { configured, sync, execute, undo };
}
