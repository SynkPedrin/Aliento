import { $, api, h, ICONS, MARK_SVG, setBusy, toast } from '../ui.js';
import { giveHealthConsent, submitLead, track } from '../track.js';
import { radarChart } from '../charts.js';
import { markLead, needsLead } from '../lead-gate.js';

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
let shownAt = Date.now();

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
  // Solo a la base propia (pixel:false): las respuestas del quiz nunca viajan a plataformas de anuncios.
  if (questionId) track('quiz_answered', { program: PROGRAM, question: questionId, answer: value, seconds: Math.round((Date.now() - shownAt) / 100) / 10, version: 'v1' }, { pixel: false });
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
  document.body.classList.toggle('quiz--hero', step.layout === 'hero');
  document.body.classList.toggle('theme-deep', step.tone === 'dark');
}

function optionButton(opt, selected, { multi, onClick }) {
  return h('button', { type: 'button', class: `option${selected ? ' is-selected' : ''}`, 'aria-pressed': String(selected), onclick: onClick },
    h('span', { class: 'option__label' }, opt.label),
    multi ? h('span', { class: 'option__check', html: ICONS.check }) : h('span', { class: 'option__radio', 'aria-hidden': 'true' }));
}

const OPTION_ICONS = {
  male: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="14" r="5"/><path d="M14 10l6-6M15 4h5v5"/></svg>',
  female: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/></svg>',
  dot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="5"/></svg>',
};

// Perfil de ejemplo para la portada (no son datos de la persona).
const DEMO_RADAR = [
  { label: 'Ansia', value: 72 }, { label: 'Hábito', value: 61 }, { label: 'Estrés', value: 44 },
  { label: 'Pertenecer', value: 29 }, { label: 'Enfoque', value: 39 }, { label: 'Placer', value: 37 },
];

function pick(step, o) {
  return (e) => {
    e.currentTarget.parentElement.querySelectorAll('[aria-pressed]').forEach((b) => { b.classList.remove('is-selected'); b.setAttribute('aria-pressed', 'false'); });
    e.currentTarget.classList.add('is-selected');
    e.currentTarget.setAttribute('aria-pressed', 'true');
    if (index === 0) giveHealthConsent(); // aviso visible junto a la primera pregunta
    answerAndNext(step, o.id);
  };
}

function renderHero(step) {
  return h('section', { class: 'quiz__screen hero-screen' },
    h('p', { class: 'eyebrow' }, step.eyebrow),
    h('h1', { class: 'title-lg' }, step.title),
    h('p', { class: 'subtitle' }, step.lead),
    radarChart(DEMO_RADAR, { caption: 'Ejemplo de perfil' }),
    h('h2', { class: 'hero-screen__q' }, step.question),
    h('div', { class: 'options options--pair' }, step.options.map((o) =>
      h('button', { type: 'button', class: 'option-pair', 'aria-pressed': String(answers[step.id] === o.id), onclick: pick(step, o) }, o.label))),
    h('p', { class: 'help hero-screen__legal' },
      'Al responder, aceptas los ', h('a', { href: '/terminos', target: '_blank' }, 'Términos'),
      ' y que tratemos tus respuestas, incluidas las relativas a tu salud y tus hábitos, solo para calcular tu resultado. Si no creas una cuenta, se eliminan en 30 días. ',
      h('a', { href: '/privacidad', target: '_blank' }, 'Política de privacidad'), '.'));
}

function renderSingle(step) {
  if (step.layout === 'hero') return renderHero(step);
  const current = answers[step.id];
  const item = (o) => {
    const attrs = { type: 'button', 'aria-pressed': String(current === o.id), onclick: pick(step, o) };
    if (step.layout === 'cards') {
      return h('button', { ...attrs, class: `option-card${current === o.id ? ' is-selected' : ''}` },
        h('span', { class: 'option-card__icon', html: OPTION_ICONS[o.icon] ?? '' }), h('span', {}, o.label));
    }
    if (step.layout === 'pair') return h('button', { ...attrs, class: `option-pair${current === o.id ? ' is-selected' : ''}` }, o.label);
    return optionButton(o, current === o.id, { onClick: attrs.onclick });
  };
  return h('section', { class: 'quiz__screen' },
    h('h1', {}, step.title),
    step.subtitle ? h('p', { class: 'subtitle' }, step.subtitle) : null,
    h('div', { class: `options${step.layout ? ` options--${step.layout}` : ''}` }, step.options.map(item)),
    index === 0 ? h('p', { class: 'help u-mt-16' },
      'Al responder, aceptas que tratemos tus respuestas —incluidas las relativas a tu bienestar y tus hábitos— solo para calcular tus resultados. Si no creas una cuenta, se eliminan en 30 días. ',
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
  // Pantalla personalizada: un párrafo por respuesta elegida (máx. 2), en el orden de las variantes.
  const picked = step.personalizedBy ? [].concat(answers[step.personalizedBy] ?? []) : [];
  const paras = Object.keys(step.variants ?? {}).filter((k) => picked.includes(k)).slice(0, 2).map((k) => step.variants[k]);
  const people = step.images ? h('div', { class: 'info-screen__people', 'aria-hidden': 'true' }, step.images.map((src) => h('img', { src, alt: '' }))) : null;
  return h('section', { class: `quiz__screen info-screen${step.tone === 'dark' ? ' info-screen--dark' : ''}` },
    people ?? (step.image ? h('img', { class: 'info-screen__img', src: step.imageByGender?.[answers.q_genero] ?? step.image, alt: '', loading: 'eager' }) : h('div', { html: MARK_SVG })),
    step.eyebrow ? h('p', { class: 'eyebrow' }, step.eyebrow) : null,
    step.stat ? h('p', { class: 'info-screen__stat' }, step.stat) : null,
    h('h1', { class: 'title-lg' }, step.title),
    ...(paras.length ? paras : [step.body]).map((t) => h('p', {}, t)),
    step.source ? h('p', { class: 'tiny info-screen__source' }, step.source) : null,
    h('div', { class: 'sticky-cta' }, cta));
}

/** Ahorro estimado: gasto semanal de la respuesta × 52, con barra animada (1 mes, 6 meses, 1 año). */
function renderSavings(step) {
  const weekly = steps.find((s) => s.id === step.from)?.options?.find((o) => o.id === answers[step.from])?.weekly ?? 0;
  const fmt = (v) => new Intl.NumberFormat(config.locale, { style: 'currency', currency: config.currency, maximumFractionDigits: 0 }).format(v);
  const marks = [['1 mes', weekly * 52 / 12], ['6 meses', weekly * 26], ['1 año', weekly * 52]];
  const fill = h('span', { class: 'savings-bar__fill' });
  const cta = h('button', { type: 'button', class: 'btn btn--lg', onclick: async () => { try { await save(null, null, steps[index + 1]?.id); goTo(index + 1); } catch (e) { toast(e.message); } } }, 'Continuar');
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = '100%'; }));
  return h('section', { class: 'quiz__screen info-screen info-screen--dark' },
    h('p', {}, h('span', { class: 'estimate-tag' }, 'Estimación')),
    h('h1', { class: 'title-lg' }, step.title.replace('{amount}', fmt(weekly * 52))),
    h('div', { class: 'savings-bar', role: 'img', 'aria-label': marks.map(([l, v]) => `${l}: ${fmt(v)}`).join(', ') },
      h('div', { class: 'savings-bar__track' }, fill),
      h('ol', { class: 'savings-bar__marks' }, marks.map(([l, v]) => h('li', {}, h('strong', {}, fmt(v)), h('span', {}, l))))),
    h('p', {}, step.body),
    h('div', { class: 'sticky-cta' }, cta));
}

function renderAnalysis(step) {
  const bar = h('div', { class: 'progress progress--lg', role: 'progressbar', 'aria-label': 'Análisis', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span'));
  const pctEl = h('p', { class: 'analysis__pct' }, '0%');
  const items = step.items.map((t) => h('li', {}, h('span', { class: 'checklist__dot', 'aria-hidden': 'true' }), t));
  const status = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const section = h('section', { class: 'quiz__screen analysis' }, step.image ? h('img', { class: 'analysis__img', src: step.image, alt: '' }) : null, h('h1', {}, step.title), pctEl, bar, h('ul', { class: 'checklist' }, items),
    h('p', { class: 'help analysis__note' }, 'Tus respuestas son privadas y solo se usan para crear tu plan.'), status);

  const completion = api('/api/assessment/complete', { method: 'POST', body: { program: PROGRAM } });
  completion.catch(() => {}); // el error se trata en finish()
  const popups = [...(step.popups ?? [])];
  let elapsed = 0, last = performance.now(), paused = false;

  // Micro-compromiso: la barra se detiene hasta que la persona responde (cualquier respuesta sigue).
  function popup({ question }) {
    paused = true;
    const answer = (value) => () => {
      track('quiz_commitment', { program: PROGRAM, question, answer: value }, { pixel: false });
      overlay.remove(); paused = false; last = performance.now();
    };
    const no = h('button', { type: 'button', class: 'btn btn--ghost btn--lg', onclick: answer('no') }, 'No');
    const overlay = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pp-q' },
      h('div', { class: 'card modal__card commit' },
        h('p', { class: 'help' }, 'Para continuar, dinos'),
        h('h2', { class: 'title-md', id: 'pp-q' }, question),
        h('div', { class: 'commit__btns' }, no, h('button', { type: 'button', class: 'btn btn--lg', onclick: answer('si') }, 'Sí'))));
    document.body.append(overlay);
    no.focus();
  }

  const tick = (t) => {
    if (!section.isConnected) return;
    if (!paused) elapsed += t - last;
    last = t;
    const p = Math.min(1, elapsed / step.durationMs);
    const pct = Math.round(p * 100);
    bar.firstChild.style.width = `${pct}%`;
    bar.setAttribute('aria-valuenow', pct);
    pctEl.textContent = `${pct}%`;
    const per = 1 / items.length;
    items.forEach((li, i) => { li.className = p >= per * (i + 1) ? 'is-done' : p >= per * i ? 'is-active' : ''; });
    if (!paused && popups.length && p >= popups[0].at) popup(popups.shift());
    if (p < 1) requestAnimationFrame(tick);
    else finish();
  };
  requestAnimationFrame(tick);

  async function finish() {
    try {
      await completion;
      status.textContent = 'Resultados listos';
      if (await needsLead()) renderLeadEmail();
      else window.location.assign(`/resultados?program=${PROGRAM}`);
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

// ---- E-mail y nombre antes del resultado (como en el embudo de referencia).
const lead = { email: '', marketing: false };

function leadScreen(...children) {
  countEl.textContent = '';
  backBtn.disabled = true;
  screenEl.replaceChildren(h('section', { class: 'quiz__screen lead-screen' }, ...children));
  screenEl.querySelector('input')?.focus();
}

function renderLeadEmail(error = '') {
  const email = h('input', { type: 'email', class: 'input', id: 'lead-email', autocomplete: 'email', inputmode: 'email', required: true, placeholder: 'tu@correo.com', value: lead.email });
  const health = h('input', { type: 'checkbox', id: 'lead-health' });
  const mkt = h('input', { type: 'checkbox', id: 'lead-mkt', checked: lead.marketing || null });
  const err = h('p', { class: 'form-error', role: 'alert' }, error);
  const form = h('form', { class: 'stack', novalidate: true },
    h('label', { class: 'field', for: 'lead-email' }, h('span', { class: 'field__label' }, 'Tu e-mail'), email),
    h('label', { class: 'check', for: 'lead-health' }, health,
      h('span', {}, 'Acepto que Alento use mis respuestas, incluidas las relativas a mi salud y mis hábitos, para crear mi plan. ', h('a', { href: '/privacidad', target: '_blank', rel: 'noopener' }, 'Política de privacidad'), '.')),
    h('label', { class: 'check', for: 'lead-mkt' }, mkt, h('span', {}, 'Quiero recibir consejos y recordatorios por e-mail (opcional).')),
    err,
    h('button', { type: 'submit', class: 'btn btn--lg btn--block' }, 'Ver mi resultado'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) { err.textContent = 'Introduce un e-mail válido.'; return; }
    if (!health.checked) { err.textContent = 'Necesitamos tu consentimiento para usar tus respuestas en tu plan.'; return; }
    Object.assign(lead, { email: email.value.trim(), marketing: mkt.checked });
    renderLeadName();
  });
  leadScreen(h('p', { class: 'eyebrow' }, 'Tu resultado está listo'),
    h('h1', { class: 'title-lg' }, 'Consulta tu resultado'),
    h('p', { class: 'subtitle' }, 'Escribe tu e-mail para ver tu perfil y recibir tu plan personalizado.'),
    form);
  track('lead_form_shown', { program: PROGRAM }, { pixel: false });
}

function renderLeadName() {
  const name = h('input', { class: 'input', id: 'lead-name', autocomplete: 'given-name', maxlength: '40', placeholder: 'Tu nombre' });
  const cta = h('button', { type: 'submit', class: 'btn btn--lg btn--block' }, 'Continuar');
  const form = h('form', { class: 'stack', novalidate: true },
    h('label', { class: 'field', for: 'lead-name' }, h('span', { class: 'field__label' }, 'Tu nombre'), name), cta);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const first = name.value.trim();
    setBusy(cta, true, 'Preparando tu resultado…');
    try {
      await submitLead({ email: lead.email, name: first, program: PROGRAM, marketingEmail: lead.marketing });
    } catch (ex) {
      // E-mail rechazado: se vuelve a pedir. Cualquier otro fallo no bloquea el resultado.
      if (['INVALID', 'CONSENT_REQUIRED', 'RATE_LIMITED'].includes(ex.code)) { renderLeadEmail(ex.message); return; }
    }
    markLead();
    try { if (first) localStorage.setItem('alento-name', first); } catch { /* modo privado */ }
    window.location.assign(`/resultados?program=${PROGRAM}`);
  });
  leadScreen(h('h1', { class: 'title-lg' }, '¿Cómo te llamamos?'),
    h('p', { class: 'subtitle' }, 'Así personalizamos tu resultado y tu plan.'),
    form);
}

function render() {
  shownAt = Date.now();
  const step = steps[index];
  updateChrome();
  const view = { single: renderSingle, multi: renderMulti, number: renderNumber, info: renderInfo, savings: renderSavings, analysis: renderAnalysis }[step.type](step);
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
    track('quiz_started', { program: PROGRAM });
    render();
  } catch (err) {
    screenEl.replaceChildren(h('p', { class: 'notice' }, err.message));
  }
}

init();
