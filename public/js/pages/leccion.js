import { $, api, h, ICONS, setBusy, toast } from '../ui.js';
import { celebrate, errorState, initApp, loading } from '../shell.js';

await initApp({ active: '/jornada' });
const root = $('[data-root]');
const slug = new URLSearchParams(location.search).get('l') ?? '';
const PROGRAM = new URLSearchParams(location.search).get('p') ?? 'sem-fumo';
const journeyHref = PROGRAM === 'sem-fumo' ? '/jornada' : `/jornada?program=${PROGRAM}`;

/** Texto con párrafos y **negritas**, sin HTML del contenido (se construye con nodos). */
function richText(body, cls = 'lesson-text') {
  return h('div', { class: cls }, String(body).split(/\n\n+/).map((para) => h('p', {},
    para.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) => (part.startsWith('**') ? h('strong', {}, part.slice(2, -2)) : part)))));
}

async function save(blockId, response) {
  return api(`/api/app/journey/lessons/${encodeURIComponent(slug)}/responses`, { method: 'POST', body: { blockId, response } });
}

const renderers = {
  educational_text: (b) => [b.title ? h('h2', {}, b.title) : null, richText(b.body)],
  feedback: (b) => [richText(b.body)],
  completion: () => [],

  multiple_choice(b, ctx) {
    const fb = h('div', { 'aria-live': 'polite' });
    const show = (result) => {
      if (!result) return fb.replaceChildren();
      fb.replaceChildren(h('div', { class: `choice-feedback ${result.correct === false ? 'choice-feedback--no' : 'choice-feedback--ok'}` },
        result.correct === true ? h('strong', {}, 'Correcto. ') : result.correct === false ? h('strong', {}, 'Vuelve a intentarlo. ') : null, result.feedback));
    };
    const list = h('div', { class: 'options' }, b.options.map((o) => h('button', {
      type: 'button', class: 'option', 'aria-pressed': String(ctx.responses[b.id]?.optionId === o.id),
      onclick: async (e) => {
        list.querySelectorAll('.option').forEach((x) => x.setAttribute('aria-pressed', String(x === e.currentTarget)));
        try { const r = await save(b.id, { optionId: o.id }); ctx.responses[b.id] = { optionId: o.id }; ctx.results[b.id] = r; show(r); ctx.update(); } catch (err) { toast(err.message); }
      },
    }, h('span', { class: 'option__label' }, o.label), h('span', { class: 'option__radio', 'aria-hidden': 'true' }))));
    show(ctx.results[b.id]);
    return [h('h2', {}, b.question), list, fb];
  },

  reflection(b, ctx) {
    const ta = h('textarea', { class: 'input', placeholder: b.placeholder ?? '', maxlength: 2000, 'aria-label': b.prompt });
    ta.value = ctx.responses[b.id]?.text ?? '';
    const status = h('p', { class: 'help', 'aria-live': 'polite' }, ta.value ? 'Guardado.' : b.required === false ? 'Opcional.' : '');
    let timer;
    ta.addEventListener('input', () => {
      clearTimeout(timer);
      status.textContent = 'Guardando…';
      timer = setTimeout(async () => {
        try { await save(b.id, { text: ta.value }); ctx.responses[b.id] = { text: ta.value.trim() }; status.textContent = 'Guardado.'; ctx.update(); } catch (err) { status.textContent = err.message; }
      }, 700);
    });
    return [h('h2', {}, b.prompt), ta, status];
  },

  interactive_exercise(b, ctx) {
    const sel = new Set(ctx.responses[b.id]?.selected ?? []);
    const hint = h('p', { class: 'help' });
    const paint = () => { hint.textContent = b.minSelected ? `Elige al menos ${b.minSelected}. Seleccionados: ${sel.size}.` : `Seleccionados: ${sel.size}.`; };
    const list = h('div', { class: 'options' }, b.items.map((it) => h('button', {
      type: 'button', class: `option${sel.has(it.id) ? ' is-selected' : ''}`, 'aria-pressed': String(sel.has(it.id)),
      onclick: async (e) => {
        if (sel.has(it.id)) sel.delete(it.id); else sel.add(it.id);
        e.currentTarget.classList.toggle('is-selected', sel.has(it.id));
        e.currentTarget.setAttribute('aria-pressed', String(sel.has(it.id)));
        paint();
        try { await save(b.id, { selected: [...sel] }); ctx.responses[b.id] = { selected: [...sel] }; ctx.update(); } catch (err) { toast(err.message); }
      },
    }, h('span', { class: 'option__label' }, it.label), h('span', { class: 'option__check', html: ICONS.check }))));
    paint();
    return [h('h2', {}, b.prompt ?? b.title), b.intro ? h('p', { class: 'muted' }, b.intro) : null, list, hint];
  },

  breathing_exercise(b, ctx) {
    const done = Boolean(ctx.responses[b.id]?.completed);
    const circle = h('div', { class: 'breathe__circle', style: 'width:200px' }, h('span', { class: 'breathe__label' }, done ? 'Completado' : 'Preparado'));
    const btn = h('button', { class: 'btn btn--ghost', disabled: done }, done ? 'Ejercicio completado' : `Empezar (${b.cycles} ciclos)`);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { inhale, hold = 0, exhale } = b.pattern;
      const phases = [['Inspira', inhale, 1], ['Mantén', hold, 1], ['Suelta', exhale, 0.55]].filter((p) => p[1] > 0);
      for (let c = 0; c < b.cycles; c++) {
        for (const [word, secs, scale] of phases) {
          circle.style.setProperty('--d', `${secs}s`);
          circle.style.setProperty('--s', scale);
          for (let s = secs; s > 0; s--) {
            circle.firstChild.replaceChildren(word, h('small', { class: 'breathe__count' }, `${s}`));
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }
      circle.firstChild.textContent = 'Completado';
      try { await save(b.id, { completed: true }); ctx.responses[b.id] = { completed: true }; btn.textContent = 'Ejercicio completado'; ctx.update(); } catch (err) { toast(err.message); btn.disabled = false; }
    });
    return [b.intro ? richText(b.intro) : null, h('div', { class: 'breathe u-mt-16' }, circle, btn)];
  },

  commitment(b, ctx) {
    const accepted = Boolean(ctx.responses[b.id]?.accepted);
    const btn = h('button', { class: 'btn', disabled: accepted }, accepted ? 'Compromiso aceptado' : (b.cta || 'Me comprometo'));
    btn.addEventListener('click', async () => {
      try { await save(b.id, { accepted: true }); ctx.responses[b.id] = { accepted: true }; btn.disabled = true; btn.textContent = 'Compromiso aceptado'; ctx.update(); } catch (err) { toast(err.message); }
    });
    return [h('div', { class: 'commit' }, richText(b.statement, 'lesson-text'), h('div', { class: 'u-mt-16' }, btn))];
  },
};

function isDone(b, r, results) {
  switch (b.type) {
    case 'multiple_choice': return Boolean(r) && results?.[b.id]?.correct !== false;
    case 'reflection': return b.required === false || Boolean(r?.text);
    case 'interactive_exercise': return (r?.selected?.length ?? 0) >= (b.minSelected ?? 0);
    case 'breathing_exercise': return Boolean(r?.completed);
    case 'commitment': return Boolean(r?.accepted);
    default: return true;
  }
}

async function render() {
  loading(root);
  let L;
  try {
    L = await api(`/api/app/journey/lessons/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err.code === 'LOCKED') {
      return root.replaceChildren(h('div', { class: 'empty-state' }, h('p', { class: 'empty-state__title' }, 'Esta lección todavía está bloqueada'),
        h('p', { class: 'muted' }, err.message), h('a', { class: 'btn', href: journeyHref }, 'Ir a mi jornada')));
    }
    return errorState(root, err, render);
  }
  const ctx = { responses: { ...L.responses }, results: { ...L.feedback }, update: () => {} };
  const completion = L.blocks.find((b) => b.type === 'completion');
  const content = L.blocks.filter((b) => b.type !== 'completion');
  const article = h('article', { class: 'lesson' });
  const finishBtn = h('button', { class: 'btn btn--lg btn--block' }, L.lesson.status === 'completed' ? 'Volver a guardar y continuar' : 'Completar lección');
  const pendingHint = h('p', { class: 'help u-text-center u-mt-8', 'aria-live': 'polite' });
  ctx.update = () => {
    const pending = content.filter((b) => !isDone(b, ctx.responses[b.id], ctx.results)).length;
    finishBtn.disabled = pending > 0;
    pendingHint.textContent = pending ? `Te ${pending === 1 ? 'falta 1 paso' : `faltan ${pending} pasos`} para completar la lección.` : '';
  };

  article.append(
    h('p', { class: 'eyebrow' }, h('a', { href: journeyHref }, 'Mi jornada'), ` · Capítulo ${L.lesson.chapter.number} · ${L.lesson.chapter.title}`),
    h('h1', { class: 'title-lg u-mt-8' }, L.lesson.title),
    h('p', { class: 'muted u-mt-8' }, `${L.lesson.description} · ${L.lesson.minutes} min`),
    L.lesson.clinicalReview !== 'approved' ? h('p', { class: 'help u-mt-8' }, 'Contenido educativo basado en guías de salud pública, pendiente de revisión por un profesional sanitario. No sustituye la atención médica.') : null,
    ...content.map((b) => h('section', { class: 'lesson-block', 'data-type': b.type }, ...(renderers[b.type]?.(b, ctx) ?? []).filter(Boolean))),
    h('div', { class: 'u-mt-16' }, finishBtn, pendingHint),
  );
  root.replaceChildren(article);
  ctx.update();

  finishBtn.addEventListener('click', async () => {
    setBusy(finishBtn, true, 'Guardando…');
    try {
      const r = await api(`/api/app/journey/lessons/${encodeURIComponent(slug)}/complete`, { method: 'POST' });
      celebrate(r.achievements);
      root.replaceChildren(h('section', { class: 'lesson lesson-done' },
        h('div', { class: 'hero__mark', style: 'margin:0 auto 16px;width:72px;height:50px', html: '<svg viewBox="0 0 48 32" fill="currentColor" aria-hidden="true"><path d="M13 12.5C19.5 4.5 29 4 35.5 9.8c3.2 2.8 6.6 3.6 11 2.6-4 4.6-10.6 5.2-15.4 1.2C26 9.4 19.6 8.6 13 12.5Z"/><path d="M2 25C9 15.4 21.4 14 29.6 20.6c3.4 2.7 7.2 3.3 11.6 1.8-4.6 5.3-12 5.9-17.2 1.8C18.2 19.6 10 19.4 2 25Z"/></svg>' }),
        h('h1', { class: 'title-lg' }, completion?.title ?? '¡Lección completada!'),
        completion?.body ? richText(completion.body) : null,
        r.chapterCompleted ? h('p', { class: 'pill pill--ok u-mt-16' }, `Capítulo ${L.lesson.chapter.number} completado`) : null,
        h('p', { class: 'help u-mt-16' }, `${r.totals.completed} de ${r.totals.lessons} lecciones completadas`),
        h('div', { class: 'actions-row', style: 'justify-content:center' },
          r.next ? h('a', { class: 'btn', href: `/leccion?l=${encodeURIComponent(r.next.slug)}${PROGRAM === 'sem-fumo' ? '' : `&p=${PROGRAM}`}` }, `Siguiente: ${r.next.title}`) : null,
          h('a', { class: 'btn btn--ghost', href: '/dashboard' }, 'Volver al inicio'))));
      window.scrollTo({ top: 0 });
    } catch (err) {
      setBusy(finishBtn, false);
      toast(err.message);
    }
  });
}

render();
