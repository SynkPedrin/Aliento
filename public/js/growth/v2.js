// Painel v2: visão geral, funis (retenção tela a tela, estilo VTurb), vendas, traqueamento por pixel e configurações.
import { h, toast } from '../ui.js';
import { act, dt, emptyEl, eur, field, gapi, int, load, pct, state } from './lib.js';
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
        card(h('h2', {}, 'Funis hoje'), d.funnels.length
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
  root.replaceChildren(head('Funis', 'Cada quiz é um funil. Clique para ver a retenção tela a tela.', periodSeg(params, (p) => goto('funnels', p))), h('div', { 'data-body': '' }));
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

const DIM_TABS = [['', 'Retenção geral'], ['country', 'Países'], ['device', 'Dispositivos'], ['source', 'Origem do tráfego'], ['language', 'Idioma']];

export async function funnel(root, _f, params) {
  const program = params.p ?? 'sem-fumo';
  const back = h('button', { type: 'button', class: 'v2-back', onclick: () => goto('funnels', { days: params.days }) }, '← Funis');
  root.replaceChildren(head(PROGRAM_NAMES[program] ?? program, null, periodSeg(params, (p) => goto('funnel', p))), h('div', { 'data-body': '' }));
  root.querySelector('.v2-head > div').prepend(back);
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const qs = new URLSearchParams({ days: params.days ?? '7', ...(params.dim ? { dim: params.dim } : {}), ...(params.val ? { val: params.val } : {}) });
    const d = await gapi(`/funnels/${encodeURIComponent(program)}?${qs}`);
    state.currency = d.currency;
    const tabs = h('div', { class: 'v2-tabs', role: 'tablist' }, DIM_TABS.map(([k, l]) =>
      h('button', { type: 'button', role: 'tab', class: (params.dim ?? '') === k ? 'on' : '', 'aria-selected': String((params.dim ?? '') === k), onclick: () => goto('funnel', { p: program, days: params.days, dim: k }) }, l)));
    const segs = params.dim ? h('div', { class: 'v2-segs' }, d.segments.length ? d.segments.map((s) =>
      h('button', { type: 'button', class: `v2-chip v2-chip--btn${params.val === s.value ? ' on' : ''}`, onclick: () => goto('funnel', { p: program, days: params.days, dim: params.dim, val: params.val === s.value ? '' : s.value }) },
        `${s.value} · ${int(s.people)}`)) : h('span', { class: 'muted' }, 'Sem dados para separar.')) : null;
    const worst = d.screens.reduce((w, s) => (s.drop_pp > (w?.drop_pp ?? 0) ? s : w), null);
    const m = d.metrics;
    body.replaceChildren(
      card(tabs, segs, d.screens[0].people
        ? [retentionChart(d.screens), worst ? h('p', { class: 'v2-note' }, 'Maior queda: ', h('b', { class: 'v2-down' }, `${worst.label} · ${worst.title} (−${worst.drop_pp} p.p.)`)) : null]
        : emptyEl('Sem dados neste período', 'Quando alguém abrir o quiz, a curva aparece aqui.')),
      h('h2', { class: 'v2-h2' }, 'Métricas'),
      h('div', { class: 'v2-grid v2-grid--6' },
        metric(int(m.started), 'Iniciaram o quiz'), metric(int(m.finished), 'Chegaram à análise'), metric(int(m.leads), 'Leads (e-mail)'),
        metric(pct(m.lead_pct), 'Taxa de lead'), metric(int(m.offer), 'Viram a oferta'), metric(int(m.checkouts), 'Abriram checkout'),
        metric(int(m.purchases), 'Compras'), metric(pct(m.conversion_pct), 'Conversão'), metric(eur(m.revenue_cents), 'Faturamento'), metric(eur(m.ticket_cents), 'Ticket médio')),
      card(h('h2', {}, 'Tela a tela'), table(['Nº', 'Tela', N('Pessoas'), N('Retenção'), N('Saída nesta tela')],
        d.screens.map((s) => [s.label, h('span', { class: 'v2-wrap' }, s.title), int(s.people), pct(s.retention_pct), h('span', { class: s.drop_pp >= 5 ? 'v2-down' : '' }, s.drop_pp ? `−${s.drop_pp} p.p.` : '—')]))));
  });
}

/** Curva em degraus (estilo VTurb). No eixo: o número de cada pergunta (P1…) e as etapas finais. */
function retentionChart(screens) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000, H = 340, L = 44, R = 40, T = 14, B = 58, iw = W - L - R, ih = H - T - B, n = screens.length;
  const x = (i) => L + (i / (n - 1)) * iw, y = (v) => T + ih - (Math.min(100, v) / 100) * ih;
  const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'v2-ret', role: 'img', 'aria-label': 'Retenção por tela do quiz' });
  for (const v of [0, 20, 40, 60, 80, 100]) { svg.append(el('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'v2-ret__grid' })); svg.append(el('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'v2-ret__y' }, `${v}%`)); }
  let d = `M${x(0)},${y(screens[0].retention_pct)}`;
  screens.forEach((s, i) => { if (i) d += ` H${x(i)} V${y(s.retention_pct)}`; });
  svg.append(el('path', { d: `${d} V${y(0)} H${x(0)} Z`, class: 'v2-ret__area' }), el('path', { d, class: 'v2-ret__line' }));
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
  const dot = el('circle', { r: 4.5, class: 'v2-ret__dot', visibility: 'hidden' });
  svg.append(cross, dot);
  const tip = h('div', { class: 'v2-tip', hidden: true });
  const hit = el('rect', { x: L, y: T, width: iw, height: ih, fill: 'transparent' });
  svg.append(hit);
  const show = (evt) => {
    const r = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((((evt.clientX - r.left) / r.width) * W) - L) / iw * (n - 1))));
    const s = screens[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(s.retention_pct)); dot.setAttribute('visibility', 'visible');
    tip.replaceChildren(h('strong', {}, `${s.label} · ${s.title}`), h('span', {}, `${pct(s.retention_pct)} chegaram (${int(s.people)} pessoas)`), s.drop_pp ? h('span', { class: 'v2-down' }, `Saída aqui: −${s.drop_pp} p.p.`) : null);
    tip.hidden = false;
    tip.style.left = `${Math.min(Math.max((x(i) / W) * 100, 12), 88)}%`;
  };
  hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
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
const NETS = [['meta', 'Meta (Facebook / Instagram)'], ['tiktok', 'TikTok Ads'], ['google', 'Google Ads']];
const UTM = {
  meta: 'utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}',
  tiktok: 'utm_source=tiktok&utm_medium=paid&utm_campaign=__CAMPAIGN_NAME__&utm_term=__AID_NAME__&utm_content=__CID_NAME__',
  google: 'utm_source=google&utm_medium=paid&utm_campaign={campaignid}&utm_term={keyword}&utm_content={creative}',
};

export async function tracking(root, _f, params) {
  const net = NETS.some(([k]) => k === params.net) ? params.net : 'meta';
  root.replaceChildren(head('Traqueamento', 'Pixel no navegador + API de conversões no servidor. Cada perfil de anúncio tem o seu pixel.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi('/pixels');
    const list = d.rows.filter((p) => p.platform === net);
    const open = list.find((p) => p.key === params.px);
    const nav = h('nav', { class: 'v2-netnav', 'aria-label': 'Redes' }, NETS.map(([k, l]) => {
      const n = d.rows.filter((p) => p.platform === k).length;
      return h('a', { href: `#/tracking?net=${k}`, class: k === net ? 'on' : '' }, h('span', { class: `v2-dot${n ? '' : ' off'}` }), l, h('small', {}, n ? `${n} ${n === 1 ? 'pixel' : 'pixels'}` : 'nenhum'));
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
  if (net === 'google') {
    return card(h('div', { class: 'v2-row' }, h('h2', {}, 'Google Ads'), chip('em breve')),
      h('p', { class: 'muted' }, 'O envio de conversões para o Google Ads ainda não está ligado. Você já pode guardar os pixels aqui.'), list.length ? pixelTable(net, list) : null, add);
  }
  return card(h('div', { class: 'v2-row' }, h('h2', {}, NETS.find(([k]) => k === net)[1]), add),
    list.length ? pixelTable(net, list) : emptyEl('Nenhum pixel', 'Adicione o pixel de cada perfil de anúncio (ex.: PIXEL PERFIL 10).'),
    h('h3', { class: 'v2-mt' }, 'Link do anúncio'),
    h('p', { class: 'muted' }, 'Coloque nos parâmetros de URL do anúncio. Troque o px pelo código do pixel daquele perfil.'),
    h('input', { class: 'v2-input mono', readonly: true, value: `${UTM[net]}&px=CODIGO_DO_PIXEL`, onfocus: (e) => e.target.select(), 'aria-label': 'Parâmetros de URL' }),
    h('p', { class: 'v2-note' }, `Exemplo: ${appUrl}/test?utm_source=${net === 'meta' ? 'facebook' : net}&px=perfil10`));
}

function pixelTable(net, list) {
  return table(['Nome', 'Código no link (px)', 'ID', 'Status', N('Eventos 24 h')], list.map((p) => [
    h('span', {}, h('strong', {}, p.name), p.isDefault ? chip('padrão') : ''), h('code', {}, p.code), h('span', { class: 'mono muted' }, p.pixelId || '—'),
    p.active === false ? chip('pausado') : !p.hasToken ? chip('sem token', 'down') : chip('ativo', 'up'),
    int((p.events24h?.sent ?? 0) + (p.events24h?.pending ?? 0)) + (p.events24h?.failed ? ` · ${p.events24h.failed} com falha` : '')]),
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
    px?.code ? h('p', { class: 'v2-note' }, `Link do anúncio: ${appUrl}/test?…&px=${px.code}`) : null, form);
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
