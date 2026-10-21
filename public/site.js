/* Alento · site institucional */
(function () {
  const A = window.Alento, C = A.C;
  // PWA: registrar el service worker también en la landing (la instalación y el
  // modo offline deben estar disponibles desde la primera visita a /).
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  }

  // Máscara da janela em curva do horizonte (mesma do símbolo)
  document.body.insertAdjacentHTML('afterbegin', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><clipPath id="clip-horizon" clipPathUnits="objectBoundingBox"><path d="M0,0.12 C0.289,0 0.711,0 1,0.12 L1,1 L0,1 Z"/></clipPath></defs></svg>');

  A.hydrate(document);
  document.querySelectorAll('[data-sym-accent]').forEach(el => {
    el.innerHTML = `<svg class="alento-symbol" viewBox="14 24 92 84">${A.SYM(C.blue, A.ACC[el.dataset.symAccent], C.wave)}</svg>`;
  });
  document.querySelectorAll('[data-sym-night]').forEach(el => {
    el.innerHTML = `<svg class="alento-symbol" viewBox="14 24 92 84">${A.SYM(C.mist, C.amber, C.waveNight)}</svg>`;
  });
  document.querySelectorAll('[data-ui-icon]').forEach(el => { el.innerHTML = A.ICONS[el.dataset.uiIcon]; });
  /* ---------- Idiomas ---------- */
  const LANGS = window.ALENTO_LANGS, DICT = window.ALENTO_I18N, DEFAULT = 'es';
  const pick = c => LANGS.find(l => l.code.toLowerCase() === String(c || '').toLowerCase());

  function setLang(code, save) {
    const lang = pick(code) || pick(DEFAULT);
    const t = Object.assign({}, DICT[DEFAULT], DICT[lang.code]);
    document.documentElement.lang = lang.code;
    document.title = t['meta.title'];
    document.querySelector('meta[name="description"]').content = t['meta.desc'];
    document.querySelector('meta[property="og:title"]').content = t['meta.title'];
    document.querySelectorAll('[data-i18n]').forEach(el => { const v = t[el.dataset.i18n]; if (v != null) el.innerHTML = v; });
    document.querySelectorAll('[data-age]').forEach(el => { el.textContent = t.age.replace('{n}', el.dataset.age); });
    document.querySelectorAll('[data-i18n-alt]').forEach(el => { el.alt = t[el.dataset.i18nAlt] || ''; });
    document.querySelectorAll('[data-i18n-aria]').forEach(el => el.setAttribute('aria-label', t[el.dataset.i18nAria] || ''));
    // Tela do app no celular
    A.L = t;
    document.querySelectorAll('.pocket').forEach(sec => A.hydrateScreens(sec));
    // Seletor
    document.querySelector('.lang__code').textContent = lang.short;
    document.querySelectorAll('.lang__menu [data-lang]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.lang === lang.code)));
    if (save) {
      try { localStorage.setItem('alento-lang', lang.code); } catch (e) {}
      const u = new URL(location.href); u.searchParams.set('lang', lang.code); history.replaceState(null, '', u);
    }
  }

  // Menu de idiomas
  const langBox = document.querySelector('.lang'), langBtn = langBox.querySelector('.lang__btn'), langMenu = langBox.querySelector('.lang__menu');
  langMenu.innerHTML = LANGS.map(l => `<li><button type="button" role="option" data-lang="${l.code}"><span>${l.name}</span><i>${l.short}</i></button></li>`).join('');
  const openMenu = on => { langMenu.hidden = !on; langBtn.setAttribute('aria-expanded', String(on)); if (on) (langMenu.querySelector('[aria-selected="true"]') || langMenu.querySelector('button')).focus(); };
  langBtn.addEventListener('click', () => openMenu(langMenu.hidden));
  langMenu.addEventListener('click', e => { const b = e.target.closest('[data-lang]'); if (b) { setLang(b.dataset.lang, true); openMenu(false); langBtn.focus(); } });
  document.addEventListener('click', e => { if (!langBox.contains(e.target)) openMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !langMenu.hidden) { openMenu(false); langBtn.focus(); } });

  let initial = new URLSearchParams(location.search).get('lang');
  if (!pick(initial)) { try { initial = localStorage.getItem('alento-lang'); } catch (e) { initial = null; } }
  setLang(pick(initial) ? initial : DEFAULT, false);

  // PWA: el service worker queda listo desde la primera visita (navegación offline en toda la web)
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });

  // Atrasos progressivos e revelação ao rolar
  document.querySelectorAll('.reveal').forEach(sec => {
    sec.querySelectorAll('[data-r]').forEach((el, k) => {
      if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', (el.dataset.d ?? (0.1 + k * 0.07)) + 's');
    });
  });
  const SHOT = /shot/.test(location.search);
  if (SHOT) document.documentElement.classList.add('shot');
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-active'); io.unobserve(e.target); if (e.target.id === 'como-funciona') runSun(); }
  }), { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach(s => SHOT ? (s.classList.add('is-active'), s.id === 'como-funciona' && setTimeout(runSun, 50)) : io.observe(s));

  // Barra de navegação sólida ao rolar
  const bar = document.querySelector('.topbar');
  const onScroll = () => bar.classList.toggle('is-solid', scrollY > 40);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Método: o sol percorre a curva do horizonte
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function runSun() {
    const svg = document.querySelector('.method__arc'), sun = document.querySelector('.method__sun');
    if (!svg || !sun || getComputedStyle(svg).display === 'none') return;
    const P = [[20, 100], [296, -26], [704, -26], [980, 100]];
    const b = (t, i) => (1 - t) ** 3 * P[0][i] + 3 * (1 - t) ** 2 * t * P[1][i] + 3 * (1 - t) * t * t * P[2][i] + t ** 3 * P[3][i];
    const place = t => {
      const r = svg.getBoundingClientRect(), sx = r.width / 1000, sy = sx;
      sun.style.transform = `translate(${b(t, 0) * sx}px, ${(b(t, 1) + 12) * sy}px)`;
    };
    if (reduce || SHOT) return place(1);
    const t0 = performance.now() + 400, dur = 3200;
    const tick = now => {
      const p = Math.min(1, Math.max(0, (now - t0) / dur));
      place(p < .5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    addEventListener('resize', () => place(1));
  }

  // Histórias: setas
  const track = document.querySelector('.stories');
  document.querySelectorAll('[data-slide]').forEach(btn => btn.addEventListener('click', () => {
    track.scrollBy({ left: +btn.dataset.slide * Math.min(420, track.clientWidth * .85), behavior: reduce ? 'auto' : 'smooth' });
  }));

  // Perguntas: uma aberta por vez
  const items = document.querySelectorAll('.faq__list details');
  items.forEach(d => d.addEventListener('toggle', () => { if (d.open) items.forEach(o => o !== d && (o.open = false)); }));

  // Cookies (preferência lembrada só neste navegador)
  const box = document.querySelector('.cookies');
  let saved = null;
  try { saved = localStorage.getItem('alento-cookies'); } catch (e) {}
  if (!saved && !SHOT) box.hidden = false;
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-cookies]'); if (!b) return;
    try { localStorage.setItem('alento-cookies', b.dataset.cookies); } catch (err) {}
    window.dispatchEvent(new Event('alento-consent')); // lo escucha js/track.js
    box.hidden = true;
  });
})();
