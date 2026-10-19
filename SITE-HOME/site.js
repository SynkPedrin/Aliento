/* Alento · site institucional */
(function () {
  const A = window.Alento, C = A.C;
  // Link do quiz de entrada: o desenvolvedor substitui aqui
  const QUIZ_URL = '#comecar';

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
  document.querySelectorAll('[data-quiz]').forEach(a => {
    if (a.getAttribute('href') === '#') a.setAttribute('href', QUIZ_URL + (a.dataset.quiz ? '?tema=' + a.dataset.quiz : ''));
  });

  /* ---------- Idiomas ---------- */
  const LANGS = window.ALENTO_LANGS, DICT = window.ALENTO_I18N, DEFAULT = 'es';
  const pick = c => LANGS.find(l => l.code.toLowerCase() === String(c || '').toLowerCase());

  // Selos das lojas: desenho no padrão oficial (substituir pelos arquivos oficiais localizados antes de publicar)
  const APPLE = '<path fill="#fff" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>';
  const PLAY = '<path fill="#FFC107" d="M22.018 13.298l-3.919 2.218-3.515-3.493 3.543-3.521 3.891 2.202a1.49 1.49 0 0 1 0 2.594z"/><path fill="#00C3FF" d="M1.337.924a1.486 1.486 0 0 0-.112.568v21.017c0 .217.045.419.124.6l11.155-11.087L1.337.924z"/><path fill="#00E676" d="M13.544 10.989l3.258-3.238L3.45.195a1.466 1.466 0 0 0-.946-.179l11.04 10.973z"/><path fill="#FF3D57" d="M13.544 13.056l-11 10.933c.298.036.612-.016.906-.183l13.324-7.54-3.23-3.21z"/>';
  const badge = (kind, t) => kind === 'apple'
    ? `<svg viewBox="0 0 24 24" aria-hidden="true">${APPLE}</svg><span><small>${t['store.apple.s']}</small><b>App Store</b></span>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true">${PLAY}</svg><span><small>${t['store.google.s']}</small><b>Google Play</b></span>`;

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
    document.querySelectorAll('[data-badge]').forEach(el => {
      el.innerHTML = badge(el.dataset.badge, t);
      el.setAttribute('aria-label', el.dataset.badge === 'apple' ? `${t['store.apple.s']} App Store` : `${t['store.google.s']} Google Play`);
    });
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
    box.hidden = true;
  });
})();
