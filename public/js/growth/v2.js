// Painel v2: visão geral, analytics (retenção tela a tela, estilo VTurb), vendas, leads, traqueamento por pixel, melhorias futuras e configurações.
import { h, toast } from '../ui.js';
import { act, csvButton, dt, emptyEl, eur, field, gapi, int, load, pct, state } from './lib.js';
import { GROUPS, groupForm, staffSection } from './settings.js';

const PROGRAM_NAMES = { 'sem-fumo': 'Sem Fumo · ES', alcohol: 'Álcool', azucar: 'Açúcar', ansiedad: 'Ansiedade', sueno: 'Sono' };
const PLAN_NAMES = { semanal: 'Prueba de una semana', mensual: 'Plan de 1 mes', trimestral: 'Plan de 3 meses', anual: 'Plan de 1 año' };
const PERIODS = [['1', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias']];

const head = (title, sub, ...right) => h('div', { class: 'v2-head' }, h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'v2-sub' }, sub) : null), h('div', { class: 'v2-head__right' }, right));
const card = (...c) => h('section', { class: 'v2-card' }, ...c);
const metric = (v, l) => h('div', { class: 'v2-card v2-metric' }, h('div', { class: 'v2-metric__v' }, v), h('div', { class: 'v2-metric__l' }, l));
const chip = (text, tone) => h('span', { class: `v2-chip${tone ? ` v2-chip--${tone}` : ''}` }, text);
const delta = (cur, prev) => {
  if (!prev) return cur ? chip('novo', 'up') : h('span', { class: 'muted' }, '—');
  const d = Math.round(((cur - prev) / prev) * 100);
  return h('span', { class: d >= 0 ? 'v2-up' : 'v2-down' }, `${d >= 0 ? '+' : '−'}${Math.abs(d)}% vs. período anterior`);
};

/** Seletor de período que vive na URL (#/rota?days=7). */
function periodSeg(params, onChange) {
  const cur = params.days ?? '7';
  return h('div', { class: 'v2-seg', role: 'group', 'aria-label': 'Período' }, PERIODS.map(([v, l]) =>
    h('button', { type: 'button', class: v === cur ? 'on' : '', 'aria-pressed': String(v === cur), onclick: () => onChange({ ...params, days: v }) }, l)));
}
const goto = (route, params = {}) => { const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString(); location.hash = `#/${route}${q ? `?${q}` : ''}`; };

function table(headers, rows, { onRow } = {}) {
  return h('div', { class: 'v2-table-wrap' }, h('table', { class: 'v2-table' },
    h('thead', {}, h('tr', {}, headers.map((x) => h('th', { class: x.num ? 'num' : '' }, x.label ?? x)))),
    h('tbody', {}, rows.map((r, i) => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(i) : null, tabindex: onRow ? '0' : null, onkeydown: onRow ? (e) => { if (e.key === 'Enter') onRow(i); } : null },
      r.map((c, k) => h('td', { class: headers[k]?.num ? 'num' : '' }, c)))))));
}
const N = (label) => ({ label, num: true });

// ---------------------------------------------------------------- Visão geral
export async function home(root) {
  root.replaceChildren(head('Visão geral', 'Faturamento confirmado pelo Stripe, já descontados os reembolsos.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi('/home');
    state.currency = d.currency;
    const k = (key, label) => {
      const c = d.cards[key];
      return h('div', { class: 'v2-card v2-kpi' }, h('p', { class: 'v2-kpi__l' }, label), h('p', { class: 'v2-kpi__v' }, eur(c.revenue_cents)),
        h('p', { class: 'v2-kpi__m' }, h('span', {}, `${int(c.orders)} ${c.orders === 1 ? 'venda' : 'vendas'}`), delta(c.revenue_cents, c.prev_revenue_cents)));
    };
    body.replaceChildren(
      h('div', { class: 'v2-grid v2-grid--3' }, k('today', 'Hoje'), k('d7', 'Últimos 7 dias'), k('d30', 'Últimos 30 dias')),
      h('div', { class: 'v2-grid v2-grid--2 v2-mt' },
        card(h('h2', {}, 'Quizzes hoje'), d.funnels.length
          ? table(['Funil', N('Iniciaram'), N('Conversão'), N('Faturamento')], d.funnels.map((f) => [PROGRAM_NAMES[f.program] ?? f.program, int(f.started), pct(f.conversion_pct), eur(f.revenue_cents)]),
            { onRow: (i) => goto('funnel', { p: d.funnels[i].program, days: '1' }) })
          : emptyEl('Sem visitas hoje', 'Quando alguém abrir um quiz, ele aparece aqui.')),
        card(h('h2', {}, 'Últimas vendas'), d.recent.length
          ? table(['Quando', 'Cliente', 'Origem', N('Valor')], d.recent.map((o) => [dt(o.paid_at), o.name ?? '—', chip(o.source ?? 'direto'), eur(o.amount_cents)]), { onRow: (i) => goto('sales', { open: d.recent[i].order_id, days: '30' }) })
          : emptyEl('Nenhuma venda ainda'))));
  });
}

// ---------------------------------------------------------------- Funis
export async function funnels(root, _f, params) {
  root.replaceChildren(head('Analytics', 'Cada quiz é um funil. Clique para ver a retenção e comparar anúncios.', periodSeg(params, (p) => goto('funnels', p))), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi(`/funnels?days=${params.days ?? '7'}`);
    state.currency = d.currency;
    body.replaceChildren(h('div', { class: 'v2-grid v2-grid--3' }, d.rows.map((f) => {
      const active = f.status === 'active';
      return h('button', { type: 'button', class: `v2-card v2-funnel${active ? '' : ' is-off'}`, onclick: () => goto('funnel', { p: f.program, days: params.days ?? '7' }) },
        h('span', { class: 'v2-row' }, h('strong', {}, PROGRAM_NAMES[f.program] ?? f.program), chip(active ? 'ativo' : 'em breve', active ? 'up' : null)),
        sparkline(f.daily),
        h('span', { class: 'v2-grid v2-grid--3 v2-funnel__nums' },
          h('span', {}, h('b', {}, int(f.started)), h('small', {}, 'Iniciaram')),
          h('span', {}, h('b', {}, pct(f.conversion_pct)), h('small', {}, 'Conversão')),
          h('span', {}, h('b', {}, eur(f.revenue_cents)), h('small', {}, 'Faturamento'))));
    })));
  });
}

function sparkline(values) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 30'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('class', 'v2-spark'); svg.setAttribute('aria-hidden', 'true');
  const max = Math.max(1, ...values);
  const vals = values.length > 1 ? values : [0, values[0] ?? 0];
  const pts = vals.map((v, i, a) => `${(i / (a.length - 1)) * 100},${28 - (v / max) * 26}`);
  const p = document.createElementNS(NS, 'polyline'); p.setAttribute('points', pts.join(' ')); svg.append(p);
  return svg;
}

// Recortes abaixo do gráfico. Campanha/conjunto/anúncio vêm das UTMs do link (TikTok: __CAMPAIGN_NAME__, __AID_NAME__, __CID_NAME__).
const DIM_TABS = [['', 'Geral'], ['campaign', 'Campanha'], ['adset', 'Conjunto'], ['ad', 'Anúncio'], ['country', 'País'], ['device', 'Dispositivo'], ['source', 'Origem'], ['language', 'Idioma']];
// Cores das linhas em classes (.v2-s0…s5): o CSP do site bloqueia style inline.
const DEVICES = { mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet' };
const regionNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['pt-BR'], { type: 'language' });
function segLabel(dim, v) {
  try {
    if (dim === 'country' && /^[a-z]{2}$/i.test(v)) return regionNames.of(v.toUpperCase());
    if (dim === 'language' && /^[a-z]{2,3}(-[a-z0-9]+)?$/i.test(v)) return languageNames.of(v);
  } catch { /* código desconhecido: mostra como veio */ }
  return dim === 'device' ? (DEVICES[v] ?? v) : v;
}

export async function funnel(root, _f, params) {
  const program = params.p ?? 'sem-fumo';
  const dim = DIM_TABS.some(([k]) => k === params.dim) ? params.dim ?? '' : '';
  const nav = (extra) => goto('funnel', { p: program, days: params.days, dim, ...extra });
  const back = h('button', { type: 'button', class: 'v2-back', onclick: () => goto('funnels', { days: params.days }) }, '← Analytics');
  root.replaceChildren(head(PROGRAM_NAMES[program] ?? program, null, periodSeg(params, (p) => goto('funnel', p))), h('div', { 'data-body': '' }));
  root.querySelector('.v2-head > div').prepend(back);
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const qs = new URLSearchParams({ days: params.days ?? '7', ...(dim ? { dim } : {}), ...(dim && params.val ? { val: params.val } : {}) });
    const d = await gapi(`/funnels/${encodeURIComponent(program)}?${qs}`);
    state.currency = d.currency;
    const dimName = DIM_TABS.find(([k]) => k === dim)[1];
    const series = d.series.map((x, i) => ({ ...x, name: segLabel(dim, x.value), cls: `v2-s${i % 6}` }));

    // Filtros embaixo do gráfico: dimensão + valores (nome completo, sem abreviar).
    const tabs = h('div', { class: 'v2-tabs', role: 'tablist', 'aria-label': 'Separar por' }, DIM_TABS.map(([k, l]) =>
      h('button', { type: 'button', role: 'tab', class: dim === k ? 'on' : '', 'aria-selected': String(dim === k), onclick: () => goto('funnel', { p: program, days: params.days, dim: k }) }, l)));
    const segs = dim ? h('div', { class: 'v2-segs' }, d.segments.length
      ? [h('button', { type: 'button', class: `v2-chip v2-chip--btn${params.val ? '' : ' on'}`, onclick: () => nav({ val: '' }) }, `Comparar (${Math.min(d.segments.length, 6)} linhas)`),
        ...d.segments.map((s) => h('button', { type: 'button', class: `v2-chip v2-chip--btn${params.val === s.value ? ' on' : ''}`, onclick: () => nav({ val: params.val === s.value ? '' : s.value }) },
          `${segLabel(dim, s.value)} · ${int(s.people)}`))]
      : h('span', { class: 'muted' }, 'Sem dados para separar neste período.')) : null;

    const worst = d.screens.reduce((w, s) => (s.drop_pp > (w?.drop_pp ?? 0) ? s : w), null);
    const chart = series.length
      ? [retentionChart(d.screens, series), h('ul', { class: 'v2-legend' }, series.map((x) => h('li', {}, h('i', { class: x.cls }), x.name)))]
      : d.screens[0].people
        ? [retentionChart(d.screens), worst ? h('p', { class: 'v2-note' }, 'Maior queda: ', h('b', { class: 'v2-down' }, `${worst.label} · ${worst.title} (−${worst.drop_pp} p.p.)`)) : null]
        : emptyEl('Sem dados neste período', 'Quando alguém abrir o quiz, a curva aparece aqui.');
    const best = series.reduce((b, x) => (x.people >= 5 && x.purchase_pct > (b?.purchase_pct ?? -1) ? x : b), null);
    const compare = series.length ? card(h('h2', {}, `Comparativo por ${dimName.toLowerCase()}`),
      table([dimName, N('Iniciaram'), N('Terminaram o quiz'), N('Leads'), N('Viram a oferta'), N('Compras'), N('Até a compra')], series.map((x) => [
        h('span', { class: 'v2-namecell' }, h('i', { class: `v2-swatch ${x.cls}` }), x.name, x === best ? chip('melhor', 'up') : null),
        int(x.people), pct(x.finished_pct), int(x.leads), int(x.offer), int(x.purchases), h('b', {}, pct(x.purchase_pct))])),
      h('p', { class: 'v2-note' }, 'Linhas = os 6 valores com mais pessoas. Clique num valor acima do gráfico para ver só ele.')) : null;

    const m = d.metrics;
    const screensTable = h('details', { class: 'v2-card v2-details v2-mt' }, h('summary', {}, 'Tela a tela'),
      table(['Nº', 'Tela', N('Pessoas'), N('Retenção'), N('Saída nesta tela')],
        d.screens.map((s) => [s.label, h('span', { class: 'v2-wrap' }, s.title), int(s.people), pct(s.retention_pct), h('span', { class: s.drop_pp >= 5 ? 'v2-down' : '' }, s.drop_pp ? `−${s.drop_pp} p.p.` : '—')])));
    const reset = state.role === 'admin' ? h('div', { class: 'v2-reset' },
      d.since ? h('span', { class: 'muted' }, `Contando desde ${dt(d.since)}`) : null,
      h('button', { type: 'button', class: 'v2-link', onclick: (e) => {
        const typed = prompt('Isto zera as métricas deste quiz no painel (as vendas e os dados continuam guardados).\n\nDigite RESETAR para confirmar:');
        if (typed == null) return;
        if (typed.trim() !== 'RESETAR') { toast('Não zerado: era preciso digitar RESETAR.'); return; }
        act(e.currentTarget, () => gapi(`/funnels/${encodeURIComponent(program)}/reset`, { method: 'POST', body: { confirm: 'RESETAR' } }), 'Métricas zeradas', () => funnel(root, _f, params));
      } }, 'Zerar métricas')) : null;

    body.replaceChildren(
      card(...[chart].flat(), h('div', { class: 'v2-filters' }, tabs, segs)),
      compare,
      h('h2', { class: 'v2-h2' }, params.val ? `Métricas · ${segLabel(dim, params.val)}` : 'Métricas'),
      h('div', { class: 'v2-grid v2-grid--6' },
        metric(int(m.started), 'Iniciaram o quiz'), metric(int(m.finished), 'Chegaram à análise'), metric(int(m.leads), 'Leads (e-mail)'),
        metric(pct(m.lead_pct), 'Taxa de lead'), metric(int(m.offer), 'Viram a oferta'), metric(int(m.checkouts), 'Abriram checkout'),
        metric(int(m.purchases), 'Compras'), metric(pct(m.conversion_pct), 'Conversão'),
        m.revenue_cents == null ? null : metric(eur(m.revenue_cents), 'Faturamento'), m.ticket_cents == null ? null : metric(eur(m.ticket_cents), 'Ticket médio')),
      screensTable, reset);
  });
}

/** Curva em degraus (estilo VTurb). Com `series`, uma linha por recorte (sem área). No eixo: P1… e as etapas finais. */
function retentionChart(screens, series = null) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000, H = 340, L = 44, R = 40, T = 14, B = 58, iw = W - L - R, ih = H - T - B, n = screens.length;
  const x = (i) => L + (i / (n - 1)) * iw, y = (v) => T + ih - (Math.min(100, v) / 100) * ih;
  const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'v2-ret', role: 'img', 'aria-label': 'Retenção por tela do quiz' });
  for (const v of [0, 20, 40, 60, 80, 100]) { svg.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'v2-ret__grid' })); svg.append(el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'v2-ret__y' }, `${v}%`)); }
  const stepPath = (vals) => { let d = `M${x(0)},${y(vals[0])}`; vals.forEach((v, i) => { if (i) d += ` H${x(i)} V${y(v)}`; }); return d; };
  const lines = series ?? [{ retention: screens.map((s) => s.retention_pct) }];
  if (!series) {
    const d = stepPath(lines[0].retention);
    svg.append(el('path', { d: `${d} V${y(0)} H${x(0)} Z`, class: 'v2-ret__area' }), el('path', { d, class: 'v2-ret__line' }));
  } else {
    for (const s of lines) svg.append(el('path', { d: stepPath(s.retention), class: `v2-ret__line ${s.cls}` }));
  }
  // Eixo X: perguntas (P1…) discretas; etapas fora do quiz em destaque.
  let stageRow = 0;
  screens.forEach((s, i) => {
    if (s.n) {
      svg.append(el('line', { x1: x(i), x2: x(i), y1: T + ih, y2: T + ih + 4, class: 'v2-ret__tick' }));
      svg.append(el('text', { x: x(i), y: T + ih + 15, 'text-anchor': 'middle', class: 'v2-ret__q' }, String(s.n)));
    } else if (s.kind !== 'quiz') {
      svg.append(el('line', { x1: x(i), x2: x(i), y1: T, y2: T + ih, class: 'v2-ret__stage' }));
      svg.append(el('text', { x: x(i), y: T + ih + 30 + (stageRow++ % 2) * 14, 'text-anchor': 'middle', class: 'v2-ret__s' }, s.label));
    }
  });
  const cross = el('line', { y1: T, y2: T + ih, class: 'v2-ret__cross', visibility: 'hidden' });
  const dots = lines.map((s) => el('circle', { r: 4.5, class: `v2-ret__dot ${s.cls ?? ''}`, visibility: 'hidden' }));
  svg.append(cross, ...dots);
  const tip = h('div', { class: 'v2-tip', hidden: true });
  const hit = el('rect', { x: L, y: T, width: iw, height: ih, fill: 'transparent' });
  svg.append(hit);
  const show = (evt) => {
    const r = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((((evt.clientX - r.left) / r.width) * W) - L) / iw * (n - 1))));
    const s = screens[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    lines.forEach((ln, k) => { dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(ln.retention[i])); dots[k].setAttribute('visibility', 'visible'); });
    tip.replaceChildren(h('strong', {}, `${s.label} · ${s.title}`), ...(series
      ? series.map((ln) => h('span', { class: 'v2-tip__row' }, h('i', { class: ln.cls }), `${ln.name}: ${pct(ln.retention[i])}`))
      : [h('span', {}, `${pct(s.retention_pct)} chegaram (${int(s.people)} pessoas)`), s.drop_pp ? h('span', { class: 'v2-down' }, `Saída aqui: −${s.drop_pp} p.p.`) : null]));
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max((x(i) / W) * 100, 12), 88)}%`;
  };
  hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.forEach((dt0) => dt0.setAttribute('visibility', 'hidden')); });
  return h('div', { class: 'v2-ret-wrap' }, svg, tip);
}

// ---------------------------------------------------------------- Vendas
const KIND_TABS = [['', 'Todas'], ['first', 'Novas'], ['renewal', 'Renovações']];
export async function sales(root, _f, params) {
  const search = h('input', { class: 'v2-input', type: 'search', placeholder: 'Buscar por nome ou e-mail', value: params.q ?? '', 'aria-label': 'Buscar venda' });
  search.addEventListener('change', () => goto('sales', { ...params, q: search.value.trim(), open: '' }));
  root.replaceChildren(head('Vendas', 'Clique numa venda para ver o cliente, as UTMs e os eventos enviados aos pixels.', periodSeg(params, (p) => goto('sales', { ...p, open: '' }))), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi(`/orders?${new URLSearchParams({ days: params.days ?? '7', kind: params.kind ?? '', q: params.q ?? '' })}`);
    state.currency = d.currency;
    const s = d.summary;
    const kinds = h('div', { class: 'v2-seg' }, KIND_TABS.map(([k, l]) => h('button', { type: 'button', class: (params.kind ?? '') === k ? 'on' : '', onclick: () => goto('sales', { ...params, kind: k, open: '' }) }, l)));
    body.replaceChildren(
      h('div', { class: 'v2-grid v2-grid--4' }, metric(eur(s.revenue_cents), 'Faturamento'), metric(int(s.orders), 'Vendas novas'), metric(eur(s.ticket_cents), 'Ticket médio'), metric(int(s.refunds), 'Reembolsos')),
      card(h('div', { class: 'v2-row v2-mb' }, kinds, search),
        d.rows.length ? table(['Data', 'Cliente', 'Plano', 'Origem', 'Campanha', 'Criativo', 'País', N('Valor')], d.rows.map((o) => [
          dt(o.paid_at), o.name ?? o.email ?? '—', PLAN_NAMES[o.plan] ?? o.plan ?? '—', chip(o.last_touch?.utm_source ?? 'direto'),
          h('span', { class: 'muted' }, o.last_touch?.utm_campaign ?? '—'), h('span', { class: 'muted' }, o.last_touch?.utm_content ?? '—'), o.country ?? '—',
          o.refunded ? h('span', { class: 'v2-down' }, `${eur(o.amount_cents)} · reembolsada`) : eur(o.amount_cents)]), { onRow: (i) => openSale(d.rows[i].order_id) })
          : emptyEl('Nenhuma venda neste período')));
    if (params.open) openSale(params.open);
  });
}

async function openSale(id) {
  const drawer = document.querySelector('.v2-drawer') ?? document.body.appendChild(h('aside', { class: 'v2-drawer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Detalhes da venda' }));
  const close = () => drawer.classList.remove('open');
  drawer.replaceChildren(h('p', { class: 'muted' }, 'Carregando…'));
  drawer.classList.add('open');
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
  try {
    const d = await gapi(`/orders/${encodeURIComponent(id)}`);
    const o = d.order, t = o.last_touch ?? {}, f = o.first_touch ?? {};
    const dl = (pairs) => h('dl', { class: 'v2-dl' }, pairs.filter(([, v]) => v != null && v !== '').flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
    const DEST = { meta: 'Meta', tiktok: 'TikTok', customerio: 'E-mail' };
    drawer.replaceChildren(
      h('button', { type: 'button', class: 'v2-back', onclick: close }, '✕ Fechar'),
      h('h2', { class: 'v2-drawer__title' }, o.name ?? 'Cliente'), h('p', { class: 'muted' }, [o.email, o.country].filter(Boolean).join(' · ')),
      card(h('h3', {}, 'Compra'), dl([['Plano', PLAN_NAMES[o.plan] ?? o.plan], ['Tipo', o.kind === 'renewal' ? 'Renovação' : 'Primeira compra'], ['Valor', eur(o.amount_cents, o.currency)], ['Data', dt(o.paid_at)],
        ['Assinatura', d.subscription ? chip(d.subscription.status, d.subscription.status === 'active' ? 'up' : null) : '—'], ['Reembolsos', d.refunds.length ? d.refunds.map((r) => eur(r.amount_cents)).join(', ') : null]])),
      card(h('h3', {}, 'De onde veio (último clique)'), dl([['Origem', t.utm_source ?? 'direto'], ['Mídia', t.utm_medium], ['Campanha', t.utm_campaign], ['Conjunto', t.utm_term], ['Criativo', t.utm_content], ['Pixel (px)', t.px], ['Página de entrada', t.landing]])),
      card(h('h3', {}, 'Primeiro contato'), dl([['Origem', f.utm_source ?? 'direto'], ['Campanha', f.utm_campaign], ['Criativo', f.utm_content], ['Quando', f.at ? dt(f.at) : null]])),
      card(h('h3', {}, 'Funil'), dl([['Quiz', PROGRAM_NAMES[o.program_slug] ?? o.program_slug]])),
      card(h('h3', {}, 'Eventos enviados'), d.events.length
        ? dl(d.events.map((e) => [DEST[e.destination] ?? e.destination, h('span', {}, chip(e.status === 'sent' ? 'enviado' : e.status, e.status === 'sent' ? 'up' : e.status === 'failed' ? 'down' : null), e.pixel_name ? ` ${e.pixel_name}` : '')]))
        : h('p', { class: 'muted' }, 'Nenhum evento de compra na fila (sem consentimento de cookies ou pixel não configurado).')));
  } catch (err) { drawer.replaceChildren(h('button', { type: 'button', class: 'v2-back', onclick: close }, '✕ Fechar'), h('p', {}, err.message)); }
}

// ---------------------------------------------------------------- Traqueamento
const NETS = [['tiktok', 'TikTok Ads'], ['meta', 'Meta Ads'], ['google', 'Google Ads']];
// Marcas simplificadas (só para identificar a rede no painel).
const NET_LOGOS = {
  tiktok: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#000"/><path d="M15.6 5c.3 1.6 1.4 2.8 3 3v2.4a6 6 0 0 1-3-.9v4.8a4.6 4.6 0 1 1-4.6-4.6h.4v2.5a2.1 2.1 0 1 0 1.7 2.1V5z" fill="#25F4EE" transform="translate(-.6 -.4)"/><path d="M15.6 5c.3 1.6 1.4 2.8 3 3v2.4a6 6 0 0 1-3-.9v4.8a4.6 4.6 0 1 1-4.6-4.6h.4v2.5a2.1 2.1 0 1 0 1.7 2.1V5z" fill="#FE2C55" transform="translate(.6 .4)"/><path d="M15.6 5c.3 1.6 1.4 2.8 3 3v2.4a6 6 0 0 1-3-.9v4.8a4.6 4.6 0 1 1-4.6-4.6h.4v2.5a2.1 2.1 0 1 0 1.7 2.1V5z" fill="#fff"/></svg>',
  meta: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#0866FF"/><path d="M5 14.6c0-3 1.6-5.6 3.4-5.6 1.4 0 2.4 1.3 3.6 3.4 1.2-2.1 2.2-3.4 3.6-3.4 1.8 0 3.4 2.6 3.4 5.6 0 1.6-.7 2.4-1.7 2.4-1.3 0-2.3-1.6-3.3-3.3l-2-3.4m0 0C10.6 13 9.6 17 7 17c-1.2 0-2-1-2-2.4" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/></svg>',
  google: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect width="24" height="24" rx="6" fill="#fff"/><path d="M19 12.2c0-.5 0-1-.1-1.4H12v2.7h3.9a3.4 3.4 0 0 1-1.4 2.2v1.8h2.3c1.4-1.2 2.2-3 2.2-5.3z" fill="#4285F4"/><path d="M12 19c1.9 0 3.5-.6 4.7-1.7l-2.3-1.8c-.6.4-1.4.7-2.4.7-1.8 0-3.4-1.2-3.9-2.9H5.7v1.9A7 7 0 0 0 12 19z" fill="#34A853"/><path d="M8.1 13.3a4.2 4.2 0 0 1 0-2.6V8.8H5.7a7 7 0 0 0 0 6.4z" fill="#FBBC05"/><path d="M12 7.8c1 0 2 .4 2.7 1.1l2-2A7 7 0 0 0 5.7 8.8l2.4 1.9C8.6 9 10.2 7.8 12 7.8z" fill="#EA4335"/></svg>',
};
const netLogo = (net) => { const s = h('span', { class: 'v2-netlogo' }); s.innerHTML = NET_LOGOS[net] ?? ''; return s; };
/** Link pronto para colar no anúncio: quiz + UTMs da rede + px do pixel. */
const adLink = (net, code, appUrl) => `${appUrl}/quiz/sem-fumo?${UTM[net]}&px=${encodeURIComponent(code)}`;
function copyBtn(text, label = 'Copiar link') {
  return h('button', { type: 'button', class: 'v2-btn ghost sm', onclick: (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(text).then(() => toast('Link copiado'), () => prompt('Copie o link:', text));
  } }, label);
}
const UTM = {
  meta: 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}',
  tiktok: 'utm_source=tiktok&utm_medium=paid&utm_campaign=__CAMPAIGN_NAME__&utm_term=__AID_NAME__&utm_content=__CID_NAME__',
  google: 'utm_source=google&utm_medium=paid&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}',
};

export async function tracking(root, _f, params) {
  const net = NETS.some(([k]) => k === params.net) ? params.net : 'tiktok';
  root.replaceChildren(head('Traqueamento', 'Pixel no navegador + API de conversões no servidor. Cada perfil de anúncio tem o seu pixel.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi('/pixels');
    const list = d.rows.filter((p) => p.platform === net);
    const open = list.find((p) => p.key === params.px);
    const nav = h('nav', { class: 'v2-netnav', 'aria-label': 'Redes' }, NETS.map(([k, l]) => {
      const n = d.rows.filter((p) => p.platform === k).length;
      return h('a', { href: `#/tracking?net=${k}`, class: k === net ? 'on' : '' }, netLogo(k), l, h('small', {}, h('span', { class: `v2-dot${n ? '' : ' off'}` }), n ? `${n} ${n === 1 ? 'pixel' : 'pixels'}` : 'nenhum'));
    }));
    const panel = open || params.px === 'novo' ? pixelForm(net, open, d.appUrl) : pixelList(net, list, d.appUrl);
    body.replaceChildren(h('div', { class: 'v2-net' }, nav, panel), queueHealth());
  });
}

/** Saúde do envio aos pixels pelo servidor (fila com novas tentativas). */
function queueHealth() {
  const box = h('div');
  load(box, async () => {
    const o = await gapi('/outbox');
    const DEST = { meta: 'Meta', tiktok: 'TikTok', customerio: 'E-mail' };
    box.replaceChildren(h('div', { class: 'v2-grid v2-grid--4' },
      metric(int(o.sent_24h), 'Enviados em 24 h'), metric(int(o.pending), 'Na fila'), metric(int(o.failed), 'Com falha'),
      metric(o.match_quality?.meta == null ? '—' : `${o.match_quality.meta}/10`, 'Qualidade dos dados (Meta)')),
      (o.last_errors ?? []).length ? card(h('h3', {}, 'Últimos erros'), table(['Rede', 'Erro', 'Tentativas', 'Quando'],
        o.last_errors.map((e) => [DEST[e.destination] ?? e.destination, h('span', { class: 'v2-wrap' }, e.last_error), int(e.attempts), dt(e.created_at)]))) : null);
  });
  return h('div', { class: 'v2-mt' }, h('h2', { class: 'v2-h2' }, 'Envio pelo servidor'), box);
}

function pixelList(net, list, appUrl) {
  const add = state.canEdit ? h('button', { type: 'button', class: 'v2-btn', onclick: () => goto('tracking', { net, px: 'novo' }) }, '+ Adicionar pixel') : null;
  const title = h('h2', { class: 'v2-row v2-row--start' }, netLogo(net), NETS.find(([k]) => k === net)[1]);
  if (net === 'google') {
    return card(h('div', { class: 'v2-row' }, title, chip('em breve')),
      h('p', { class: 'muted' }, 'O envio de conversões para o Google Ads ainda não está ligado. Você já pode guardar os pixels aqui.'), list.length ? pixelTable(net, list, appUrl) : null, add);
  }
  return card(h('div', { class: 'v2-row' }, title, add),
    list.length ? pixelTable(net, list, appUrl) : emptyEl('Nenhum pixel', 'Adicione o pixel de cada perfil de anúncio (ex.: PIXEL PERFIL 10).'));
}

function pixelTable(net, list, appUrl) {
  return table(['Nome', 'Código no link (px)', 'ID', 'Status', N('Eventos 24 h'), 'Link'], list.map((p) => [
    h('span', {}, h('strong', {}, p.name), p.isDefault ? chip('padrão') : ''), h('code', {}, p.code), h('span', { class: 'mono muted' }, p.pixelId || '—'),
    p.active === false ? chip('pausado') : !p.hasToken ? chip('sem token', 'down') : chip('ativo', 'up'),
    int((p.events24h?.sent ?? 0) + (p.events24h?.pending ?? 0)) + (p.events24h?.failed ? ` · ${p.events24h.failed} com falha` : ''),
    p.code ? copyBtn(adLink(net, p.code, appUrl)) : h('span', { class: 'muted' }, 'sem código')]),
  { onRow: (i) => goto('tracking', { net, px: list[i].key }) });
}

function pixelForm(net, px, appUrl) {
  const v = px ?? { platform: net, active: true };
  const inp = (id, label, value, attrs = {}, help) => field(id, label, h('input', { class: 'v2-input', id, value: value ?? '', ...attrs }), help);
  const form = h('form', { class: 'v2-form' },
    inp('px-name', 'Nome', v.name, { required: true, maxlength: '60', placeholder: 'PIXEL PERFIL 10' }),
    inp('px-code', 'Código no link (px)', v.code, { maxlength: '40', placeholder: 'perfil10' }, 'Só letras e números. Vai no link do anúncio: &px=perfil10'),
    inp('px-id', 'ID do pixel', v.pixelId, { maxlength: '40', inputmode: 'numeric' }),
    inp('px-token', 'Token da API de conversões', v.hasToken ? '********' : '', { type: 'password', autocomplete: 'off' }, v.hasToken ? 'Já salvo. Deixe como está para manter.' : 'Gere no gerenciador de eventos da rede.'),
    inp('px-test', 'Código de evento de teste', v.testEventCode, { maxlength: '40', placeholder: 'TEST12345' }),
    h('label', { class: 'v2-check' }, h('input', { type: 'checkbox', id: 'px-default', checked: v.isDefault || null }), 'Pixel padrão (usado quando o link não traz px)'),
    h('label', { class: 'v2-check' }, h('input', { type: 'checkbox', id: 'px-active', checked: v.active !== false || null }), 'Ativo'));
  const val = (id) => form.querySelector(`#${id}`);
  const save = h('button', { type: 'submit', class: 'v2-btn' }, 'Salvar');
  form.append(h('div', { class: 'v2-row v2-mt' },
    h('div', { class: 'v2-row' }, save, px?.key?.startsWith('pixel:') && state.canEdit ? h('button', { type: 'button', class: 'v2-btn ghost', onclick: (e) => act(e.currentTarget, () => gapi('/pixels/test', { method: 'POST', body: { key: px.key } })).then((r) => r && toast(r.message, 8000)) }, 'Enviar evento de teste') : null),
    px?.key?.startsWith('pixel:') && state.canEdit ? h('button', { type: 'button', class: 'v2-btn ghost danger', onclick: (e) => { if (confirm(`Remover ${px.name}?`)) act(e.currentTarget, () => gapi(`/pixels/${encodeURIComponent(px.key)}`, { method: 'DELETE' }), 'Pixel removido', () => goto('tracking', { net })); } }, 'Remover') : null));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    act(save, () => gapi('/pixels', { method: 'PUT', body: { key: px?.key, platform: net, name: val('px-name').value, code: val('px-code').value, pixelId: val('px-id').value, accessToken: val('px-token').value,
      testEventCode: val('px-test').value, isDefault: val('px-default').checked, active: val('px-active').checked } }), 'Pixel salvo', () => goto('tracking', { net }));
  });
  if (!state.canEdit) form.querySelectorAll('input, button[type=submit]').forEach((x) => { x.disabled = true; });
  return card(h('button', { type: 'button', class: 'v2-back', onclick: () => goto('tracking', { net }) }, '← Pixels'), h('h2', {}, px ? px.name : 'Novo pixel'),
    px?.code ? h('div', { class: 'v2-row v2-row--start v2-mb' }, h('code', { class: 'v2-wrap muted' }, adLink(net, px.code, appUrl)), copyBtn(adLink(net, px.code, appUrl))) : null, form);
}

// ---------------------------------------------------------------- Leads
export async function leads(root, _f, params) {
  const search = h('input', { class: 'v2-input', type: 'search', placeholder: 'Buscar por nome ou e-mail', value: params.q ?? '', 'aria-label': 'Buscar lead' });
  search.addEventListener('change', () => goto('leads', { ...params, q: search.value.trim() }));
  root.replaceChildren(head('Leads', 'E-mails deixados no quiz. Quem já comprou aparece marcado.', periodSeg(params, (p) => goto('leads', p))), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi(`/leads?${new URLSearchParams({ days: params.days ?? '7', q: params.q ?? '' })}`);
    const bought = d.rows.filter((x) => x.bought).length;
    body.replaceChildren(
      h('div', { class: 'v2-grid v2-grid--3' }, metric(int(d.total), 'Leads no período'), metric(int(bought), 'Já compraram'), metric(int(d.total - bought), 'Ainda não compraram')),
      card(h('div', { class: 'v2-row v2-mb' }, search, csvButton('/leads', {}, { days: params.days ?? '7', q: params.q ?? '' })),
        d.rows.length ? table(['Quando', 'Nome', 'E-mail', 'País', 'Origem', 'Anúncio', 'Status'], d.rows.map((x) => [
          dt(x.created_at), x.first_name ?? '—', x.email, x.country ? segLabel('country', x.country) : '—', chip(x.utm_source ?? 'direto'),
          h('span', { class: 'muted v2-wrap' }, x.utm_content ?? '—'), x.bought ? chip('comprou', 'up') : chip('lead')]))
          : emptyEl('Nenhum lead neste período', 'Quando alguém deixar o e-mail no quiz, aparece aqui.')));
  });
}

// ---------------------------------------------------------------- Melhorias futuras
const TAGS = [['funil', 'Funil'], ['app', 'App'], ['email', 'E-mail'], ['trafego', 'Tráfego'], ['outro', 'Outro']];
export async function roadmap(root, _f, params) {
  const showDone = params.v === 'feitas';
  root.replaceChildren(head('Melhorias futuras', 'Anote cada ideia. Quando estiver pronta, marque como feita.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    let items = (await gapi('/roadmap')).items;
    const save = async (next, msg) => {
      try { items = (await gapi('/roadmap', { method: 'PUT', body: { items: next } })).items; if (msg) toast(msg); draw(); }
      catch (err) { toast(err.message); }
    };
    const title = h('input', { class: 'v2-input', id: 'rm-title', maxlength: '160', placeholder: 'Ex.: Adicionar order bump no checkout', required: true });
    const note = h('textarea', { class: 'v2-input', id: 'rm-note', rows: '2', maxlength: '2000', placeholder: 'Detalhes (opcional)' });
    const tag = h('select', { class: 'v2-input', id: 'rm-tag', 'aria-label': 'Área' }, TAGS.map(([v, l]) => h('option', { value: v }, l)));
    const add = h('form', { class: 'v2-card v2-rm-add', onsubmit: (e) => {
      e.preventDefault();
      if (!title.value.trim()) return;
      save([{ id: crypto.randomUUID(), title: title.value, note: note.value, tag: tag.value, done: false, created_at: new Date().toISOString() }, ...items], 'Melhoria anotada');
      title.value = ''; note.value = '';
    } }, h('div', { class: 'v2-rm-add__row' }, title, tag, h('button', { type: 'submit', class: 'v2-btn' }, 'Anotar')), note);
    const list = h('div', { class: 'v2-rm' });
    function draw() {
      const todo = items.filter((x) => !x.done), done = items.filter((x) => x.done);
      const shown = showDone ? done : todo;
      const move = (it, dir) => {
        const arr = [...items]; const i = arr.indexOf(it);
        let j = i + dir; while (arr[j] && arr[j].done !== it.done) j += dir; // pula as da outra lista
        if (!arr[j]) return;
        [arr[i], arr[j]] = [arr[j], arr[i]]; save(arr);
      };
      list.replaceChildren(
        h('div', { class: 'v2-seg v2-mb' },
          h('button', { type: 'button', class: showDone ? '' : 'on', onclick: () => goto('roadmap') }, `A fazer (${todo.length})`),
          h('button', { type: 'button', class: showDone ? 'on' : '', onclick: () => goto('roadmap', { v: 'feitas' }) }, `Feitas (${done.length})`)),
        shown.length ? h('ol', { class: 'v2-rm__list' }, shown.map((it, k) => h('li', { class: `v2-card v2-rm__item${it.done ? ' is-done' : ''}` },
          h('label', { class: 'v2-rm__check' }, h('input', { type: 'checkbox', checked: it.done || null, disabled: !state.canEdit || null, 'aria-label': `Marcar "${it.title}" como feita`,
            onchange: (e) => save(items.map((x) => (x === it ? { ...x, done: e.target.checked, done_at: e.target.checked ? new Date().toISOString() : null } : x)), e.target.checked ? 'Feito!' : null) })),
          h('div', { class: 'v2-rm__body' },
            h('p', { class: 'v2-rm__title' }, showDone ? null : h('span', { class: 'v2-rm__n' }, `${k + 1}.`), it.title, ' ', chip(TAGS.find(([v]) => v === it.tag)?.[1] ?? 'Outro')),
            it.note ? h('p', { class: 'v2-rm__note' }, it.note) : null,
            h('p', { class: 'v2-rm__meta' }, it.done && it.done_at ? `Feita em ${dt(it.done_at)}` : `Anotada em ${dt(it.created_at)}`)),
          state.canEdit ? h('div', { class: 'v2-rm__tools' },
            showDone ? null : h('button', { type: 'button', class: 'v2-icon-btn', title: 'Subir prioridade', 'aria-label': 'Subir prioridade', onclick: () => move(it, -1) }, '↑'),
            showDone ? null : h('button', { type: 'button', class: 'v2-icon-btn', title: 'Descer prioridade', 'aria-label': 'Descer prioridade', onclick: () => move(it, 1) }, '↓'),
            h('button', { type: 'button', class: 'v2-icon-btn', title: 'Editar', 'aria-label': 'Editar', onclick: () => {
              const t = prompt('Melhoria:', it.title); if (t == null || !t.trim()) return;
              const nt = prompt('Detalhes (opcional):', it.note ?? ''); if (nt == null) return;
              save(items.map((x) => (x === it ? { ...x, title: t, note: nt } : x)));
            } }, '✎'),
            h('button', { type: 'button', class: 'v2-icon-btn danger', title: 'Excluir', 'aria-label': 'Excluir', onclick: () => { if (confirm(`Excluir "${it.title}"?`)) save(items.filter((x) => x !== it), 'Excluída'); } }, '✕')) : null)))
          : emptyEl(showDone ? 'Nada concluído ainda' : 'Nenhuma melhoria anotada', showDone ? 'Marque uma melhoria como feita e ela vem para cá.' : 'Use o campo acima para anotar a primeira.'));
    }
    draw();
    body.replaceChildren(state.canEdit ? add : null, list);
  });
}

// ---------------------------------------------------------------- Configurações
export async function config(root) {
  root.replaceChildren(head('Configurações'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const all = (await gapi('/settings')).settings ?? {};
    const canSave = state.role === 'admin';
    const reload = () => config(root);
    const lang = h('select', { class: 'v2-input', id: 'cfg-lang' }, [['pt-BR', 'Português'], ['es', 'Español (em breve)'], ['en', 'English (em breve)']].map(([v, l]) => h('option', { value: v, disabled: v !== 'pt-BR' || null }, l)));
    const integr = GROUPS.filter((g) => !g.key.startsWith('pixels.'));
    body.replaceChildren(
      h('div', { class: 'v2-grid v2-grid--2' },
        staffSection(canSave),
        card(h('h2', {}, 'Painel'), h('div', { class: 'v2-form' }, field('cfg-lang', 'Idioma do painel', lang), field('cfg-cur', 'Moeda dos relatórios', h('input', { class: 'v2-input', id: 'cfg-cur', value: state.currency, readonly: true }), 'Definida no servidor (APP_CURRENCY).')),
          groupForm(integr.find((g) => g.key === 'timezone'), all, canSave, reload))),
      h('details', { class: 'v2-card v2-mt v2-details' }, h('summary', {}, 'Integrações e avançado'),
        h('div', { class: 'v2-grid v2-grid--2 v2-mt' }, integr.filter((g) => g.key !== 'timezone').map((g) => groupForm(g, all, canSave, reload)))));
  });
}
