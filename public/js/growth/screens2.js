// Pantallas 6-9: personas, e-mails, experimentos, IA.
import { h } from '../ui.js';
import { N, act, csvButton, dec, dt, emptyEl, eur, field, genericTable, gapi, head, int, legend, load, pct, pill, qs, state, table, term } from './lib.js';

// ---------------------------------------------------------------- personas
export async function people(root, f, params) {
  const input = h('input', { class: 'input', id: 'pq', type: 'search', maxlength: '120', autocomplete: 'off', placeholder: 'Correo (o parte del correo)', value: params.q ?? '' });
  const results = h('div', { 'aria-live': 'polite' });
  const detail = h('div', { 'aria-live': 'polite' });
  root.replaceChildren(head('Personas', 'Busca por correo y revisa la línea de tiempo. Exportar y eliminar siguen el derecho de acceso y supresión.'),
    h('form', { class: 'gr-search', role: 'search', onsubmit: (e) => { e.preventDefault(); search(); } },
      h('div', { class: 'field grow' }, h('label', { for: 'pq' }, 'Buscar persona'), input), h('button', { class: 'btn', type: 'submit' }, 'Buscar')),
    results, detail);
  async function search() {
    const q = input.value.trim();
    detail.replaceChildren();
    if (q.length < 2) { results.replaceChildren(emptyEl('Escribe al menos 2 caracteres', 'Por privacidad no se listan personas sin una búsqueda.')); return; }
    await load(results, async () => {
      const { rows = [] } = await gapi(`/people?q=${encodeURIComponent(q)}`);
      results.replaceChildren(rows.length ? table(['Correo', 'Tema', 'Idioma', 'Alta', 'Estado', ''], rows.map((r) => [r.email, r.topic, r.language, dt(r.created_at), r.status ? pill(r.status) : '—',
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => open(r) }, 'Ver')]), 'Resultados') : emptyEl('Sin resultados', 'Ninguna persona coincide con la búsqueda.'));
    });
  }
  async function open(r) {
    await load(detail, async () => {
      const t = await gapi(`/people/${encodeURIComponent(r.key)}`);
      const sections = [['events', 'Eventos'], ['quiz', 'Respuestas del cuestionario'], ['answers', 'Respuestas del cuestionario'], ['emails', 'E-mails'], ['orders', 'Pedidos'], ['refunds', 'Reembolsos'], ['consents', 'Consentimientos']];
      const present = sections.filter(([k]) => Array.isArray(t[k]));
      const timeline = present.length ? present.map(([k, title]) => h('section', { class: 'u-mt' }, h('h3', { class: 'gr-h3' }, `${title} (${t[k].length})`), t[k].length ? genericTable(t[k], title) : h('p', { class: 'muted' }, 'Sin registros.')))
        : [genericTable(t.timeline ?? [], 'Línea de tiempo')];
      detail.replaceChildren(h('section', { class: 'card u-mt' },
        h('div', { class: 'gr-head' }, h('h2', { class: 'gr-h2' }, `Línea de tiempo · ${r.email ?? r.key}`),
          h('div', { class: 'gr-actions' },
            h('a', { class: 'btn btn--ghost btn--sm', href: `/api/growth/people/${encodeURIComponent(r.key)}/export`, download: '' }, 'Exportar datos (JSON)'),
            state.role === 'admin' ? h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: (e) => del(e.currentTarget, r) }, 'Eliminar persona') : null)),
        ...timeline));
    });
  }
  async function del(btn, r) {
    if (!confirm(`Se eliminarán todos los datos de ${r.email ?? r.key} (también en Customer.io). Esta acción no se puede deshacer. ¿Continuar?`)) return;
    await act(btn, () => gapi(`/people/${encodeURIComponent(r.key)}`, { method: 'DELETE' }), 'Persona eliminada', () => { detail.replaceChildren(); return search(); });
  }
  if (params.q) await search(); else results.replaceChildren(emptyEl('Busca una persona', 'Introduce un correo para ver su historial.'));
}

// ---------------------------------------------------------------- e-mails
export async function emails(root, f) {
  root.replaceChildren(head('E-mails', 'Rendimiento por flujo, idioma y variante.', csvButton('/emails', f)), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  await load(body, async () => {
    const d = await gapi(`/emails${qs(f)}`);
    const flows = d.flows ?? [];
    const lang = (rows, cap) => (rows?.length ? genericTable(rows, cap) : h('p', { class: 'muted' }, 'Sin datos.'));
    body.replaceChildren(
      d.configured === false ? h('p', { class: 'notice' }, 'Customer.io no está configurado: los datos de e-mail aparecerán al conectarlo en Configuración.') : null,
      flows.length ? table(['Flujo', N('Enviados'), N('Abiertos'), N('Clics'), N('Bajas'), N('Conversiones'), N('Ingresos'), N('Apertura'), N('Clic'), 'Desglose'],
        flows.map((r) => [r.flow, int(r.sent), int(r.opened), int(r.clicked), int(r.unsubscribed), int(r.converted), eur(r.revenue_cents), pct(r.open_rate), pct(r.click_rate),
          h('details', { class: 'inline-details' }, h('summary', {}, 'Idioma y variante'), h('h4', { class: 'gr-h4' }, 'Por idioma'), lang(r.by_language, `${r.flow} por idioma`), h('h4', { class: 'gr-h4' }, 'Por variante'), lang(r.by_variant, `${r.flow} por variante`))]), 'Flujos de e-mail')
        : emptyEl('Sin envíos', 'Todavía no hay eventos de e-mail en el periodo.'),
      h('h2', { class: 'gr-h2 u-mt' }, 'Catálogo de flujos'),
      h('div', { class: 'grid-2' }, (d.catalog ?? []).map((c) => h('article', { class: 'card' }, h('h3', { class: 'gr-h3' }, c.name ?? c.flow ?? c.key),
        h('dl', { class: 'kv kv--2' }, ...Object.entries(c).filter(([k]) => !['name', 'flow', 'key'].includes(k)).flatMap(([k, v]) => [h('dt', {}, { trigger: 'Gatillo', sequence: 'Secuencia', exit: 'Salida' }[k] ?? k),
          h('dd', { class: 'wrap' }, Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x.subject ?? x.name ?? JSON.stringify(x))).join(' → ') : typeof v === 'object' ? JSON.stringify(v) : String(v))]))))));
  });
}

// ---------------------------------------------------------------- experimentos
const EXP_STATUS = { draft: 'Borrador', running: 'En curso', paused: 'Pausado', ended: 'Terminado', won: 'Ganador elegido' };
export async function experiments(root, f) {
  root.replaceChildren(head('Experimentos', 'Pruebas A/B con significancia al 95 % y elección de ganador.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  const reload = () => experiments(root, f);
  await load(body, async () => {
    const d = await gapi('/experiments');
    const list = Array.isArray(d) ? d : d.experiments ?? d.rows ?? [];
    const form = state.canEdit ? h('details', { class: 'card u-mt' }, h('summary', { class: 'gr-h3' }, 'Nuevo experimento'), newForm(reload)) : null;
    body.replaceChildren(list.length ? h('div', { class: 'stack' }, list.map((e) => expCard(e, reload))) : emptyEl('Sin experimentos', 'Crea el primero para probar variantes del cuestionario, del precio o de un e-mail.'), form, legend(['signif']));
  });
}
function newForm(reload) {
  const k = h('input', { class: 'input', id: 'ek', required: '', pattern: '[a-z0-9_\\-]+', maxlength: '60', placeholder: 'precio_anual_v2' });
  const n = h('input', { class: 'input', id: 'en', required: '', maxlength: '120' });
  const kind = h('select', { class: 'select', id: 'eknd' }, ['quiz', 'price', 'email', 'landing'].map((x) => h('option', { value: x }, { quiz: 'Cuestionario', price: 'Precio', email: 'E-mail', landing: 'Landing' }[x])));
  const v = h('input', { class: 'input', id: 'ev', required: '', value: 'control:50, variante_b:50' });
  const g = h('select', { class: 'select', id: 'eg' }, ['purchase', 'lead_created', 'checkout_started', 'plan_selected'].map((x) => h('option', { value: x }, x)));
  return h('form', { class: 'form-grid u-mt', onsubmit: (e) => {
    e.preventDefault();
    const variants = v.value.split(',').map((s) => s.trim()).filter(Boolean).map((s) => { const [key, w] = s.split(':'); return { key: key.trim(), weight: Number(w) || 50 }; });
    if (variants.length < 2) return;
    act(e.submitter, () => gapi('/experiments', { method: 'POST', body: { key: k.value.trim(), name: n.value.trim(), kind: kind.value, variants, goal_event: g.value } }), 'Experimento creado', reload);
  } },
    field('ek', 'Clave', k), field('en', 'Nombre', n), field('eknd', 'Tipo', kind), field('eg', 'Evento objetivo', g),
    field('ev', 'Variantes (clave:peso, separadas por comas)', v, 'Mínimo dos. El peso es relativo.'),
    h('div', { class: 'field' }, h('button', { class: 'btn', type: 'submit' }, 'Crear experimento')));
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
      vs.length ? table(['Variante', N('Visitantes'), N('Conversiones'), N('Tasa'), ''], vs.map((x) => [h('strong', {}, x.variant), int(x.visitors), int(x.conversions), pct(x.rate * (x.rate <= 1 ? 100 : 1)),
        [winner === x.variant ? pill('Ganador', 'ok') : (best?.variant === x.variant ? pill('Va ganando') : null),
          state.canEdit && e.status !== 'won' ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: (ev) => { if (confirm(`¿Promover «${x.variant}» como ganadora?`)) act(ev.currentTarget, () => gapi(`/experiments/${encodeURIComponent(e.key)}/promote`, { method: 'POST', body: { variant: x.variant } }), 'Variante promovida', reload); } }, 'Promover') : null]].map((c) => c)), 'Variantes') : emptyEl('Sin datos todavía'),
      h('p', { class: 'stat-line' }, term('signif'), ': ', s.significant ? pill('Significativo al 95 %', 'ok') : pill('No significativo todavía', 'warn'),
        s.p_value != null ? ` · p = ${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 4 }).format(s.p_value)}` : '', s.min_sample ? ` · muestra mínima ${int(s.min_sample)} por variante` : ''),
      state.canEdit ? h('div', { class: 'actions-row' }, ...['running', 'paused', 'ended'].filter((x) => x !== e.status && e.status !== 'won').map((x) => h('button', { class: 'btn btn--ghost btn--sm', type: 'button',
        onclick: (ev) => act(ev.currentTarget, () => gapi(`/experiments/${encodeURIComponent(e.key)}/status`, { method: 'POST', body: { status: x } }), 'Estado actualizado', reload) }, { running: 'Iniciar / reanudar', paused: 'Pausar', ended: 'Terminar' }[x]))) : null);
  });
  loadStats();
  return card;
}

// ---------------------------------------------------------------- IA
const ACTION_KIND = { pause_ad: 'Pausar anuncio', scale_budget: 'Subir presupuesto', promote_variant: 'Promover variante', email_variant: 'Variante de e-mail', creative_brief: 'Brief de creativo', change_price: 'Cambiar precio' };
const ACTION_STATUS = { proposed: 'Propuesta', approved: 'Aprobada', executed: 'Ejecutada', failed: 'Fallida', rejected: 'Recusada', undone: 'Deshecha' };
const KIND_REPORT = { monitor: 'Monitor', daily: 'Diario', weekly: 'Semanal' };

export async function ai(root, f, params) {
  const filt = { status: params.status ?? 'proposed', kind: params.kind ?? '' };
  root.replaceChildren(head('IA', 'Informes, acciones propuestas y preguntas a los datos. La IA nunca escribe directo en tus cuentas: todo pasa por aprobación o reglas.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  const actionsBox = h('div'); const reportsBox = h('div');
  await load(body, async () => {
    const st = await gapi('/ai/status');
    const sw = h('input', { type: 'checkbox', role: 'switch', id: 'killsw', checked: st.auto_enabled ? '' : null, disabled: state.canEdit ? null : '', 'aria-describedby': 'killhelp' });
    sw.checked = !!st.auto_enabled;
    sw.addEventListener('change', async () => {
      const want = sw.checked;
      const r = await act(null, () => gapi('/ai/kill-switch', { method: 'POST', body: { enabled: want } }), want ? 'Acciones automáticas activadas' : 'Acciones automáticas desactivadas');
      if (!r) sw.checked = !want;
    });
    const q = h('input', { class: 'input', id: 'askq', maxlength: '500', required: '', placeholder: '¿Qué anuncio tuvo mejor ROAS la semana pasada?' });
    const ans = h('div', { 'aria-live': 'polite' });
    body.replaceChildren(
      h('section', { class: 'card' },
        h('div', { class: 'gr-head' }, h('div', {}, h('h2', { class: 'gr-h2' }, 'Interruptor general'), h('p', { id: 'killhelp', class: 'help' }, 'Apagado, la IA solo propone; no ejecuta nada por su cuenta.'),
          h('p', {}, st.llm ? pill('Claude conectado', 'ok') : pill('Sin clave de Anthropic: informes automáticos por reglas', 'warn'))),
          h('label', { class: 'switch' }, sw, h('span', {}, 'Acciones automáticas'))),
        state.canEdit ? h('div', { class: 'actions-row' }, ['monitor', 'daily', 'weekly'].map((r) => h('button', { class: 'btn btn--ghost btn--sm', type: 'button',
          onclick: (e) => act(e.currentTarget, () => gapi('/ai/run', { method: 'POST', body: { routine: r } }), `Rutina «${KIND_REPORT[r]}» lanzada`, () => loadReports()) }, `Ejecutar ${KIND_REPORT[r].toLowerCase()}`))) : null),
      h('section', { class: 'card u-mt' }, h('h2', { class: 'gr-h2' }, 'Pregunta a los datos'),
        h('form', { class: 'gr-search', onsubmit: async (e) => {
          e.preventDefault();
          ans.replaceChildren(h('p', { class: 'muted' }, 'Pensando…'));
          const r = await act(e.submitter, () => gapi('/ai/ask', { method: 'POST', body: { question: q.value.trim() } }));
          if (!r) { ans.replaceChildren(); return; }
          ans.replaceChildren(h('p', { class: 'prose' }, r.answer), r.sql ? h('details', { class: 'defs' }, h('summary', {}, 'SQL utilizado'), h('pre', { class: 'code' }, r.sql)) : null,
            r.rows?.length ? genericTable(r.rows.slice(0, 50), 'Resultado de la consulta') : null);
        } }, h('div', { class: 'field grow' }, h('label', { for: 'askq' }, 'Tu pregunta'), q), h('button', { class: 'btn', type: 'submit' }, 'Preguntar')), ans),
      h('h2', { class: 'gr-h2 u-mt' }, 'Acciones propuestas'),
      h('div', { class: 'gr-filters-inline' }, h('div', { class: 'field' }, h('label', { for: 'astat' }, 'Estado'),
        h('select', { class: 'select', id: 'astat', onchange: (e) => { filt.status = e.target.value; loadActions(); } }, [['proposed', 'Propuestas'], ['executed', 'Ejecutadas'], ['rejected', 'Recusadas'], ['failed', 'Fallidas'], ['', 'Todas']].map(([v, l]) => h('option', { value: v, selected: v === filt.status ? '' : null }, l))))),
      actionsBox,
      h('h2', { class: 'gr-h2 u-mt' }, 'Informes'),
      h('div', { class: 'gr-filters-inline' }, h('div', { class: 'field' }, h('label', { for: 'rkind' }, 'Tipo'),
        h('select', { class: 'select', id: 'rkind', onchange: (e) => { filt.kind = e.target.value; loadReports(); } }, [['', 'Todos'], ['monitor', 'Monitor'], ['daily', 'Diario'], ['weekly', 'Semanal']].map(([v, l]) => h('option', { value: v, selected: v === filt.kind ? '' : null }, l))))),
      reportsBox);
    loadActions(); loadReports();
  });
  function loadActions() {
    return load(actionsBox, async () => {
      const d = await gapi(`/ai/actions${qs({ status: filt.status })}`);
      const rows = Array.isArray(d) ? d : d.actions ?? d.rows ?? [];
      actionsBox.replaceChildren(rows.length ? h('ul', { class: 'cards-list' }, rows.map((a) => actionCard(a, loadActions))) : emptyEl('Sin acciones', 'No hay acciones con este estado.'));
    });
  }
  function loadReports() {
    return load(reportsBox, async () => {
      const d = await gapi(`/ai/reports${qs({ kind: filt.kind })}`);
      const rows = Array.isArray(d) ? d : d.reports ?? d.rows ?? [];
      reportsBox.replaceChildren(rows.length ? h('div', { class: 'stack' }, rows.map((r, i) => h('details', { class: 'card report', open: i === 0 ? '' : null },
        h('summary', {}, h('strong', {}, r.title), ' ', pill(KIND_REPORT[r.kind] ?? r.kind ?? 'Informe'), ' ', r.llm === false ? pill('Reglas') : null, h('span', { class: 'help' }, ` ${dt(r.created_at)}`)),
        h('p', { class: 'prose' }, r.body)))) : emptyEl('Sin informes', 'Aún no se ha generado ningún informe.'));
    });
  }
}
function actionCard(a, reload) {
  const conf = a.confidence;
  const run = (path, ok) => (e) => act(e.currentTarget, () => gapi(`/ai/actions/${a.id}/${path}`, { method: 'POST' }), ok, reload);
  const data = a.data && typeof a.data === 'object' ? Object.entries(a.data).filter(([, v]) => typeof v !== 'object') : [];
  return h('li', { class: 'card action' },
    h('div', { class: 'action__top' }, h('strong', {}, ACTION_KIND[a.kind] ?? a.kind), pill(ACTION_STATUS[a.status] ?? a.status, a.status === 'executed' ? 'ok' : a.status === 'failed' ? 'bad' : a.status === 'proposed' ? 'warn' : null),
      conf ? pill(`Confianza ${conf === 'low' ? 'baja' : conf === 'high' ? 'alta' : 'media'}`, conf === 'low' ? 'warn' : null) : null),
    a.target || a.title ? h('p', { class: 'wrap' }, a.target ?? a.title) : null,
    h('p', { class: 'wrap' }, a.reason),
    data.length ? h('dl', { class: 'kv kv--2' }, data.flatMap(([k, v]) => [h('dt', {}, k.replace(/_/g, ' ')), h('dd', {}, String(v))])) : null,
    a.last_error ? h('p', { class: 'help is-high' }, a.last_error) : null,
    h('p', { class: 'help' }, dt(a.created_at)),
    state.canEdit ? h('div', { class: 'actions-row' },
      a.status === 'proposed' ? [h('button', { class: 'btn btn--sm', type: 'button', onclick: run('approve', 'Acción aprobada') }, 'Aprobar'), h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: run('reject', 'Acción recusada') }, 'Recusar')] : null,
      a.status === 'executed' && a.undo_data !== null ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: run('undo', 'Acción deshecha') }, 'Deshacer') : null) : null);
}
