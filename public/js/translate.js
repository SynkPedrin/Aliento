// Idioma em todas as telas (fora a landing, que tem textos próprios em 6 idiomas).
// Ordem: escolha salva neste navegador → idioma salvo na conta → idioma do navegador → espanhol.
// Fora do espanhol, quem traduz é o Google Translate (o texto da tela vai para o Google).
const LANGS = [['es', 'Español'], ['en', 'English'], ['pt', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano']];
const KEY = 'alento-gt';
const HOME_KEY = 'alento-lang'; // a landing guarda aqui (es, pt-BR, pt-PT, en, fr, de)
const norm = (c) => { const b = String(c ?? '').toLowerCase().split('-')[0]; return LANGS.some((l) => l[0] === b) ? b : null; };
const store = {
  get() { try { return norm(localStorage.getItem(KEY)) ?? norm(localStorage.getItem(HOME_KEY)); } catch { return null; } },
  set(v) { try { localStorage.setItem(KEY, v); localStorage.setItem(HOME_KEY, v === 'pt' ? 'pt-BR' : v); } catch { /* modo privado */ } },
};
const browserLang = () => (navigator.languages ?? [navigator.language]).map(norm).find(Boolean) ?? 'es';
const loggedIn = () => /(?:^|;\s*)al_s=/.test(document.cookie);

function setCookie(lang) {
  const host = location.hostname;
  const expire = 'Thu, 01 Jan 1970 00:00:00 GMT';
  for (const d of [null, host, `.${host}`]) document.cookie = `googtrans=; expires=${expire}; path=/${d ? `; domain=${d}` : ''}`;
  if (lang !== 'es') document.cookie = `googtrans=/es/${lang}; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}

function loadWidget(want) {
  if (document.getElementById('gt-root') || window.google?.translate) return;
  const root = document.createElement('div');
  root.id = 'gt-root'; root.hidden = true; root.setAttribute('translate', 'no');
  document.body.append(root);
  window.__gtInit = () => {
    new window.google.translate.TranslateElement({ pageLanguage: 'es', autoDisplay: false, includedLanguages: LANGS.map((l) => l[0]).join(',') }, 'gt-root');
    // Respaldo: si la cookie no dispara la traducción, se acciona el selector interno del widget.
    let tries = 0;
    const t = setInterval(() => {
      const combo = document.querySelector('select.goog-te-combo');
      if (combo && want !== 'es') { clearInterval(t); if (combo.value !== want) { combo.value = want; combo.dispatchEvent(new Event('change')); } }
      else if (++tries > 40) clearInterval(t);
    }, 250);
  };
  const s = document.createElement('script');
  s.src = 'https://translate.google.com/translate_a/element.js?cb=__gtInit';
  s.async = true;
  document.head.append(s);
}

function apply(lang) {
  store.set(lang);
  setCookie(lang);
  // Logado: o idioma fica salvo na conta (vale em outro aparelho).
  const save = loggedIn() ? fetch('/api/profile', { method: 'PATCH', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: lang }) }).catch(() => {}) : null;
  Promise.resolve(save).finally(() => location.reload());
}

async function detect() {
  const saved = store.get();
  if (saved) return saved;
  if (loggedIn()) {
    try { const me = await (await fetch('/api/me', { credentials: 'same-origin' })).json(); if (norm(me?.user?.locale)) return norm(me.user.locale); } catch { /* sem rede: segue */ }
  }
  return browserLang();
}

async function mount() {
  if (window.ALENTO_I18N) return; // landing: ya tiene su selector de idioma
  if (location.pathname.startsWith('/growth')) return; // panel de gestión: solo portugués
  if (document.getElementById('gt-btn')) return;
  const current = await detect();
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/translate.css'; document.head.append(css);
  const btn = document.createElement('button');
  // Quiz e resultado: botão discreto no topo (embaixo ficam os botões de resposta).
  const top = /^\/(quiz|test|resultados)(\/|$)/.test(location.pathname);
  btn.id = 'gt-btn'; btn.type = 'button'; btn.className = `gt-btn notranslate${top ? ' gt-btn--top' : ''}`; btn.setAttribute('translate', 'no');
  btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg><span></span>';
  btn.querySelector('span').textContent = LANGS.find((l) => l[0] === current)?.[1] ?? 'Idioma';
  const menu = document.createElement('div');
  menu.className = `gt-menu notranslate${top ? ' gt-menu--top' : ''}`; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('translate', 'no');
  for (const [code, name] of LANGS) {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(code === current)); b.textContent = name;
    b.addEventListener('click', () => apply(code));
    menu.append(b);
  }
  const note = document.createElement('p');
  note.className = 'gt-note'; note.textContent = 'Traducción automática de Google Translate (el texto de la pantalla se envía a Google). Original: Español.';
  menu.append(note);
  const toggle = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
  document.body.append(btn, menu);
  setCookie(current); // sempre: em espanhol, apaga a cookie de tradução que tenha ficado
  if (current !== 'es') loadWidget(current);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount()); else mount();
