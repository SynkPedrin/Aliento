// Utilidades del panel Growth: formato, tablas, CSV, definiciones de métricas y estados.
import { api, h, setBusy, toast } from '../ui.js';

export const state = { currency: 'EUR', canEdit: false, role: 'readonly' };

const nf = new Intl.NumberFormat('pt-BR', { useGrouping: 'always' });
const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, useGrouping: 'always' });
export const int = (n) => (n == null ? '—' : nf.format(n));
export const dec = (n) => (n == null ? '—' : nf1.format(n));
export const pct = (n) => (n == null ? '—' : `${nf1.format(n)}%`);
export const mult = (n) => (n == null ? '—' : `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n)}×`);
export function eur(cents, currency = state.currency) {
  if (cents == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency, useGrouping: 'always', maximumFractionDigits: Math.abs(cents) >= 100000 ? 0 : 2 }).format(cents / 100);
}
export const dt = (iso) => (iso ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—');
export const day = (iso) => (iso ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso)) : '—');

// Definiciones visibles (tooltip + leyenda).
export const DEFS = {
  capture: ['Taxa de captura', 'Leads criados ÷ quizzes iniciados.'],
  funnel: ['Conversão do funil', 'Compras ÷ visitas únicas no período.'],
  cac: ['CAC', 'Custo de aquisição de cliente: gasto com anúncios ÷ novas compras.'],
  roas0: ['ROAS D0', 'Receita do mesmo dia da compra ÷ gasto.'],
  roas30: ['ROAS D30', 'Receita acumulada em 30 dias após a compra ÷ gasto.'],
  ltv: ['LTV', 'Receita líquida acumulada por pagante de uma coorte (descontados os reembolsos).'],
  cart: ['Carrinho abandonado', 'Checkout iniciado sem compra posterior.'],
  mrr: ['MRR', 'Receita recorrente mensal normalizada das assinaturas ativas.'],
  hook: ['Hook rate', 'Visualizações de 3 s ÷ impressões do vídeo.'],
  ctr: ['CTR', 'Cliques ÷ impressões.'],
  cpl: ['CPL', 'Custo por lead: gasto ÷ leads.'],
  match: ['Qualidade de correspondência', 'Campos do usuário enviados ao pixel (0 a 10); quanto maior, melhor a atribuição.'],
  fatigue: ['Fadiga', 'O CTR dos últimos 7 dias cai em relação aos 7 dias anteriores.'],
  signif: ['Significância', 'Teste z de duas proporções a 95% com amostra mínima.'],
};
export function term(key, label) {
  const [name, text] = DEFS[key];
  return h('span', { class: 'tip', tabindex: '0', title: `${name}: ${text}`, 'aria-label': `${label ?? name}. ${text}` }, label ?? name);
}
export function legend(keys) {
  return h('details', { class: 'defs' }, h('summary', {}, 'Definições das métricas'),
    h('dl', {}, keys.flatMap((k) => [h('dt', {}, DEFS[k][0]), h('dd', {}, DEFS[k][1])])));
}

/** Parámetros de filtros globales (hash), sin vacíos. */
export function qs(filters, extra = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v !== '' && v != null) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}
export const csvHref = (path, filters, extra = {}) => `/api/growth${path}${qs(filters, { ...extra, format: 'csv' })}`;
export const csvButton = (path, filters, extra) => h('a', { class: 'btn btn--ghost btn--sm', href: csvHref(path, filters, extra), download: '' }, 'Exportar CSV');

export function table(headers, rows, caption, { cls = '' } = {}) {
  return h('div', { class: 'table-wrap' }, h('table', { class: `table ${cls}` },
    h('caption', { class: 'sr-only' }, caption),
    h('thead', {}, h('tr', {}, headers.map((x) => h('th', { scope: 'col', class: x?.num ? 'num' : null }, x?.label ?? x)))),
    h('tbody', {}, rows.map((r) => h('tr', { class: r.cls }, (r.cells ?? r).map((c, i) => {
      const hd = headers[i];
      return h('td', { class: hd?.num ? 'num' : null, 'data-label': hd?.label ?? hd }, c?.nodeType ? c : (c ?? '—'));
    }))))));
}
export const N = (label) => ({ label, num: true });

export const stat = (label, value, sub, tone) => h('div', { class: `card stat${tone ? ` stat--${tone}` : ''}` },
  h('p', { class: 'stat__label' }, label), h('p', { class: 'stat__value' }, value), sub ? h('p', { class: 'stat__sub' }, sub) : null);

export const pill = (text, tone) => h('span', { class: `pill${tone === 'ok' ? ' pill--ok' : tone === 'warn' ? ' pill--warn' : tone === 'bad' ? ' pill--bad' : ''}` }, text);

export const loadingEl = () => h('div', { class: 'loading', role: 'status' }, h('div', { class: 'skeleton' }), h('span', { class: 'sr-only' }, 'Carregando'));
export const emptyEl = (title, text) => h('div', { class: 'empty-state' }, h('p', { class: 'empty-state__title' }, title), text ? h('p', { class: 'muted' }, text) : null);
export function errorEl(err, retry) {
  return h('div', { class: 'empty-state', role: 'alert' },
    h('p', { class: 'empty-state__title' }, 'Não foi possível carregar esta seção'),
    h('p', { class: 'muted' }, err.message),
    retry ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: retry }, 'Tentar novamente') : null);
}

/** Carga datos en `target` con estados cargando/error. */
export async function load(target, fn) {
  target.replaceChildren(loadingEl());
  try { await fn(); } catch (err) {
    if (err.status === 401 || err.status === 428) throw err;
    target.replaceChildren(errorEl(err, () => load(target, fn)));
  }
}

export const gapi = (path, opts) => api(`/api/growth${path}`, opts);

/** Acción con botón ocupado y aviso. */
export async function act(btn, fn, okMsg, after) {
  if (btn) setBusy(btn, true, 'Aguarde…');
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    await after?.(r);
    return r;
  } catch (err) {
    if (err.status === 401 || err.status === 428) { location.reload(); return null; }
    toast(err.message);
    return null;
  } finally { if (btn?.isConnected) setBusy(btn, false); }
}

export const field = (id, label, control, help) => h('div', { class: 'field' }, h('label', { for: id }, label), control, help ? h('p', { class: 'help' }, help) : null);
export const head = (title, intro, ...actions) => h('div', { class: 'gr-head' }, h('div', {}, h('h1', { class: 'gr-title' }, title), intro ? h('p', { class: 'muted' }, intro) : null), h('div', { class: 'gr-actions' }, actions));

/** Barra horizontal simple (valor 0..100). */
export function bar(value, label, tone) {
  const w = Math.max(0, Math.min(100, value ?? 0));
  return h('span', { class: `bar${tone ? ` bar--${tone}` : ''}`, role: 'img', 'aria-label': label ?? `${dec(w)}%` },
    h('span', { class: 'bar__fill', 'data-w': String(Math.round(w)) }));
}
/** Aplica anchos vía CSSOM (la CSP bloquea style inline pero no estas propiedades). */
export function applyBars(root) {
  root.querySelectorAll('.bar__fill[data-w]').forEach((f) => { f.style.width = `${f.dataset.w}%`; });
}

const LABELS = { id: 'ID', email: 'E-mail', status: 'Status', plan: 'Plano', currency: 'Moeda', country: 'País', source: 'Fonte', created_at: 'Data', day: 'Dia', date: 'Data',
  orders: 'Pedidos', amount_cents: 'Valor', net_cents: 'Líquido', gross_cents: 'Bruto', refunded_cents: 'Reembolsado', interval: 'Intervalo', language: 'Idioma', canceled_at: 'Cancelada em', current_period_end: 'Renovação', user_id: 'ID do usuário', topic: 'Tema', kind: 'Tipo', name: 'Nome', event: 'Evento', event_name: 'Evento', type: 'Tipo', provider: 'Provedor', destination: 'Destino', message: 'Mensagem', answer: 'Resposta', question: 'Pergunta', program: 'Programa', total: 'Total', count: 'Quantidade', granted: 'Concedido', updated_at: 'Atualizado em', variant: 'Variante', flow: 'Fluxo' };
const label = (k) => LABELS[k] ?? k.replace(/_cents$/, '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
function cell(k, v, row) {
  if (v == null || v === '') return '—';
  if (k.endsWith('_cents')) return eur(v, String(row.currency || state.currency).toUpperCase());
  if (k.endsWith('_at')) return dt(v);
  if (k === 'day' || k === 'date') return day(v);
  if (k.endsWith('_pct')) return pct(v);
  if (typeof v === 'number') return int(v);
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
/** Tabla genérica a partir de filas con claves arbitrarias (el contrato deja las columnas abiertas). */
export function genericTable(rows, caption, skip = []) {
  if (!rows?.length) return emptyEl('Sem dados', 'Não há registros neste período.');
  const keys = Object.keys(rows[0]).filter((k) => !skip.includes(k) && typeof rows[0][k] !== 'object');
  return table(keys.map((k) => (typeof rows[0][k] === 'number' ? N(label(k)) : label(k))), rows.map((r) => keys.map((k) => cell(k, r[k], r))), caption);
}

// replaceChildren(null) pintaría «null»: se ignoran los hijos vacíos en este panel.
const _rc = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...kids) { return _rc.apply(this, kids.flat().filter((k) => k != null && k !== false && k !== '')); };

/** Etapas do funil em português (o servidor envia o rótulo pela chave). */
export const STEP_LABELS = { visits: 'Visitas', quiz_started: 'Quiz iniciado', leads: 'E-mail capturado', plan_viewed: 'Plano visto', plan_selected: 'Plano escolhido', checkouts: 'Checkout aberto', purchases: 'Compra', activated: 'Primeiro acesso ao app' };

/** Mensagem do teste de conexão em português (o servidor pode responder em outro idioma). */
export function testMessage(what, r) {
  const m = String(r?.message ?? '');
  if (/^Customer\.io configurado/i.test(m)) return 'Customer.io configurado.';
  if (/^Customer\.io sin configurar/i.test(m)) return 'Customer.io não configurado.';
  const p = m.match(/^Meta: (configurado|sin configurar) · TikTok: (configurado|sin configurar)/);
  if (p) return `Meta: ${p[1] === 'configurado' ? 'configurado' : 'não configurado'} · TikTok: ${p[2] === 'configurado' ? 'configurado' : 'não configurado'}`;
  const px = m.match(/^Pixel (\S+) y token guardados/);
  if (px) return `Pixel ${px[1]} e token salvos. Use o código de eventos de teste para verificar no Gerenciador de Eventos.`;
  if (/^Falta el ID del pixel o el token/i.test(m)) return 'Falta o ID do pixel ou o token de acesso.';
  if (/[ñ¿¡]|ción\b|\b(sin|falta|error|configurad[oa])\b/i.test(m)) return r?.ok ? 'Conexão verificada.' : 'A conexão falhou. Revise as credenciais e tente novamente.';
  return m;
}

/** Suporte de acesso de uma conta: link para criar senha nova e troca de e-mail. Devolve { buttons, box }. */
export function supportActions(userId, currentEmail, onEmail) {
  const base = `/users/${encodeURIComponent(userId)}`;
  const box = h('div', { 'aria-live': 'polite' });
  const link = (btn) => act(btn, () => gapi(`${base}/access-link`, { method: 'POST' }), null, ({ email, link: url }) => {
    const input = h('input', { class: 'input', readonly: true, value: url, onfocus: (e) => e.target.select() });
    box.replaceChildren(h('div', { class: 'notice u-mt' },
      h('p', {}, `Link de acesso de ${email}. Envie para a pessoa: ao abrir, ela cria uma senha nova. Vale por cerca de 1 hora e só funciona uma vez.`),
      h('div', { class: 'gr-search' }, input, h('button', { class: 'btn btn--sm', type: 'button', onclick: () => navigator.clipboard.writeText(url).then(() => toast('Link copiado')) }, 'Copiar'))));
  });
  const email = async (btn) => {
    const next = prompt(`Novo e-mail da conta (hoje: ${currentEmail ?? '—'}). A pessoa passa a entrar com ele, e os recibos da Stripe vão para ele.`)?.trim();
    if (next) await act(btn, () => gapi(`${base}/email`, { method: 'POST', body: { email: next } }), `E-mail trocado para ${next}`, (r) => onEmail?.(r.email));
  };
  const buttons = state.canEdit ? [
    h('button', { class: 'btn btn--sm', type: 'button', onclick: (e) => link(e.currentTarget) }, 'Gerar link de acesso'),
    h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: (e) => email(e.currentTarget) }, 'Trocar e-mail'),
  ] : [];
  return { buttons, box };
}
