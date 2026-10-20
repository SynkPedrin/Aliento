// Pantalla 10: configuración (píxeles, metas, IA, alertas, precios, equipo y salud de la bandeja).
import { h } from '../ui.js';
import { N, act, dt, emptyEl, field, gapi, head, int, legend, load, pill, state, table, term } from './lib.js';

const MASK = '********';
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function set(o, path, v) {
  const ks = path.split('.');
  let c = o;
  ks.slice(0, -1).forEach((k) => { if (typeof c[k] !== 'object' || c[k] === null) c[k] = {}; c = c[k]; });
  c[ks.at(-1)] = v;
}

// type: text | secret | number | cents | bool | list
const GROUPS = [
  { key: 'pixels.meta', title: 'Píxel de Meta', test: 'meta', fields: [['pixelId', 'ID del píxel'], ['accessToken', 'Token de acceso', 'secret'], ['testEventCode', 'Código de eventos de prueba']] },
  { key: 'pixels.tiktok', title: 'Píxel de TikTok', test: 'tiktok', fields: [['pixelId', 'ID del píxel'], ['accessToken', 'Token de acceso', 'secret'], ['testEventCode', 'Código de eventos de prueba']] },
  { key: 'ads.meta', title: 'Cuenta publicitaria de Meta', test: 'ads', fields: [['accountId', 'ID de cuenta'], ['accessToken', 'Token de acceso', 'secret']] },
  { key: 'ads.tiktok', title: 'Cuenta publicitaria de TikTok', test: 'ads', fields: [['advertiserId', 'ID de anunciante'], ['accessToken', 'Token de acceso', 'secret']] },
  { key: 'customerio', title: 'Customer.io', test: 'customerio', fields: [['siteId', 'Site ID'], ['apiKey', 'API key (Track)', 'secret'], ['appApiKey', 'API key (App)', 'secret'], ['webhookSecret', 'Secreto del webhook', 'secret'], ['region', 'Región (eu o us)']] },
  { key: 'anthropic', title: 'Anthropic (IA)', fields: [['apiKey', 'API key', 'secret']] },
  { key: 'goals', title: 'Metas', fields: [['cac_max.default', 'CAC máximo (por defecto)', 'cents', 'Importe en la moneda principal.'], ['roas_min', 'ROAS mínimo', 'number'], ['daily_budget_cents', 'Presupuesto diario', 'cents'], ['min_sample', 'Muestra mínima (conversiones)', 'number', 'Por debajo, la IA marca confianza baja y no automatiza.']] },
  { key: 'ai', title: 'Límites de la IA', fields: [['limits.pause_cpa_multiple', 'Pausar si CPA supera × meta', 'number'], ['limits.pause_spend_multiple', 'Tras gastar × meta sin ventas', 'number'], ['limits.budget_max_step_pct', 'Subida máxima de presupuesto por día (%)', 'number'], ['limits.daily_cap_cents', 'Tope diario de gasto', 'cents'],
    ['auto.promote_variant', 'Promover variantes A/B automáticamente', 'bool'], ['auto.email_variant', 'Variantes de e-mail automáticas', 'bool'], ['auto.creative_brief', 'Briefs de creativos automáticos', 'bool']] },
  { key: 'alerts', title: 'Alertas', fields: [['emails', 'Correos de aviso (separados por comas)', 'list'], ['webhookUrl', 'Webhook (Slack, WhatsApp…)']] },
  { key: 'timezone', title: 'Zona horaria', fields: [['tz', 'Zona horaria (p. ej. Europe/Madrid)']] },
];

function groupForm(g, all, canSave, reload) {
  const val = structuredClone(all[g.key] ?? {});
  const inputs = [];
  const controls = g.fields.map(([path, label, type = 'text', help], i) => {
    const id = `s-${g.key.replace(/\W/g, '')}-${i}`;
    const cur = get(val, path);
    let el;
    if (type === 'bool') { el = h('input', { type: 'checkbox', id, disabled: canSave ? null : '' }); el.checked = !!cur; }
    else if (type === 'secret') el = h('input', { class: 'input', id, type: 'password', autocomplete: 'new-password', disabled: canSave ? null : '', placeholder: cur === MASK ? 'Guardado (oculto). Escribe para reemplazar.' : '', value: cur && cur !== MASK ? cur : '' });
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
    act(e.submitter, () => gapi(`/settings/${g.key}`, { method: 'PUT', body: val }), 'Configuración guardada', reload);
  } },
    h('h3', { class: 'gr-h3' }, g.title), h('div', { class: 'form-grid' }, controls),
    canSave ? h('div', { class: 'actions-row' }, h('button', { class: 'btn btn--sm', type: 'submit' }, 'Guardar'),
      g.test ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async (e) => { const r = await act(e.currentTarget, () => gapi(`/settings/test/${g.test}`, { method: 'POST' })); if (r) status.textContent = `${r.ok ? 'Conexión correcta' : 'Fallo'}: ${r.message ?? ''}`; } }, 'Probar conexión') : null) : null, status);
}

function pricesForm(all, canSave, reload) {
  const cur = all.prices ?? {};
  const rows = Object.entries(cur);
  const simple = rows.every(([, v]) => typeof v === 'number');
  const area = h('textarea', { class: 'input code-input', id: 'prices-json', rows: '6', disabled: canSave ? null : '', spellcheck: 'false' }, JSON.stringify(cur, null, 2));
  return h('form', { class: 'card', onsubmit: (e) => {
    e.preventDefault();
    let v;
    try { v = JSON.parse(area.value); } catch { act(null, async () => { throw new Error('El JSON de precios no es válido.'); }); return; }
    act(e.submitter, () => gapi('/settings/prices', { method: 'PUT', body: v }), 'Precios guardados', reload);
  } }, h('h3', { class: 'gr-h3' }, 'Precios por país'),
  simple && rows.length ? table(['País', N('Precio')], rows.map(([c, v]) => [c, `${(v / 100).toFixed(2)}`]), 'Precios por país (importes en la unidad principal)') : null,
  field('prices-json', 'Editar precios (JSON: país → importe en céntimos)', area, 'Los cambios de precio nunca los aplica la IA automáticamente.'),
  canSave ? h('div', { class: 'actions-row' }, h('button', { class: 'btn btn--sm', type: 'submit' }, 'Guardar precios')) : null);
}

function staffSection(canAdmin) {
  const box = h('div');
  const render = () => load(box, async () => {
    const d = await gapi('/staff');
    const list = Array.isArray(d) ? d : d.staff ?? d.rows ?? [];
    const email = h('input', { class: 'input', id: 'st-mail', type: 'email', required: '', autocomplete: 'off' });
    const role = h('select', { class: 'select', id: 'st-role' }, [['marketing', 'Marketing (edita)'], ['readonly', 'Solo lectura'], ['admin', 'Administrador']].map(([v, l]) => h('option', { value: v }, l)));
    box.replaceChildren(
      list.length ? table(['Correo', 'Rol', 'Alta', ''], list.map((s) => [s.email, pill({ admin: 'Administrador', marketing: 'Marketing', readonly: 'Solo lectura' }[s.role] ?? s.role), dt(s.created_at),
        canAdmin ? h('button', { class: 'btn btn--ghost btn--sm btn--danger', type: 'button', onclick: (e) => { if (confirm(`¿Quitar el acceso a ${s.email}?`)) act(e.currentTarget, () => gapi(`/staff/${s.user_id}`, { method: 'DELETE' }), 'Acceso retirado', render); } }, 'Quitar') : null]), 'Equipo') : emptyEl('Sin equipo'),
      canAdmin ? h('form', { class: 'form-grid u-mt', onsubmit: (e) => { e.preventDefault(); act(e.submitter, () => gapi('/staff', { method: 'POST', body: { email: email.value.trim(), role: role.value } }), 'Permiso concedido', render); } },
        field('st-mail', 'Correo de la cuenta Alento', email), field('st-role', 'Rol', role), h('div', { class: 'field' }, h('button', { class: 'btn btn--sm', type: 'submit' }, 'Conceder acceso'))) : null);
  });
  const sec = h('section', { class: 'card' }, h('h3', { class: 'gr-h3' }, 'Equipo y permisos'), box);
  render();
  return sec;
}

function outboxSection() {
  const box = h('div');
  load(box, async () => {
    const o = await gapi('/outbox');
    const mq = o.match_quality ?? {};
    box.replaceChildren(
      h('dl', { class: 'kv kv--4' }, ...[['Pendientes', int(o.pending)], ['Fallidos', int(o.failed)], ['Enviados en 24 h', int(o.sent_24h)], [term('match', 'Calidad Meta'), mq.meta == null ? '—' : `${mq.meta}/10`], [term('match', 'Calidad TikTok'), mq.tiktok == null ? '—' : `${mq.tiktok}/10`]]
        .flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, b)])),
      o.pending > 0 && o.failed > 0 ? h('p', { class: 'notice' }, 'Hay eventos fallidos: revisa las credenciales de los píxeles.') : null,
      (o.last_errors ?? []).length ? h('div', { class: 'u-mt' }, h('h4', { class: 'gr-h4' }, 'Últimos errores'), h('ul', { class: 'list' }, o.last_errors.map((e) => h('li', {}, h('div', { class: 'list__main' }, h('p', { class: 'wrap' }, e.last_error ?? e.message ?? JSON.stringify(e)),
        h('p', { class: 'list__meta' }, [e.destination, e.event_name, dt(e.created_at ?? e.updated_at)].filter((x) => x && x !== '—').join(' · '))))))) : h('p', { class: 'muted' }, 'Sin errores recientes.'));
  });
  return h('section', { class: 'card' }, h('h3', { class: 'gr-h3' }, 'Salud de la bandeja de eventos'), h('p', { class: 'help' }, 'Eventos en cola hacia Meta, TikTok y Customer.io.'), box);
}

export async function settings(root) {
  root.replaceChildren(head('Configuración', 'Píxeles, tokens, metas, límites de la IA, alertas, precios, equipo y salud de eventos.'), h('div', { 'data-body': '' }));
  const body = root.querySelector('[data-body]');
  const reload = () => settings(root);
  await load(body, async () => {
    const d0 = await gapi('/settings');
    const all = d0.settings ?? d0;
    const canSave = state.role === 'admin';
    body.replaceChildren(
      canSave ? null : h('p', { class: 'notice' }, 'Tu rol no permite modificar la configuración. Solo un administrador puede guardar cambios.'),
      outboxSection(),
      h('div', { class: 'grid-2 u-mt' }, GROUPS.map((g) => groupForm(g, all, canSave, reload)), pricesForm(all, canSave, reload)),
      h('div', { class: 'u-mt' }, staffSection(canSave)),
      legend(['match']));
  });
}
