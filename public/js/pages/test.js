import { $, api, h, ICONS, MARK_SVG, setBusy, toast } from '../ui.js';

const screenEl = $('[data-screen]');
const backBtn = $('[data-back]');
const countEl = $('[data-count]');
const progressEl = $('[data-progress]');
$('[data-brand]').innerHTML = `${MARK_SVG}<span class="brand__name">Alento</span>`;
backBtn.innerHTML = `${ICONS.back}<span>Atrás</span>`;

const QUESTION_TYPES = ['single', 'multi', 'number'];
let steps = [];
let answers = {};
let index = 0;
let config = { currency: 'USD', locale: 'es-US' };

/** Programa del funil: /quiz/<slug>, ?program=<slug> o sem-fumo. */
const SLUGS = ['sem-fumo', 'alcohol', 'azucar', 'ansiedad', 'sueno'];
const PROGRAM =
  location.pathname.match(/^\/quiz\/([a-z-]+)/)?.[1]
  || new URLSearchParams(location.search).get('program')
  || 'sem-fumo';
const PROGRAM_OK = SLUGS.includes(PROGRAM);

function currencySymbol() {
  const parts = new Intl.NumberFormat(config.locale, { style: 'currency', currency: config.currency }).formatToParts(0);
  return parts.find((p) => p.type === 'currency')?.value ?? config.currency;
}

async function save(questionId, value, nextStepId) {
  const body = { step: nextStepId, program: PROGRAM };
  if (questionId) Object.assign(body, { questionId, value, consent: true }); // tras el aviso visible en la primera pregunta
  const { assessment } = await api('/api/assessment/answers', { method: 'PUT', body });
  answers = assessment.answers;
}

function goTo(i, { push = true } = {}) {
  index = Math.max(0, Math.min(steps.length - 1, i));
  if (push) history.pushState({ step: steps[index].id }, '', `#${steps[index].id}`);
  render();
}

async function answerAndNext(step, value, btn) {
  const next = steps[index + 1];
  try {
    if (btn) setBusy(btn, true, 'Guardando…');
    await save(step.id, value, next?.id);
    goTo(index + 1);
  } catch (err) {
    if (btn) setBusy(btn, false);
    toast(err.message);
  }
}

function updateChrome() {
  const step = steps[index];
  const questions = steps.filter((s) => QUESTION_TYPES.includes(s.type));
  const answeredBefore = steps.slice(0, index).filter((s) => QUESTION_TYPES.includes(s.type)).length;
  const isQuestion = QUESTION_TYPES.includes(step.type);
  countEl.textContent = isQuestion ? `${answeredBefore + 1} / ${questions.length}` : '';
  const pct = Math.round(((step.type === 'analysis' ? questions.length : answeredBefore) / questions.length) * 100);
  progressEl.firstElementChild.style.width = `${pct}%`;
  progressEl.setAttribute('aria-valuenow', pct);
  backBtn.disabled = index === 0 || step.type === 'analysis';
  document.body.classList.toggle('theme-deep', step.tone === 'dark');
}

function optionButton(opt, selected, { multi, onClick }) {
  return h('button', { type: 'button', class: `option${selected ? ' is-selected' : ''}`, 'aria-pressed': String(selected), onclick: onClick },
    h('span', { class: 'option__label' }, opt.label),
    multi ? h('span', { class: 'option__check', html: ICONS.check }) : h('span', { class: 'option__radio', 'aria-hidden': 'true' }));
}

function renderSingle(step) {
  const current = answers[step.id];
  return h('section', { class: 'quiz__screen' },
    h('h1', {}, step.title),
    step.subtitle ? h('p', { class: 'subtitle' }, step.subtitle) : null,
    h('div', { class: 'options' }, step.options.map((o) => optionButton(o, current === o.id, {
      onClick: (e) => {
        e.currentTarget.parentElement.querySelectorAll('.option').forEach((b) => b.classList.remove('is-selected'));
        e.currentTarget.classList.add('is-selected');
        answerAndNext(step, o.id);
      },
    }))),
    index === 0 ? h('p', { class: 'help u-mt-16' },
      PROGRAM === 'sem-fumo'
        ? 'Al responder, aceptas que tratemos tus respuestas —incluidas las relativas a tu consumo de tabaco y tu bienestar— solo para calcular tus resultados. Si no creas una cuenta, se eliminan en 30 días. '
        : 'Al responder, aceptas que tratemos tus respuestas —incluidas las relativas a tu bienestar y tus hábitos— solo para calcular tus resultados. Si no creas una cuenta, se eliminan en 30 días. ',
      h('a', { href: '/privacidad', target: '_blank' }, 'Política de privacidad'), '.') : null);
}

function renderMulti(step) {
  let selected = [...(answers[step.id] ?? [])];
  const cta = h('button', { type: 'button', class: 'btn btn--lg', onclick: () => answerAndNext(step, selected, cta) }, 'Continuar');
  const list = h('div', { class: 'options' });
  const draw = () => {
    list.replaceChildren(...step.options.map((o) => optionButton(o, selected.includes(o.id), {
      multi: true,
      onClick: () => {
        if (selected.includes(o.id)) selected = selected.filter((x) => x !== o.id);
        else if (o.exclusive) selected = [o.id];
        else selected = [...selected.filter((x) => !step.options.find((p) => p.id === x)?.exclusive), o.id];
        draw();
      },
    })));
    cta.disabled = selected.length < (step.minSelected ?? 1);
  };
  draw();
  return h('section', { class: 'quiz__screen' },
    h('h1', {}, step.title),
    step.subtitle ? h('p', { class: 'subtitle' }, step.subtitle) : null,
    list,
    h('div', { class: 'sticky-cta' }, cta));
}

function renderNumber(step) {
  let value = answers[step.id] ?? step.default;
  const isMoney = step.unit === 'currency';
  const input = h('input', {
    type: 'number', inputmode: isMoney ? 'decimal' : 'numeric', min: step.min, max: step.max, step: isMoney ? 'any' : 1,
    value, 'aria-label': step.title,
  });
  const range = h('input', { type: 'range', class: 'range', min: step.min, max: Math.min(step.max, isMoney ? 150 : 60), step: 1, value, 'aria-hidden': 'true', tabindex: -1 });
  const cta = h('button', { type: 'button', class: 'btn btn--lg', onclick: () => answerAndNext(step, value, cta) }, 'Continuar');
  const err = h('p', { class: 'form-error', role: 'alert', style: 'text-align:center' });
  const set = (v, from) => {
    const n = Number(v);
    value = n;
    const valid = Number.isFinite(n) && n >= step.min && n <= step.max && v !== '';
    cta.disabled = !valid;
    err.textContent = valid ? '' : `Introduce un valor entre ${step.min} y ${step.max}.`;
    if (from !== 'input') input.value = n;
    if (from !== 'range') range.value = n;
  };
  input.addEventListener('input', () => set(input.value, 'input'));
  range.addEventListener('input', () => set(range.value, 'range'));
  const bump = (d) => set(Math.min(step.max, Math.max(step.min, Math.round((Number(value) || 0) + d))));
  return h('section', { class: 'quiz__screen' },
    h('h1', {}, step.title),
    step.subtitle ? h('p', { class: 'subtitle' }, step.subtitle) : null,
    h('div', { class: 'stepper' },
      h('button', { type: 'button', 'aria-label': 'Restar', onclick: () => bump(-1) }, '−'),
      h('label', { class: 'stepper__value' },
        isMoney ? h('span', { class: 'stepper__unit' }, currencySymbol()) : null,
        input,
        h('span', { class: 'stepper__unit' }, isMoney ? '/ semana' : step.unit)),
      h('button', { type: 'button', 'aria-label': 'Sumar', onclick: () => bump(1) }, '+')),
    range, err,
    h('div', { class: 'sticky-cta' }, cta));
}

function renderInfo(step) {
  const cta = h('button', {
    type: 'button', class: 'btn btn--lg',
    onclick: async () => {
      try { await save(null, null, steps[index + 1]?.id); goTo(index + 1); } catch (e) { toast(e.message); }
    },
  }, 'Continuar');
  return h('section', { class: 'quiz__screen info-screen' },
    h('div', { html: MARK_SVG }),
    h('p', { class: 'eyebrow' }, step.eyebrow),
    h('h1', { class: 'title-lg' }, step.title),
    h('p', {}, step.body),
    h('div', { class: 'sticky-cta' }, cta));
}

function renderAnalysis(step) {
  const ring = h('div', { class: 'ring', style: '--p:0' }, h('span', {}, '0%'));
  const items = step.items.map((t) => h('li', {}, h('span', { class: 'checklist__dot', 'aria-hidden': 'true' }), t));
  const status = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const section = h('section', { class: 'quiz__screen analysis' }, ring, h('h1', {}, step.title), h('ul', { class: 'checklist' }, items), status);

  const completion = api('/api/assessment/complete', { method: 'POST', body: { program: PROGRAM } });
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / step.durationMs);
    const pct = Math.round(p * 100);
    ring.style.setProperty('--p', pct);
    ring.firstChild.textContent = `${pct}%`;
    const per = 1 / items.length;
    items.forEach((li, i) => {
      li.className = p >= per * (i + 1) ? 'is-done' : p >= per * i ? 'is-active' : '';
    });
    if (p < 1) requestAnimationFrame(tick);
    else finish();
  };
  requestAnimationFrame(tick);

  async function finish() {
    try {
      await completion;
      status.textContent = 'Resultados listos';
      window.location.assign(`/resultados?program=${PROGRAM}`);
    } catch (err) {
      if (err.data?.missing?.length) {
        toast('Falta alguna respuesta. Vamos a completarla.');
        const i = steps.findIndex((s) => s.id === err.data.missing[0]);
        goTo(i);
      } else {
        section.append(h('p', { class: 'form-error', style: 'margin-top:24px' }, err.message),
          h('button', { class: 'btn', style: 'margin-top:16px', onclick: () => render() }, 'Reintentar'));
      }
    }
  }
  return section;
}

function render() {
  const step = steps[index];
  updateChrome();
  const view = { single: renderSingle, multi: renderMulti, number: renderNumber, info: renderInfo, analysis: renderAnalysis }[step.type](step);
  screenEl.replaceChildren(view);
  window.scrollTo({ top: 0 });
  view.querySelector('h1')?.setAttribute('tabindex', '-1');
}

window.addEventListener('popstate', (e) => {
  const i = steps.findIndex((s) => s.id === (e.state?.step ?? location.hash.slice(1)));
  if (i >= 0 && steps[index].type !== 'analysis') goTo(i, { push: false });
});
backBtn.addEventListener('click', () => history.back());

async function init() {
  if (!PROGRAM_OK) return window.location.replace('/test');
  try {
    const [quiz, cfg, state] = await Promise.all([
      api(`/api/quiz?program=${PROGRAM}`), api('/api/config'), api(`/api/assessment?program=${PROGRAM}`)]);
    steps = quiz.steps;
    config = cfg;
    let assessment = state.assessment;
    const restart = new URLSearchParams(location.search).has('nuevo');
    if (assessment?.completed && !restart) return window.location.replace(`/resultados?program=${PROGRAM}`);
    if (!assessment || assessment.paid || restart || assessment.completed) {
      assessment = (await api('/api/assessment/reset', { method: 'POST', body: { program: PROGRAM } })).assessment;
    }
    answers = assessment.answers;
    // Retoma en el paso guardado o en la primera pregunta sin responder.
    let i = steps.findIndex((s) => s.id === assessment.currentStep);
    const firstMissing = steps.findIndex((s) => QUESTION_TYPES.includes(s.type) && answers[s.id] === undefined);
    if (i < 0 || (firstMissing >= 0 && firstMissing < i)) i = Math.max(0, firstMissing);
    if (steps[i].type === 'analysis' && firstMissing >= 0) i = firstMissing;
    index = i;
    history.replaceState({ step: steps[index].id }, '', `${restart ? location.pathname : ''}#${steps[index].id}`);
    render();
  } catch (err) {
    screenEl.replaceChildren(h('p', { class: 'notice' }, err.message));
  }
}

init();
