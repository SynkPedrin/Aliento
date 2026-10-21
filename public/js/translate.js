// Botón «Traducir» en todas las pantallas. Usa Google Translate solo cuando la persona lo elige
// (el texto visible de la pantalla se envía a Google para traducirlo). La landing tiene su propio selector de idioma.
const LANGS = [['es', 'Español (original)'], ['pt', 'Português'], ['en', 'English'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano']];
const KEY = 'alento-gt';
const store = {
  get() { try { return localStorage.getItem(KEY) || 'es'; } catch { return 'es'; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch { /* modo privado */ } },
};

function setCookie(lang) {
  const host = location.hostname;
  const expire = 'Thu, 01 Jan 1970 00:00:00 GMT';
  for (const d of [null, host, `.${host}`]) document.cookie = `googtrans=; expires=${expire}; path=/${d ? `; domain=${d}` : ''}`;
  if (lang !== 'es') document.cookie = `googtrans=/es/${lang}; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
}

function loadWidget() {
  if (document.getElementById('gt-root') || window.google?.translate) return;
  const root = document.createElement('div');
  root.id = 'gt-root'; root.hidden = true; root.setAttribute('translate', 'no');
  document.body.append(root);
  window.__gtInit = () => {
    new window.google.translate.TranslateElement({ pageLanguage: 'es', autoDisplay: false, includedLanguages: LANGS.map((l) => l[0]).join(',') }, 'gt-root');
    // Respaldo: si la cookie no dispara la traducción, se acciona el selector interno del widget.
    const want = store.get();
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
  location.reload();
}

function mount() {
  if (window.ALENTO_I18N) return; // landing: ya tiene su selector de idioma
  if (document.getElementById('gt-btn')) return;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/css/translate.css'; document.head.append(css);
  const current = store.get();
  const btn = document.createElement('button');
  btn.id = 'gt-btn'; btn.type = 'button'; btn.className = 'gt-btn notranslate'; btn.setAttribute('translate', 'no');
  btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg><span></span>';
  btn.querySelector('span').textContent = current === 'es' ? 'Traducir' : (LANGS.find((l) => l[0] === current)?.[1] ?? 'Traducir');
  const menu = document.createElement('div');
  menu.className = 'gt-menu notranslate'; menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('translate', 'no');
  for (const [code, name] of LANGS) {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(code === current)); b.textContent = name;
    b.addEventListener('click', () => apply(code));
    menu.append(b);
  }
  const note = document.createElement('p');
  note.className = 'gt-note'; note.textContent = 'La traducción la hace Google Translate: el texto de la pantalla se envía a Google. Si no quieres, elige «Español».';
  menu.append(note);
  const toggle = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(menu.hidden); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggle(false); });
  document.body.append(btn, menu);
  if (current !== 'es') { setCookie(current); loadWidget(); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
