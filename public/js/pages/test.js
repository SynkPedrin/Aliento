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

// Portada: el radar alterna seis perfiles de ejemplo (no son datos de la persona), como en el embudo original.
const RADAR_AXES = ['Ansia', 'Hábito', 'Estrés', 'Pertenecer', 'Enfoque', 'Placer'];
const RADAR_PROFILES = [[86, 52, 46, 28, 33, 41], [45, 85, 38, 30, 52, 27], [48, 33, 87, 25, 40, 36], [30, 42, 35, 84, 22, 55], [38, 49, 27, 24, 83, 31], [33, 28, 41, 52, 26, 88]];

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
    h('p', { class: 'hero-screen__sub' }, step.subtitle),
    radarChart(RADAR_AXES.map((label, i) => ({ label, value: RADAR_PROFILES[0][i] })), { caption: 'Ejemplo de perfil', cycle: RADAR_PROFILES }),
    h('h1', { class: 'hero-screen__title' }, `${step.title} `, h('span', { class: 'mark' }, step.titleMark)),
    h('p', { class: 'hero-screen__q' }, step.question),
    h('div', { class: 'options options--pair' }, step.options.map((o) =>
      h('button', { type: 'button', class: 'option-pair', 'aria-pressed': String(answers[step.id] === o.id), onclick: pick(step, o) }, o.label))),
    h('p', { class: 'help hero-screen__legal' },
      'Si sigues adelante, aceptas nuestros ', h('a', { href: '/terminos', target: '_blank' }, 'Términos y condiciones'), ' | ',
      h('a', { href: '/privacidad', target: '_blank' }, 'Política de privacidad'), '.'),
    h('p', { class: 'help hero-screen__legal' }, `© ${new Date().getFullYear()} Alento. Todos los derechos reservados.`));
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

// Orden (1, 2, 3…) de la opción elegida: el embudo original personaliza por posición.
const orderOf = (qid, value) => (steps.find((s) => s.id === qid)?.options?.findIndex((o) => o.id === value) ?? -1) + 1;
const FORM_KEYS = { 1: 'cigarettes', 2: 'e-cig/vape', 3: 'heated-tobacco', 4: 'cigars', 5: 'shisha/hookah', 6: 'pouches/snus' };
const YEAR_KEYS = { 1: 'less-than-1-year', 2: '1-2-years', 3: '3-5-years', 4: '6-9-years', 5: '10-plus-years' };

function personalText(step) {
  const t = step.texts ?? {};
  if (step.personalize === 'duration') {
    return t.byForm?.[FORM_KEYS[orderOf('q_producto', answers.q_producto)]]?.[YEAR_KEYS[orderOf('q_anios', answers.q_anios)]] ?? t.fallback;
  }
  if (step.personalize === 'friend') {
    const picked = [].concat(answers.q_disfrute ?? []).map((v) => orderOf('q_disfrute', v)).filter(Boolean);
    const add = picked.length ? t.pleasure?.[picked[Math.floor(Math.random() * picked.length)]] : '';
    return [t.friend?.[orderOf('q_amigo', answers.q_amigo)] ?? t.friend?.FALLBACK, add].filter(Boolean).join('\n\n');
  }
  if (step.personalize === 'goal') {
    const tried = [].concat(answers.q_metodos ?? []).map((v) => orderOf('q_metodos', v)).find((o) => t.tried?.[o]);
    const text = [t.tried?.[tried], t.goal?.[orderOf('q_meta3m', answers.q_meta3m)]].filter(Boolean).join('\n\n');
    return text || t.fallback;
  }
  return step.body;
}

const continueBtn = () => {
  const cta = h('button', {
    type: 'button', class: 'btn btn--lg',
    onclick: async () => { try { await save(null, null, steps[index + 1]?.id); goTo(index + 1); } catch (e) { toast(e.message); } },
  }, 'Continuar');
  return h('div', { class: 'sticky-cta' }, cta);
};

function renderInfo(step) {
  const image = step.imageByGender?.[answers.q_genero] ?? step.image;
  return h('section', { class: `quiz__screen info-screen${step.tone === 'dark' ? ' info-screen--dark' : ''} info-screen--story` },
    step.title ? h('h1', { class: 'title-lg' }, step.title) : null,
    step.html ? h('p', { class: 'info-screen__text', html: step.html }) : h('p', { class: 'info-screen__text' }, personalText(step)),
    image ? h('img', { class: 'info-screen__img info-screen__img--leaf', src: image, alt: '', loading: 'eager' }) : null,
    continueBtn());
}

function renderNotalone() {
  return h('section', { class: 'quiz__screen info-screen info-screen--dark notalone' },
    h('h1', { class: 'notalone__title' }, '¡No estás solo!'),
    h('p', { class: 'notalone__stat notalone__stat--mobile' }, 'Más de 280 millones'),
    h('div', { class: 'notalone__row' },
      h('img', { class: 'notalone__people', src: '/assets/quiz/people-left-mobile.webp', alt: '' }),
      h('div', {}, h('p', { class: 'notalone__stat notalone__stat--desktop' }, 'Más de 960 millones'), h('p', { class: 'notalone__lead' }, 'tienen problemas con el tabaco en todo el mundo')),
      h('img', { class: 'notalone__people', src: '/assets/quiz/people-right-mobile.webp', alt: '' })),
    h('blockquote', { class: 'notalone__quote' }, h('span', { 'aria-hidden': 'true' }, '"'), 'Con la ayuda adecuada, el cambio siempre es posible', h('br'), h('br'), 'Alento te ofrece apoyo diario y herramientas contrastadas y con base científica'),
    continueBtn());
}

function renderScience(step) {
  return h('section', { class: 'quiz__screen info-screen info-screen--dark science' },
    h('h1', { class: 'title-lg' }, step.title),
    h('h2', { class: 'science__sub' }, step.subtitle),
    h('div', { class: 'science__grid' }, step.logos.map(([name, file]) =>
      h('div', { class: 'science__card' }, h('span', {}, name), h('img', { src: `/assets/quiz/logos/${file}.webp`, alt: name, loading: 'lazy' })))),
    continueBtn());
}

/** Ahorro anual según el gasto mensual elegido, con barra animada y etiqueta (como en el original). */
function renderSavings(step) {
  const annual = steps.find((s) => s.id === step.from)?.options?.find((o) => o.id === answers[step.from])?.annual ?? 2304;
  const fmt = (v) => new Intl.NumberFormat(config.locale, { style: 'currency', currency: config.currency, maximumFractionDigits: 0 }).format(v);
  const pct = Math.max(6, Math.min(100, Math.round((annual / (annual + 200)) * 100)));
  const fill = h('span', { class: 'savings-bar__fill' });
  const pill = h('span', { class: 'savings-bar__pill' }, fmt(annual));
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${pct}%`; pill.style.left = `${Math.max(5, Math.min(95, pct))}%`; }));
  return h('section', { class: 'quiz__screen info-screen info-screen--dark savings' },
    h('h1', { class: 'title-lg' }, step.title.replace('{amount}', fmt(annual))),
    h('p', { class: 'savings__sub' }, step.body),
    h('div', { class: 'savings-bar' },
      h('div', { class: 'savings-bar__track' }, fill, pill),
      h('div', { class: 'savings-bar__ends' }, h('span', {}, fmt(0)), h('span', {}, fmt(annual)))),
    continueBtn());
}

function renderAnalysis(step) {
  const bar = h('div', { class: 'progress progress--lg', role: 'progressbar', 'aria-label': 'Análisis', 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('span'));
  const items = step.items.map((t) => h('li', {}, h('span', { class: 'checklist__dot', 'aria-hidden': 'true' }), t));
  const status = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const section = h('section', { class: 'quiz__screen analysis' },
    h('h1', {}, step.title, h('span', { class: 'analysis__dots', 'aria-hidden': 'true' }, h('span', {}, '.'), h('span', {}, '.'), h('span', {}, '.'))),
    bar, h('ul', { class: 'checklist' }, items),
    step.testimonial ? h('figure', { class: 'card analysis__quote' },
      h('figcaption', {}, h('strong', {}, step.testimonial.name), h('span', { class: 'analysis__stars', 'aria-label': '5 estrellas' }, '★★★★★')),
      h('blockquote', {}, step.testimonial.text)) : null,
    step.supportingText ? h('p', { class: 'analysis__support' }, step.supportingText) : null,
    step.supportingText ? h('img', { class: 'analysis__avatars', src: '/assets/quiz/grouped-people.jpg', alt: '' }) : null,
    status);

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
        h('p', { class: 'help' }, 'Para seguir adelante, especifica'),
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
  const email = h('input', { type: 'email', class: 'input', id: 'lead-email', autocomplete: 'email', inputmode: 'email', required: true, placeholder: 'Introduce tu dirección de correo electrónico', value: lead.email });
  const health = h('input', { type: 'checkbox', id: 'lead-health' });
  const err = h('p', { class: 'form-error', role: 'alert' }, error);
  const form = h('form', { class: 'stack', novalidate: true },
    h('label', { class: 'field', for: 'lead-email' }, h('span', { class: 'field__label' }, 'Tu dirección de correo electrónico:'), email),
    h('label', { class: 'check', for: 'lead-health' }, health,
      h('span', {}, 'Respetamos tu privacidad y nos comprometemos a proteger tus datos personales. Tus datos se tratarán de acuerdo con nuestra ', h('a', { href: '/privacidad', target: '_blank', rel: 'noopener' }, 'Política de privacidad'), '.')),
    err,
    h('button', { type: 'submit', class: 'btn btn--lg btn--block' }, 'Ver mis resultados'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) { err.textContent = 'Por favor, introduce una dirección de correo electrónico válida.'; return; }
    if (!health.checked) { err.textContent = 'Marca la casilla para continuar.'; return; }
    Object.assign(lead, { email: email.value.trim(), marketing: false });
    renderLeadName();
  });
  leadScreen(h('h1', { class: 'title-lg' }, 'Consulta tus resultados'),
    h('p', { class: 'subtitle' }, 'Introduce tu dirección de correo electrónico para recibir los resultados de tu prueba y seguir avanzando con nuestro plan personalizado.'),
    form);
  track('lead_form_shown', { program: PROGRAM }, { pixel: false });
}

function renderLeadName() {
  const name = h('input', { class: 'input', id: 'lead-name', autocomplete: 'given-name', maxlength: '40', placeholder: 'Escribe tu nombre' });
  const cta = h('button', { type: 'submit', class: 'btn btn--lg btn--block' }, 'Continuar');
  const form = h('form', { class: 'stack', novalidate: true },
    h('label', { class: 'field', for: 'lead-name' }, h('span', { class: 'field__label' }, 'Tu nombre:'), name), cta);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const first = name.value.trim();
    setBusy(cta, true, 'Cargando…');
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
  leadScreen(h('h1', { class: 'title-lg' }, 'Alento quiere saludarte como es debido'),
    h('p', { class: 'subtitle' }, '¿Cómo te podemos llamar?'),
    form);
}

function render() {
  shownAt = Date.now();
  const step = steps[index];
  updateChrome();
  const view = { single: renderSingle, multi: renderMulti, number: renderNumber, info: renderInfo, notalone: renderNotalone, science: renderScience, savings: renderSavings, analysis: renderAnalysis }[step.type](step);
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
