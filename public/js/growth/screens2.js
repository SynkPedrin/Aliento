// Telas 6-9: pessoas, e-mails, experimentos, IA.
import { h, toast } from '../ui.js';
import { N, act, csvButton, dec, dt, emptyEl, eur, field, genericTable, gapi, head, int, legend, load, pct, pill, qs, state, table, term } from './lib.js';

// ---------------------------------------------------------------- personas
export async function people(root, f, params) {
  const input = h('input', { class: 'input', id: 'pq', type: 'search', maxlength: '120', autocomplete: 'off', placeholder: 'E-mail (ou parte do e-mail)', value: params.q ?? '' });
  const results = h('div', { 'aria-live': 'polite' });
  const detail = h('div', { 'aria-live': 'polite' });
  root.replaceChildren(head('Pessoas', 'Busque por e-mail e consulte a linha do tempo. Exportar e excluir atendem ao direito de acesso e de exclusão (LGPD).'),
    h('form', { class: 'gr-search', role: 'search', onsubmit: (e) => { e.preventDefault(); search(); } },
      h('div', { class: 'field grow' }, h('label', { for: 'pq' }, 'Buscar pessoa'), input), h('button', { class: 'btn', type: 'submit' }, 'Buscar')),
    results, detail);
  async function search() {
    const q = input.value.trim();
    detail.replaceChildren();
    if (q.length < 2) { results.replaceChildren(emptyEl('Digite pelo menos 2 caracteres', 'Por privacidade, as pessoas só são listadas após uma busca.')); return; }
    await load(results, async () => {
      const { rows = [] } = await gapi(`/people?q=${encodeURIComponent(q)}`);
      results.replaceChildren(rows.length ? table(['E-mail', 'Tema', 'Idioma', 'Cadastro', 'Status', ''], rows.map((r) => [r.email, r.topic, r.language, dt(r.created_at), r.status ? pill(r.status) : '—',
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => open(r) }, 'Ver')]), 'Resultados') : emptyEl('Sem resultados', 'Nenhuma pessoa corresponde à busca.'));
    });
  }
  async function open(r) {
    await load(detail, async () => {
      const t = await gapi(`/people/${encodeURIComponent(r.key)}`);
      const sections = [['events', 'Eventos'], ['quiz', 'Respostas do quiz'], ['answers', 'Respostas do quiz'], ['emails', 'E-mails'], ['orders', 'Pedidos'], ['refunds', 'Reembolsos'], ['consents', 'Consentimentos']];
      const present = sections.filter(([k]) => Array.isArray(t[k]));
      const timeline = present.length ? present.map(([k, title]) => h('section', { class: 'u-mt' }, h('h3', { class: 'gr-h3' }, `${title} (${t[k].length})`), t[k].length ? genericTable(t[k], title) : h('p', { class: 'muted' }, 'Sem registros.')))
        : [genericTable(t.timeline ?? [], 'Linha do tempo')];
      const access = h('div', { 'aria-live': 'polite' });
      const support = t.person?.user_id && state.canEdit ? [
        h('button', { class: 'btn btn--sm', type: 'button', onclick: (e) => accessLink(e.currentTarget, r, access) }, 'Gerar link de acesso'),
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: (e) => changeEmail(e.currentTarget, r) }, 'Trocar e-mail'),
      ] : [];
      detail.replaceChildren(h('section', { class: 'card u-mt' },
        h('div', { class: 'gr-head' }, h('h2', { class: 'gr-h2' }, `Linha do tempo · ${r.email ?? r.key}`),
          h('div', { class: 'gr-actions' }, ...support,
            h('a', { class: 'btn btn--ghost btn--sm', href: `/api/growth/people/${encodeURIComponent(r.key)}/export`, download: '' }, 'Exportar dados (JSON)'),
            state.role === 'admin' ? h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: (e) => del(e.currentTarget, r) }, 'Excluir pessoa') : null)),
        access, ...timeline));
    });
  }
  // Suporte: link de uso único para a pessoa entrar e criar uma senha nova (vale ~1 hora).
  async function accessLink(btn, r, box) {
    await act(btn, () => gapi(`/people/${encodeURIComponent(r.key)}/access-link`, { method: 'POST' }), null, ({ email, link }) => {
      const input = h('input', { class: 'input', readonly: true, value: link, onfocus: (e) => e.target.select() });
      box.replaceChildren(h('div', { class: 'notice u-mt' },
        h('p', {}, `Link de acesso de ${email}. Envie para a pessoa: ao abrir, ela cria uma senha nova. Vale por cerca de 1 hora e só funciona uma vez.`),
        h('div', { class: 'gr-search' }, input, h('button', { class: 'btn btn--sm', type: 'button', onclick: () => navigator.clipboard.writeText(link).then(() => toast('Link copiado')) }, 'Copiar'))));
    });
  }
  async function changeEmail(btn, r) {
    const email = prompt(`Novo e-mail da conta (hoje: ${r.email ?? '—'}). A pessoa passa a entrar com ele, e os recibos da Stripe vão para ele.`)?.trim();
    if (!email) return;
    await act(btn, () => gapi(`/people/${encodeURIComponent(r.key)}/email`, { method: 'POST', body: { email } }), `E-mail trocado para ${email}`);
  }
  async function del(btn, r) {
    if (!confirm(`Todos os dados de ${r.email ?? r.key} serão excluídos (inclusive no Customer.io). Esta ação não pode ser desfeita. Continuar?`)) return;
    await act(btn, () => gapi(`/people/${encodeURIComponent(r.key)}`, { method: 'DELETE' }), 'Pessoa excluída', () => { detail.replaceChildren(); return search(); });
  }
  if (params.q) await search(); else results.replaceChildren(emptyEl('Busque uma pessoa', 'Digite um e-mail para ver o histórico.'));
}

// ---------------------------------------------------------------- e-mails
export async function emails(root, f) {
  root.replaceChildren(head('E-mails', 'Desempenho por fluxo, idioma e variante.', csvButton('/emails', f)), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi(`/emails${qs(f)}`);
    const flows = d.flows ?? [];
    const lang = (rows, cap) => (rows?.length ? genericTable(rows, cap) : h('p', { class: 'muted' }, 'Sem dados.'));
    body.replaceChildren(
      d.configured === false ? h('p', { class: 'notice' }, 'O Customer.io não está configurado: os dados de e-mail aparecerão quando você conectá-lo em Configurações.') : null,
      flows.length ? table(['Fluxo', N('Enviados'), N('Abertos'), N('Cliques'), N('Descadastros'), N('Conversões'), N('Receita'), N('Abertura'), N('Clique'), 'Detalhamento'],
        flows.map((r) => [r.flow, int(r.sent), int(r.opened), int(r.clicked), int(r.unsubscribed), int(r.converted), eur(r.revenue_cents), pct(r.open_rate), pct(r.click_rate),
          h('details', { class: 'inline-details' }, h('summary', {}, 'Idioma e variante'), h('h4', { class: 'gr-h4' }, 'Por idioma'), lang(r.by_language, `${r.flow} por idioma`), h('h4', { class: 'gr-h4' }, 'Por variante'), lang(r.by_variant, `${r.flow} por variante`))]), 'Fluxos de e-mail')
        : emptyEl('Sem envios', 'Ainda não há eventos de e-mail no período.'),
      h('h2', { class: 'gr-h2 u-mt' }, 'Catálogo de fluxos'),
      h('div', { class: 'grid-2' }, (d.catalog ?? []).map((c) => h('article', { class: 'card' }, h('h3', { class: 'gr-h3' }, c.name ?? c.flow ?? c.key),
        h('dl', { class: 'kv kv--2' }, ...Object.entries(c).filter(([k]) => !['name', 'flow', 'key'].includes(k)).flatMap(([k, v]) => [h('dt', {}, { trigger: 'Gatilho', sequence: 'Sequência', exit: 'Saída' }[k] ?? k),
          h('dd', { class: 'wrap' }, Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x.subject ?? x.name ?? JSON.stringify(x))).join(' → ') : typeof v === 'object' ? JSON.stringify(v) : String(v))]))))));
  });
}

// ---------------------------------------------------------------- experimentos
const EXP_STATUS = { draft: 'Rascunho', running: 'Em andamento', paused: 'Pausado', ended: 'Encerrado', won: 'Vencedor escolhido' };
export async function experiments(root, f) {
  root.replaceChildren(head('Experimentos', 'Testes A/B com significância de 95% e escolha do vencedor.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  const reload = () => experiments(root, f);
  await load(body, async () => {
    const d = await gapi('/experiments');
    const list = Array.isArray(d) ? d : d.experiments ?? d.rows ?? [];
    const form = state.canEdit ? h('details', { class: 'card u-mt' }, h('summary', { class: 'gr-h3' }, 'Novo experimento'), newForm(reload)) : null;
    body.replaceChildren(list.length ? h('div', { class: 'stack' }, list.map((e) => expCard(e, reload))) : emptyEl('Sem experimentos', 'Crie o primeiro para testar variantes do quiz, do preço ou de um e-mail.'), form, legend(['signif']));
  });
}
function newForm(reload) {
  const k = h('input', { class: 'input', id: 'ek', required: '', pattern: '[a-z0-9_\\-]+', maxlength: '60', placeholder: 'preco_anual_v2' });
  const n = h('input', { class: 'input', id: 'en', required: '', maxlength: '120' });
  const kind = h('select', { class: 'select', id: 'eknd' }, ['quiz', 'price', 'email', 'landing'].map((x) => h('option', { value: x }, { quiz: 'Quiz', price: 'Preço', email: 'E-mail', landing: 'Landing page' }[x])));
  const v = h('input', { class: 'input', id: 'ev', required: '', value: 'controle:50, variante_b:50' });
  const g = h('select', { class: 'select', id: 'eg' }, ['purchase', 'lead_created', 'checkout_started', 'plan_selected'].map((x) => h('option', { value: x }, x)));
  return h('form', { class: 'form-grid u-mt', onsubmit: (e) => {
    e.preventDefault();
    const variants = v.value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const [key, w] = s.split(':'); return { key: key.trim(), weight: Number(w) || 50 }; });
    if (variants.length < 2) return;
    act(e.submitter, () => gapi('/experiments', { method: 'POST', body: { key: k.value.trim(), name: n.value.trim(), kind: kind.value, variants, goal_event: g.value } }), 'Experimento criado', reload);
  } },
    field('ek', 'Chave', k), field('en', 'Nome', n), field('eknd', 'Tipo', kind), field('eg', 'Evento objetivo', g),
    field('ev', 'Variantes (chave:peso, separadas por vírgula)', v, 'Mínimo de duas. O peso é relativo.'),
    h('div', { class: 'field' }, h('button', { class: 'btn', type: 'submit' }, 'Criar experimento')));
}
function expCard(e, reload) {
  const holder = h('div');
  const status = h('span', {}, pill(EXP_STATUS[e.status] ?? e.status, e.status === 'running' ? 'ok' : e.status === 'won' ? 'ok' : null));
  const card = h('article', { class: 'card' },
    h('div', { class: 'gr-head' }, h('div', {}, h('h2', { class: 'gr-h3' }, e.name ?? e.key), h('p', { class: 'help' }, `${e.key} · ${e.kind ?? ''} · objetivo: ${e.goal_event ?? '—'}`)), status), holder);
  const loadStats = () => load(holder, async () => {
    const s = await gapi(`/experiments/${encodeURIComponent(e.key)}`);
    const vs = Array.isArray(s) ? s : s.variants ?? s.stats ?? [];
    const best = vs.reduce((a, b) => (b.rate > (a?.rate ?? -1) ? b : a), null);
    const winner = s.winner ?? e.winner;
    holder.replaceChildren(
      vs.length ? table(['Variante', N('Visitantes'), N('Conversões'), N('Taxa'), ''], vs.map((x) => [h('strong', {}, x.variant), int(x.visitors), int(x.conversions), pct(x.rate * (x.rate <= 1 ? 100 : 1)),
        [winner === x.variant ? pill('Vencedora', 'ok') : (best?.variant === x.variant ? pill('Na frente') : null),
          state.canEdit && e.status !== 'won' ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: (ev) => { if (confirm(`Promover «${x.variant}» como vencedora?`)) act(ev.currentTarget, () => gapi(`/experiments/${encodeURIComponent(e.key)}/promote`, { method: 'POST', body: { variant: x.variant } }), 'Variante promovida', reload); } }, 'Promover') : null]].map((c) => c)), 'Variantes') : emptyEl('Ainda sem dados'),
      h('p', { class: 'stat-line' }, term('signif'), ': ', s.significant ? pill('Significativo a 95%', 'ok') : pill('Ainda não significativo', 'warn'),
        s.p_value != null ? ` · p = ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 }).format(s.p_value)}` : '', s.min_sample ? ` · amostra mínima de ${int(s.min_sample)} por variante` : ''),
      state.canEdit ? h('div', { class: 'actions-row' }, ...['running', 'paused', 'ended'].filter((x) => x !== e.status && e.status !== 'won').map((x) => h('button', { class: 'btn btn--ghost btn--sm', type: 'button',
        onclick: (ev) => act(ev.currentTarget, () => gapi(`/experiments/${encodeURIComponent(e.key)}/status`, { method: 'POST', body: { status: x } }), 'Status atualizado', reload) }, { running: 'Iniciar / retomar', paused: 'Pausar', ended: 'Encerrar' }[x]))) : null);
  });
  loadStats();
  return card;
}

// ---------------------------------------------------------------- IA
const ACTION_KIND = { pause_ad: 'Pausar anúncio', scale_budget: 'Aumentar orçamento', promote_variant: 'Promover variante', email_variant: 'Variante de e-mail', creative_brief: 'Briefing de criativo', change_price: 'Alterar preço' };
const ACTION_STATUS = { proposed: 'Proposta', approved: 'Aprovada', executed: 'Executada', failed: 'Falhou', rejected: 'Recusada', undone: 'Desfeita' };
const KIND_REPORT = { monitor: 'Monitor', daily: 'Diário', weekly: 'Semanal' };

export async function ai(root, f, params) {
  const filt = { status: params.status ?? 'proposed', kind: params.kind ?? '' };
  root.replaceChildren(head('IA', 'Relatórios, ações propostas e perguntas aos dados. A IA nunca grava direto nas suas contas: tudo passa por aprovação ou regras.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  const actionsBox = h('div'); const reportsBox = h('div');
  await load(body, async () => {
    const st = await gapi('/ai/status');
    const sw = h('input', { type: 'checkbox', role: 'switch', id: 'killsw', checked: st.auto_enabled ? '' : null, disabled: state.canEdit ? null : '', 'aria-describedby': 'killhelp' });
    sw.checked = !!st.auto_enabled;
    sw.addEventListener('change', async () => {
      const want = sw.checked;
      const r = await act(null, () => gapi('/ai/kill-switch', { method: 'POST', body: { enabled: want } }), want ? 'Ações automáticas ativadas' : 'Ações automáticas desativadas');
      if (!r) sw.checked = !want;
    });
    const q = h('input', { class: 'input', id: 'askq', maxlength: '500', required: '', placeholder: 'Qual anúncio teve o melhor ROAS na semana passada?' });
    const ans = h('div', { 'aria-live': 'polite' });
    body.replaceChildren(
      h('section', { class: 'card' },
        h('div', { class: 'gr-head' }, h('div', {}, h('h2', { class: 'gr-h2' }, 'Chave geral'), h('p', { id: 'killhelp', class: 'help' }, 'Desligada, a IA apenas propõe; não executa nada por conta própria.'),
          h('p', {}, st.llm ? pill('Claude conectado', 'ok') : pill('Sem chave da Anthropic: relatórios automáticos por regras', 'warn'))),
          h('label', { class: 'switch' }, sw, h('span', {}, 'Ações automáticas'))),
        state.canEdit ? h('div', { class: 'actions-row' }, ['monitor', 'daily', 'weekly'].map((r) => h('button', { class: 'btn btn--ghost btn--sm', type: 'button',
          onclick: (e) => act(e.currentTarget, () => gapi('/ai/run', { method: 'POST', body: { routine: r } }), `Rotina «${KIND_REPORT[r]}» iniciada`, () => loadReports()) }, `Executar ${KIND_REPORT[r].toLowerCase()}`))) : null),
      h('section', { class: 'card u-mt' }, h('h2', { class: 'gr-h2' }, 'Pergunte aos dados'),
        h('form', { class: 'gr-search', onsubmit: async (e) => {
          e.preventDefault();
          ans.replaceChildren(h('p', { class: 'muted' }, 'Pensando…'));
          const r = await act(e.submitter, () => gapi('/ai/ask', { method: 'POST', body: { question: q.value.trim() } }));
          if (!r) { ans.replaceChildren(); return; }
          ans.replaceChildren(h('p', { class: 'prose' }, r.answer), r.sql ? h('details', { class: 'defs' }, h('summary', {}, 'SQL utilizado'), h('pre', { class: 'code' }, r.sql)) : null,
            r.rows?.length ? genericTable(r.rows.slice(0, 50), 'Resultado da consulta') : null);
        } }, h('div', { class: 'field grow' }, h('label', { for: 'askq' }, 'Sua pergunta'), q), h('button', { class: 'btn', type: 'submit' }, 'Perguntar')), ans),
      h('h2', { class: 'gr-h2 u-mt' }, 'Ações propostas'),
      h('div', { class: 'gr-filters-inline' }, h('div', { class: 'field' }, h('label', { for: 'astat' }, 'Status'),
        h('select', { class: 'select', id: 'astat', onchange: (e) => { filt.status = e.target.value; loadActions(); } }, [['proposed', 'Propostas'], ['executed', 'Executadas'], ['rejected', 'Recusadas'], ['failed', 'Com falha'], ['', 'Todas']].map(([v, l]) => h('option', { value: v, selected: v === filt.status ? '' : null }, l))))),
      actionsBox,
      h('h2', { class: 'gr-h2 u-mt' }, 'Relatórios'),
      h('div', { class: 'gr-filters-inline' }, h('div', { class: 'field' }, h('label', { for: 'rkind' }, 'Tipo'),
        h('select', { class: 'select', id: 'rkind', onchange: (e) => { filt.kind = e.target.value; loadReports(); } }, [['', 'Todos'], ['monitor', 'Monitor'], ['daily', 'Diário'], ['weekly', 'Semanal']].map(([v, l]) => h('option', { value: v, selected: v === filt.kind ? '' : null }, l))))),
      reportsBox);
    loadActions(); loadReports();
  });
  function loadActions() {
    return load(actionsBox, async () => {
      const d = await gapi(`/ai/actions${qs({ status: filt.status })}`);
      const rows = Array.isArray(d) ? d : d.actions ?? d.rows ?? [];
      actionsBox.replaceChildren(rows.length ? h('ul', { class: 'cards-list' }, rows.map((a) => actionCard(a, loadActions))) : emptyEl('Sem ações', 'Não há ações com este status.'));
    });
  }
  function loadReports() {
    return load(reportsBox, async () => {
      const d = await gapi(`/ai/reports${qs({ kind: filt.kind })}`);
      const rows = Array.isArray(d) ? d : d.reports ?? d.rows ?? [];
      reportsBox.replaceChildren(rows.length ? h('div', { class: 'stack' }, rows.map((r, i) => h('details', { class: 'card report', open: i === 0 ? '' : null },
        h('summary', {}, h('strong', {}, r.title), ' ', pill(KIND_REPORT[r.kind] ?? r.kind ?? 'Relatório'), ' ', r.llm === false ? pill('Regras') : null, h('span', { class: 'help' }, ` ${dt(r.created_at)}`)),
        h('p', { class: 'prose' }, r.body)))) : emptyEl('Sem relatórios', 'Nenhum relatório foi gerado ainda.'));
    });
  }
}
function actionCard(a, reload) {
  const conf = a.confidence;
  const run = (path, ok) => (e) => act(e.currentTarget, () => gapi(`/ai/actions/${a.id}/${path}`, { method: 'POST' }), ok, reload);
  const data = a.data && typeof a.data === 'object' ? Object.entries(a.data).filter(([, v]) => typeof v !== 'object') : [];
  return h('li', { class: 'card action' },
    h('div', { class: 'action__top' }, h('strong', {}, ACTION_KIND[a.kind] ?? a.kind), pill(ACTION_STATUS[a.status] ?? a.status, a.status === 'executed' ? 'ok' : a.status === 'failed' ? 'bad' : a.status === 'proposed' ? 'warn' : null),
      conf ? pill(`Confiança ${conf === 'low' ? 'baixa' : conf === 'high' ? 'alta' : 'média'}`, conf === 'low' ? 'warn' : null) : null),
    a.target || a.title ? h('p', { class: 'wrap' }, a.target ?? a.title) : null,
    h('p', { class: 'wrap' }, a.reason),
    data.length ? h('dl', { class: 'kv kv--2' }, data.flatMap(([k, v]) => [h('dt', {}, k.replace(/_/g, ' ')), h('dd', {}, String(v))])) : null,
    a.last_error ? h('p', { class: 'help is-high' }, a.last_error) : null,
    h('p', { class: 'help' }, dt(a.created_at)),
    state.canEdit ? h('div', { class: 'actions-row' },
      a.status === 'proposed' ? [h('button', { class: 'btn btn--sm', type: 'button', onclick: run('approve', 'Ação aprovada') }, 'Aprovar'), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: run('reject', 'Ação recusada') }, 'Recusar')] : null,
      a.status === 'executed' && a.undo_data !== null ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: run('undo', 'Ação desfeita') }, 'Desfazer') : null) : null);
}
