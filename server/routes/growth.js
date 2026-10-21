// API del panel de operación y growth (/api/growth). Solo equipo con 2FA. Contrato: docs/GROWTH_CONTRACT.md
import { Router } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { HttpError, wrap } from './util.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v) => (v == null ? 0 : Number(v));
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const ratio = (a, b) => (b ? Math.round((a / b) * 100) / 100 : 0);

function toCsv(rows) {
  if (!rows?.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

/** Filtros comunes: periodo y dimensiones. */
export function filtersOf(req, tz = 'UTC') {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const to = DAY.test(String(req.query.to ?? '')) ? String(req.query.to) : today;
  const fromDefault = new Date(new Date(`${to}T00:00:00Z`).getTime() - 29 * 86400_000).toISOString().slice(0, 10);
  const from = DAY.test(String(req.query.from ?? '')) ? String(req.query.from) : fromDefault;
  const pick = (k) => (req.query[k] && req.query[k] !== 'all' ? String(req.query[k]).slice(0, 40) : null);
  return { from, to, today, language: pick('language'), country: pick('country'), device: pick('device'), source: pick('source'), program: pick('program') };
}

export function growthRoutes({ db, config, growth, auth, log = console }) {
  const r = Router();
  const q = db.service;
  const { staff, settings, people, experiments, ai, ads, forwarders, email } = growth;
  const currency = config.currency;

  const tzOf = async () => (await settings.get('timezone', { tz: config.growth.timezone })).tz || config.growth.timezone;
  const send = (req, res, body, rows) => {
    if (req.query.format === 'csv') {
      res.set('Content-Type', 'text/csv; charset=utf-8').set('Content-Disposition', 'attachment; filename="alento-growth.csv"');
      return res.send(toCsv(rows ?? body.rows ?? []));
    }
    return res.json(body);
  };

  // ---------------------------------------------------------------- sesión de equipo y 2FA
  const sessionUser = (req) => { if (!req.user) throw new HttpError(401, 'Inicia sesión para continuar.', 'AUTH_REQUIRED'); return req.user; };
  r.get('/me', wrap(async (req, res) => {
    const user = sessionUser(req);
    const role = await staff.roleOf(user.id);
    if (!role) throw new HttpError(403, 'No autorizado.', 'FORBIDDEN');
    const enabled = await staff.twofaEnabled(user.id);
    const master = Boolean(config.growth.masterEmail); // modo master: sin segundo factor
    res.json({ user: { email: user.email }, role, canEdit: role !== 'readonly', twofa: { enabled: master ? false : enabled, verified: master ? true : staff.has2fa(req, user.id), required: !master } });
  }));
  r.post('/2fa/setup', wrap(async (req, res) => {
    const user = sessionUser(req);
    if (!(await staff.roleOf(user.id))) throw new HttpError(403, 'No autorizado.', 'FORBIDDEN');
    if (await staff.twofaEnabled(user.id) && !staff.has2fa(req, user.id)) throw new HttpError(428, 'Verifica tu código 2FA actual.', 'TWOFA_REQUIRED');
    res.json(await staff.totpSetup(user.id, user.email));
  }));
  r.post('/2fa/enable', wrap(async (req, res) => {
    const user = sessionUser(req);
    if (!(await staff.roleOf(user.id))) throw new HttpError(403, 'No autorizado.', 'FORBIDDEN');
    if (!(await staff.totpEnable(user.id, String(req.body?.code ?? '')))) throw new HttpError(422, 'Código no válido.', 'INVALID');
    staff.issue2fa(res, user.id);
    res.json({ ok: true });
  }));
  r.post('/2fa/verify', wrap(async (req, res) => {
    const user = sessionUser(req);
    if (!(await staff.roleOf(user.id))) throw new HttpError(403, 'No autorizado.', 'FORBIDDEN');
    if (!(await staff.verifyTotp(user.id, String(req.body?.code ?? '')))) throw new HttpError(422, 'Código no válido.', 'INVALID');
    staff.issue2fa(res, user.id);
    res.json({ ok: true });
  }));

  // A partir de aquí: equipo con 2FA verificado.
  r.use(staff.requireStaff());
  const canEdit = (req) => { if (req.staff.role === 'readonly') throw new HttpError(403, 'Tu rol es de solo lectura.', 'FORBIDDEN'); };
  const adminOnly = (req) => { if (req.staff.role !== 'admin') throw new HttpError(403, 'Solo administradores.', 'FORBIDDEN'); };
  const audit = (req, action, entity, id, details) => staff.audit(req, action, entity, id, details).catch(() => {});

  // ---------------------------------------------------------------- visión general
  async function windowKpis(f, tz) {
    const win = async (days) => {
      const from = new Date(new Date(`${f.today}T00:00:00Z`).getTime() - (days - 1) * 86400_000).toISOString().slice(0, 10);
      const [sales, spend, fun, mrr] = await Promise.all([
        q.one(`select coalesce(sum(net_cents), 0) as revenue, count(*) filter (where kind = 'first') as orders from growth.v_atribuicao
          where day between $1 and $2 and currency = $3`, [from, f.today, currency]),
        q.one('select coalesce(sum(spend_cents), 0) as spend from growth.ad_spend_daily where day between $1 and $2', [from, f.today]),
        q.one(`select coalesce(sum(visits), 0) as visits, coalesce(sum(quiz_started), 0) as quiz_started, coalesce(sum(purchases), 0) as purchases
          from growth.v_funil_diario where day between $1 and $2`, [from, f.today]),
        q.one(`select coalesce(round(sum(case interval when 'week' then amount * 52.0 / 12 / interval_count when 'month' then amount * 1.0 / interval_count
            when 'year' then amount / 12.0 / interval_count end)), 0)::bigint as mrr from public.subscriptions
          where status in ('active','trialing','past_due') and amount is not null and upper(currency) = $1`, [currency]),
      ]);
      return {
        revenue_cents: num(sales.revenue), orders: num(sales.orders), spend_cents: num(spend.spend), roas: ratio(num(sales.revenue), num(spend.spend)),
        cac_cents: num(sales.orders) ? Math.round(num(spend.spend) / num(sales.orders)) : 0, mrr_cents: num(mrr.mrr),
        conversion_pct: pct(num(fun.purchases), num(fun.quiz_started)), visits: num(fun.visits), quiz_started: num(fun.quiz_started),
      };
    };
    return { today: await win(1), d7: await win(7), d30: await win(30) };
  }
  r.get('/overview', wrap(async (req, res) => {
    const tz = await tzOf();
    const f = filtersOf(req, tz);
    const [kpis, report, alerts] = await Promise.all([
      windowKpis(f, tz),
      q.one(`select id, title, body, llm, created_at from growth.ai_reports where kind = 'daily' order by created_at desc limit 1`),
      q.rows('select id, code, severity, message, created_at from growth.alerts where resolved_at is null order by created_at desc limit 20'),
    ]);
    res.json({ currency, kpis, ai: report, alerts });
  }));
  r.post('/alerts/:id/resolve', wrap(async (req, res) => {
    canEdit(req);
    await q.exec('update growth.alerts set resolved_at = now() where id = $1', [String(req.params.id)]);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- funil del quiz
  r.get('/funnel', wrap(async (req, res) => {
    const f = filtersOf(req, await tzOf());
    const p = [f.from, f.to, f.language, f.country, f.device, f.source, f.program];
    const t = await q.one(`select coalesce(sum(visits),0) visits, coalesce(sum(quiz_started),0) quiz_started, coalesce(sum(leads),0) leads,
        coalesce(sum(plan_viewed),0) plan_viewed, coalesce(sum(plan_selected),0) plan_selected, coalesce(sum(checkouts),0) checkouts,
        coalesce(sum(purchases),0) purchases, coalesce(sum(activated),0) activated
      from growth.v_funil_diario where day between $1 and $2 and ($3::text is null or language = $3) and ($4::text is null or country = $4)
        and ($5::text is null or device = $5) and ($6::text is null or source = $6) and ($7::text is null or program = $7)`, p);
    const labels = [['visits', 'Visitas'], ['quiz_started', 'Quiz iniciado'], ['leads', 'E-mail dejado'], ['plan_viewed', 'Plan visto'],
      ['plan_selected', 'Plan elegido'], ['checkouts', 'Checkout abierto'], ['purchases', 'Compra'], ['activated', 'Primer acceso a la app']];
    const steps = labels.map(([key, label], i) => ({ key, label, count: num(t[key]), drop_pct: i && num(t[labels[i - 1][0]]) ? pct(num(t[labels[i - 1][0]]) - num(t[key]), num(t[labels[i - 1][0]])) : 0 }));
    const qrows = await q.rows(`
      select program_slug as program, question, count(distinct coalesce(lead_id::text, visitor_id::text)) as people, count(*) as answers,
        round(avg(seconds)::numeric, 1) as avg_seconds, min(id) as first_id
      from growth.quiz_answers where answered_at::date between $1 and $2 and ($3::text is null or program_slug = $3)
      group by 1, 2 order by 1, first_id`, [f.from, f.to, f.program]);
    const dist = await q.rows(`select program, question, answer, total from growth.v_quiz_respuestas order by total desc`);
    const questions = []; let prev = null;
    for (const row of qrows) {
      const first = prev && prev.program === row.program ? prev : null;
      questions.push({ program: row.program, question: row.question, answers: num(row.answers), people: num(row.people), avg_seconds: num(row.avg_seconds),
        drop_pct: first && first.people ? pct(first.people - row.people, first.people) : 0,
        distribution: dist.filter((d) => d.program === row.program && d.question === row.question).slice(0, 8).map((d) => ({ answer: d.answer, total: num(d.total) })) });
      prev = row;
    }
    send(req, res, { steps, questions, rows: steps }, steps);
  }));

  // ---------------------------------------------------------------- aquisición
  async function adRows(f) {
    return q.rows(`
      with base as (
        select platform, campaign_id, max(campaign_name) as campaign_name, adset_id, max(adset_name) as adset_name, ad_id, max(ad_name) as ad_name,
          sum(spend_cents) spend_cents, sum(clicks) clicks, sum(impressions) impressions, sum(leads) leads, sum(checkouts) checkouts,
          sum(purchases) purchases, sum(revenue_net_cents) revenue_cents, sum(refunded_cents) refunded_cents, sum(reported_conversions) reported_conversions,
          sum(reported_value_cents) reported_value_cents
        from growth.v_desempenho_anuncios where day between $1 and $2 group by 1, 2, 4, 6),
      firsts as (
        select o.user_id, a.last_ad as ad_id, a.paid_at as first_at from growth.orders o join growth.v_atribuicao a on a.order_id = o.order_id
        where o.kind = 'first' and o.user_id is not null and a.last_ad is not null and a.day between $1 and $2),
      d30 as (
        select f.ad_id, sum(a.net_cents) as net30 from firsts f join growth.orders o on o.user_id = f.user_id and o.paid_at <= f.first_at + interval '30 days'
        join growth.v_atribuicao a on a.order_id = o.order_id group by 1)
      select b.*, coalesce(d30.net30, b.revenue_cents) as revenue_d30_cents from base b left join d30 on d30.ad_id = b.ad_id order by b.spend_cents desc`, [f.from, f.to]);
  }
  r.get('/acquisition', wrap(async (req, res) => {
    const f = filtersOf(req, await tzOf());
    const raw = await adRows(f);
    const rows = raw.map((x) => ({
      platform: x.platform, campaign_id: x.campaign_id, campaign_name: x.campaign_name, adset_id: x.adset_id, adset_name: x.adset_name, ad_id: x.ad_id, ad_name: x.ad_name,
      spend_cents: num(x.spend_cents), clicks: num(x.clicks), cpc_cents: x.clicks ? Math.round(num(x.spend_cents) / num(x.clicks)) : 0,
      leads: num(x.leads), cpl_cents: x.leads ? Math.round(num(x.spend_cents) / num(x.leads)) : 0, checkouts: num(x.checkouts),
      carts_abandoned: Math.max(0, num(x.checkouts) - num(x.purchases)), purchases: num(x.purchases),
      cac_cents: x.purchases ? Math.round(num(x.spend_cents) / num(x.purchases)) : 0, revenue_cents: num(x.revenue_cents),
      roas_d0: ratio(num(x.revenue_cents), num(x.spend_cents)), roas_d30: ratio(num(x.revenue_d30_cents), num(x.spend_cents)),
      refunded_cents: num(x.refunded_cents), reported_conversions: num(x.reported_conversions), reported_value_cents: num(x.reported_value_cents),
    }));
    const sum = (list) => list.reduce((a, x) => { for (const k of ['spend_cents', 'clicks', 'leads', 'checkouts', 'carts_abandoned', 'purchases', 'revenue_cents', 'refunded_cents', 'reported_conversions']) a[k] = (a[k] ?? 0) + x[k]; return a; }, {});
    const fin = (o, extra) => ({ ...extra, ...o, cpc_cents: o.clicks ? Math.round(o.spend_cents / o.clicks) : 0, cpl_cents: o.leads ? Math.round(o.spend_cents / o.leads) : 0,
      cac_cents: o.purchases ? Math.round(o.spend_cents / o.purchases) : 0, roas_d0: ratio(o.revenue_cents, o.spend_cents) });
    const tree = [];
    for (const [pl, byP] of Object.entries(Object.groupBy(rows, (x) => x.platform))) {
      for (const [cid, byC] of Object.entries(Object.groupBy(byP, (x) => x.campaign_id ?? '-'))) {
        const adsets = Object.entries(Object.groupBy(byC, (x) => x.adset_id ?? '-')).map(([sid, byS]) => fin(sum(byS), { adset_id: sid, adset_name: byS[0].adset_name, ads: byS }));
        tree.push(fin(sum(byC), { platform: pl, campaign_id: cid, campaign_name: byC[0].campaign_name, adsets }));
      }
    }
    const att = (col) => q.rows(`select ${col} as source, count(*) filter (where kind = 'first')::int as orders, coalesce(sum(net_cents), 0) as revenue_cents
      from growth.v_atribuicao where day between $1 and $2 group by 1 order by 3 desc`, [f.from, f.to]);
    const attribution = {
      last: (await att('last_source')).map((x) => ({ ...x, revenue_cents: num(x.revenue_cents) })),
      first: (await att('first_source')).map((x) => ({ ...x, revenue_cents: num(x.revenue_cents) })),
      platform: (await q.rows(`select platform, sum(reported_conversions) as reported_conversions, sum(reported_value_cents) as reported_value_cents
        from growth.ad_spend_daily where day between $1 and $2 group by 1`, [f.from, f.to])).map((x) => ({ platform: x.platform, reported_conversions: num(x.reported_conversions), reported_value_cents: num(x.reported_value_cents) })),
    };
    send(req, res, { rows, tree, attribution }, rows);
  }));

  // ---------------------------------------------------------------- criativos
  r.get('/creatives', wrap(async (req, res) => {
    const f = filtersOf(req, await tzOf());
    const base = await q.rows(`select platform, ad_id, max(ad_name) as ad_name, max(thumbnail_url) as thumbnail_url, sum(spend_cents) spend_cents, sum(impressions) impressions,
        sum(clicks) clicks, sum(video_3s_views) v3, sum(purchases) purchases, sum(revenue_net_cents) revenue
      from growth.v_desempenho_anuncios where day between $1 and $2 group by 1, 2 order by sum(spend_cents) desc limit 200`, [f.from, f.to]);
    const trend = await q.rows(`select platform, ad_id,
        sum(clicks) filter (where day > current_date - 7)::numeric / nullif(sum(impressions) filter (where day > current_date - 7), 0) as ctr_now,
        sum(clicks) filter (where day <= current_date - 7 and day > current_date - 14)::numeric / nullif(sum(impressions) filter (where day <= current_date - 7 and day > current_date - 14), 0) as ctr_prev
      from growth.ad_spend_daily where day > current_date - 14 group by 1, 2`);
    const tmap = new Map(trend.map((t) => [`${t.platform}:${t.ad_id}`, t]));
    const ads2 = base.map((x) => {
      const t = tmap.get(`${x.platform}:${x.ad_id}`);
      const change = t?.ctr_prev ? Math.round(((num(t.ctr_now) - num(t.ctr_prev)) / num(t.ctr_prev)) * 1000) / 10 : null;
      return { platform: x.platform, ad_id: x.ad_id, ad_name: x.ad_name, thumbnail_url: x.thumbnail_url, spend_cents: num(x.spend_cents), impressions: num(x.impressions), clicks: num(x.clicks),
        ctr_pct: pct(num(x.clicks), num(x.impressions)), hook_rate_pct: pct(num(x.v3), num(x.impressions)), purchases: num(x.purchases),
        cost_per_sale_cents: x.purchases ? Math.round(num(x.spend_cents) / num(x.purchases)) : 0, roas: ratio(num(x.revenue), num(x.spend_cents)),
        ctr_7d_change_pct: change, fatigue: change != null && change <= -20 };
    });
    send(req, res, { ads: ads2, rows: ads2 }, ads2);
  }));

  // ---------------------------------------------------------------- ventas y suscripciones
  r.get('/sales', wrap(async (req, res) => {
    const f = filtersOf(req, await tzOf());
    const daily = (await q.rows(`select day, program, plan, currency, kind, orders, gross_cents, refunded_cents, net_cents from growth.v_ventas_diarias
      where day between $1 and $2 and ($3::text is null or program = $3) order by day desc`, [f.from, f.to, f.program])).map((x) => ({ ...x, gross_cents: num(x.gross_cents), refunded_cents: num(x.refunded_cents), net_cents: num(x.net_cents), orders: num(x.orders) }));
    const s = daily.reduce((a, x) => ({ orders: a.orders + x.orders, gross: a.gross + x.gross_cents, refunded: a.refunded + x.refunded_cents, net: a.net + x.net_cents }), { orders: 0, gross: 0, refunded: 0, net: 0 });
    const st = await q.rows('select status, count(*)::int as n from growth.subscriptions group by 1');
    const failed = await q.one(`select count(*)::int as n from growth.events where name = 'payment_failed' and occurred_at::date between $1 and $2`, [f.from, f.to]);
    const k = (await windowKpis(f, 'UTC')).d30;
    const cohortRows = await q.rows('select cohort, source, currency, months_since, payers, net_cents from growth.v_coortes order by cohort, months_since');
    const ltv = [];
    for (const [key, list] of Object.entries(Object.groupBy(cohortRows, (c) => `${c.cohort}|${c.source}|${c.currency}`))) {
      const [cohort, source, cur] = key.split('|');
      let acc = 0; const first = list.find((c) => c.months_since === 0);
      const months = list.map((c) => { acc += num(c.net_cents); return { m: c.months_since, net_cents: acc }; });
      const payers = num(first?.payers ?? list[0]?.payers);
      ltv.push({ cohort, source, currency: cur, payers, months, ltv_cents: payers ? Math.round(acc / payers) : 0 });
    }
    const subs = await q.rows(`select subscription_id, provider, program_slug, plan, status, amount_cents, currency, started_at, next_billing_at, canceled_at, cancel_reason
      from growth.subscriptions order by updated_at desc limit 200`);
    send(req, res, {
      summary: { orders: s.orders, gross_cents: s.gross, refunded_cents: s.refunded, net_cents: s.net, mrr_cents: k.mrr_cents,
        active: num(st.find((x) => ['active', 'trialing', 'past_due'].includes(x.status))?.n), canceled: num(st.find((x) => x.status === 'canceled')?.n), failed_payments: num(failed.n) },
      daily, ltv, subscriptions: subs, rows: daily,
    }, daily);
  }));

  // ---------------------------------------------------------------- personas
  r.get('/people', wrap(async (req, res) => { const rows = await people.search(String(req.query.q ?? '').slice(0, 120)); send(req, res, { rows }, rows); }));
  r.get('/people/:key', wrap(async (req, res) => { res.json(await people.timeline(String(req.params.key))); }));
  r.get('/people/:key/export', wrap(async (req, res) => {
    adminOnlyOrMarketing(req);
    const data = await people.export(String(req.params.key));
    await audit(req, 'person.export', 'person', String(req.params.key));
    res.set('Content-Disposition', 'attachment; filename="datos-persona.json"').json(data);
  }));
  const adminOnlyOrMarketing = (req) => canEdit(req);
  r.delete('/people/:key', wrap(async (req, res) => {
    adminOnly(req);
    await people.erase(String(req.params.key), req.staff.userId);
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- e-mails
  r.get('/emails', wrap(async (req, res) => {
    const f = filtersOf(req, await tzOf());
    const rows = await q.rows(`select flow, language, variant, count(*) filter (where event = 'sent')::int sent, count(*) filter (where event = 'opened')::int opened,
        count(*) filter (where event = 'clicked')::int clicked, count(*) filter (where event = 'unsubscribed')::int unsubscribed, count(*) filter (where event = 'converted')::int converted
      from growth.email_events where occurred_at::date between $1 and $2 group by 1, 2, 3`, [f.from, f.to]);
    const agg = (list) => list.reduce((a, x) => ({ sent: a.sent + x.sent, opened: a.opened + x.opened, clicked: a.clicked + x.clicked, unsubscribed: a.unsubscribed + x.unsubscribed, converted: a.converted + x.converted }), { sent: 0, opened: 0, clicked: 0, unsubscribed: 0, converted: 0 });
    const flows = Object.entries(Object.groupBy(rows, (x) => x.flow ?? '(sin flujo)')).map(([flow, list]) => {
      const a = agg(list);
      return { flow, ...a, revenue_cents: 0, open_rate: pct(a.opened, a.sent), click_rate: pct(a.clicked, a.sent),
        by_language: Object.entries(Object.groupBy(list, (x) => x.language)).map(([language, l]) => ({ language, ...agg(l) })),
        by_variant: Object.entries(Object.groupBy(list, (x) => x.variant)).map(([variant, l]) => ({ variant, ...agg(l) })) };
    });
    send(req, res, { flows, catalog: email.FLOWS ?? [], configured: await email.enabled(), rows: flows.map(({ by_language, by_variant, ...x }) => x) }, flows.map(({ by_language, by_variant, ...x }) => x));
  }));

  // ---------------------------------------------------------------- experimentos
  r.get('/experiments', wrap(async (req, res) => { const rows = await experiments.list(); send(req, res, { rows }, rows); }));
  r.post('/experiments', wrap(async (req, res) => { canEdit(req); const exp = await experiments.create(req.body ?? {}); await audit(req, 'experiment.create', 'experiment', exp?.key ?? req.body?.key); res.json(exp); }));
  r.get('/experiments/:key', wrap(async (req, res) => { res.json(await experiments.stats(String(req.params.key))); }));
  r.post('/experiments/:key/status', wrap(async (req, res) => { canEdit(req); await experiments.setStatus(String(req.params.key), String(req.body?.status)); await audit(req, 'experiment.status', 'experiment', req.params.key, { status: req.body?.status }); res.json({ ok: true }); }));
  r.post('/experiments/:key/promote', wrap(async (req, res) => { canEdit(req); await experiments.promote(String(req.params.key), String(req.body?.variant)); await audit(req, 'experiment.promote', 'experiment', req.params.key, { variant: req.body?.variant }); res.json({ ok: true }); }));

  // ---------------------------------------------------------------- IA
  r.get('/ai/status', wrap(async (req, res) => {
    const [aiCfg, goals, key] = await Promise.all([settings.get('ai', {}), settings.get('goals', {}), settings.get('anthropic', {})]);
    res.json({ llm: Boolean(key.apiKey || config.growth.anthropicApiKey), auto_enabled: aiCfg.auto_enabled === true, goals, limits: aiCfg.limits ?? {} });
  }));
  r.get('/ai/reports', wrap(async (req, res) => {
    const kind = ['monitor', 'daily', 'weekly', 'question'].includes(req.query.kind) ? req.query.kind : null;
    const rows = await q.rows(`select id, kind, title, body, numbers, model, llm, created_at from growth.ai_reports where ($1::text is null or kind = $1) order by created_at desc limit 60`, [kind]);
    send(req, res, { rows }, rows.map((x) => ({ ...x, numbers: undefined })));
  }));
  r.get('/ai/actions', wrap(async (req, res) => {
    const st = ['proposed', 'approved', 'rejected', 'executed', 'failed', 'undone'].includes(req.query.status) ? req.query.status : null;
    const rows = await q.rows(`select * from growth.ai_actions where ($1::text is null or status = $1) order by proposed_at desc limit 100`, [st]);
    send(req, res, { rows }, rows.map((x) => ({ ...x, data: undefined, result: undefined, undo_data: undefined })));
  }));
  for (const verb of ['approve', 'reject', 'undo']) {
    r.post(`/ai/actions/:id/${verb}`, wrap(async (req, res) => {
      canEdit(req);
      const out = await ai[verb](String(req.params.id), { id: req.staff.userId, role: req.staff.role });
      await audit(req, `ai.${verb}`, 'ai_action', req.params.id);
      res.json({ ok: true, action: out ?? null });
    }));
  }
  r.post('/ai/ask', wrap(async (req, res) => {
    const question = String(req.body?.question ?? '').trim().slice(0, 600);
    if (!question) throw new HttpError(422, 'Escribe una pregunta.', 'INVALID');
    res.json(await ai.ask(question, { user: { id: req.staff.userId } }));
  }));
  r.post('/ai/run', wrap(async (req, res) => {
    canEdit(req);
    const routine = { monitor: 'runMonitor', daily: 'runDaily', weekly: 'runWeekly' }[req.body?.routine];
    if (!routine) throw new HttpError(422, 'Rutina no válida.', 'INVALID');
    res.json({ ok: true, result: await ai[routine]({ force: true }) });
  }));
  r.post('/ai/kill-switch', wrap(async (req, res) => {
    adminOnly(req);
    const cur = await settings.get('ai', {});
    await settings.set('ai', { ...cur, auto_enabled: req.body?.enabled === true }, { by: req.staff.userId });
    await audit(req, 'ai.auto', 'settings', 'ai', { enabled: req.body?.enabled === true });
    res.json({ ok: true, auto_enabled: req.body?.enabled === true });
  }));

  // ---------------------------------------------------------------- configuración
  const SETTING_KEYS = ['pixels.meta', 'pixels.tiktok', 'ads.meta', 'ads.tiktok', 'customerio', 'anthropic', 'goals', 'ai', 'alerts', 'timezone', 'prices'];
  r.get('/settings', wrap(async (req, res) => {
    const out = await settings.all();
    for (const k of SETTING_KEYS) out[k] ??= {};
    res.json({ settings: out, env: { customerio: Boolean(config.growth.customerio.siteId), anthropic: Boolean(config.growth.anthropicApiKey) } });
  }));
  r.put('/settings/:key', wrap(async (req, res) => {
    adminOnly(req);
    const key = String(req.params.key);
    if (!SETTING_KEYS.includes(key)) throw new HttpError(404, 'Configuración desconocida.');
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) throw new HttpError(422, 'Valor no válido.', 'INVALID');
    await settings.set(key, req.body, { by: req.staff.userId });
    await audit(req, 'settings.update', 'settings', key); // nunca se registran los valores
    res.json({ ok: true });
  }));
  r.post('/settings/test/:what', wrap(async (req, res) => {
    adminOnly(req);
    const what = String(req.params.what);
    try {
      if (what === 'ads') {
        const c = await ads.configured();
        return res.json({ ok: c.meta || c.tiktok, message: `Meta: ${c.meta ? 'configurado' : 'sin configurar'} · TikTok: ${c.tiktok ? 'configurado' : 'sin configurar'}` });
      }
      if (what === 'customerio') { const on = await email.enabled(); return res.json({ ok: on, message: on ? 'Customer.io configurado.' : 'Customer.io sin configurar.' }); }
      if (what === 'meta' || what === 'tiktok') {
        const c = await settings.get(`pixels.${what}`);
        return res.json({ ok: Boolean(c.pixelId && c.accessToken), message: c.pixelId && c.accessToken ? `Pixel ${c.pixelId} y token guardados. Usa el código de evento de prueba para verificar en el Administrador de eventos.` : 'Falta el ID del pixel o el token.' });
      }
    } catch (err) { return res.json({ ok: false, message: err.message }); }
    throw new HttpError(404, 'Integración desconocida.');
  }));

  // ---------------------------------------------------------------- equipo y salud
  r.get('/staff', wrap(async (req, res) => { res.json({ rows: await staff.list() }); }));
  r.post('/staff', wrap(async (req, res) => {
    adminOnly(req);
    const out = await staff.grant({ email: String(req.body?.email ?? ''), role: String(req.body?.role ?? '') });
    await audit(req, 'staff.grant', 'staff', out?.userId ?? req.body?.email, { role: req.body?.role });
    res.json({ ok: true });
  }));
  r.delete('/staff/:userId', wrap(async (req, res) => {
    adminOnly(req);
    await staff.revoke(String(req.params.userId));
    await audit(req, 'staff.revoke', 'staff', req.params.userId);
    res.json({ ok: true });
  }));
  r.get('/outbox', wrap(async (req, res) => {
    const c = await q.one(`select count(*) filter (where status = 'pending')::int pending, count(*) filter (where status = 'failed')::int failed,
      count(*) filter (where status = 'sent' and sent_at > now() - interval '24 hours')::int sent_24h from growth.outbox`);
    const errors = await q.rows(`select destination, last_error, attempts, created_at from growth.outbox where status in ('failed', 'pending') and last_error is not null order by created_at desc limit 10`);
    const mq = {};
    for (const dest of ['meta', 'tiktok']) {
      const sample = await q.rows(`select payload from growth.outbox where destination = $1 order by created_at desc limit 100`, [dest]);
      mq[dest] = sample.length && forwarders.matchQuality ? Math.round((sample.reduce((a, s) => a + forwarders.matchQuality(s.payload), 0) / sample.length) * 10) / 10 : null;
    }
    res.json({ ...c, match_quality: mq, last_errors: errors });
  }));

  return r;
}

// ---------------------------------------------------------------- cron (Bearer CRON_SECRET)
export function growthCron({ config, growth, log = console }) {
  const r = Router();
  const authorized = (req) => {
    const given = Buffer.from(String(req.get('authorization') ?? ''));
    const expected = Buffer.from(`Bearer ${config.cronSecret}`);
    return config.cronSecret && given.length === expected.length && timingSafeEqual(given, expected);
  };
  const { ai, ads, forwarders, settings } = growth;

  async function due(name, everyMs) {
    const last = (await settings.get('cron.last', {}))[name];
    return !last || Date.now() - new Date(last).getTime() >= everyMs;
  }
  async function mark(name) {
    const cur = await settings.get('cron.last', {});
    await settings.set('cron.last', { ...cur, [name]: new Date().toISOString() });
  }
  const JOBS = {
    outbox: () => forwarders.processOutbox({ limit: 100 }),
    monitor: async () => ({ monitor: await ai.runMonitor(), auto: await ai.autoExecute() }),
    daily: () => ai.runDaily({}),
    weekly: () => ai.runWeekly({}),
    'ads-hourly': () => ads.sync({ scope: 'hourly' }),
    'ads-daily': () => ads.sync({ scope: 'daily', days: 7 }),
  };

  r.all('/growth', async (req, res) => {
    if (!authorized(req)) return res.status(401).end();
    const job = String(req.query.job ?? 'tick');
    const out = {};
    try {
      if (job === 'tick') {
        // Un solo cron (cada 10 min) gobierna todo: la bandeja siempre; el resto según su frecuencia.
        out.outbox = await JOBS.outbox();
        if (await due('ads-hourly', 55 * 60_000)) { out['ads-hourly'] = await JOBS['ads-hourly']().catch((e) => ({ error: e.message })); await mark('ads-hourly'); }
        if (await due('monitor', 55 * 60_000)) { out.monitor = await JOBS.monitor().catch((e) => ({ error: e.message })); await mark('monitor'); }
        if (await due('ads-daily', 23 * 3600_000)) { out['ads-daily'] = await JOBS['ads-daily']().catch((e) => ({ error: e.message })); await mark('ads-daily'); }
        const now = new Date();
        const tz = (await settings.get('timezone', { tz: config.growth.timezone })).tz || config.growth.timezone;
        const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
        if ((await ai.shouldRunDaily(now)) && (await due('daily', 6 * 3600_000))) { out.daily = await JOBS.daily().catch((e) => ({ error: e.message })); await mark('daily'); }
        if (local.getDay() === 1 && local.getHours() >= 9 && (await due('weekly', 6 * 86400_000))) { out.weekly = await JOBS.weekly().catch((e) => ({ error: e.message })); await mark('weekly'); }
        return res.json(out);
      }
      if (!JOBS[job]) return res.status(404).json({ error: 'Tarea desconocida.' });
      res.json({ [job]: await JOBS[job]() });
    } catch (err) {
      log.error('[cron] growth:', err.message);
      res.status(500).json({ error: 'Error' });
    }
  });

  // Webhook de informes de Customer.io (aperturas, clics, bajas).
  r.post('/customerio', async (req, res) => {
    try {
      const out = await growth.email.handleWebhook(req.body, req.headers, req.rawBody);
      res.status(out?.ok === false ? (out.status ?? 400) : 200).json(out?.ok === false ? { error: out.error } : out);
    } catch (err) { res.status(err.status ?? 400).json({ error: err.message }); }
  });
  return r;
}
