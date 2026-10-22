// Telas 1-5: visão geral, funil, aquisição, criativos, vendas.
import { h } from '../ui.js';
import { xyChart } from '../charts.js';
import { N, applyBars, bar, csvButton, dec, emptyEl, eur, genericTable, gapi, head, int, legend, load, mult, pct, pill, qs, state, stat, table, term, dt, STEP_LABELS } from './lib.js';

// ---------------------------------------------------------------- visión general
export async function overview(root, f) {
  root.replaceChildren(head('Visão geral', 'Como vai o negócio hoje, em 7 e em 30 dias.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi(`/overview${qs(f)}`);
    state.currency = (d.currency || state.currency).toUpperCase();
    const win = (title, k) => h('section', { class: 'card kpi', 'aria-label': title },
      h('h2', { class: 'kpi__title' }, title),
      h('p', { class: 'kpi__main' }, eur(k?.revenue_cents)), h('p', { class: 'kpi__sub muted' }, 'Receita'),
      h('dl', { class: 'kv' },
        ...[['Pedidos', int(k?.orders)], ['Gasto', eur(k?.spend_cents)], [term('roas0', 'ROAS'), mult(k?.roas)], [term('cac'), eur(k?.cac_cents)],
          [term('mrr'), eur(k?.mrr_cents)], [term('funnel'), pct(k?.conversion_pct)], ['Visitas', int(k?.visits)], ['Quizzes iniciados', int(k?.quiz_started)]]
          .flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, b)])));
    const ai = d.ai;
    const alerts = d.alerts ?? [];
    body.replaceChildren(
      h('div', { class: 'grid-3' }, win('Hoje', d.kpis?.today), win('Últimos 7 dias', d.kpis?.d7), win('Últimos 30 dias', d.kpis?.d30)),
      h('div', { class: 'grid-2 u-mt' },
        h('section', { class: 'card' },
          h('h2', { class: 'gr-h2' }, 'Resumo da IA', ai ? pill(ai.llm ? 'IA' : 'Relatório automático por regras', ai.llm ? 'ok' : null) : null),
          ai ? [h('h3', { class: 'gr-h3' }, ai.title), h('p', { class: 'prose' }, ai.body), h('p', { class: 'help' }, dt(ai.created_at)), h('a', { class: 'link', href: '#/ai' }, 'Ver todos os relatórios')]
            : emptyEl('Ainda não há relatórios', 'O primeiro relatório aparecerá após a próxima rotina diária.')),
        h('section', { class: 'card' },
          h('h2', { class: 'gr-h2' }, 'Alertas abertos', alerts.length ? pill(String(alerts.length), 'warn') : null),
          alerts.length ? h('ul', { class: 'list' }, alerts.map((a) => h('li', {}, pill(a.severity === 'critical' ? 'Crítico' : a.severity === 'warning' ? 'Atenção' : 'Info', a.severity === 'critical' ? 'bad' : a.severity === 'warning' ? 'warn' : null),
            h('div', { class: 'list__main' }, h('p', {}, a.message), h('p', { class: 'list__meta' }, `${a.code} · ${dt(a.created_at)}`)))))
            : emptyEl('Tudo em ordem', 'Não há alertas abertos.'))),
      legend(['funnel', 'cac', 'roas0', 'mrr']));
  });
}

// ---------------------------------------------------------------- embudo
export async function funnel(root, f) {
  root.replaceChildren(head('Funil do quiz', 'Onde as pessoas desistem, por etapa e por pergunta.', csvButton('/funnel', f)), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi(`/funnel${qs(f)}`);
    const steps = d.steps ?? [];
    const top = Math.max(1, ...steps.map((s) => s.count));
    const qs_ = d.questions ?? [];
    body.replaceChildren(
      h('section', { class: 'card' }, h('h2', { class: 'gr-h2' }, 'Queda por etapa'),
        steps.length ? h('ol', { class: 'funnel' }, steps.map((s, i) => h('li', {},
          h('div', { class: 'funnel__row' }, h('span', { class: 'funnel__label' }, STEP_LABELS[s.key] ?? s.label), h('strong', {}, int(s.count)),
            i ? h('span', { class: `funnel__drop${s.drop_pct >= 40 ? ' is-high' : ''}` }, `−${dec(s.drop_pct)}%`) : h('span', { class: 'funnel__drop muted' }, 'início')),
          bar((s.count / top) * 100, `${STEP_LABELS[s.key] ?? s.label}: ${int(s.count)}`)))) : emptyEl('Sem dados do funil', 'Não há eventos no período e nos filtros escolhidos.')),
      h('h2', { class: 'gr-h2 u-mt' }, 'Queda por pergunta'),
      qs_.length ? table(['Programa', 'Pergunta', N('Respostas'), N('Tempo médio'), N('Abandono'), 'Distribuição'],
        qs_.map((q) => [q.program, h('span', { class: 'wrap' }, q.question), int(q.answers), `${dec(q.avg_seconds)} s`,
          h('span', { class: q.drop_pct >= 15 ? 'is-high' : null }, pct(q.drop_pct)),
          h('details', { class: 'inline-details' }, h('summary', {}, `${(q.distribution ?? []).length} respostas`),
            h('ul', { class: 'mini' }, (q.distribution ?? []).map((x) => h('li', {}, h('span', {}, x.answer), h('strong', {}, int(x.total))))))]), 'Queda por pergunta')
        : emptyEl('Sem perguntas', 'Ainda não há respostas registradas.'),
      legend(['capture', 'funnel']));
    applyBars(body);
  });
}

// ---------------------------------------------------------------- adquisición
const ACQ_HEAD = ['Nível', N('Gasto'), N('Cliques'), N('CPC'), N('Leads'), N('CPL'), N('Checkouts'), N('Carrinhos abandonados'), N('Compras'), N('CAC'), N('Receita'), N('ROAS D0'), N('ROAS D30'), N('Reembolsos'), N('Conv. plataforma')];
const acqCells = (r) => [eur(r.spend_cents), int(r.clicks), eur(r.cpc_cents), int(r.leads), eur(r.cpl_cents), int(r.checkouts), int(r.carts_abandoned), int(r.purchases), eur(r.cac_cents), eur(r.revenue_cents), mult(r.roas_d0), mult(r.roas_d30), eur(r.refunded_cents), int(r.reported_conversions)];

export async function acquisition(root, f) {
  root.replaceChildren(head('Aquisição', 'Campanha → conjunto → anúncio, com atribuição por último clique, primeiro clique e plataforma.', csvButton('/acquisition', f)), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi(`/acquisition${qs(f)}`);
    const tree = d.tree ?? [];
    const open = new Set();
    const treeWrap = h('div');
    const render = () => {
      const rows = [];
      const add = (level, id, name, plat, r, kids) => {
        const key = `${level}:${id}`;
        const isOpen = open.has(key);
        const btn = kids?.length ? h('button', { class: 'tree-btn', type: 'button', 'aria-expanded': String(isOpen), 'aria-label': `${isOpen ? 'Recolher' : 'Expandir'} ${name}`,
          onclick: () => { isOpen ? open.delete(key) : open.add(key); render(); } }, isOpen ? '▾' : '▸') : h('span', { class: 'tree-btn tree-btn--none' });
        rows.push({ cls: `lvl-${level}`, cells: [h('span', { class: 'tree-name' }, btn, h('span', { class: 'wrap' }, name || id), plat ? h('span', { class: 'help' }, plat) : null), ...acqCells(r)] });
        if (isOpen) kids?.forEach((k) => k());
      };
      for (const c of tree) {
        add(0, c.campaign_id, c.campaign_name, c.platform, c, (c.adsets ?? []).map((a) => () => add(1, a.adset_id, a.adset_name, null, a,
          (a.ads ?? []).map((ad) => () => add(2, ad.ad_id, ad.ad_name, null, ad)))));
      }
      treeWrap.replaceChildren(rows.length ? table(ACQ_HEAD, rows, 'Árvore de aquisição por campanha, conjunto e anúncio', { cls: 'table--tree' }) : emptyEl('Sem campanhas', 'Conecte o Meta ou o TikTok em Configurações para ver o gasto e as campanhas.'));
    };
    tree.forEach((c) => open.add(`0:${c.campaign_id}`));
    render();
    const at = d.attribution ?? {};
    const src = (rows, cap) => (rows?.length ? table(['Fonte', N('Pedidos'), N('Receita')], rows.map((r) => [r.source, int(r.orders), eur(r.revenue_cents)]), cap) : emptyEl('Sem pedidos'));
    body.replaceChildren(
      h('section', {}, h('h2', { class: 'gr-h2' }, 'Campanhas, conjuntos e anúncios'), treeWrap),
      h('h2', { class: 'gr-h2 u-mt' }, 'Atribuição lado a lado'),
      h('p', { class: 'help' }, 'As três visões podem divergir: a plataforma costuma reportar mais conversões do que as nossas próprias vendas.'),
      h('div', { class: 'grid-3' },
        h('section', { class: 'card' }, h('h3', { class: 'gr-h3' }, 'Último clique'), src(at.last, 'Atribuição por último clique')),
        h('section', { class: 'card' }, h('h3', { class: 'gr-h3' }, 'Primeiro clique'), src(at.first, 'Atribuição por primeiro clique')),
        h('section', { class: 'card' }, h('h3', { class: 'gr-h3' }, 'Reportado pela plataforma'),
          at.platform?.length ? table(['Plataforma', N('Conversões'), N('Valor')], at.platform.map((r) => [r.platform, int(r.reported_conversions), eur(r.reported_value_cents)]), 'Conversões reportadas por plataforma') : emptyEl('Sem dados'))),
      legend(['cac', 'roas0', 'roas30', 'cart', 'cpl']));
  });
}

// ---------------------------------------------------------------- creativos
export async function creatives(root, f) {
  root.replaceChildren(head('Criativos', 'Desempenho por anúncio e sinal de fadiga.', csvButton('/creatives', f)), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const { ads = [] } = await gapi(`/creatives${qs(f)}`);
    body.replaceChildren(
      ads.length ? h('div', { class: 'cards-creative' }, ads.map((a) => {
        const img = a.thumbnail_url ? h('img', { src: a.thumbnail_url, alt: `Miniatura de ${a.ad_name}`, loading: 'lazy', width: '96', height: '96' }) : null;
        const ph = h('div', { class: 'thumb thumb--empty', 'aria-hidden': 'true' }, 'Sem miniatura');
        const thumb = h('div', { class: 'thumb' }, img ?? ph);
        img?.addEventListener('error', () => thumb.replaceChildren(ph));
        return h('article', { class: `card creative${a.fatigue ? ' is-fatigued' : ''}` },
          thumb,
          h('div', { class: 'creative__main' },
            h('h2', { class: 'gr-h3 wrap' }, a.ad_name), h('p', { class: 'help' }, `${a.platform} · ${a.ad_id}`),
            a.fatigue ? h('p', {}, pill('Em fadiga', 'warn'), ' ', h('span', { class: 'help' }, `CTR 7 d ${a.ctr_7d_change_pct > 0 ? '+' : ''}${dec(a.ctr_7d_change_pct)}%`)) : h('p', {}, pill('Estável', 'ok')),
            h('dl', { class: 'kv kv--2' }, ...[['Gasto', eur(a.spend_cents)], ['Impressões', int(a.impressions)], ['Cliques', int(a.clicks)], [term('ctr'), pct(a.ctr_pct)],
              [term('hook'), pct(a.hook_rate_pct)], ['Compras', int(a.purchases)], ['Custo por venda', eur(a.cost_per_sale_cents)], ['ROAS', mult(a.roas)]].flatMap(([x, y]) => [h('dt', {}, x), h('dd', {}, y)]))));
      })) : emptyEl('Sem criativos', 'Quando os anúncios forem sincronizados, eles aparecerão aqui.'),
      legend(['ctr', 'hook', 'fatigue']));
  });
}

// ---------------------------------------------------------------- ventas
export async function sales(root, f) {
  root.replaceChildren(head('Vendas e assinaturas', 'Receita, MRR e valor por coorte.', csvButton('/sales', f)), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi(`/sales${qs(f)}`);
    const s = d.summary ?? {};
    const daily = d.daily ?? [];
    const ltv = d.ltv ?? [];
    const maxM = Math.max(0, ...ltv.map((r) => (r.months ?? []).length));
    const mx = Math.max(1, ...ltv.flatMap((r) => (r.months ?? []).map((m) => m.net_cents)));
    const dayKey = (r) => r.day ?? r.date;
    const fmtDay = (v) => String(v).slice(5).split('-').reverse().join('/');
    body.replaceChildren(
      h('div', { class: 'stats' }, stat('Pedidos', int(s.orders)), stat('Receita bruta', eur(s.gross_cents)), stat('Reembolsado', eur(s.refunded_cents)), stat('Líquido', eur(s.net_cents)),
        stat(h('span', {}, term('mrr')), eur(s.mrr_cents)), stat('Assinaturas ativas', int(s.active)), stat('Canceladas', int(s.canceled)), stat('Pagamentos com falha', int(s.failed_payments), null, s.failed_payments ? 'warn' : null)),
      h('section', { class: 'card u-mt' }, h('h2', { class: 'gr-h2' }, 'Receita por dia'),
        daily.length ? xyChart({ labels: daily.map((r) => fmtDay(dayKey(r))), series: [{ key: 'net', label: 'Líquido', kind: 'bars', values: daily.map((r) => (r.net_cents ?? r.revenue_cents ?? 0) / 100) }],
          format: (v) => eur(Math.round(v * 100)), caption: 'Receita líquida por dia' }) : emptyEl('Sem vendas no período')),
      h('h2', { class: 'gr-h2 u-mt' }, term('ltv', 'LTV por coorte'),),
      ltv.length ? table(['Coorte', 'Fonte', N('Pagantes'), ...Array.from({ length: maxM }, (_, i) => N(`M${i}`)), N('LTV')],
        ltv.map((r) => [r.cohort, r.source, int(r.payers), ...Array.from({ length: maxM }, (_, i) => {
          const m = (r.months ?? [])[i];
          if (!m) return '—';
          const td = h('span', { class: 'heat' }, eur(m.net_cents, String(r.currency || state.currency).toUpperCase()));
          td.style.setProperty('--a', String(Math.max(0.06, m.net_cents / mx).toFixed(2)));
          return td;
        }), h('strong', {}, eur(r.ltv_cents, String(r.currency || state.currency).toUpperCase()))]), 'LTV por coorte') : emptyEl('Ainda não há coortes'),
      h('h2', { class: 'gr-h2 u-mt' }, 'Assinaturas'), genericTable(d.subscriptions, 'Assinaturas', ['user_id']),
      h('h2', { class: 'gr-h2 u-mt' }, 'Pedidos'), genericTable(d.rows, 'Pedidos'),
      legend(['mrr', 'ltv']));
  });
}
