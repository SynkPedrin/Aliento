// Instalación de Alento como app (PWA).
//  · Android / Chrome / Edge: diálogo nativo (beforeinstallprompt) cuando el navegador lo ofrece.
//  · iPhone / iPad: la instalación la hace el usuario desde Safari → tutorial ilustrado.
//  · Navegadores integrados (Instagram, Facebook, TikTok…): primero hay que abrir en el navegador.
//  · Nunca se promete una instalación automática donde no existe.
import { h } from './ui.js';

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isInAppBrowser = () => /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Line\/|Twitter|LinkedInApp|GSA\//i.test(navigator.userAgent);
const isIOSSafari = () => isIOS() && /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent) && !isInAppBrowser();

/**
 * Estado de instalación:
 * 'installed' | 'prompt' (diálogo nativo disponible) | 'ios' (Safari) | 'ios-other' (otro navegador en iOS)
 * | 'in-app' (navegador integrado de una red social) | 'manual' (menú del navegador) .
 */
export function installState() {
  if (isStandalone()) return 'installed';
  if (window.__alientoInstallPrompt) return 'prompt';
  if (isInAppBrowser()) return 'in-app';
  if (isIOS()) return isIOSSafari() ? 'ios' : 'ios-other';
  return 'manual';
}

/** Abre el diálogo nativo. Devuelve 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  const ev = window.__alientoInstallPrompt;
  if (!ev) return 'unavailable';
  window.__alientoInstallPrompt = null;
  ev.prompt();
  const { outcome } = await ev.userChoice;
  return outcome;
}

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8"/></svg>';
const ADD_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
const DOTS_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';

const step = (n, text, iconHtml) => h('li', { class: 'install-step' },
  h('span', { class: 'install-step__n', 'aria-hidden': 'true' }, String(n)),
  h('span', { class: 'install-step__text' }, text),
  iconHtml ? h('span', { class: 'install-step__icon', html: iconHtml }) : null);

/** Contenido de ayuda según el estado (para un modal o una tarjeta). */
export function installHelp(state = installState()) {
  if (state === 'ios') {
    return [
      h('h2', { class: 'title-md' }, 'Instala Alento en tu iPhone'),
      h('p', { class: 'muted u-mt-8' }, 'Accede a tu espacio de bienestar directamente desde tu pantalla de inicio.'),
      h('ol', { class: 'install-steps' },
        step(1, 'Abre Alento en Safari.'),
        step(2, 'Toca el botón Compartir (abajo en el iPhone, arriba en el iPad).', SHARE_ICON),
        step(3, 'Selecciona «Añadir a pantalla de inicio».', ADD_ICON),
        step(4, 'Confirma tocando «Añadir».'),
        step(5, 'Abre Alento desde el icono de tu pantalla de inicio.')),
      h('p', { class: 'help' }, 'Si no ves el botón Compartir, toca el menú «…» de la barra de direcciones y busca «Compartir» o «Añadir a pantalla de inicio». La primera vez que abras la app instalada tendrás que iniciar sesión.', h('span', { class: 'install-step__icon install-step__icon--inline', html: DOTS_ICON })),
    ];
  }
  if (state === 'ios-other') {
    return [h('h2', { class: 'title-md' }, 'Abre Alento en Safari'),
      h('p', { class: 'muted u-mt-8' }, 'En iPhone y iPad, la instalación se hace desde Safari. Copia la dirección de esta página, ábrela en Safari y sigue los pasos para «Añadir a pantalla de inicio».')];
  }
  if (state === 'in-app') {
    return [h('h2', { class: 'title-md' }, 'Ábrelo en tu navegador'),
      h('p', { class: 'muted u-mt-8' }, 'Estás dentro de otra app. Toca el menú «…» o «⋮» y elige «Abrir en el navegador» (Safari o Chrome). Desde allí podrás instalar Alento.')];
  }
  return [h('h2', { class: 'title-md' }, 'Instala Alento'),
    h('p', { class: 'muted u-mt-8' }, 'Abre el menú de tu navegador (⋮ o ⋯) y elige «Instalar aplicación» o «Añadir a pantalla de inicio». Si tu navegador no ofrece esta opción, puedes seguir usando Alento desde aquí sin ningún problema.')];
}

/**
 * Acción del botón «Instalar Alento». Devuelve el resultado para que la pantalla reaccione.
 * Si hay diálogo nativo lo abre; si no, muestra las instrucciones adecuadas en `showHelp`.
 */
export async function installAction(showHelp) {
  const state = installState();
  if (state === 'installed') return 'installed';
  if (state === 'prompt') {
    const outcome = await promptInstall();
    if (outcome === 'accepted') { try { localStorage.setItem('al_installed', '1'); } catch { /* sin almacenamiento */ } }
    return outcome;
  }
  showHelp(installHelp(state));
  return 'instructions';
}
