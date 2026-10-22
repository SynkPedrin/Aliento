// Anuncios (Meta/TikTok): importación idempotente, paginación, mapeo de IDs y límites de ejecución. fetch simulado.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createAds, dayIn } from '../server/growth/ads.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
const U = randomUUID().slice(0, 8);
const ACC = `acc${U}`; const ADV = `adv${U}`;
const AD1 = `t${U}1`; const AD2 = `t${U}2`; const AD3 = `t${U}3`; const TK1 = `k${U}1`;
const ADSET = `s${U}1`; const TKSET = `g${U}1`;
let db; let cfg; let calls; let behavior; const actionIds = [];

const store = { 'ads.meta': { accountId: ACC, accessToken: 'tok-meta-secret' }, 'ads.tiktok': { advertiserId: ADV, accessToken: 'tok-tk-secret' }, ai: { limits: { budget_max_step_pct: 20, daily_cap_cents: 10000 } }, timezone: { tz: 'Europe/Madrid' } };
const settings = { get: async (k, f = {}) => store[k] ?? f };
const today = dayIn('Europe/Madrid');
const yday = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();

const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
let spendValue = '12.50';
async function fakeFetch(url, init = {}) {
  const u = new URL(url);
  calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body, headers: init.headers });
  if (behavior?.fail) return json(400, { error: { message: 'Invalid OAuth access token' }, code: 100, message: 'Invalid token' });
  if (u.hostname === 'graph.facebook.com') {
    if (init.method === 'POST') return json(200, { success: true });
    if (u.pathname.endsWith('/ads')) {
      return json(200, { data: [
        { id: AD1, name: 'Anuncio 1', effective_status: 'ACTIVE', adset: { id: ADSET, name: 'Conjunto', daily_budget: '5000' }, campaign: { id: `c${U}`, name: 'Campaña' }, creative: { thumbnail_url: 'https://x/t1.jpg' } },
        { id: AD2, name: 'Anuncio 2', effective_status: 'PAUSED', adset: { id: ADSET, name: 'Conjunto', daily_budget: '5000' }, campaign: { id: `c${U}`, name: 'Campaña' } },
      ] });
    }
    if (u.pathname.endsWith('/insights')) {
      if (u.searchParams.get('page') === '2') {
        return json(200, { data: [{ ad_id: AD3, ad_name: 'Solo insights', date_start: yday, spend: '1.00', impressions: '10', clicks: '1' }] });
      }
      return json(200, { data: [
        { ad_id: AD1, ad_name: 'Anuncio 1', adset_id: ADSET, adset_name: 'Conjunto', campaign_id: `c${U}`, campaign_name: 'Campaña', date_start: today, spend: spendValue, impressions: '1000', clicks: '40',
          actions: [{ action_type: 'purchase', value: '2' }, { action_type: 'omni_purchase', value: '2' }, { action_type: 'video_view', value: '300' }], action_values: [{ action_type: 'purchase', value: '58.00' }] },
        { ad_id: AD1, ad_name: 'Anuncio 1', date_start: yday, spend: '3.00', impressions: '200', clicks: '5' },
      ], paging: { next: `https://graph.facebook.com/v21.0/act_${ACC}/insights?page=2&access_token=tok-meta-secret` } });
    }
  }
  if (u.hostname === 'business-api.tiktok.com') {
    assert.equal(init.headers?.['Access-Token'], 'tok-tk-secret');
    if (u.pathname.endsWith('/adgroup/get/')) return json(200, { code: 0, data: { list: [{ adgroup_id: TKSET, budget: 30 }], page_info: { total_page: 1 } } });
    if (u.pathname.endsWith('/ad/get/')) return json(200, { code: 0, data: { list: [{ ad_id: TK1, ad_name: 'TT 1', adgroup_id: TKSET, adgroup_name: 'Grupo TT', campaign_id: 'cc', campaign_name: 'Camp TT', operation_status: 'ENABLE', video_cover_url: 'https://x/c.jpg' }], page_info: { total_page: 1 } } });
    if (u.pathname.endsWith('/report/integrated/get/')) {
      const page = Number(u.searchParams.get('page'));
      return json(200, { code: 0, data: { list: page === 1
        ? [{ dimensions: { ad_id: TK1, stat_time_day: `${today} 00:00:00` }, metrics: { spend: '7.25', impressions: '900', clicks: '30', conversion: '1', video_play_actions: '500' } }]
        : [{ dimensions: { ad_id: TK1, stat_time_day: `${yday} 00:00:00` }, metrics: { spend: '2.00', impressions: '100', clicks: '3', conversion: '0', video_play_actions: '50' } }], page_info: { total_page: 2 } } });
    }
    if (init.method === 'POST') return json(200, { code: 0, data: {} });
  }
  return json(404, {});
}

before(async () => {
  cfg = loadConfig({ APP_URL: 'http://localhost', CRON_SECRET: 'cron-test', ...localSupabaseEnv() });
  db = createDb(cfg.supabase.dbUrl, { max: 3 });
});
after(async () => {
  await db.service.exec('delete from growth.ad_spend_daily where ad_id like $1', [`%${U}%`]);
  await db.service.exec('delete from growth.ads where ad_id like $1', [`%${U}%`]);
  for (const id of actionIds) await db.service.exec('delete from growth.ai_actions where id = $1', [id]);
  await db.end();
});
const make = () => { calls = []; behavior = {}; return createAds({ db, settings, config: cfg, fetchImpl: fakeFetch, log: silent }); };

test('configured() refleja los ajustes', async () => {
  const ads = make();
  assert.deepEqual(await ads.configured(), { meta: true, tiktok: true });
  const none = createAds({ db, settings: { get: async (k, f = {}) => f }, config: cfg, fetchImpl: fakeFetch, log: silent });
  assert.deepEqual(await none.configured(), { meta: false, tiktok: false });
  assert.equal((await none.sync()).skipped, true);
  await assert.rejects(none.execute({ kind: 'pause_ad', platform: 'meta', target_id: AD1 }), /não está configurado/);
});

test('sync Meta: estructura, paginación, ad_id de la plataforma y upsert idempotente', async () => {
  const ads = make();
  store['ads.tiktok'] = {}; // solo Meta aquí
  const r = await ads.sync({ scope: 'daily', days: 7 });
  store['ads.tiktok'] = { advertiserId: ADV, accessToken: 'tok-tk-secret' };
  assert.equal(r.tiktok.skipped, true);
  assert.equal(r.meta.rows, 3, 'dos páginas de insights: 3 filas ad+día');
  const ad = await db.service.one("select * from growth.ads where platform = 'meta' and ad_id = $1", [AD1]);
  assert.equal(ad.ad_name, 'Anuncio 1'); assert.equal(ad.adset_id, ADSET); assert.equal(ad.daily_budget_cents, 5000);
  assert.equal(ad.thumbnail_url, 'https://x/t1.jpg'); assert.equal(ad.status, 'ACTIVE'); assert.equal(ad.account_id, ACC);
  assert.equal((await db.service.one("select status from growth.ads where ad_id = $1", [AD2])).status, 'PAUSED');
  assert.equal((await db.service.one("select ad_name from growth.ads where ad_id = $1", [AD3])).ad_name, 'Solo insights');
  const day = await db.service.one("select * from growth.ad_spend_daily where platform = 'meta' and ad_id = $1 and day = $2", [AD1, today]);
  assert.equal(day.spend_cents, 1250); assert.equal(day.impressions, 1000); assert.equal(day.clicks, 40);
  assert.equal(Number(day.reported_conversions), 2, 'no duplica purchase + omni_purchase'); assert.equal(day.reported_value_cents, 5800); assert.equal(day.video_3s_views, 300);
  // el token viaja en la consulta pero la ventana usa time_range
  const ins = calls.find((c) => c.url.includes('/insights') && !c.url.includes('page=2'));
  assert.ok(ins.url.includes('level=ad') && ins.url.includes('time_increment=1'));
  assert.ok(decodeURIComponent(ins.url).includes(`"since":"${(() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 6); return d.toISOString().slice(0, 10); })()}"`));
  // segunda pasada con otro gasto: mismas filas, valor actualizado
  spendValue = '20.00';
  await ads.sync({ scope: 'daily', days: 7 });
  spendValue = '12.50';
  const n = await db.service.one('select count(*)::int n from growth.ad_spend_daily where ad_id = $1', [AD1]);
  assert.equal(n.n, 2);
  assert.equal((await db.service.one('select spend_cents from growth.ad_spend_daily where ad_id = $1 and day = $2', [AD1, today])).spend_cents, 2000);
});

test('sync hourly pide solo el día en curso', async () => {
  const ads = make(); store['ads.tiktok'] = {};
  await ads.sync({ scope: 'hourly' });
  store['ads.tiktok'] = { advertiserId: ADV, accessToken: 'tok-tk-secret' };
  const ins = calls.find((c) => c.url.includes('/insights') && !c.url.includes('page=2'));
  const tr = JSON.parse(new URL(ins.url).searchParams.get('time_range'));
  assert.equal(tr.since, today); assert.equal(tr.until, today);
});

test('sync TikTok: paginación del informe y presupuesto del grupo', async () => {
  const ads = make(); store['ads.meta'] = {};
  const r = await ads.sync({ scope: 'daily', days: 3 });
  store['ads.meta'] = { accountId: ACC, accessToken: 'tok-meta-secret' };
  assert.equal(r.meta.skipped, true); assert.equal(r.tiktok.rows, 2);
  const ad = await db.service.one("select * from growth.ads where platform = 'tiktok' and ad_id = $1", [TK1]);
  assert.equal(ad.adset_id, TKSET); assert.equal(ad.daily_budget_cents, 3000); assert.equal(ad.status, 'ENABLE');
  const day = await db.service.one("select * from growth.ad_spend_daily where platform = 'tiktok' and ad_id = $1 and day = $2", [TK1, today]);
  assert.equal(day.spend_cents, 725); assert.equal(day.video_3s_views, 500);
});

test('un error de la plataforma no tumba la sincronización y no filtra el token', async () => {
  const ads = make(); behavior.fail = true;
  const r = await ads.sync({ scope: 'daily' });
  assert.match(r.meta.error, /Invalid OAuth/); assert.ok(!JSON.stringify(r).includes('tok-meta-secret'));
});

test('execute/undo pause_ad en Meta y TikTok', async () => {
  const ads = make();
  const m = await ads.execute({ kind: 'pause_ad', platform: 'meta', target_id: AD1 });
  assert.equal(m.ok, true); assert.equal(m.undo_data.ad_id, AD1);
  const post = calls.find((c) => c.method === 'POST');
  assert.ok(post.url.endsWith(`/${AD1}`)); assert.match(post.body, /status=PAUSED/);
  assert.equal((await db.service.one('select status from growth.ads where ad_id = $1', [AD1])).status, 'PAUSED');
  await ads.undo({ kind: 'pause_ad', undo_data: m.undo_data });
  assert.match(calls.filter((c) => c.method === 'POST').at(-1).body, /status=ACTIVE/);
  const t = await ads.execute({ kind: 'pause_ad', platform: 'tiktok', target_id: TK1 });
  const tp = calls.filter((c) => c.method === 'POST').at(-1);
  assert.ok(tp.url.includes('/ad/status/update/')); assert.deepEqual(JSON.parse(tp.body).ad_ids, [TK1]); assert.equal(JSON.parse(tp.body).operation_status, 'DISABLE');
  await ads.undo({ kind: 'pause_ad', undo_data: t.undo_data });
  assert.equal(JSON.parse(calls.filter((c) => c.method === 'POST').at(-1).body).operation_status, 'ENABLE');
});

test('scale_budget respeta el paso máximo, el tope diario y un solo aumento por día', async () => {
  const ads = make();
  await db.service.exec("update growth.ads set daily_budget_cents = 5000 where platform = 'meta' and adset_id = $1", [ADSET]);
  await assert.rejects(ads.execute({ kind: 'scale_budget', platform: 'meta', target_id: ADSET, data: { new_budget_cents: 6500 } }), /máximo de 20%/);
  await assert.rejects(ads.execute({ kind: 'scale_budget', platform: 'meta', target_id: ADSET, data: { new_budget_cents: 5000 } }), /maior/);
  store.ai = { limits: { budget_max_step_pct: 300, daily_cap_cents: 5500 } };
  await assert.rejects(ads.execute({ kind: 'scale_budget', platform: 'meta', target_id: ADSET, data: { new_budget_cents: 6000 } }), /teto diário/);
  store.ai = { limits: { budget_max_step_pct: 20, daily_cap_cents: 10000 } };
  assert.equal(calls.filter((c) => c.method === 'POST').length, 0, 'ninguna llamada a la plataforma al rechazar');
  const r = await ads.execute({ kind: 'scale_budget', platform: 'meta', target_id: ADSET, data: { new_budget_cents: 6000 } });
  assert.deepEqual(r.undo_data, { platform: 'meta', adset_id: ADSET, previous_budget_cents: 5000 });
  assert.match(calls.at(-1).body, /daily_budget=6000/);
  assert.equal((await db.service.one('select daily_budget_cents b from growth.ads where ad_id = $1', [AD1])).b, 6000);
  // un aumento ejecutado hoy bloquea otro
  const a = await db.service.one("insert into growth.ai_actions (kind, platform, target_id, reason, status, executed_at) values ('scale_budget','meta',$1,'t','executed',now()) returning id", [ADSET]);
  actionIds.push(a.id);
  await assert.rejects(ads.execute({ kind: 'scale_budget', platform: 'meta', target_id: ADSET, data: { new_budget_cents: 7000 } }), /já teve o orçamento aumentado/);
  await ads.undo({ kind: 'scale_budget', undo_data: r.undo_data });
  assert.match(calls.at(-1).body, /daily_budget=5000/);
  // TikTok: presupuesto en unidades de moneda
  await db.service.exec("update growth.ai_actions set status = 'undone' where id = $1", [a.id]);
  await db.service.exec("update growth.ads set daily_budget_cents = 3000 where platform = 'tiktok' and adset_id = $1", [TKSET]);
  await ads.execute({ kind: 'scale_budget', platform: 'tiktok', target_id: TKSET, data: { new_budget_cents: 3500 } });
  const tp = calls.at(-1);
  assert.ok(tp.url.includes('/adgroup/update/')); assert.equal(JSON.parse(tp.body).budget, 35);
});
