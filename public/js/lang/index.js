// Idioma da tela: ?lang= → escolha salva (a mesma da home) → idioma do navegador → espanhol.
// Uso: import { t } from '/js/lang/index.js'; t('Texto en español') · t('Hola, {name}', { name }).
import { LOCALES, compile, localize as deep, normLocale, translate } from './core.js';

const KEY = 'alento-lang';
function resolve() {
  if (typeof window === 'undefined') return 'es'; // Node (testes que importam ui.js)
  const q = normLocale(new URLSearchParams(location.search).get('lang'));
  if (q) { try { localStorage.setItem(KEY, q); } catch { /* modo privado */ } return q; }
  try { const s = normLocale(localStorage.getItem(KEY)); if (s) return s; } catch { /* modo privado */ }
  for (const c of navigator.languages ?? [navigator.language]) { const n = normLocale(c); if (n) return n; }
  return 'es';
}

export { LOCALES };
export const locale = resolve();
if (typeof document !== 'undefined') document.documentElement.lang = locale;
const cat = compile(locale === 'es' ? {} : (await import(`./${locale}.js`)).default);

export const t = (es, vars) => translate(cat, es, vars);
export const localize = (value) => deep(cat, value);

// Fora do espanhol, a tela inteira passa pelo catálogo (textos do HTML e do JS, sem marcar um por um).
if (locale !== 'es' && typeof document !== 'undefined' && !location.pathname.startsWith('/growth')) (await import('./dom.js')).startDomTranslation(t);

/** Troca o idioma (guardado neste navegador) e recarrega a tela. */
export function setLocale(code) {
  try { localStorage.setItem(KEY, normLocale(code) ?? 'es'); } catch { /* modo privado */ }
}
