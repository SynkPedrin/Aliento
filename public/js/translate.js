// Seletor de idioma em todas as telas (a home tem o seu próprio). Sem tradutor automático:
// os textos vêm dos catálogos em /js/lang. A escolha fica neste navegador e, com login, na conta.
import { LOCALES, LOCALE_NAMES, normLocale } from './lang/core.js';
import { locale, setLocale } from './lang/index.js';

const loggedIn = () => /(?:^|;\s*)al_s=/.test(document.cookie);
const hasChoice = () => { try { return Boolean(localStorage.getItem('alento-lang')); } catch { return true; } };

function choose(code) {
  setLocale(code);
  // Com login, o idioma fica salvo na conta (vale em outro aparelho e nos e-mails).
  const save = loggedIn() ? fetch('/api/profile', { method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: code }) }).catch(() => {}) : null;
  Promise.resolve(save).finally(() => location.reload());
}

async function syncFromAccount() {
  if (hasChoice() || !loggedIn()) return;
  try {
    const me = await (await fetch('/api/me', { credentials: 'same-origin' })).json();
    const acc = normLocale(me?.user?.locale);
    if (acc && acc !== locale) { setLocale(acc); location.reload(); }
  } catch { /* sem rede: segue com o idioma do navegador */ }
}

function mount() {
  if (window.ALENTO_I18N || location.pathname.startsWith('/growth') || document.getElementById('gt-btn')) return; // home: seletor próprio · painel: só português
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/translate.css'; document.head.append(css);
  // Quiz e resultado: botão discreto no topo (embaixo ficam os botões de resposta).
  const top = /^\/(quiz|test|resultados)(\/|$)/.test(location.pathname);
  const btn = document.createElement('button');
  btn.id = 'gt-btn'; btn.type = 'button'; btn.className = `gt-btn${top ? ' gt-btn--top' : ''}`;
  btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Idioma / Language');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg><span></span>';
  btn.querySelector('span').textContent = locale === 'pt-BR' ? 'PT-BR' : locale === 'pt-PT' ? 'PT-PT' : locale.toUpperCase();
  const menu = document.createElement('div');
  menu.className = `gt-menu${top ? ' gt-menu--top' : ''}`; menu.hidden = true; menu.setAttribute('role', 'menu');
  for (const code of LOCALES) {
    const b = document.createElement('button');
    b.type = 'button'; b.lang = code; b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(code === locale)); b.textContent = LOCALE_NAMES[code];
    b.addEventListener('click', () => (code === locale ? toggle(false) : choose(code)));
    menu.append(b);
  }
  const toggle = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
  document.body.append(btn, menu);
}

// Restos do tradutor do Google de versões anteriores: a cookie forçaria a tradução automática.
for (const d of ['', `; domain=${location.hostname}`, `; domain=.${location.hostname}`]) document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
syncFromAccount();
