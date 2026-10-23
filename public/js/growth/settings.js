// Tela 10: configurações (pixels, metas, IA, alertas, preços, equipe e saúde da fila de eventos).
import { h } from '../ui.js';
import { N, act, testMessage, dt, emptyEl, field, gapi, head, int, legend, load, pill, state, table, term } from './lib.js';

const MASK = '********';
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function set(o, path, v) {
  const ks = path.split('.');
  let c = o;
  ks.slice(0, -1).forEach((k) => { if (typeof c[k] !== 'object' || c[k] === null) c[k] = {}; c = c[k]; });
  c[ks.at(-1)] = v;
}

// type: text | secret | number | cents | bool | list
const PIXEL_FIELDS = (idHelp, tokHelp, testHelp) => [['pixelId', 'ID do pixel', 'text', idHelp], ['accessToken', 'Token de acesso da API de Conversões', 'secret', tokHelp], ['testEventCode', 'Código de eventos de teste', 'text', testHelp]];
const GROUPS = [
  { key: 'pixels.meta', title: 'Pixel do Meta', test: 'meta', intro: 'Envia as conversões do servidor para o Meta (API de Conversões), mesmo com bloqueadores de anúncios.',
    fields: PIXEL_FIELDS('Gerenciador de Eventos do Meta > Fontes de dados > seu pixel > Configurações. Só números.', 'Mesma tela do pixel > API de Conversões > Gerar token de acesso. Fica oculto após salvar.', 'Gerenciador de Eventos > Testar eventos (ex.: TEST12345). Use só durante os testes e apague depois.') },
  { key: 'pixels.tiktok', title: 'Pixel do TikTok', test: 'tiktok', intro: 'Envia as conversões do servidor para o TikTok (Events API).',
    fields: PIXEL_FIELDS('TikTok Ads Manager > Ativos > Eventos > Eventos da Web > seu pixel (Pixel ID).', 'Na configuração do pixel > Events API > Gerar token de acesso. Fica oculto após salvar.', 'Aba Testar eventos do pixel (ex.: TEST12345). Use só durante os testes e apague depois.') },
  { key: 'ads.meta', title: 'Conta de anúncios do Meta', test: 'ads', intro: 'Permite trazer gasto, campanhas e criativos do Meta para o painel.', fields: [['accountId', 'ID da conta de anúncios', 'text', 'Gerenciador de Anúncios > seletor de conta (formato act_123456789 ou só os números).'], ['accessToken', 'Token de acesso', 'secret', 'Token de usuário do sistema com a permissão ads_read, gerado no Gerenciador de Negócios.']] },
  { key: 'ads.tiktok', title: 'Conta de anúncios do TikTok', test: 'ads', intro: 'Permite trazer gasto, campanhas e criativos do TikTok para o painel.', fields: [['advertiserId', 'ID do anunciante', 'text', 'TikTok Ads Manager > canto superior direito, ao lado do nome da conta.'], ['accessToken', 'Token de acesso', 'secret', 'Gerado no TikTok for Business (Marketing API) com permissão de leitura de relatórios.']] },
  { key: 'customerio', title: 'Customer.io', test: 'customerio', intro: 'Ferramenta de e-mail: fluxos de boas-vindas, recuperação de carrinho e renovação.', fields: [['siteId', 'Site ID', 'text', 'Customer.io > Settings > Workspace Settings > API Credentials.'], ['apiKey', 'API key (Track)', 'secret', 'Na mesma tela: Track API Key.'], ['appApiKey', 'API key (App)', 'secret', 'Settings > API Credentials > App API Keys.'], ['webhookSecret', 'Segredo do webhook', 'secret', 'Chave de assinatura do webhook de relatórios (Reporting Webhooks).'], ['region', 'Região (eu ou us)', 'text', 'Região do seu workspace no Customer.io.']] },
  { key: 'anthropic', title: 'Anthropic (IA)', intro: 'Sem chave, a IA gera apenas relatórios automáticos por regras.', fields: [['apiKey', 'API key', 'secret', 'console.anthropic.com > API Keys.']] },
  { key: 'goals', title: 'Metas', intro: 'Referências que a IA e os alertas usam para julgar o desempenho.', fields: [['cac_max.default', 'CAC máximo (padrão)', 'cents', 'Valor na moeda principal.'], ['roas_min', 'ROAS mínimo', 'number'], ['daily_budget_cents', 'Orçamento diário', 'cents'], ['min_sample', 'Amostra mínima (conversões)', 'number', 'Abaixo disso, a IA marca confiança baixa e não automatiza.']] },
  { key: 'ai', title: 'Limites da IA', fields: [['limits.pause_cpa_multiple', 'Pausar se o CPA passar × a meta', 'number'], ['limits.pause_spend_multiple', 'Após gastar × a meta sem vendas', 'number'], ['limits.budget_max_step_pct', 'Aumento máximo de orçamento por dia (%)', 'number'], ['limits.daily_cap_cents', 'Teto diário de gasto', 'cents'],
    ['auto.promote_variant', 'Promover variantes A/B automaticamente', 'bool'], ['auto.email_variant', 'Variantes de e-mail automáticas', 'bool'], ['auto.creative_brief', 'Briefings de criativos automáticos', 'bool']] },
  { key: 'alerts', title: 'Alertas', fields: [['emails', 'E-mails de aviso (separados por vírgula)', 'list'], ['webhookUrl', 'Webhook (Slack, WhatsApp…)']] },
  { key: 'timezone', title: 'Fuso horário', fields: [['tz', 'Fuso horário (ex.: America/Sao_Paulo)']] },
];

function groupForm(g, all, canSave, reload) {
  const val = structuredClone(all[g.key] ?? {});
  const inputs = [];
  const controls = g.fields.map(([path, label, type = 'text', help], i) => {
    const id = `s-${g.key.replace(/\W/g, '')}-${i}`;
    const cur = get(val, path);
    let el;
    if (type === 'bool') { el = h('input', { type: 'checkbox', id, disabled: canSave ? null : '' }); el.checked = !!cur; }
    else if (type === 'secret') el = h('input', { class: 'input', id, type: 'password', autocomplete: 'new-password', disabled: canSave ? null : '', placeholder: cur === MASK ? 'Salvo (oculto). Digite para substituir.' : '', value: cur && cur !== MASK ? cur : '' });
    else if (type === 'number' || type === 'cents') el = h('input', { class: 'input', id, type: 'number', step: 'any', min: '0', disabled: canSave ? null : '', value: cur == null ? '' : type === 'cents' ? cur / 100 : cur });
    else el = h('input', { class: 'input', id, type: 'text', disabled: canSave ? null : '', value: type === 'list' ? (cur ?? []).join(', ') : (cur ?? '') });
    inputs.push([path, type, el, cur]);
    return type === 'bool' ? h('div', { class: 'field field--check' }, h('label', { class: 'check', for: id }, el, label)) : field(id, label, el, help);
  });
  const status = h('p', { class: 'help', role: 'status' });
  return h('form', { class: 'card', onsubmit: (e) => {
    e.preventDefault();
    for (const [path, type, el, cur] of inputs) {
      let v;
      if (type === 'bool') v = el.checked;
      else if (type === 'secret') v = el.value === '' ? (cur === MASK ? MASK : '') : el.value;
      else if (type === 'number') v = el.value === '' ? null : Number(el.value);
      else if (type === 'cents') v = el.value === '' ? null : Math.round(Number(el.value) * 100);
      else if (type === 'list') v = el.value.split(',').map((x) => x.trim()).filter(Boolean);
      else v = el.value.trim();
      set(val, path, v);
    }
    act(e.submitter, () => gapi(`/settings/${g.key}`, { method: 'PUT', body: val }), 'Configurações salvas', reload);
  } },
    h('h3', { class: 'gr-h3' }, g.title), g.intro ? h('p', { class: 'help' }, g.intro) : null, h('div', { class: 'form-grid' }, controls),
    canSave ? h('div', { class: 'actions-row' }, h('button', { class: 'btn btn--sm', type: 'submit' }, 'Salvar'),
      g.test ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async (e) => { const r = await act(e.currentTarget, () => gapi(`/settings/test/${g.test}`, { method: 'POST' })); if (r) { status.className = `help test-result ${r.ok ? 'is-ok' : 'is-high'}`; status.textContent = `${r.ok ? 'OK — conexão verificada' : 'Erro'}: ${testMessage(g.test, r)}`; } } }, 'Testar conexão') : null) : null, status);
}

function pricesForm(all, canSave, reload) {
  const cur = all.prices ?? {};
  const rows = Object.entries(cur);
  const simple = rows.every(([, v]) => typeof v === 'number');
  const area = h('textarea', { class: 'input code-input', id: 'prices-json', rows: '6', disabled: canSave ? null : '', spellcheck: 'false' }, JSON.stringify(cur, null, 2));
  return h('form', { class: 'card', onsubmit: (e) => {
    e.preventDefault();
    let v;
    try { v = JSON.parse(area.value); } catch { act(null, async () => { throw new Error('O JSON de preços não é válido.'); }); return; }
    act(e.submitter, () => gapi('/settings/prices', { method: 'PUT', body: v }), 'Preços salvos', reload);
  } }, h('h3', { class: 'gr-h3' }, 'Preços por país'),
  simple && rows.length ? table(['País', N('Preço')], rows.map(([c, v]) => [c, `${(v / 100).toFixed(2)}`]), 'Preços por país (valores na unidade principal)') : null,
  field('prices-json', 'Editar preços (JSON: país → valor em centavos)', area, 'A IA nunca aplica mudanças de preço automaticamente.'),
  canSave ? h('div', { class: 'actions-row' }, h('button', { class: 'btn btn--sm', type: 'submit' }, 'Salvar preços')) : null);
}

function staffSection(canAdmin) {
  const box = h('div');
  const render = () => load(box, async () => {
    const d = await gapi('/staff');
    const list = Array.isArray(d) ? d : d.staff ?? d.rows ?? [];
    const name = h('input', { class: 'input', id: 'st-name', autocomplete: 'off', maxlength: '80' });
    const email = h('input', { class: 'input', id: 'st-mail', type: 'email', required: '', autocomplete: 'off' });
    const pass = h('input', { class: 'input', id: 'st-pass', type: 'text', autocomplete: 'new-password', minlength: '10', placeholder: 'mín. 10 caracteres' });
    const role = h('select', { class: 'select', id: 'st-role' }, [['marketing', 'Marketing (edita)'], ['readonly', 'Somente leitura'], ['admin', 'Administrador']].map(([v, l]) => h('option', { value: v }, l)));
    box.replaceChildren(
      list.length ? table(['E-mail', 'Função', 'Cadastro', ''], list.map((s) => [s.email, pill({ admin: 'Administrador', marketing: 'Marketing', readonly: 'Somente leitura' }[s.role] ?? s.role), dt(s.created_at),
        canAdmin ? h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: (e) => { if (confirm(`Remover o acesso de ${s.email}?`)) act(e.currentTarget, () => gapi(`/staff/${s.user_id}`, { method: 'DELETE' }), 'Acesso removido', render); } }, 'Remover') : null]), 'Equipe') : emptyEl('Sem equipe'),
      canAdmin ? h('h4', { class: 'gr-h4 u-mt' }, 'Adicionar usuário') : null,
      canAdmin ? h('form', { class: 'form-grid', onsubmit: (e) => { e.preventDefault(); act(e.submitter, () => gapi('/staff', { method: 'POST', body: { name: name.value.trim(), email: email.value.trim(), password: pass.value, role: role.value } }), 'Usuário adicionado', render); } },
        field('st-name', 'Nome', name), field('st-mail', 'E-mail', email),
        field('st-pass', 'Senha inicial', pass, 'Só para quem ainda não tem conta. Envie à pessoa por um canal seguro.'),
        field('st-role', 'Função', role), h('div', { class: 'field' }, h('button', { class: 'btn btn--sm', type: 'submit' }, 'Adicionar'))) : null);
  });
  const sec = h('section', { class: 'card' }, h('h3', { class: 'gr-h3' }, 'Equipe e permissões'), box);
  render();
  return sec;
}

function outboxSection() {
  const box = h('div');
  load(box, async () => {
    const o = await gapi('/outbox');
    const mq = o.match_quality ?? {};
    box.replaceChildren(
      h('dl', { class: 'kv kv--4' }, ...[['Pendentes', int(o.pending)], ['Com falha', int(o.failed)], ['Enviados em 24 h', int(o.sent_24h)], [term('match', 'Qualidade Meta'), mq.meta == null ? '—' : `${mq.meta}/10`], [term('match', 'Qualidade TikTok'), mq.tiktok == null ? '—' : `${mq.tiktok}/10`]]
        .flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, b)])),
      o.pending > 0 && o.failed > 0 ? h('p', { class: 'notice' }, 'Há eventos com falha: revise as credenciais dos pixels.') : null,
      (o.last_errors ?? []).length ? h('div', { class: 'u-mt' }, h('h4', { class: 'gr-h4' }, 'Últimos erros'), h('ul', { class: 'list' }, o.last_errors.map((e) => h('li', {}, h('div', { class: 'list__main' }, h('p', { class: 'wrap' }, e.last_error ?? e.message ?? JSON.stringify(e)),
        h('p', { class: 'list__meta' }, [e.destination, e.event_name, dt(e.created_at ?? e.updated_at)].filter((x) => x && x !== '—').join(' · '))))))) : h('p', { class: 'muted' }, 'Sem erros recentes.'));
  });
  return h('section', { class: 'card' }, h('h3', { class: 'gr-h3' }, 'Saúde da fila de eventos'), h('p', { class: 'help' }, 'Eventos na fila de envio para Meta, TikTok e Customer.io.'), box);
}

export async function settings(root) {
  root.replaceChildren(head('Configurações', 'Pixels, tokens, contas de anúncios, metas, limites da IA, alertas, preços, equipe e saúde dos eventos.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  const reload = () => settings(root);
  await load(body, async () => {
    const d0 = await gapi('/settings');
    const all = d0.settings ?? d0;
    const canSave = state.role === 'admin';
    body.replaceChildren(
      canSave ? null : h('p', { class: 'notice' }, 'Sua função não permite alterar as configurações. Somente um administrador pode salvar mudanças.'),
      outboxSection(),
      h('div', { class: 'grid-2 u-mt' }, GROUPS.map((g) => groupForm(g, all, canSave, reload)), pricesForm(all, canSave, reload)),
      h('div', { class: 'u-mt' }, staffSection(canSave)),
      legend(['match']));
  });
}
