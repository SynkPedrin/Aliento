// Capa de IA del panel: monitor, informes, preguntas y acciones.
// Las reglas deterministas SIEMPRE corren; el LLM (Claude) solo redacta/explica y propone. Nunca escribe en la base ni en las cuentas de anuncios.
import { dayIn } from './ads.js';
import { isUuid } from './context.js';

export const MODELS = { fast: 'claude-sonnet-5-5', deep: 'claude-opus-5-5' };
const API = 'https://api.anthropic.com/v1/messages';
const MAX_ROWS = 200;
const KINDS = ['pause_ad', 'scale_budget', 'promote_variant', 'email_variant', 'creative_brief', 'price_change'];
const CONF = ['low', 'medium', 'high'];
const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|set|into|call|do|execute|prepare|vacuum|reset|listen|notify|lock|begin|commit|rollback|savepoint|analyze|explain|refresh|comment|security|show|declare|fetch|cluster|reindex|load|import|merge|pg_\w*|dblink\w*|lo_\w+|set_config|current_setting|information_schema|growth_pii|auth|public|storage|extensions|vault|supabase_\w+)\b/;

const DEFAULTS = {
  limits: { pause_cpa_multiple: 2, pause_spend_multiple: 3, budget_max_step_pct: 20 },
  auto: { promote_variant: true, email_variant: true, creative_brief: true, pause_ad: false, scale_budget: false },
  minSample: 100,
};
// Formatação pt-BR: moeda conforme a configuração (R$/US$/€), vírgula decimal e datas dd/mm.
let CUR = 'USD';
const eur = (c) => (c == null ? '-' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: CUR }).format(Number(c) / 100));
const br = (n) => (n == null || n === '' ? '-' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const dm = (ymd) => { const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(ymd ?? '')); return m ? `${m[2]}/${m[1]}` : String(ymd ?? ''); };
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const userId = (u) => { const v = u?.id ?? u; return isUuid(v) ? v : null; };

// ---------------------------------------------------------------------- validación SQL (capa 1)
/** Valida que sea UN solo select/with sobre vistas growth.v_*. Devuelve el SQL limpio o lanza error. */
export function validateReadonlySql(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('Consulta vazia');
  if (sql.length > 8000) throw new Error('Consulta longa demais');
  let s = sql.trim().replace(/;\s*$/, '');
  if (s.replace(/'(?:[^']|'')*'/g, "''").includes(';')) throw new Error('Só é permitida uma instrução');
  if (/--|\/\*|\*\/|"|\\|\$\$|\$[a-z_0-9]*\$/i.test(s)) throw new Error('Comentários, identificadores entre aspas e caracteres de escape não são permitidos');
  const scan = s.replace(/'(?:[^']|'')*'/g, "''").toLowerCase();
  if (!/^\s*(select|with)\b/.test(scan)) throw new Error('Só são permitidas consultas select');
  if (FORBIDDEN.test(scan)) throw new Error('A consulta usa palavras ou funções não permitidas');
  if (/\bgrowth\s*\.\s*(?!v_)\w+/.test(scan)) throw new Error('Só é possível consultar as views growth.v_*');
  if (/\bpg_catalog\b|\bsys\w*\b/.test(scan)) throw new Error('Consulta não permitida');
  // Relaciones tras from/join: solo growth.v_* o CTEs declaradas.
  const ctes = new Set([...scan.matchAll(/\b([a-z_][a-z0-9_]*)\s+as\s*\(/g)].map((m) => m[1]));
  const flat = scan
    .replace(/\b(extract|substring|overlay|trim|position)\s*\([^()]*?\bfrom\b/g, '$1(,')
    .replace(/\bdistinct\s+from\b/g, 'distinct_');
  for (const m of flat.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_.]*)\s*(\(|,)?/g)) {
    const rel = m[1];
    if (m[2] === '(') throw new Error('Não são permitidas funções como origem de dados');
    if (m[2] === ',') throw new Error('Use JOIN explícito em vez de listas separadas por vírgulas');
    if (!/^growth\.v_[a-z0-9_]+$/.test(rel) && !ctes.has(rel)) throw new Error(`Relação não permitida: ${rel}`);
  }
  return s;
}

export function createAi({ db, settings, config, ads, email, experiments, fetchImpl = globalThis.fetch, log = console } = {}) {
  CUR = String(config?.currency || 'USD').toUpperCase();
  // ---------------------------------------------------------------------- ajustes
  async function conf() {
    const [goals, ai, alerts, tz] = await Promise.all([
      settings.get('goals', {}), settings.get('ai', {}), settings.get('alerts', {}), settings.get('timezone', {})]);
    return {
      goals: {
        cac_max: goals?.cac_max?.default ?? (typeof goals?.cac_max === 'number' ? goals.cac_max : null),
        roas_min: goals?.roas_min ?? null, daily_budget_cents: goals?.daily_budget_cents ?? null,
        min_sample: Number(goals?.min_sample ?? DEFAULTS.minSample),
      },
      ai: {
        auto_enabled: ai?.auto_enabled === true,
        limits: { ...DEFAULTS.limits, ...(ai?.limits ?? {}) },
        auto: { ...DEFAULTS.auto, ...(ai?.auto ?? {}) },
      },
      alerts: alerts ?? {}, tz: tz?.tz || 'Europe/Madrid',
    };
  }
  async function apiKey() {
    const s = await settings.get('anthropic', {});
    return s?.apiKey || config?.growth?.anthropicApiKey || null;
  }
  const llmAvailable = async () => !!(await apiKey());

  // ---------------------------------------------------------------------- consulta de solo lectura (capa 2)
  /** Ejecuta SQL ya validado como rol growth_ai en transacción de solo lectura. NO valida: usar queryReadonly. */
  async function execReadonly(sql) {
    const clean = sql.trim().replace(/;\s*$/, '');
    return db.tx(async (q) => {
      await q.exec('set local transaction_read_only = on');
      await q.exec("set local statement_timeout = '5s'");
      await q.exec('set local role growth_ai');
      return q.rows(`select * from (${clean}) as t limit ${MAX_ROWS}`);
    });
  }
  async function queryReadonly(sql) {
    const clean = validateReadonlySql(sql);
    const rows = await execReadonly(clean);
    return { rows, truncated: rows.length >= MAX_ROWS };
  }

  // ---------------------------------------------------------------------- Claude: bucle de herramientas
  const TOOLS = [
    { name: 'consultar_banco', description: 'Executa um SELECT somente leitura sobre as views growth.v_* (v_funil_diario, v_quiz_preguntas, v_quiz_respuestas, v_atribuicao, v_desempenho_anuncios, v_coortes, v_ventas_diarias, v_emails). Máximo de 200 linhas.',
      input_schema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
    { name: 'ler_anuncios', description: 'Lê o desempenho dos anúncios (view v_desempenho_anuncios) dos últimos N dias.',
      input_schema: { type: 'object', properties: { days: { type: 'integer' }, platform: { type: 'string' } } } },
    { name: 'propor_acao', description: 'Propõe uma ação (fica pendente de aprovação, a menos que as regras permitam execução automática). kind: pause_ad, scale_budget, promote_variant, email_variant, creative_brief, price_change.',
      input_schema: { type: 'object', properties: { kind: { type: 'string' }, platform: { type: 'string' }, target_id: { type: 'string' }, reason: { type: 'string' }, data: { type: 'object' }, confidence: { type: 'string', enum: CONF } }, required: ['kind', 'reason', 'confidence'] } },
    { name: 'publicar_relatorio', description: 'Publica o relatório final (título e corpo em texto simples, em português do Brasil) e encerra o trabalho.',
      input_schema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } },
  ];

  /** Bucle de herramientas. ctx: { kind, periodStart, periodEnd, numbers, onSql }. */
  async function runTools({ model, system, prompt, tools = TOOLS.map((t) => t.name), ctx = {}, maxTurns = 8 }) {
    const key = await apiKey();
    const messages = [{ role: 'user', content: prompt }];
    const state = { report: null, sqls: [], lastRows: [], text: '' };
    const defs = TOOLS.filter((t) => tools.includes(t.name));
    for (let turn = 0; turn < maxTurns; turn++) {
      const res = await fetchImpl(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 2048, system, tools: defs, messages }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Anthropic: ${body?.error?.message ?? `HTTP ${res.status}`}`);
      const content = body.content ?? [];
      messages.push({ role: 'assistant', content });
      state.text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim() || state.text;
      const uses = content.filter((b) => b.type === 'tool_use');
      if (body.stop_reason !== 'tool_use' || !uses.length) break;
      const results = [];
      for (const u of uses) {
        let out; let isError = false;
        try { out = await callTool(u.name, u.input ?? {}, state, ctx); } catch (e) { out = { error: e.message }; isError = true; }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out).slice(0, 30000), ...(isError ? { is_error: true } : {}) });
      }
      messages.push({ role: 'user', content: results });
      if (state.report) break;
    }
    return state;
  }

  async function callTool(name, input, state, ctx) {
    if (name === 'consultar_banco') {
      const r = await queryReadonly(input.sql);
      state.sqls.push(input.sql); state.lastRows = r.rows;
      return r;
    }
    if (name === 'ler_anuncios') {
      const days = Math.min(90, Math.max(1, Number(input.days) || 7));
      const params = [days]; let where = "day >= (now() at time zone 'UTC')::date - ($1::int - 1)";
      if (input.platform) { params.push(String(input.platform)); where += ' and platform = $2'; }
      const sql = `select day, platform, ad_id, ad_name, adset_id, campaign_name, spend_cents, impressions, clicks, leads, checkouts, purchases, revenue_net_cents from growth.v_desempenho_anuncios where ${where} order by day desc`;
      return { rows: (await db.tx(async (q) => { await q.exec('set local transaction_read_only = on'); await q.exec('set local role growth_ai'); return q.rows(`${sql} limit ${MAX_ROWS}`, params); })) };
    }
    if (name === 'propor_acao') {
      const a = await propose({ kind: input.kind, platform: input.platform, target_id: input.target_id, reason: input.reason, data: input.data, confidence: input.confidence });
      return { id: a.id, status: a.status, auto: a.auto };
    }
    if (name === 'publicar_relatorio') {
      state.report = await saveReport({ kind: ctx.kind ?? 'daily', period_start: ctx.periodStart, period_end: ctx.periodEnd, title: input.title, body: input.body, numbers: ctx.numbers ?? {}, model: ctx.model, llm: true, at: ctx.now });
      return { ok: true, id: state.report.id };
    }
    throw new Error(`Ferramenta desconhecida: ${name}`);
  }

  async function saveReport({ kind, period_start = null, period_end = null, title, body, numbers = {}, model = null, llm = false, at = null }) {
    return db.service.one(`insert into growth.ai_reports (kind, period_start, period_end, title, body, numbers, model, llm, created_at)
      values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, coalesce($9::timestamptz, now())) returning *`,
    [kind, period_start, period_end, title, body, JSON.stringify(numbers), model, llm, at]);
  }

  const SYSTEM = `Você é o analista de growth da Alento (app para largar maus hábitos). Trabalha com dados agregados, sem dados pessoais nem de saúde individuais.
Responda SEMPRE em português do Brasil, em tom profissional e direto. Redija relatórios, alertas e justificativas de ações (reason) em português do Brasil, com números no formato brasileiro (vírgula decimal, datas dd/mm, valores em R$ ou US$ conforme a moeda do dado).
Mantenha os nomes das ferramentas, colunas e views exatamente como estão (consultar_banco, ler_anuncios, propor_acao, publicar_relatorio, v_funil_diario etc.).
Use as ferramentas para verificar os números antes de afirmar qualquer coisa. Nunca invente números. Seja concreto e breve.
Você não tem acesso de escrita: só pode propor ações com propor_acao (um humano as aprova) e publicar o relatório com publicar_relatorio.
Marque confidence 'low' quando a amostra for pequena. Nunca proponha mudanças de preço como automáticas.`;

  /** Intenta con LLM; si falla o no hay clave, usa el informe por reglas (llm=false). */
  async function report({ kind, model, title, rulesBody, numbers, periodStart, periodEnd, instruction, now }) {
    if (await llmAvailable()) {
      try {
        const st = await runTools({
          model, system: SYSTEM, ctx: { kind, periodStart, periodEnd, numbers, model, now },
          prompt: `${instruction}\n\nDados calculados por regras (confiáveis):\n${JSON.stringify(numbers)}\n\nRascunho por regras:\n${rulesBody}\n\nQuando terminar, chame publicar_relatorio. Redija o título e o corpo em português do Brasil.`,
        });
        if (st.report) return st.report;
        if (st.text) return saveReport({ kind, period_start: periodStart, period_end: periodEnd, title, body: st.text, numbers, model, llm: true, at: now });
      } catch (e) { log.warn?.(`[ai] LLM indisponível, relatório por regras: ${e.message}`); }
    }
    return saveReport({ kind, period_start: periodStart, period_end: periodEnd, title, body: `Relatório automático por regras.\n\n${rulesBody}`, numbers, llm: false, at: now });
  }

  // ---------------------------------------------------------------------- métricas (vistas, días UTC)
  async function kpis(from, to) {
    const f = await db.service.one(`select coalesce(sum(visits),0) visits, coalesce(sum(quiz_started),0) quiz_started, coalesce(sum(leads),0) leads,
      coalesce(sum(checkouts),0) checkouts, coalesce(sum(purchases),0) purchases from growth.v_funil_diario where day between $1 and $2`, [from, to]);
    const r = await db.service.one('select coalesce(sum(net_cents),0) revenue_cents, coalesce(sum(orders),0) orders from growth.v_ventas_diarias where day between $1 and $2', [from, to]);
    const s = await db.service.one('select coalesce(sum(spend_cents),0) spend_cents from growth.ad_spend_daily where day between $1 and $2', [from, to]);
    const first = await db.service.one("select count(*)::int n from growth.v_atribuicao where day between $1 and $2 and kind = 'first'", [from, to]);
    return { ...f, ...r, ...s, new_customers: first.n, cac_cents: first.n > 0 ? Math.round(s.spend_cents / first.n) : null, roas: s.spend_cents > 0 ? Math.round((r.revenue_cents / s.spend_cents) * 100) / 100 : null };
  }
  const addDay = (ymd, n) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  /** Rendimiento por anuncio en una ventana, con CPA. */
  async function adWindow(from, to) {
    return db.service.rows(`select platform, ad_id, max(ad_name) ad_name, max(adset_id) adset_id, sum(spend_cents) spend_cents, sum(impressions) impressions,
      sum(clicks) clicks, sum(purchases) purchases, sum(revenue_net_cents) revenue_cents from growth.v_desempenho_anuncios where day between $1 and $2 group by 1, 2`, [from, to]);
  }

  // ---------------------------------------------------------------------- acciones
  async function autoEligible(a, c) {
    if (!KINDS.includes(a.kind) || a.kind === 'price_change') return false;      // precio: nunca automático
    if (a.confidence === 'low') return false;                                    // baja confianza: nunca automático
    if (!c.ai.auto[a.kind]) return false;
    if (a.kind === 'promote_variant' || a.kind === 'email_variant') return a.confidence === 'high';
    if (a.kind === 'creative_brief') return true;
    // pausar/escalar: solo cuando el histórico lo permite (>=5 ejecutadas con aprobación humana y ninguna deshecha en 60 días)
    const h = await db.service.one(`select count(*) filter (where status = 'executed' and not auto)::int ok, count(*) filter (where status = 'undone')::int undone
      from growth.ai_actions where kind = $1 and proposed_at > now() - interval '60 days'`, [a.kind]);
    return h.ok >= 5 && h.undone === 0;
  }

  /** Crea una propuesta (nunca ejecuta). Aplica límites y decide si es elegible a automática. */
  async function propose({ kind, platform = null, target_id = null, reason, data = {}, confidence = 'low' }) {
    if (!KINDS.includes(kind)) throw new Error(`Tipo de ação inválido: ${kind}`);
    if (!reason) throw new Error('Falta o motivo');
    if (!CONF.includes(confidence)) confidence = 'low';
    const c = await conf();
    if (kind === 'scale_budget') {
      const cur = Number(data?.current_budget_cents); const next = Number(data?.new_budget_cents);
      if (!(next > 0) || !(cur > 0) || next <= cur) throw new Error('scale_budget precisa de current_budget_cents e new_budget_cents (maior)');
      if (next > Math.floor(cur * (1 + c.ai.limits.budget_max_step_pct / 100)) + 1) throw new Error(`O aumento supera o máximo de ${c.ai.limits.budget_max_step_pct}% ao dia`);
      if (c.ai.limits.daily_cap_cents != null && next > c.ai.limits.daily_cap_cents) throw new Error('O orçamento supera o teto diário');
    }
    if (target_id != null) {
      const dup = await db.service.one("select * from growth.ai_actions where kind = $1 and target_id = $2 and status = 'proposed' and coalesce(platform,'') = coalesce($3,'') limit 1", [kind, String(target_id), platform]);
      if (dup) return dup;
    }
    const auto = await autoEligible({ kind, confidence }, c);
    return db.service.one(`insert into growth.ai_actions (kind, platform, target_id, reason, data, confidence, auto) values ($1, $2, $3, $4, $5::jsonb, $6, $7) returning *`,
      [kind, platform, target_id == null ? null : String(target_id), reason, JSON.stringify(data ?? {}), confidence, auto]);
  }

  async function perform(a) {
    if (a.kind === 'pause_ad' || a.kind === 'scale_budget') return ads.execute(a);
    if (a.kind === 'promote_variant' || a.kind === 'email_variant') {
      const variant = a.data?.variant;
      if (!a.target_id || !variant) throw new Error('Faltam o experimento ou a variante');
      const prev = await db.service.one('select status, winner, ended_at from growth.experiments where key = $1', [a.target_id]);
      if (!prev) throw new Error('Experimento não encontrado');
      await experiments.promote(a.target_id, variant);
      return { ok: true, result: { promoted: variant }, undo_data: { experiment: a.target_id, previous: prev } };
    }
    if (a.kind === 'creative_brief') return { ok: true, result: { brief: a.data?.brief ?? a.reason }, undo_data: null };
    if (a.kind === 'price_change') return { ok: true, result: { manual: true, note: 'Mudança de preço: aplicar manualmente no Stripe/lojas' }, undo_data: null };
    throw new Error(`Ação não suportada: ${a.kind}`);
  }

  async function runAction(a, { by = null, auto = false } = {}) {
    try {
      const r = await perform(a);
      return db.service.one(`update growth.ai_actions set status = 'executed', executed_at = now(), result = $2::jsonb, undo_data = $3::jsonb, auto = $4 where id = $1 returning *`,
        [a.id, JSON.stringify(r.result ?? {}), r.undo_data ? JSON.stringify(r.undo_data) : null, auto]);
    } catch (e) {
      return db.service.one("update growth.ai_actions set status = 'failed', executed_at = now(), result = $2::jsonb where id = $1 returning *", [a.id, JSON.stringify({ error: e.message })]);
    }
  }

  async function approve(id, user) {
    const a = await db.service.one("update growth.ai_actions set status = 'approved', decided_by = $2, decided_at = now() where id = $1 and status = 'proposed' returning *", [id, userId(user)]);
    if (!a) throw new Error('A ação não está pendente de aprovação');
    return runAction(a, { by: userId(user), auto: false });
  }
  async function reject(id, user) {
    const a = await db.service.one("update growth.ai_actions set status = 'rejected', decided_by = $2, decided_at = now() where id = $1 and status = 'proposed' returning *", [id, userId(user)]);
    if (!a) throw new Error('A ação não está pendente');
    return a;
  }
  async function undo(id, user) {
    const a = await db.service.one("select * from growth.ai_actions where id = $1 and status = 'executed'", [id]);
    if (!a) throw new Error('Só é possível desfazer ações executadas');
    if (a.kind === 'pause_ad' || a.kind === 'scale_budget') {
      await ads.undo(a);
    } else if (a.kind === 'promote_variant' || a.kind === 'email_variant') {
      if (!a.undo_data?.experiment) throw new Error('Não há dados para desfazer');
      const p = a.undo_data.previous ?? {};
      await db.service.exec('update growth.experiments set status = $2, winner = $3, ended_at = $4 where key = $1', [a.undo_data.experiment, p.status ?? 'running', p.winner ?? null, p.ended_at ?? null]);
    } else if (a.kind === 'price_change') {
      throw new Error('A mudança de preço deve ser revertida manualmente');
    }
    return db.service.one("update growth.ai_actions set status = 'undone', decided_by = coalesce($2, decided_by), decided_at = now() where id = $1 returning *", [id, userId(user)]);
  }

  /** Ejecuta solo lo elegible a automático, y solo con el interruptor general encendido. */
  async function autoExecute() {
    const c = await conf();
    if (!c.ai.auto_enabled) return { skipped: true, reason: 'chave geral desligada', executed: 0, failed: 0 };
    const rows = await db.service.rows("select * from growth.ai_actions where status = 'proposed' and auto = true order by proposed_at limit 50");
    let executed = 0; let failed = 0; let blocked = 0;
    for (const a of rows) {
      if (!(await autoEligible(a, c))) { blocked++; await db.service.exec("update growth.ai_actions set auto = false where id = $1", [a.id]); continue; }
      const claimed = await db.service.one("update growth.ai_actions set status = 'approved', decided_at = now() where id = $1 and status = 'proposed' returning *", [a.id]);
      if (!claimed) continue;
      const r = await runAction(claimed, { auto: true });
      if (r.status === 'executed') executed++; else failed++;
    }
    return { skipped: false, executed, failed, blocked };
  }

  // ---------------------------------------------------------------------- propuestas por reglas
  async function proposeAdActions(c) {
    const out = [];
    const today = new Date().toISOString().slice(0, 10);
    const rows = await adWindow(addDay(today, -6), today);
    const cac = c.goals.cac_max;
    if (!cac) return out;
    const L = c.ai.limits;
    for (const r of rows) {
      const lowSample = Number(r.clicks) < c.goals.min_sample;
      const conf = lowSample ? 'low' : 'high';
      const cpa = r.purchases > 0 ? r.spend_cents / r.purchases : null;
      if (r.spend_cents >= L.pause_spend_multiple * cac && (r.purchases === 0 || cpa > L.pause_cpa_multiple * cac)) {
        out.push(await propose({
          kind: 'pause_ad', platform: r.platform, target_id: r.ad_id, confidence: conf,
          reason: r.purchases === 0
            ? `Gastou ${eur(r.spend_cents)} (mais de ${L.pause_spend_multiple}x a meta de CAC de ${eur(cac)}) sem nenhuma venda em 7 dias.`
            : `CPA de ${eur(cpa)}, mais de ${L.pause_cpa_multiple}x a meta de ${eur(cac)}, com ${eur(r.spend_cents)} gastos.`,
          data: { ad_name: r.ad_name, spend_cents: r.spend_cents, purchases: r.purchases, cpa_cents: cpa && Math.round(cpa), cac_max: cac, clicks: r.clicks },
        }).catch((e) => { log.warn?.(`[ai] proposta pause_ad: ${e.message}`); return null; }));
      } else if (r.purchases >= 2 && cpa <= cac && r.adset_id && (c.goals.roas_min == null || r.revenue_cents / r.spend_cents >= c.goals.roas_min)) {
        const bud = await db.service.one('select max(daily_budget_cents) b from growth.ads where platform = $1 and adset_id = $2', [r.platform, r.adset_id]);
        if (bud?.b > 0) {
          const next = Math.floor(bud.b * (1 + L.budget_max_step_pct / 100));
          out.push(await propose({
            kind: 'scale_budget', platform: r.platform, target_id: r.adset_id, confidence: conf,
            reason: `CPA de ${eur(cpa)} abaixo da meta (${eur(cac)}) com ${r.purchases} vendas em 7 dias.`,
            data: { current_budget_cents: bud.b, new_budget_cents: next, ad_id: r.ad_id, cpa_cents: Math.round(cpa), purchases: r.purchases },
          }).catch((e) => { log.warn?.(`[ai] proposta scale_budget: ${e.message}`); return null; }));
        }
      }
    }
    return out.filter(Boolean);
  }

  async function proposeExperiments(c) {
    const out = [];
    if (!experiments?.list || !experiments?.stats) return out;
    try {
      for (const e of (await experiments.list()).filter((x) => x.status === 'running')) {
        const st = await experiments.stats(e.key);
        const variants = st?.variants ?? (Array.isArray(st) ? st : []);
        if (!st?.significant || variants.length < 2) continue;
        const best = [...variants].sort((a, b) => b.rate - a.rate)[0];
        const enough = variants.every((v) => Number(v.visitors) >= Math.max(c.goals.min_sample, Number(st.min_sample ?? 0)));
        const kind = e.kind === 'price' ? 'price_change' : e.kind === 'email' ? 'email_variant' : 'promote_variant';
        out.push(await propose({
          kind, target_id: e.key, confidence: enough ? 'high' : 'low',
          reason: `A variante ${best.variant} vence em "${e.name}" com significância de 95% (p=${br(st.p_value)}).`,
          data: { variant: best.variant, stats: variants, p_value: st.p_value },
        }));
      }
    } catch (err) { log.warn?.(`[ai] experimentos: ${err.message}`); }
    return out;
  }

  // ---------------------------------------------------------------------- alertas
  async function notify(alert, c) {
    const text = `[Alento ${alert.severity}] ${alert.message}`;
    try {
      for (const to of c.alerts.emails ?? []) {
        if (email?.sendTransactional) await email.sendTransactional({ to, template: 'alert', data: { code: alert.code, severity: alert.severity, message: alert.message }, language: 'es' });
      }
      if (c.alerts.webhookUrl) {
        await fetchImpl(c.alerts.webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text, code: alert.code }) });
      }
    } catch (e) { log.warn?.(`[ai] notificação de alerta: ${e.message}`); }
    await db.service.exec('update growth.alerts set notified_at = now() where id = $1', [alert.id]);
  }

  /** Abre una alerta salvo que ya haya una abierta con el mismo code. Devuelve { alert, created }. */
  async function raiseAlert({ code, severity = 'warn', message, data = {} }, c = null) {
    const open = await db.service.one('select * from growth.alerts where code = $1 and resolved_at is null order by created_at desc limit 1', [code]);
    if (open) return { alert: open, created: false };
    const alert = await db.service.one('insert into growth.alerts (code, severity, message, data) values ($1, $2, $3, $4::jsonb) returning *', [code, severity, message, JSON.stringify(data)]);
    await notify(alert, c ?? await conf());
    return { alert, created: true };
  }

  const ALERT_CODES = ['conversion_drop', 'cac_high', 'outbox_stalled', 'outbox_failed', 'checkout_errors', 'payment_failed_spike', 'spend_pace'];

  async function evaluateRules(c) {
    const found = [];
    const now = new Date(); const today = now.toISOString().slice(0, 10);
    // 1) conversión de hoy vs media 7 días
    const t = await kpis(today, today); const w = await kpis(addDay(today, -7), addDay(today, -1));
    if (t.visits >= c.goals.min_sample && w.visits > 0 && w.purchases > 0) {
      const rt = t.purchases / t.visits; const rw = w.purchases / w.visits;
      if (rt < rw * 0.5) found.push({ code: 'conversion_drop', severity: 'critical', message: `A conversão de hoje (${br(pct(t.purchases, t.visits))}%) caiu mais da metade em relação à média de 7 dias (${br(pct(w.purchases, w.visits))}%).`, data: { today: { visits: t.visits, purchases: t.purchases }, avg7: { visits: w.visits, purchases: w.purchases } } });
    }
    // 2) CAC por encima de 2x la meta (7 días)
    const k7 = await kpis(addDay(today, -6), today);
    if (c.goals.cac_max && k7.spend_cents >= c.goals.cac_max && (k7.new_customers === 0 || k7.spend_cents / k7.new_customers > 2 * c.goals.cac_max)) {
      found.push({ code: 'cac_high', severity: 'critical', message: `O CAC de 7 dias (${k7.cac_cents == null ? 'sem vendas' : eur(k7.cac_cents)}) supera 2x a meta (${eur(c.goals.cac_max)}). Gasto: ${eur(k7.spend_cents)}.`, data: { spend_cents: k7.spend_cents, new_customers: k7.new_customers, cac_max: c.goals.cac_max } });
    }
    // 3) pixel/outbox
    const ob = await db.service.one(`select count(*) filter (where status = 'pending' and next_attempt_at < now() - interval '30 minutes')::int stalled,
      count(*) filter (where status = 'failed' and created_at > now() - interval '24 hours')::int failed from growth.outbox`);
    if (ob.stalled > 0) found.push({ code: 'outbox_stalled', severity: 'critical', message: `${ob.stalled} eventos estão há mais de 30 minutos sem ser enviados aos pixels/Customer.io.`, data: ob });
    if (ob.failed > 0) found.push({ code: 'outbox_failed', severity: 'warn', message: `${ob.failed} eventos falharam definitivamente nas últimas 24 h.`, data: ob });
    // 4) errores de checkout
    const ce = await db.service.one("select count(*)::int n from growth.checkouts where status = 'failed' and opened_at > now() - interval '1 hour'");
    if (ce.n >= 3) found.push({ code: 'checkout_errors', severity: 'critical', message: `${ce.n} checkouts com falha na última hora.`, data: ce });
    // 5) pagos fallidos en alza
    const pf = await db.service.one(`select count(*) filter (where occurred_at > now() - interval '24 hours')::int d1,
      count(*) filter (where occurred_at <= now() - interval '24 hours' and occurred_at > now() - interval '8 days')::int d7 from growth.events where name = 'payment_failed'`);
    if (pf.d1 >= 3 && pf.d1 > 2 * (pf.d7 / 7)) found.push({ code: 'payment_failed_spike', severity: 'warn', message: `Pagamentos com falha em alta: ${pf.d1} em 24 h (média diária anterior: ${br(Math.round((pf.d7 / 7) * 10) / 10)}).`, data: pf });
    // 6) gasto sobre el ritmo
    const budget = c.goals.daily_budget_cents;
    if (budget) {
      const spent = (await db.service.one('select coalesce(sum(spend_cents),0) s from growth.ad_spend_daily where day = $1', [today])).s;
      const frac = (now.getUTCHours() * 60 + now.getUTCMinutes()) / 1440;
      const projected = frac >= 0.25 ? spent / frac : spent;
      if (spent > 0 && projected > budget * 1.25) found.push({ code: 'spend_pace', severity: 'warn', message: `Gasto de hoje ${eur(spent)} acima do ritmo do orçamento diário (${eur(budget)}); projeção ${eur(Math.round(projected))}.`, data: { spent, budget, projected: Math.round(projected) } });
    }
    return found;
  }

  async function runMonitor() {
    const c = await conf();
    const found = await evaluateRules(c);
    const created = [];
    for (const f of found) { const r = await raiseAlert(f, c); if (r.created) created.push(r.alert); }
    // Resuelve las alertas de reglas que ya no se cumplen
    const active = new Set(found.map((f) => f.code));
    const resolved = await db.service.rows("update growth.alerts set resolved_at = now() where resolved_at is null and code = any($1::text[]) and not (code = any($2::text[])) returning id, code",
      [ALERT_CODES, [...active]]);
    let proposals = [];
    try { proposals = await proposeAdActions(c); } catch (e) { log.warn?.(`[ai] propuestas: ${e.message}`); }
    let rep = null;
    if (created.length) {
      const body = created.map((a) => `- (${a.severity}) ${a.message}`).join('\n');
      rep = await report({ kind: 'monitor', model: MODELS.fast, title: `Monitor: ${created.length} alerta(s) nova(s)`, rulesBody: body, numbers: { alerts: created.map((a) => ({ code: a.code, data: a.data })) },
        instruction: 'Explique brevemente os alertas novos, a possível causa e o que verificar primeiro. Responda em português do Brasil.' });
    }
    const auto = await autoExecute();
    return { alerts: found, created: created.length, resolved: resolved.length, proposals: proposals.length, report: rep, auto };
  }

  // ---------------------------------------------------------------------- informes
  /** ¿Toca el informe diario? Desde las 8:00 en el fuso de las settings y solo si aún no hay uno de ese día local. */
  async function shouldRunDaily(now = new Date()) {
    const { tz } = await conf();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((p) => [p.type, p.value]));
    if (Number(parts.hour) < 8) return false;
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    const done = await db.service.one("select 1 as x from growth.ai_reports where kind = 'daily' and (created_at at time zone $1)::date = $2::date limit 1", [tz, day]);
    return !done;
  }

  async function runDaily({ now = null } = {}) {
    const c = await conf();
    const ref = now ? new Date(now) : new Date();
    const yday = addDay(dayIn(c.tz, ref), -1);
    const y = await kpis(yday, yday); const w = await kpis(addDay(yday, -7), addDay(yday, -1));
    const avg = (v) => Math.round((Number(v) / 7) * 10) / 10;
    // anuncios que ganaron / perdieron ayer
    const ayer = await adWindow(yday, yday);
    const sorted = ayer.filter((r) => r.spend_cents > 0).map((r) => ({ ...r, cpa: r.purchases > 0 ? r.spend_cents / r.purchases : null }));
    const winners = sorted.filter((r) => r.purchases > 0).sort((a, b) => a.cpa - b.cpa).slice(0, 3);
    const losers = sorted.filter((r) => r.purchases === 0).sort((a, b) => b.spend_cents - a.spend_cents).slice(0, 3);
    const proposals = [...await proposeAdActions(c), ...await proposeExperiments(c)];
    const pending = await db.service.rows("select id, kind, reason, confidence, auto from growth.ai_actions where status = 'proposed' order by proposed_at desc limit 20");
    const numbers = { day: yday, yesterday: y, avg7: { visits: avg(w.visits), purchases: avg(w.purchases), revenue_cents: Math.round(w.revenue_cents / 7), spend_cents: Math.round(w.spend_cents / 7) },
      winners: winners.map((r) => ({ ad_id: r.ad_id, name: r.ad_name, purchases: r.purchases, cpa_cents: Math.round(r.cpa) })), losers: losers.map((r) => ({ ad_id: r.ad_id, name: r.ad_name, spend_cents: r.spend_cents })),
      funnel: { yesterday: { quiz: y.quiz_started, leads: y.leads, checkouts: y.checkouts, purchases: y.purchases }, avg7: { quiz: avg(w.quiz_started), leads: avg(w.leads), checkouts: avg(w.checkouts), purchases: avg(w.purchases) } },
      pending_actions: pending.length };
    const lines = [
      `Ontem (${dm(yday)}): ${br(y.visits)} visitas, ${br(y.quiz_started)} quizzes, ${br(y.leads)} leads, ${br(y.checkouts)} checkouts, ${br(y.purchases)} compras.`,
      `Média de 7 dias: ${br(avg(w.visits))} visitas, ${br(avg(w.quiz_started))} quizzes, ${br(avg(w.leads))} leads, ${br(avg(w.checkouts))} checkouts, ${br(avg(w.purchases))} compras.`,
      `Receita líquida: ${eur(y.revenue_cents)} (média 7d: ${eur(Math.round(w.revenue_cents / 7))}). Gasto: ${eur(y.spend_cents)} (média 7d: ${eur(Math.round(w.spend_cents / 7))}). CAC: ${y.cac_cents == null ? '-' : eur(y.cac_cents)}. ROAS: ${br(y.roas)}.`,
      winners.length ? `Anúncios que se destacaram: ${winners.map((r) => `${r.ad_name ?? r.ad_id} (${r.purchases} vendas, CPA ${eur(r.cpa)})`).join('; ')}.` : 'Nenhum anúncio com vendas ontem.',
      losers.length ? `Anúncios que perderam: ${losers.map((r) => `${r.ad_name ?? r.ad_id} (${eur(r.spend_cents)} sem vendas)`).join('; ')}.` : 'Nenhum anúncio gastou sem vender.',
      pending.length ? `Ações propostas (${pending.length}):\n${pending.map((p) => `- ${p.kind} [confiança ${p.confidence}${p.auto ? ', automática' : ''}]: ${p.reason}`).join('\n')}` : 'Nenhuma ação proposta.',
    ];
    const rep = await report({ kind: 'daily', model: MODELS.fast, title: `Relatório diário ${dm(yday)}`, rulesBody: lines.join('\n'), numbers, periodStart: `${yday}T00:00:00Z`, periodEnd: `${yday}T23:59:59Z`, now: ref,
      instruction: 'Redija o relatório diário em português do Brasil: ontem vs média de 7 dias, anúncios que se destacaram/perderam, mudanças no funil e as ações propostas com seu impacto e confiança.' });
    return { report: rep, proposals: proposals.length };
  }

  async function runWeekly() {
    const c = await conf();
    const today = new Date().toISOString().slice(0, 10);
    const cohorts = await db.service.rows(`select cohort, currency, max(payers) filter (where months_since = 0) payers, sum(net_cents) ltv_cents
      from growth.v_coortes group by 1, 2 order by 1 desc limit 6`);
    const bySource = await db.service.rows(`select source, currency, max(payers) filter (where months_since = 0) payers, sum(net_cents) ltv_cents from growth.v_coortes group by 1, 2 order by 4 desc nulls last limit 6`);
    const recent = await adWindow(addDay(today, -2), today); const prior = await adWindow(addDay(today, -9), addDay(today, -3));
    const pm = new Map(prior.map((r) => [`${r.platform}|${r.ad_id}`, r]));
    const fatigued = [];
    for (const r of recent) {
      const p = pm.get(`${r.platform}|${r.ad_id}`);
      if (!p || r.impressions < 1000 || p.impressions < 1000) continue;
      const a = r.clicks / r.impressions; const b = p.clicks / p.impressions;
      if (b > 0 && a < b * 0.75) fatigued.push({ platform: r.platform, ad_id: r.ad_id, name: r.ad_name, ctr_recent_pct: Math.round(a * 10000) / 100, ctr_prior_pct: Math.round(b * 10000) / 100, impressions: r.impressions });
    }
    const questions = await db.service.rows(`select program, question, people, round(avg_seconds, 1) avg_seconds,
      round(100.0 * people / nullif(max(people) over (partition by program), 0), 1) retention_pct from growth.v_quiz_preguntas order by retention_pct asc nulls last limit 5`);
    const briefs = [];
    for (const f of fatigued.slice(0, 3)) {
      briefs.push(await propose({ kind: 'creative_brief', platform: f.platform, target_id: f.ad_id, confidence: f.impressions >= 5000 ? 'medium' : 'low',
        reason: `O CTR de "${f.name ?? f.ad_id}" caiu de ${br(f.ctr_prior_pct)}% para ${br(f.ctr_recent_pct)}%: preparar um criativo substituto.`,
        data: { brief: `Novo criativo para substituir "${f.name ?? f.ad_id}": manter a mensagem que funcionava, trocar o gancho (primeiros 3 s) e o formato. Tom Alento: acolhedor, sem culpa nem promessas de cura.`, ...f } }).catch(() => null));
    }
    const exp = await proposeExperiments(c); const ads_ = await proposeAdActions(c);
    const numbers = { cohorts, by_source: bySource, fatigued, weak_questions: questions, proposals: briefs.filter(Boolean).length + exp.length + ads_.length };
    const lines = [
      cohorts.length ? `LTV por coorte:\n${cohorts.map((r) => `- ${dm(r.cohort)} (${r.currency}): ${r.payers ?? 0} clientes, ${eur(r.ltv_cents)} líquido acumulado`).join('\n')}` : 'Ainda não há coortes de pagamento.',
      bySource.length ? `LTV por fonte:\n${bySource.map((r) => `- ${r.source}: ${eur(r.ltv_cents)}`).join('\n')}` : '',
      fatigued.length ? `Criativos com fadiga:\n${fatigued.map((f) => `- ${f.name ?? f.ad_id}: CTR ${br(f.ctr_prior_pct)}% -> ${br(f.ctr_recent_pct)}%`).join('\n')}` : 'Nenhum criativo com fadiga.',
      questions.length ? `Perguntas do quiz com menor retenção:\n${questions.map((q) => `- ${q.program}: "${q.question}" (${br(q.retention_pct)}%)`).join('\n')}` : '',
      `Novas propostas: ${numbers.proposals} (incluindo testes de preço/quiz e briefings de criativos).`,
    ].filter(Boolean);
    const rep = await report({ kind: 'weekly', model: MODELS.deep, title: `Relatório semanal ${dm(today)}`, rulesBody: lines.join('\n'), numbers, periodStart: `${addDay(today, -7)}T00:00:00Z`, periodEnd: `${today}T00:00:00Z`,
      instruction: 'Redija o relatório semanal em português do Brasil: LTV por coorte/fonte, fadiga de criativos, perguntas do quiz com mais abandono, propostas de teste de preço/quiz e briefings de criativos.' });
    return { report: rep, proposals: numbers.proposals };
  }

  /** Pregunta libre sobre los datos. Devuelve { answer, sql, rows, llm }. */
  async function ask(question, { user = null } = {}) {
    const q = String(question ?? '').trim();
    if (!q) throw new Error('Falta a pergunta');
    if (!(await llmAvailable())) {
      return { answer: 'A IA conversacional não está ativa (falta a chave da Anthropic em Configurações). Enquanto isso, o painel mostra relatórios automáticos por regras.', sql: null, rows: [], llm: false };
    }
    const st = await runTools({ model: MODELS.fast, system: `${SYSTEM}\nResponda à pergunta usando consultar_banco; não é preciso publicar relatório.`, tools: ['consultar_banco', 'ler_anuncios'], prompt: q, ctx: { kind: 'question' } });
    const answer = st.text || 'Não consegui obter uma resposta.';
    const sql = st.sqls.length ? st.sqls.join(';\n') : null;
    await saveReport({ kind: 'question', title: q.slice(0, 120), body: answer, numbers: { sql, asked_by: userId(user) }, model: MODELS.fast, llm: true }).catch(() => {});
    return { answer, sql, rows: st.lastRows, llm: true };
  }

  return {
    runMonitor, runDaily, runWeekly, ask, approve, reject, undo, autoExecute,
    // utilidades (cron, rutas, pruebas)
    shouldRunDaily, queryReadonly, propose, raiseAlert, llmAvailable,
    _execReadonly: execReadonly,
  };
}
