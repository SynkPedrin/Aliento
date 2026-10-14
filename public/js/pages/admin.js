// Área de administración: resumen, usuarios, suscripciones, contenido y auditoría.
import { $, api, h, icon, money, num, setBusy, toast } from '../ui.js';
import { emptyState, errorState, initApp, loading, modal, page } from '../shell.js';

const me = await initApp({ active: null, access: 'account' });
const root = $('[data-root]');

const TABS = [
  ['resumen', 'Resumen'],
  ['usuarios', 'Usuarios'],
  ['suscripciones', 'Suscripciones'],
  ['contenido', 'Contenido'],
  ['auditoria', 'Auditoría'],
];

const STATUS = {
  active: 'Activa', trialing: 'En prueba', past_due: 'Pago pendiente', canceled: 'Cancelada', unpaid: 'Impagada',
  incomplete: 'Incompleta', incomplete_expired: 'Caducada', paused: 'Pausada', open: 'Abierta', resolved: 'Resuelta',
};
const INTERVAL = { week: 'semana', month: 'mes', year: 'año' };

const fmtDate = (iso) => (iso ? new Intl.DateTimeFormat('es-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—');
const fmtDay = (iso) => (iso ? new Intl.DateTimeFormat('es-US', { dateStyle: 'medium' }).format(new Date(iso)) : '—');
const pct = (a, b) => (b ? `${new Intl.NumberFormat('es-US', { maximumFractionDigits: 1 }).format((a / b) * 100)} %` : '—');
const cents = (amount, currency) => (amount == null || !currency ? '—' : money(amount / 100, String(currency).toUpperCase()));
const statusPill = (s) => h('span', { class: `pill${['active', 'trialing', 'resolved'].includes(s) ? ' pill--ok' : ['past_due', 'unpaid', 'open', 'incomplete'].includes(s) ? ' pill--warn' : ''}` }, STATUS[s] ?? s ?? 'Sin suscripción');

function table(headers, rows, caption) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    caption ? h('caption', { class: 'sr-only' }, caption) : null,
    h('thead', {}, h('tr', {}, headers.map((x) => h('th', { scope: 'col' }, x)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => (c?.nodeType && c.tagName === 'TD' ? c : h('td', {}, c ?? '—'))))))));
}

const stat = (label, value, sub) => h('div', { class: 'card stat' },
  h('p', { class: 'stat__label' }, label), h('p', { class: 'stat__value' }, value), sub ? h('p', { class: 'stat__sub' }, sub) : null);

const field = (id, label, control, help) => h('div', { class: 'field' }, h('label', { for: id }, label), control, help ? h('p', { class: 'help' }, help) : null);

/** Ejecuta una acción con botón ocupado, toast y recarga de la pestaña. */
async function act(btn, fn, okMsg, after) {
  if (btn) setBusy(btn, true, 'Un momento…');
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    await after?.(r);
    return r;
  } catch (err) {
    toast(err.message);
    return null;
  } finally {
    if (btn?.isConnected) setBusy(btn, false);
  }
}

async function guarded(target, fn) {
  loading(target);
  try {
    await fn();
  } catch (err) {
    if (err.status === 403) target.replaceChildren(emptyState('No tienes acceso a esta sección.'));
    else errorState(target, err, () => guarded(target, fn));
  }
}

// ---------------------------------------------------------------- resumen
function overview(target) {
  return guarded(target, async () => {
    const d = await api('/api/admin/overview');
    const f = d.funnel ?? {};
    const r = d.retention ?? {};
    target.replaceChildren(
      h('h2', { class: 'section-title' }, 'Embudo'),
      h('div', { class: 'stats' },
        stat('Cuestionarios iniciados', num(f.started ?? 0)),
        stat('Cuestionarios completados', num(f.completed ?? 0), `${pct(f.completed, f.started)} de los iniciados`),
        stat('Cuentas creadas', num(f.accounts ?? 0), `${pct(f.accounts, f.completed)} de los completados`),
        stat('Clientes de pago', num(f.paying ?? 0), `${pct(f.paying, f.completed)} de los completados`)),
      h('h2', { class: 'section-title' }, 'Ingresos y actividad'),
      h('div', { class: 'stats' },
        ...(d.revenue?.length ? d.revenue.map((x) => stat(`MRR (${String(x.currency).toUpperCase()})`, cents(x.mrr, x.currency), 'Ingreso recurrente mensual normalizado'))
          : [stat('MRR', '—', 'Sin suscripciones activas')]),
        stat('Usuarios con acceso', num(r.active_users ?? 0)),
        stat('Activos últimos 7 días', num(r.active_7d ?? 0), pct(r.active_7d, r.active_users) === '—' ? null : `${pct(r.active_7d, r.active_users)} de los usuarios con acceso`),
        stat('Revisiones abiertas', num(d.openReviews ?? 0), d.openReviews ? 'Revísalas en Suscripciones' : 'Todo al día')),
      h('div', { class: 'grid-2 u-mt-16' },
        h('section', {},
          h('h2', { class: 'section-title' }, 'Suscripciones por estado'),
          d.subscriptions?.length
            ? table(['Estado', 'Total'], d.subscriptions.map((s) => [statusPill(s.status), num(s.total)]), 'Suscripciones por estado')
            : h('p', { class: 'muted' }, 'Todavía no hay suscripciones.')),
        h('section', {},
          h('h2', { class: 'section-title' }, 'Webhooks con error'),
          d.failedWebhooks?.length
            ? h('ul', { class: 'list card card--flat' }, d.failedWebhooks.map((w) => h('li', {},
              h('div', { class: 'list__main' }, h('strong', {}, w.type), h('p', { class: 'list__meta' }, `${fmtDate(w.received_at)} · ${w.id}`),
                w.error ? h('p', { class: 'small' }, w.error) : null))))
            : h('p', { class: 'muted' }, 'No hay webhooks fallidos.'))),
    );
  });
}

// ---------------------------------------------------------------- usuarios
function users(target) {
  const input = h('input', { type: 'search', class: 'input', id: 'user-q', placeholder: 'Buscar por correo o nombre', autocomplete: 'off', maxlength: 120 });
  const results = h('div', { 'aria-live': 'polite' });
  let timer;
  let seq = 0;
  const search = () => {
    const mine = ++seq;
    return guarded(results, async () => {
      const q = input.value.trim();
      const { users: list = [] } = await api(`/api/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      if (mine !== seq) return;
      results.replaceChildren(
        h('p', { class: 'help' }, list.length >= 100 ? 'Mostrando los 100 más recientes. Afina la búsqueda para ver más.' : `${num(list.length)} ${list.length === 1 ? 'usuario' : 'usuarios'}`),
        list.length
          ? h('div', { class: 'u-mt-8' }, table(['Correo', 'Nombre', 'Alta', 'Configuración', 'Suscripción', 'Lecciones'],
            list.map((u) => [u.email, u.name, fmtDay(u.created_at), u.onboarded_at ? fmtDay(u.onboarded_at) : 'Pendiente', statusPill(u.subscription), num(u.lessons ?? 0)]), 'Usuarios'))
          : emptyState('Sin resultados', q ? 'No hay usuarios que coincidan con tu búsqueda.' : 'Todavía no hay usuarios.'));
    });
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 350); });
  target.replaceChildren(
    h('div', { class: 'admin-toolbar' }, h('div', { class: 'field admin-wide' }, h('label', { for: 'user-q' }, 'Buscar usuarios'), input)),
    results);
  return search();
}

// ---------------------------------------------------------------- suscripciones
function subscriptions(target) {
  const reload = () => subscriptions(target);
  return guarded(target, async () => {
    const { subscriptions: subs = [], reviews = [] } = await api('/api/admin/subscriptions');
    const open = reviews.filter((r) => r.status === 'open').length;
    target.replaceChildren(
      h('h2', { class: 'section-title' }, `Revisiones de facturación${open ? ` · ${open} abiertas` : ''}`),
      reviews.length
        ? table(['Estado', 'Fecha', 'Motivo', 'Suscripción Stripe', 'Cliente Stripe', ''], reviews.map((r) => [
          statusPill(r.status), fmtDate(r.created_at), h('td', { class: 'wrap' }, r.reason ?? '—'),
          r.stripe_subscription_id, r.stripe_customer_id,
          r.status === 'open' ? h('button', { type: 'button', class: 'btn btn--sm btn--ghost', onclick: () => resolveReview(r, reload) }, 'Marcar como resuelta') : '',
        ]), 'Revisiones de facturación')
        : h('p', { class: 'muted' }, 'No hay revisiones pendientes.'),
      h('h2', { class: 'section-title' }, 'Suscripciones'),
      subs.length
        ? table(['Correo', 'Plan', 'Estado', 'Importe', 'Fin del periodo', 'Cancela al final', 'Actualizada'], subs.map((s) => [
          s.email, s.plan, statusPill(s.status),
          s.amount == null ? '—' : `${cents(s.amount, s.currency)}${s.interval ? ` / ${INTERVAL[s.interval] ?? s.interval}` : ''}`,
          fmtDay(s.current_period_end), s.cancel_at_period_end ? 'Sí' : 'No', fmtDate(s.updated_at),
        ]), 'Suscripciones')
        : emptyState('Todavía no hay suscripciones'),
    );
  });
}

function resolveReview(review, after) {
  modal((close) => {
    const note = h('textarea', { class: 'input', id: 'review-note', maxlength: 500, rows: 4, placeholder: 'Qué se ha comprobado o corregido' });
    const btn = h('button', { type: 'submit', class: 'btn' }, 'Marcar como resuelta');
    return h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const ok = await act(btn, () => api(`/api/admin/reviews/${review.id}/resolve`, { method: 'POST', body: { note: note.value.trim() || null } }), 'Revisión marcada como resuelta.');
        if (ok) { close(); after(); }
      },
    },
    h('h2', { class: 'title-md' }, 'Resolver revisión'),
    h('p', { class: 'muted small u-mt-8' }, review.reason ?? ''),
    h('div', { class: 'u-mt-16' }, field('review-note', 'Nota (opcional)', note, 'Quedará guardada en la auditoría.')),
    h('div', { class: 'modal__actions' }, h('button', { type: 'button', class: 'link', onclick: close }, 'Cancelar'), btn));
  }, { label: 'Resolver revisión' });
}

// ---------------------------------------------------------------- contenido
const EXAMPLE_BLOCKS = [
  { id: 'idea-clave', type: 'educational_text', title: 'Idea clave', body: 'Escribe aquí el contenido principal de la lección.\n\nSepara los párrafos con una línea en blanco.' },
  { id: 'reflexion', type: 'reflection', prompt: '¿Qué te llevas de esta lección?', placeholder: 'Escribe tu respuesta…', required: true },
  { id: 'cierre', type: 'completion', title: '¡Lección completada!', body: 'Has dado un paso más en tu camino.' },
];

const BLOCK_HELP = [
  ['educational_text', '{ title?, body }'],
  ['multiple_choice', '{ question, options: [{ id, label }], correct: id | null, feedback: { idOpción: texto } }'],
  ['reflection', '{ prompt, placeholder, required }'],
  ['interactive_exercise', "{ kind: 'checklist', prompt, items: [{ id, label }], minSelected }"],
  ['breathing_exercise', '{ intro, pattern: { inhale, hold, exhale }, cycles }'],
  ['commitment', '{ statement, cta }'],
  ['feedback', '{ body }'],
  ['completion', '{ title, body } (obligatorio y siempre el último)'],
];

function content(target) {
  const reload = () => content(target);
  return guarded(target, async () => {
    const { chapters = [] } = await api('/api/admin/content');
    target.replaceChildren(
      h('div', { class: 'admin-toolbar' },
        h('p', { class: 'muted small' }, `${chapters.length} capítulos · ${chapters.reduce((n, c) => n + (c.lessons?.length ?? 0), 0)} lecciones`),
        h('button', { type: 'button', class: 'btn btn--sm', onclick: () => chapterForm(null, reload) }, 'Nuevo capítulo')),
      chapters.length ? h('div', {}, chapters.map((c) => chapterCard(c, target, reload)))
        : emptyState('Todavía no hay capítulos', 'Crea el primero o carga el programa inicial.'),
    );
  });
}

function chapterCard(c, target, reload) {
  const pub = h('input', { type: 'checkbox', role: 'switch', id: `pub-${c.id}`, checked: Boolean(c.published) });
  pub.addEventListener('change', async () => {
    pub.disabled = true;
    const ok = await act(null, () => api(`/api/admin/chapters/${c.id}`, { method: 'PATCH', body: { published: pub.checked } }),
      pub.checked ? 'Capítulo publicado.' : 'Capítulo despublicado.', reload);
    if (!ok) { pub.checked = !pub.checked; pub.disabled = false; }
  });
  const lessons = c.lessons ?? [];
  return h('section', { class: 'card admin-chapter', 'aria-labelledby': `ch-${c.id}` },
    h('div', { class: 'admin-chapter__head' },
      h('div', {},
        h('p', { class: 'kicker' }, `Capítulo ${c.number}`),
        h('h2', { class: 'title-md', id: `ch-${c.id}` }, c.title),
        h('p', { class: 'muted small' }, c.description)),
      h('div', { class: 'admin-row-actions' },
        h('button', { type: 'button', class: 'btn btn--sm btn--ghost', onclick: () => chapterForm(c, reload) }, 'Editar'),
        h('button', { type: 'button', class: 'btn btn--sm btn--ghost', onclick: () => lessonCreateForm(c, target, reload) }, 'Nueva lección'))),
    h('label', { class: 'toggle', for: `pub-${c.id}` }, h('span', {}, 'Publicado'), pub),
    h('div', { class: 'admin-lessons' },
      lessons.length ? h('ol', { class: 'list' }, lessons.map((l, i) => h('li', {},
        h('div', { class: 'list__main' },
          h('strong', {}, `${i + 1}. ${l.title}`),
          h('p', { class: 'list__meta' }, `${l.minutes} min · versión ${l.version} · ${num(l.completions ?? 0)} completadas · ${l.slug}`)),
        h('span', { class: `pill${l.published ? ' pill--ok' : ''}` }, l.published ? 'Publicada' : 'Borrador'),
        h('div', { class: 'admin-row-actions' },
          h('button', { type: 'button', class: 'icon-btn', disabled: i === 0, 'aria-label': `Subir «${l.title}»`, onclick: (e) => act(e.currentTarget, () => api(`/api/admin/lessons/${l.id}/move`, { method: 'POST', body: { direction: 'up' } }), 'Orden actualizado.', reload) }, '↑'),
          h('button', { type: 'button', class: 'icon-btn', disabled: i === lessons.length - 1, 'aria-label': `Bajar «${l.title}»`, onclick: (e) => act(e.currentTarget, () => api(`/api/admin/lessons/${l.id}/move`, { method: 'POST', body: { direction: 'down' } }), 'Orden actualizado.', reload) }, '↓'),
          h('button', { type: 'button', class: 'icon-btn', onclick: () => lessonEditor(l.id, target, reload) }, 'Editar')))))
        : h('p', { class: 'muted small' }, 'Este capítulo aún no tiene lecciones.')));
}

function chapterForm(chapter, after) {
  modal((close) => {
    const title = h('input', { class: 'input', id: 'ch-title', maxlength: 120, required: true });
    title.value = chapter?.title ?? '';
    const desc = h('textarea', { class: 'input', id: 'ch-desc', maxlength: 400, rows: 3, required: true });
    desc.value = chapter?.description ?? '';
    const btn = h('button', { type: 'submit', class: 'btn' }, chapter ? 'Guardar' : 'Crear capítulo');
    return h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        const body = { title: title.value.trim(), description: desc.value.trim() };
        const ok = await act(btn, () => (chapter
          ? api(`/api/admin/chapters/${chapter.id}`, { method: 'PATCH', body })
          : api('/api/admin/chapters', { method: 'POST', body })), chapter ? 'Capítulo actualizado.' : 'Capítulo creado (sin publicar).');
        if (ok) { close(); after(); }
      },
    },
    h('h2', { class: 'title-md' }, chapter ? 'Editar capítulo' : 'Nuevo capítulo'),
    h('div', { class: 'stack u-mt-16' },
      field('ch-title', 'Título', title),
      field('ch-desc', 'Descripción', desc, 'Máximo 400 caracteres.')),
    !chapter ? h('p', { class: 'help u-mt-8' }, 'Los capítulos nuevos se crean sin publicar.') : null,
    h('div', { class: 'modal__actions' }, h('button', { type: 'button', class: 'link', onclick: close }, 'Cancelar'), btn));
  }, { label: chapter ? 'Editar capítulo' : 'Nuevo capítulo' });
}

function lessonCreateForm(chapter, target, reload) {
  modal((close) => {
    const title = h('input', { class: 'input', id: 'nl-title', maxlength: 120, required: true });
    const desc = h('textarea', { class: 'input', id: 'nl-desc', maxlength: 400, rows: 3, required: true });
    const minutes = h('input', { class: 'input', id: 'nl-min', type: 'number', min: 1, max: 60, step: 1, value: 5, required: true });
    const errors = h('div', { 'aria-live': 'polite' });
    const btn = h('button', { type: 'submit', class: 'btn' }, 'Crear lección');
    return h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        errors.replaceChildren();
        setBusy(btn, true, 'Creando…');
        try {
          const r = await api('/api/admin/lessons', { method: 'POST', body: {
            chapterId: chapter.id, title: title.value.trim(), description: desc.value.trim(), minutes: Number(minutes.value), blocks: EXAMPLE_BLOCKS,
          } });
          toast('Lección creada como borrador. Edita sus bloques.');
          close();
          lessonEditor(r.lesson.id, target, reload);
        } catch (err) {
          errors.replaceChildren(errorBox(err));
          setBusy(btn, false);
        }
      },
    },
    h('h2', { class: 'title-md' }, 'Nueva lección'),
    h('p', { class: 'muted small u-mt-8' }, `En «${chapter.title}». Se crea sin publicar con unos bloques de ejemplo que podrás editar.`),
    h('div', { class: 'stack u-mt-16' },
      field('nl-title', 'Título', title), field('nl-desc', 'Descripción', desc), field('nl-min', 'Duración (minutos)', minutes)),
    errors,
    h('div', { class: 'modal__actions' }, h('button', { type: 'button', class: 'link', onclick: close }, 'Cancelar'), btn));
  }, { label: 'Nueva lección' });
}

function errorBox(err) {
  const list = err?.code === 'INVALID_CONTENT' && Array.isArray(err.data?.errors) ? err.data.errors : null;
  return h('div', { class: 'notice notice--warn u-mt-16', role: 'alert' }, icon('info', 'notice__icon'),
    h('div', {}, h('strong', {}, err.message), list ? h('ul', { class: 'admin-errors' }, list.map((x) => h('li', {}, x))) : null));
}

function lessonEditor(id, target, reload) {
  window.scrollTo({ top: 0 });
  return guarded(target, async () => {
    const { lesson, blocks = [] } = await api(`/api/admin/lessons/${id}`);
    const title = h('input', { class: 'input', id: 'le-title', maxlength: 120, required: true });
    title.value = lesson.title ?? '';
    const desc = h('textarea', { class: 'input', id: 'le-desc', maxlength: 400, rows: 3 });
    desc.value = lesson.description ?? '';
    const minutes = h('input', { class: 'input', id: 'le-min', type: 'number', min: 1, max: 60, step: 1, value: lesson.minutes ?? 5 });
    const published = h('input', { type: 'checkbox', id: 'le-pub', checked: Boolean(lesson.published) });
    const json = h('textarea', { class: 'input code-input', id: 'le-json', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-describedby': 'le-json-help le-json-error' });
    json.value = JSON.stringify(blocks, null, 2);
    const jsonError = h('p', { class: 'form-error', id: 'le-json-error', 'aria-live': 'polite' });
    const errors = h('div', { 'aria-live': 'polite' });
    const preview = h('div', { class: 'u-mt-16' });

    const parse = () => {
      jsonError.textContent = '';
      json.removeAttribute('aria-invalid');
      try {
        const v = JSON.parse(json.value);
        if (!Array.isArray(v)) throw new Error('El contenido debe ser una lista (array) de bloques.');
        return v;
      } catch (err) {
        jsonError.textContent = `JSON no válido: ${err.message}`;
        json.setAttribute('aria-invalid', 'true');
        json.focus();
        return null;
      }
    };

    const back = () => content(target);
    const save = h('button', { type: 'submit', class: 'btn' }, 'Guardar');
    const form = h('form', {
      class: 'card',
      onsubmit: async (e) => {
        e.preventDefault();
        errors.replaceChildren();
        const parsed = parse();
        if (!parsed) return;
        setBusy(save, true, 'Guardando…');
        try {
          const r = await api(`/api/admin/lessons/${id}`, { method: 'PUT', body: {
            title: title.value.trim(), description: desc.value.trim(), minutes: Number(minutes.value), published: published.checked, blocks: parsed,
          } });
          toast(`Lección guardada (versión ${r.lesson?.version ?? lesson.version}).`);
          lessonEditor(id, target, reload);
        } catch (err) {
          errors.replaceChildren(errorBox(err));
          errors.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setBusy(save, false);
        }
      },
    },
    h('div', { class: 'form-grid' },
      field('le-title', 'Título', title),
      field('le-min', 'Duración (minutos)', minutes)),
    h('div', { class: 'u-mt-16' }, field('le-desc', 'Descripción', desc)),
    h('label', { class: 'check u-mt-16', for: 'le-pub' }, published, h('span', {}, 'Publicada (visible para los usuarios)')),
    h('div', { class: 'field u-mt-16' },
      h('label', { for: 'le-json' }, 'Bloques (JSON)'),
      json, jsonError,
      h('details', { class: 'help', id: 'le-json-help' },
        h('summary', {}, 'Tipos de bloque permitidos'),
        h('p', { class: 'u-mt-8' }, 'Cada bloque necesita un "id" único y un "type". Debe haber al menos un bloque interactivo y terminar con un único "completion".'),
        h('ul', { class: 'admin-errors list-reset' }, BLOCK_HELP.map(([t, f]) => h('li', { class: 'muted' }, h('code', {}, t), ` ${f}`))))),
    errors,
    h('div', { class: 'actions-row' },
      save,
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => { const p = parse(); if (p) { preview.replaceChildren(renderPreview(p, title.value)); preview.scrollIntoView({ behavior: 'smooth', block: 'start' }); } } }, 'Vista previa'),
      h('button', { type: 'button', class: 'link', onclick: back }, 'Volver sin guardar')));

    target.replaceChildren(
      h('div', { class: 'admin-toolbar' },
        h('button', { type: 'button', class: 'link', onclick: back }, '← Volver al contenido'),
        h('span', { class: 'muted small' }, `${lesson.slug} · versión ${lesson.version}`)),
      h('h2', { class: 'title-md' }, `Editar lección: ${lesson.title}`),
      h('p', { class: 'help u-mt-8' }, 'Si cambias los bloques, la versión de la lección aumenta al guardar.'),
      h('div', { class: 'u-mt-16' }, form),
      preview);
  });
}

// Vista previa de solo lectura.
const paras = (text) => String(text ?? '').split(/\n{2,}/).filter((p) => p.trim()).map((p) => h('p', {}, p.trim()));
const KIND = {
  educational_text: 'Texto', multiple_choice: 'Pregunta', reflection: 'Reflexión', interactive_exercise: 'Ejercicio',
  breathing_exercise: 'Respiración', commitment: 'Compromiso', feedback: 'Mensaje', completion: 'Cierre',
};

function renderPreview(blocks, title) {
  return h('section', { class: 'card', 'aria-label': 'Vista previa' },
    h('p', { class: 'eyebrow' }, 'Vista previa'),
    h('h2', { class: 'title-md' }, title || 'Sin título'),
    h('div', { class: 'admin-preview u-mt-16' }, blocks.map((b, i) => h('div', { class: 'lesson-block' },
      h('span', { class: 'kicker' }, `${i + 1} · ${KIND[b?.type] ?? `Tipo no reconocido (${b?.type})`}`),
      previewBlock(b ?? {})))));
}

function previewBlock(b) {
  switch (b.type) {
    case 'educational_text':
      return h('div', { class: 'lesson-text' }, b.title ? h('h3', {}, b.title) : null, paras(b.body));
    case 'multiple_choice':
      return h('div', {}, h('p', {}, h('strong', {}, b.question)),
        h('ul', { class: 'list' }, (b.options ?? []).map((o) => h('li', {},
          h('div', { class: 'list__main' }, o.label, o.id === b.correct ? h('span', { class: 'pill pill--ok' }, ' Correcta') : null,
            b.feedback?.[o.id] ? h('p', { class: 'list__meta' }, b.feedback[o.id]) : h('p', { class: 'form-error' }, 'Falta la retroalimentación'))))),
        b.correct == null ? h('p', { class: 'help' }, 'Sin respuesta correcta (pregunta abierta).') : null);
    case 'reflection':
      return h('div', {}, h('p', {}, h('strong', {}, b.prompt)),
        h('textarea', { class: 'input u-mt-8', disabled: true, placeholder: b.placeholder ?? '', 'aria-label': 'Respuesta (vista previa)' }),
        h('p', { class: 'help' }, b.required === false ? 'Opcional' : 'Obligatoria'));
    case 'interactive_exercise':
      return h('div', {}, h('p', {}, h('strong', {}, b.prompt)),
        h('div', { class: 'stack u-mt-8' }, (b.items ?? []).map((it) => h('label', { class: 'check' }, h('input', { type: 'checkbox', disabled: true }), h('span', {}, it.label)))),
        h('p', { class: 'help u-mt-8' }, `Mínimo para continuar: ${b.minSelected ?? 0}`));
    case 'breathing_exercise': {
      const p = b.pattern ?? {};
      return h('div', {}, paras(b.intro),
        h('p', { class: 'help u-mt-8' }, `Inhala ${p.inhale ?? '?'} s · Mantén ${p.hold ?? 0} s · Exhala ${p.exhale ?? '?'} s · ${b.cycles ?? '?'} ciclos`));
    }
    case 'commitment':
      return h('div', { class: 'commit' }, h('p', {}, h('strong', {}, b.statement)),
        h('button', { type: 'button', class: 'btn btn--sm u-mt-8', disabled: true }, b.cta || 'Me comprometo'));
    case 'feedback':
      return h('div', {}, paras(b.body));
    case 'completion':
      return h('div', { class: 'lesson-done' }, h('h3', {}, b.title), paras(b.body));
    default:
      return h('pre', { class: 'small' }, JSON.stringify(b, null, 2));
  }
}

// ---------------------------------------------------------------- auditoría
function audit(target) {
  return guarded(target, async () => {
    const { logs = [] } = await api('/api/admin/audit');
    target.replaceChildren(
      h('h2', { class: 'section-title' }, 'Últimas 200 acciones'),
      logs.length
        ? table(['Fecha', 'Administrador', 'Acción', 'Entidad', 'ID', 'Detalles'], logs.map((l) => [
          fmtDate(l.created_at), l.admin, h('td', {}, h('code', {}, l.action)), l.entity, l.entity_id,
          h('td', { class: 'wrap' }, h('code', { class: 'small' }, l.details && Object.keys(l.details).length ? JSON.stringify(l.details) : '—')),
        ]), 'Registro de auditoría')
        : emptyState('Sin actividad registrada', 'Aquí aparecerán los cambios hechos desde el panel.'),
    );
  });
}

// ---------------------------------------------------------------- estructura
if (!me.user?.isAdmin) {
  page(root, { eyebrow: 'Administración', title: 'Acceso restringido' });
  root.append(emptyState('No tienes acceso a esta sección.', 'Si crees que es un error, contacta con el equipo de Aliento.',
    h('a', { class: 'btn btn--ghost', href: me.access ? '/dashboard' : '/perfil' }, 'Volver')));
} else {
  const panel = h('div', { id: 'admin-panel', role: 'tabpanel', tabindex: '-1' });
  const initial = TABS.find(([id]) => id === location.hash.slice(1))?.[0] ?? 'resumen';
  const tabs = h('div', { class: 'segmented admin-tabs', role: 'tablist', 'aria-label': 'Secciones de administración' }, TABS.map(([id, label]) => h('button', {
    type: 'button', role: 'tab', id: `tab-${id}`, 'aria-controls': 'admin-panel', 'aria-selected': String(id === initial),
    onclick: () => show(id),
  }, label)));
  tabs.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const btns = [...tabs.querySelectorAll('button')];
    const i = btns.indexOf(document.activeElement);
    const next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
    next.focus(); next.click();
  });

  page(root, { eyebrow: 'Administración', title: 'Panel de administración', intro: 'Gestiona usuarios, suscripciones y el contenido de la jornada. Cada cambio queda registrado en la auditoría.' });
  root.append(tabs, panel);

  const RENDER = { resumen: overview, usuarios: users, suscripciones: subscriptions, contenido: content, auditoria: audit };

  function show(id) {
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.id === `tab-${id}`)));
    panel.setAttribute('aria-labelledby', `tab-${id}`);
    history.replaceState(null, '', `#${id}`);
    RENDER[id](panel);
  }
  show(initial);
}
