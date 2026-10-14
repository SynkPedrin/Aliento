import { $, api, h, toast } from '../ui.js';
import { celebrate, errorState, initApp, loading, page } from '../shell.js';

await initApp({ active: null });
const root = $('[data-root]');
const params = new URLSearchParams(location.search);

let exercises = [];
let audioCtx = null;

/** Tono suave generado (sin archivos) para marcar el cambio de fase. */
function chime(freq) {
  try {
    audioCtx ??= new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = 'sine';
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.9);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 1);
  } catch { /* sin audio disponible */ }
}

async function load() {
  loading(root);
  try { ({ exercises } = await api('/api/app/breathing')); } catch (err) { return errorState(root, err, load); }
  render();
}

function render() {
  page(root, { eyebrow: 'Ejercicio', title: 'Respirar', intro: 'Un minuto de respiración lenta ayuda a atravesar las ganas y a bajar el ritmo. Sigue el círculo.' });
  let ex = exercises.find((e) => e.slug === params.get('ejercicio')) ?? exercises[0];
  let minutes = 1;
  let sound = false;

  const exSelect = h('select', { class: 'select', id: 'ex' }, exercises.map((e) => h('option', { value: e.slug, selected: e.slug === ex.slug }, e.name)));
  const exDesc = h('p', { class: 'help' }, ex.description);
  const durSelect = h('select', { class: 'select', id: 'dur' }, [1, 2, 3, 5, 10].map((m) => h('option', { value: m }, `${m} ${m === 1 ? 'minuto' : 'minutos'}`)));
  const soundBox = h('input', { type: 'checkbox', role: 'switch', id: 'snd' });
  const label = h('span', { class: 'breathe__label' }, 'Preparado');
  const circle = h('div', { class: 'breathe__circle', 'aria-hidden': 'true' }, label);
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const timeLeft = h('p', { class: 'breathe__time' });
  const startBtn = h('button', { class: 'btn btn--lg' }, 'Iniciar');
  const pauseBtn = h('button', { class: 'btn btn--ghost', hidden: true }, 'Pausar');
  const resetBtn = h('button', { class: 'btn btn--ghost', hidden: true }, 'Reiniciar');
  const finishBtn = h('button', { class: 'link', hidden: true }, 'Finalizar');

  exSelect.addEventListener('change', () => { ex = exercises.find((e) => e.slug === exSelect.value); exDesc.textContent = ex.description; });
  durSelect.addEventListener('change', () => { minutes = Number(durSelect.value); updateTime(minutes * 60); });
  soundBox.addEventListener('change', () => { sound = soundBox.checked; if (sound) chime(440); });

  // Estado de la sesión: el tiempo activo solo avanza mientras no está en pausa.
  let session = null; let running = false; let active = 0; let phaseIdx = 0; let phaseLeft = 0; let timer = null;
  const phases = () => [['Inspira', ex.inhale, 1, 523], ['Mantén', ex.hold, 1, 0], ['Suelta', ex.exhale, 0.55, 392], ['Pausa', ex.hold_after, 0.55, 0]].filter((p) => p[1] > 0);
  const planned = () => minutes * 60;
  const updateTime = (left) => { const m = Math.floor(left / 60); timeLeft.textContent = `${m}:${String(Math.max(0, left % 60)).padStart(2, '0')} restantes`; };
  updateTime(planned());

  function enterPhase() {
    const [word, secs, scale, freq] = phases()[phaseIdx];
    phaseLeft = secs;
    circle.style.setProperty('--d', `${secs}s`);
    circle.style.setProperty('--s', scale);
    live.textContent = word;
    if (sound && freq) chime(freq);
  }

  function tick() {
    active += 1;
    phaseLeft -= 1;
    updateTime(planned() - active);
    if (active >= planned()) return complete();
    if (phaseLeft <= 0) { phaseIdx = (phaseIdx + 1) % phases().length; enterPhase(); }
    label.replaceChildren(phases()[phaseIdx][0], h('small', { class: 'breathe__count' }, String(phaseLeft)));
  }

  async function start() {
    try {
      session = (await api('/api/app/breathing/sessions', { method: 'POST', body: { exercise: ex.slug, plannedSeconds: planned() } })).session;
    } catch (err) { return toast(err.message); }
    active = 0; phaseIdx = 0; exSelect.disabled = true; durSelect.disabled = true;
    enterPhase();
    label.replaceChildren(phases()[0][0], h('small', { class: 'breathe__count' }, String(phaseLeft)));
    resume();
  }
  function resume() { running = true; timer = setInterval(tick, 1000); startBtn.hidden = true; pauseBtn.hidden = false; pauseBtn.textContent = 'Pausar'; resetBtn.hidden = false; finishBtn.hidden = false; }
  function pause() { running = false; clearInterval(timer); pauseBtn.textContent = 'Continuar'; label.replaceChildren('En pausa'); circle.style.setProperty('--s', 0.7); }
  function reset() {
    clearInterval(timer); running = false; session = null; active = 0;
    exSelect.disabled = false; durSelect.disabled = false;
    startBtn.hidden = false; startBtn.textContent = 'Iniciar'; pauseBtn.hidden = true; resetBtn.hidden = true; finishBtn.hidden = true;
    label.textContent = 'Preparado'; circle.style.setProperty('--s', 0.55); updateTime(planned());
  }
  async function complete() {
    clearInterval(timer); running = false;
    label.textContent = 'Muy bien';
    try {
      const r = await api(`/api/app/breathing/sessions/${session.id}/complete`, { method: 'POST', body: { activeSeconds: active } });
      celebrate(r.achievements);
      toast('Ejercicio completado y registrado.');
    } catch (err) { toast(err.message); }
    pauseBtn.hidden = true; resetBtn.hidden = true; finishBtn.hidden = true;
    startBtn.hidden = false; startBtn.textContent = 'Repetir';
    session = null; exSelect.disabled = false; durSelect.disabled = false;
    if (params.get('desde') === 'ganas') {
      root.querySelector('.breathe').append(h('a', { class: 'btn btn--ghost', href: '/dashboard#ganas' }, 'Volver a mis ganas'));
    }
  }
  // Finalizar antes de tiempo: la sesión no cuenta como completada (no se envía la finalización).
  function finishEarly() { reset(); toast('Sesión finalizada. Solo se registran los ejercicios completos.'); }

  startBtn.addEventListener('click', () => (startBtn.textContent === 'Repetir' ? (reset(), start()) : start()));
  pauseBtn.addEventListener('click', () => (running ? pause() : resume()));
  resetBtn.addEventListener('click', reset);
  finishBtn.addEventListener('click', finishEarly);
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) pause(); });

  root.append(
    h('section', { class: 'card' },
      h('div', { class: 'form-grid' },
        h('div', { class: 'field' }, h('label', { for: 'ex' }, 'Ejercicio'), exSelect, exDesc),
        h('div', { class: 'field' }, h('label', { for: 'dur' }, 'Duración'), durSelect),
        h('label', { class: 'toggle', for: 'snd' }, h('span', {}, h('strong', {}, 'Sonido suave'), h('br'), h('span', { class: 'help' }, 'Un tono al cambiar de fase')), soundBox))),
    h('section', { class: 'card u-mt-16' },
      h('div', { class: 'breathe' }, circle, live, timeLeft,
        h('div', { class: 'actions-row', style: 'justify-content:center' }, startBtn, pauseBtn, resetBtn), finishBtn)));
}

load();
