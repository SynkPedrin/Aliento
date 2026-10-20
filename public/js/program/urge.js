// Momento difícil en 3 pasos, generado desde urgeForm:
// 1) qué sientes + intensidad  2) técnica (con respiración guiada si hay exerciseId)  3) desenlace.
import { api, h, toast } from '../ui.js';
import { celebrate } from '../shell.js';
import { openDialog } from './modal.js';
import { BREATH_PATTERNS, EXERCISES } from './format.js';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Guía de respiración dentro del diálogo. Llama a onDone() al terminar o detener. */
function breathingGuide({ exerciseId, slug, onDone }) {
  const pattern = BREATH_PATTERNS[exerciseId] ?? BREATH_PATTERNS['calma-4-6'];
  const cycle = pattern.reduce((a, p) => a + p[1], 0);
  const cycles = Math.max(3, Math.round(60 / cycle));
  const planned = Math.max(30, cycles * cycle);
  const orb = h('div', { class: 'pg-orb', 'aria-hidden': 'true' });
  const phase = h('p', { class: 'pg-breath__phase', 'aria-live': 'off' }, 'Prepárate…');
  const count = h('p', { class: 'muted small', role: 'status' }, `${cycles} ciclos · ${planned} s`);
  const stop = h('button', { type: 'button', class: 'btn btn--ghost btn--block u-mt-16' }, 'Terminar');
  let timer = null, session = null, cancelled = false, done = false;
  const finish = (completed) => {
    if (done) return;
    done = true; clearTimeout(timer);
    if (session && completed) api(`/api/app/breathing/sessions/${session}/complete`, { method: 'POST', body: { activeSeconds: planned } }).catch(() => {});
    onDone(completed);
  };
  stop.addEventListener('click', () => { cancelled = true; finish(false); });
  api(`/api/app/breathing/sessions?program=${slug}`, { method: 'POST', body: { exercise: exerciseId, plannedSeconds: planned } })
    .then((r) => { session = r.session?.id ?? null; }).catch(() => {});
  let i = 0, c = 0;
  const step = () => {
    if (cancelled || done) return;
    if (c >= cycles) { finish(true); return; }
    const [label, secs, kind] = pattern[i];
    phase.textContent = `${label} · ${secs} s`;
    count.textContent = `Ciclo ${c + 1} de ${cycles}`;
    orb.dataset.phase = kind;
    orb.style.transitionDuration = reduceMotion() ? '0s' : `${kind === 'hold' ? 0 : secs}s`;
    timer = setTimeout(() => { i += 1; if (i >= pattern.length) { i = 0; c += 1; } step(); }, secs * 1000);
  };
  const start = () => { phase.setAttribute('aria-live', 'polite'); step(); };
  const el = h('div', { class: 'pg-breath' }, orb, phase, count, stop);
  setTimeout(start, 600);
  return { el, cancel: () => { cancelled = true; clearTimeout(timer); } };
}

export function openUrgeFlow({ d, onDone }) {
  const uf = d.urgeForm;
  const slug = d.program.slug;
  const base = `/api/app/programs/${slug}`;
  const state = { feeling: null, intensity: Math.ceil((uf.intensity.min + uf.intensity.max) / 2), technique: null, id: null, after: null };
  let step = 0, guide = null, changed = false;
  const dlg = openDialog(uf.cta, { onClose: () => { guide?.cancel(); if (changed) onDone?.(); } });
  const crisis = uf.crisis ? h('details', { class: 'pg-crisis' }, h('summary', {}, 'Si necesitas ayuda ahora'), h('p', { class: 'small' }, uf.crisis)) : null;

  async function ensureUrge() {
    if (state.id) return true;
    try {
      const r = await api(`${base}/urge`, { method: 'POST', body: {
        feeling: state.feeling, intensity: state.intensity, ...(state.technique ? { technique: state.technique.id } : {}),
      } });
      state.id = r.urge.id; changed = true;
      celebrate(r.achievements);
      return true;
    } catch (err) { toast(err.message); return false; }
  }
  async function resolve(outcome) {
    try {
      const body = { outcome, ...(state.technique ? { technique: state.technique.id } : {}) };
      if (state.after != null) body.afterIntensity = state.after;
      const r = await api(`${base}/urge/${state.id}`, { method: 'PATCH', body });
      celebrate(r.achievements);
      return true;
    } catch (err) { toast(err.message); return false; }
  }

  const stepper = (n) => h('p', { class: 'eyebrow' }, `Paso ${n} de 3`);
  const rangeBlock = (label, key, min, max, onInput) => {
    const out = h('output', { class: 'pg-range__out' }, String(state[key] ?? Math.ceil((min + max) / 2)));
    const r = h('input', { type: 'range', class: 'range', min, max, step: 1, value: state[key] ?? Math.ceil((min + max) / 2), 'aria-label': label });
    r.addEventListener('input', () => { state[key] = Number(r.value); out.textContent = r.value; r.setAttribute('aria-valuetext', `${r.value} de ${max}`); onInput?.(); });
    if (state[key] == null) state[key] = Number(r.value);
    return h('div', { class: 'field u-mt-16' }, h('div', { class: 'pg-range' }, h('span', { class: 'pg-label' }, label), out), r,
      h('span', { class: 'range-scale' }, h('span', {}, `${min}`), h('span', {}, `${max}`)));
  };

  function s1() {
    const chips = h('div', { class: 'chips', role: 'radiogroup', 'aria-labelledby': 'pg-feel' });
    const next = h('button', { type: 'button', class: 'btn', disabled: !state.feeling }, 'Continuar');
    const draw = () => chips.replaceChildren(...uf.feelings.map((f, idx) => h('button', {
      type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(state.feeling === f.id),
      onclick: () => { state.feeling = f.id; next.disabled = false; draw(); chips.children[idx].focus({ preventScroll: true }); },
    }, f.label)));
    draw();
    next.addEventListener('click', () => { step = 1; render(); });
    return [stepper(1), h('h2', { class: 'title-md', tabindex: '-1' }, uf.title), h('p', { class: 'muted u-mt-8' }, uf.body),
      h('p', { class: 'pg-label u-mt-16', id: 'pg-feel' }, '¿Qué estás sintiendo?'), chips,
      rangeBlock(uf.intensity.label, 'intensity', uf.intensity.min, uf.intensity.max),
      h('div', { class: 'modal__actions' }, h('button', { type: 'button', class: 'link', onclick: dlg.close }, 'Cerrar'), next)];
  }

  function s2() {
    const list = h('div', { class: 'stack', role: 'radiogroup', 'aria-label': 'Técnicas' });
    const go = h('button', { type: 'button', class: 'btn', disabled: !state.technique }, 'Continuar');
    const draw = () => {
      list.replaceChildren(...uf.techniques.map((t, idx) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(state.technique?.id === t.id), class: `option${state.technique?.id === t.id ? ' is-selected' : ''}`,
        onclick: () => { state.technique = t; go.disabled = false; go.textContent = t.exerciseId ? 'Respirar ahora' : 'Lo voy a probar'; draw(); list.children[idx].focus({ preventScroll: true }); },
      }, h('span', { class: 'option__label' }, h('strong', {}, t.label), h('br'), h('span', { class: 'small muted' }, t.detail)), h('span', { class: 'option__radio' }))));
    };
    draw();
    go.addEventListener('click', async () => {
      go.disabled = true;
      if (!(await ensureUrge())) { go.disabled = false; return; }
      step = state.technique.exerciseId ? 2 : 3; render();
    });
    return [stepper(2), h('h2', { class: 'title-md', tabindex: '-1' }, 'Elige algo que puedas probar ahora'), h('p', { class: 'muted u-mt-8' }, 'Solo una cosa. Si no te sirve, probamos otra.'),
      h('div', { class: 'u-mt-16' }, list),
      h('div', { class: 'modal__actions' }, h('button', { type: 'button', class: 'link', onclick: () => { step = 0; render(); } }, 'Atrás'), go)];
  }

  function sBreath() {
    const t = state.technique;
    guide = breathingGuide({ exerciseId: t.exerciseId, slug, onDone: () => { guide = null; step = 3; render(); } });
    return [h('p', { class: 'eyebrow' }, EXERCISES[t.exerciseId] ?? 'Respiración'), h('h2', { class: 'title-md', tabindex: '-1' }, t.label),
      h('p', { class: 'muted small u-mt-8' }, 'Sigue el círculo a tu ritmo. Si te mareas, respira con normalidad.'), guide.el];
  }

  function s3() {
    const t = state.technique;
    const [min, max] = [uf.intensity.min, uf.intensity.max];
    const support = h('p', { class: 'pg-support', hidden: true, role: 'status' }, uf.supportText);
    const btnOk = h('button', { type: 'button', class: 'btn btn--block' }, uf.resolvedLabel);
    const btnNo = h('button', { type: 'button', class: 'btn btn--ghost btn--block' }, uf.continuedLabel);
    const run = (outcome) => async () => {
      btnOk.disabled = btnNo.disabled = true;
      if (await resolve(outcome)) {
        changed = true;
        if (outcome === 'resolved') { dlg.close(); toast('Bien hecho. Lo has atravesado.'); } else { support.hidden = false; btnNo.hidden = btnOk.hidden = true; after.hidden = true; closeBtn.hidden = false; }
      } else btnOk.disabled = btnNo.disabled = false;
    };
    btnOk.addEventListener('click', run('resolved'));
    btnNo.addEventListener('click', run('continued'));
    const closeBtn = h('button', { type: 'button', class: 'btn btn--block u-mt-16', hidden: true, onclick: dlg.close }, 'Cerrar');
    const after = rangeBlock(uf.afterLabel, 'after', min, max);
    state.after = null; // solo se envía si la persona la mueve
    after.querySelector('input').addEventListener('input', (e) => { state.after = Number(e.target.value); });
    return [h('h2', { class: 'title-md', tabindex: '-1' }, uf.afterLabel),
      t && !t.exerciseId ? h('p', { class: 'muted u-mt-8' }, `${t.label}: ${t.detail}`) : h('p', { class: 'muted u-mt-8' }, 'Tómate un momento para notar cómo estás. Sin juicios.'),
      after, h('div', { class: 'stack u-mt-16' }, btnOk, btnNo), support, closeBtn,
      h('button', { type: 'button', class: 'link u-mt-16', onclick: dlg.close }, 'Decidirlo más tarde')];
  }

  function render() {
    guide?.cancel(); guide = null;
    dlg.setContent([s1, s2, sBreath, s3][step](), crisis);
  }
  render();
  return dlg;
}
