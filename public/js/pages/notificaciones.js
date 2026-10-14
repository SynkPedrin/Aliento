// Preferencias de recordatorios: consentimiento explícito, horario y categorías.
import { $, api, h, icon, setBusy, toast } from '../ui.js';
import { errorState, initApp, loading, page, userTimezone } from '../shell.js';

await initApp({ active: null });
const root = $('[data-root]');

const ZONES = [
  ['Europe/Madrid', 'España (península)'],
  ['Atlantic/Canary', 'España (Canarias)'],
  ['America/Mexico_City', 'México (Ciudad de México)'],
  ['America/Bogota', 'Colombia'],
  ['America/Lima', 'Perú'],
  ['America/Santiago', 'Chile'],
  ['America/Argentina/Buenos_Aires', 'Argentina'],
  ['America/Caracas', 'Venezuela'],
  ['America/Guayaquil', 'Ecuador'],
  ['America/Montevideo', 'Uruguay'],
  ['America/Asuncion', 'Paraguay'],
  ['America/La_Paz', 'Bolivia'],
  ['America/Guatemala', 'Centroamérica (Guatemala)'],
  ['America/Panama', 'Panamá'],
  ['America/Santo_Domingo', 'República Dominicana'],
  ['America/Puerto_Rico', 'Puerto Rico'],
  ['America/New_York', 'EE. UU. (Este)'],
  ['America/Los_Angeles', 'EE. UU. (Pacífico)'],
  ['UTC', 'UTC'],
];

const CATEGORIES = [
  ['lessons', 'Lección disponible', 'Cuando tengas una nueva lección de tu jornada lista para empezar.'],
  ['tracking', 'Recordatorio de seguimiento', 'Un aviso diario para registrar cómo ha ido tu día.'],
  ['exercises', 'Ejercicio recomendado', 'Sugerencias de respiración o ejercicios según tu plan.'],
  ['achievements', 'Logro desbloqueado', 'Cuando consigas un nuevo logro.'],
  ['weeklySummary', 'Resumen semanal', 'Un resumen de tu progreso una vez por semana.'],
];

async function load() {
  loading(root);
  try {
    render(await api('/api/app/notifications'));
  } catch (err) {
    errorState(root, err, load);
  }
}

const toggle = (id, label, help, checked) => {
  const input = h('input', { type: 'checkbox', role: 'switch', id, checked: Boolean(checked), 'aria-describedby': help ? `${id}-help` : null });
  return {
    input,
    el: h('label', { class: 'toggle', for: id },
      h('span', {}, h('strong', {}, label), help ? h('span', { class: 'help', id: `${id}-help` }, h('br'), help) : null),
      input),
  };
};

function render(prefs) {
  page(root, {
    eyebrow: 'Ajustes',
    title: 'Notificaciones',
    intro: 'Decide si quieres recibir recordatorios, cuándo y sobre qué. Puedes cambiarlo en cualquier momento.',
  });

  const detected = userTimezone();
  const zones = [...ZONES];
  if (!zones.some(([z]) => z === detected)) zones.unshift([detected, `Detectada: ${detected}`]);
  if (prefs.timezone && !zones.some(([z]) => z === prefs.timezone)) zones.unshift([prefs.timezone, prefs.timezone]);
  // Si nunca se ha dado el consentimiento, proponemos la zona del dispositivo.
  const initialZone = prefs.consentAt && prefs.timezone && prefs.timezone !== 'UTC' ? prefs.timezone : detected;
  const zoneSelect = h('select', { class: 'select', id: 'tz' }, zones.map(([z, l]) => h('option', { value: z, selected: z === initialZone }, z === detected && !l.startsWith('Detectada') ? `${l} · tu dispositivo` : l)));

  const time = h('input', { type: 'time', class: 'input', id: 'time', value: prefs.time ?? '09:00', step: 300, required: true });

  const master = toggle('enabled', 'Quiero recibir recordatorios', null, prefs.enabled);
  const cats = Object.fromEntries(CATEGORIES.map(([k, l, help]) => [k, toggle(`cat-${k}`, l, help, prefs[k])]));

  const details = h('div', {},
    h('div', { class: 'form-grid u-mt-16' },
      h('div', { class: 'field' }, h('label', { for: 'time' }, 'Hora de los recordatorios'), time),
      h('div', { class: 'field' }, h('label', { for: 'tz' }, 'Zona horaria'), zoneSelect)),
    h('h2', { class: 'section-title' }, '¿Sobre qué quieres que te avisemos?'),
    h('div', { role: 'group', 'aria-label': 'Categorías de recordatorios' }, Object.values(cats).map((c) => c.el)));

  const sync = () => {
    const on = master.input.checked;
    details.hidden = !on;
    [time, zoneSelect, ...Object.values(cats).map((c) => c.input)].forEach((el) => { el.disabled = !on; });
  };
  master.input.addEventListener('change', sync);
  sync();

  const btn = h('button', { type: 'submit', class: 'btn' }, 'Guardar preferencias');
  const form = h('form', {
    class: 'card',
    onsubmit: async (e) => {
      e.preventDefault();
      if (master.input.checked && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time.value)) { toast('Indica una hora válida.'); time.focus(); return; }
      const body = {
        enabled: master.input.checked,
        time: time.value || prefs.time || '09:00',
        timezone: zoneSelect.value || detected,
        ...Object.fromEntries(Object.entries(cats).map(([k, c]) => [k, c.input.checked])),
      };
      setBusy(btn, true, 'Guardando…');
      try {
        const saved = await api('/api/app/notifications', { method: 'PUT', body });
        toast('Preferencias guardadas.');
        render(saved);
      } catch (err) {
        toast(err.message);
        setBusy(btn, false);
      }
    },
  },
  master.el,
  h('p', { class: 'help' }, 'Al activarlo das tu consentimiento para recibir recordatorios de Aliento. Solo te avisaremos de las categorías que elijas y puedes desactivarlo cuando quieras.'),
  prefs.enabled && prefs.consentAt ? h('p', { class: 'help u-mt-8' }, `Consentimiento registrado el ${new Intl.DateTimeFormat('es-US', { dateStyle: 'long' }).format(new Date(prefs.consentAt))}.`) : null,
  details,
  h('div', { class: 'u-mt-16' }, btn));

  const device = h('div', { class: 'u-mt-16' });
  root.append(...[
    prefs.deliveryAvailable === false ? h('div', { class: 'notice notice--warn' }, icon('info', 'notice__icon'),
      h('div', {}, 'Tus preferencias quedan guardadas. El envío de recordatorios se activará cuando esté disponible el canal de notificaciones; no recibirás avisos hasta entonces.')) : null,
    h('div', { class: 'u-mt-16 admin-wide' }, form),
    prefs.deliveryAvailable ? device : null,
  ].filter(Boolean));
  if (prefs.deliveryAvailable) renderDevice(device, prefs);
}

// ------------------------------------------------------------------ este dispositivo (Web Push)
const b64ToBytes = (b64) => {
  const raw = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function renderDevice(box, prefs) {
  const card = (...children) => box.replaceChildren(h('section', { class: 'card stack' }, h('h2', { class: 'title-md' }, 'Este dispositivo'), ...children));
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!supported) {
    return card(h('p', { class: 'muted' }, ios && !standalone
      ? 'En iPhone y iPad, primero añade Aliento a tu pantalla de inicio (botón Compartir › «Añadir a pantalla de inicio») y abre la app desde allí para activar las notificaciones.'
      : 'Este navegador no admite notificaciones push. Prueba con Chrome, Edge, Firefox o Safari actualizados.'));
  }
  const { publicKey } = await api('/api/app/push');
  const reg = await navigator.serviceWorker.register('/sw.js');
  const current = await reg.pushManager.getSubscription();

  if (Notification.permission === 'denied') {
    return card(h('p', { class: 'muted' }, 'Las notificaciones están bloqueadas para Aliento en este navegador. Puedes permitirlas desde la configuración del sitio (icono del candado junto a la dirección).'));
  }

  if (current) {
    const test = h('button', { class: 'btn btn--ghost btn--sm' }, 'Enviar notificación de prueba');
    test.addEventListener('click', async () => {
      setBusy(test, true, 'Enviando…');
      try { await api('/api/app/push/test', { method: 'POST' }); toast('Notificación enviada. Debería aparecer en unos segundos.'); } catch (err) { toast(err.message); } finally { setBusy(test, false); }
    });
    const off = h('button', { class: 'link' }, 'Desactivar en este dispositivo');
    off.addEventListener('click', async () => {
      await api('/api/app/push/subscriptions', { method: 'DELETE', body: { endpoint: current.endpoint } }).catch(() => {});
      await current.unsubscribe();
      toast('Notificaciones desactivadas en este dispositivo.');
      renderDevice(box, prefs);
    });
    return card(
      h('p', {}, h('span', { class: 'pill pill--ok' }, 'Activadas'), ' Este dispositivo recibe tus recordatorios.'),
      !prefs.enabled ? h('p', { class: 'help' }, 'Activa también «Quiero recibir recordatorios» arriba para que te lleguen los avisos programados.') : null,
      h('div', { class: 'actions-row', style: 'margin:0' }, test), off);
  }

  const on = h('button', { class: 'btn' }, 'Activar en este dispositivo');
  on.addEventListener('click', async () => {
    setBusy(on, true, 'Activando…');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('No has dado permiso para mostrar notificaciones.');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      await api('/api/app/push/subscriptions', { method: 'POST', body: sub.toJSON() });
      toast('Notificaciones activadas en este dispositivo.');
      renderDevice(box, prefs);
    } catch (err) {
      setBusy(on, false);
      toast(err.message);
    }
  });
  return card(h('p', { class: 'muted' }, 'Para recibir los recordatorios aquí, activa las notificaciones de este navegador o dispositivo. Puedes hacerlo en cada dispositivo que uses.'), h('div', {}, on));
}

load();
