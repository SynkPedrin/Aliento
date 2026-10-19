/* Alento · geometria oficial da marca.
   Símbolo, logotipo e ícone reproduzem exatamente os SVGs de assets/logos/.
   Patterns e formas derivadas usam apenas as três peças: sol, horizonte e respiração. */
(function () {
  const A = window.Alento = window.Alento || {};

  const C = A.C = {
    blue: '#1E3FFF', night: '#0A0F3C', mint: '#3EE0B5', mist: '#B9C8FF', air: '#EEF3FF', white: '#FFFFFF',
    wave: '#8E9DFF', waveNight: '#4A5BC4', lav: '#9B8CFF', coral: '#FF7A59', amber: '#FFC857',
    line: '#D5DCF5', muted: '#4A5185'
  };

  // Geometria do símbolo (viewBox de referência 120 × 120)
  A.SUN = { cx: 60, cy: 44, r: 14 };
  A.HORIZON = 'M22 80 C 44 70, 76 70, 98 80';
  A.BREATH = 'M38 96 C 52 91, 68 91, 82 96';
  A.STROKE = 12;

  const WM = A.WM = "M88 -482Q175 -520 274.5 -520.0Q374 -520 427.0 -462.0Q480 -404 480 -323V0H400L389 -64H386Q314 10 201 10Q133 10 85.5 -31.0Q38 -72 38.0 -143.0Q38 -214 96.5 -258.0Q155 -302 268 -302H389V-310Q389 -376 356.5 -405.0Q324 -434 244.0 -434.0Q164 -434 94 -400H88ZM389 -145V-229H280Q129 -229 129.0 -149.5Q129 -70 235 -70Q279 -70 320.0 -91.5Q361 -113 389 -145Z M733 -730V0H642V-730Z M1347 -255V-223H961Q969 -153 1013.0 -114.0Q1057 -75 1146.5 -75.0Q1236 -75 1312 -125H1317V-37Q1233 10 1119.5 10.0Q1006 10 937.5 -59.5Q869 -129 869.0 -247.5Q869 -366 930.0 -443.0Q991 -520 1108.0 -520.0Q1225 -520 1286.0 -443.0Q1347 -366 1347 -255ZM961 -297H1256Q1252 -369 1207.5 -406.0Q1163 -443 1108.0 -443.0Q1053 -443 1009.0 -406.0Q965 -369 961 -297Z M1746 -520Q1829 -520 1877.0 -464.0Q1925 -408 1925 -324V0H1834V-314Q1834 -436 1724 -436Q1637 -436 1560 -340V0H1469V-510H1549L1560 -446V-431H1562Q1643 -520 1746 -520Z M2347 -432H2202V-130Q2202 -88 2225 -78Q2244 -70 2274.0 -70.0Q2304 -70 2340 -86H2347V-12Q2305 10 2257 10Q2111 10 2111 -122V-432H2016V-438L2202 -620V-510H2347Z M2431.0 -255.0Q2431 -374 2501.0 -447.0Q2571 -520 2686.5 -520.0Q2802 -520 2872.5 -447.0Q2943 -374 2943.0 -255.0Q2943 -136 2872.5 -63.0Q2802 10 2686.5 10.0Q2571 10 2501.0 -63.0Q2431 -136 2431.0 -255.0ZM2571.5 -118.5Q2621 -73 2687.0 -73.0Q2753 -73 2802.5 -118.5Q2852 -164 2852.0 -255.5Q2852 -347 2802.5 -392.0Q2753 -437 2687.0 -437.0Q2621 -437 2571.5 -392.0Q2522 -347 2522.0 -255.5Q2522 -164 2571.5 -118.5Z";

  // [horizonte, sol, respiração, palavra]
  const SCHEMES = A.SCHEMES = {
    cor:    [C.blue, C.mint, C.wave, C.night],
    branco: [C.white, C.mint, C.wave, C.white],
    noite:  [C.mist, C.mint, C.waveNight, C.white],
    mono:   [C.blue, C.blue, C.blue, C.blue],
    'mono-branco': [C.white, C.white, C.white, C.white],
    'mono-noite':  [C.night, C.night, C.night, C.night]
  };

  // Partes com classes para animação. pathLength=1 permite desenhar as curvas.
  const SYM = A.SYM = (h, sun, b) =>
    `<circle class="sym-sun" cx="60" cy="44" r="14" fill="${sun}"/>` +
    `<path class="sym-h" pathLength="1" d="${A.HORIZON}" fill="none" stroke="${h}" stroke-width="12" stroke-linecap="round"/>` +
    `<path class="sym-b" pathLength="1" d="${A.BREATH}" fill="none" stroke="${b}" stroke-width="12" stroke-linecap="round"/>`;

  const scheme = k => SCHEMES[k] || SCHEMES.cor;
  const s = 620 / 72, gx = -16 * s, gy = 110 - 30 * s;
  A.LOGO_TRANSFORM = `translate(${gx} ${gy}) scale(${s})`;

  A.logo = (k = 'cor') => {
    const [h, sun, b, t] = scheme(k);
    return `<svg class="alento-logo" viewBox="-20 -10 3903 760" role="img" aria-label="Alento"><g class="sym" transform="${A.LOGO_TRANSFORM}">${SYM(h, sun, b)}</g><path class="wm" transform="translate(920 730)" fill="${t}" d="${WM}"/></svg>`;
  };

  A.symbol = (k = 'cor') => {
    const [h, sun, b] = scheme(k);
    return `<svg class="alento-symbol" viewBox="14 24 92 84" role="img" aria-label="Símbolo Alento">${SYM(h, sun, b)}</svg>`;
  };

  const ACC = A.ACC = { mint: C.mint, lav: C.lav, coral: C.coral, amber: C.amber };
  A.icon = (k = 'mint') =>
    `<svg class="alento-icon" viewBox="0 0 1024 1024" role="img" aria-label="Ícone Alento"><rect width="1024" height="1024" rx="230" fill="${C.blue}"/><g transform="translate(512 512) scale(6.2) translate(-60 -64)">${SYM(C.white, ACC[k] || k, C.wave)}</g></svg>`;

  /* ---------- Patterns: todos derivados da geometria do símbolo ---------- */
  const svg = (w, h, body, bg) =>
    `<svg class="alento-pattern" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`;
  let uid = 0;

  const PATTERNS = {
    // 1 · Repetição geométrica do símbolo completo, linhas alternadas deslocadas meio módulo
    symbols(w, h, o) {
      const cell = o.cell || 150, k = cell / 120, id = 'p' + (++uid);
      const [hc, sun, b] = o.colors || [C.white, C.mint, C.wave];
      const one = (x, y) => `<g transform="translate(${x} ${y}) scale(${k})">${SYM(hc, sun, b)}</g>`;
      return svg(w, h,
        `<defs><pattern id="${id}" width="${cell}" height="${cell * 2}" patternUnits="userSpaceOnUse">` +
        one(0, 0) + one(cell / 2, cell) + one(-cell / 2, cell) +
        `</pattern></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`, o.bg || C.blue);
    },
    // 2 · Ondas: a curva do horizonte repetida lado a lado, linhas deslocadas meio período
    waves(w, h, o) {
      const k = o.scale || 1.4, id = 'p' + (++uid), row = o.row || 30;
      const hump = (x, y) => `<path d="M${x} ${y + 10} C ${x + 22} ${y}, ${x + 54} ${y}, ${x + 76} ${y + 10}" fill="none" stroke="${o.stroke || C.blue}" stroke-width="${o.weight || 12}" stroke-linecap="round"/>`;
      return svg(w, h,
        `<defs><pattern id="${id}" width="76" height="${row * 2}" patternUnits="userSpaceOnUse" patternTransform="scale(${k})">` +
        hump(0, 0) + hump(38, row) + hump(-38, row) +
        `</pattern></defs><rect width="${w}" height="${h}" fill="url(#${id})"/>`, o.bg || C.air);
    },
    // 3 · Órbita: círculos (múltiplos do sol) e arcos do horizonte em composição livre
    orbit(w, h, o) {
      const u = Math.min(w, h) / 120;
      const circ = (x, y, r, c, op = 1) => `<circle cx="${x * w}" cy="${y * h}" r="${r * u}" fill="${c}" opacity="${op}"/>`;
      const ring = (x, y, r, c, sw = 12) => `<circle cx="${x * w}" cy="${y * h}" r="${r * u}" fill="none" stroke="${c}" stroke-width="${sw * u * 0.5}"/>`;
      const arc = (x, y, sc, c, path = A.HORIZON) => `<path d="${path}" transform="translate(${x * w} ${y * h}) scale(${sc * u}) translate(-60 -75)" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round"/>`;
      return svg(w, h,
        ring(.8, .3, 26, C.waveNight, 4) + circ(.8, .3, 9, C.mint) +
        arc(.32, .66, .95, C.blue) + arc(.35, .8, .6, C.wave, A.BREATH) +
        circ(.12, .22, 3, C.mist, .9) + ring(.14, .82, 14, C.waveNight, 4) +
        circ(.56, .14, 2, C.mint, .8) + arc(.84, .82, .55, C.mist) + circ(.6, .5, 18, C.blue, .28) +
        circ(.93, .58, 2.5, C.wave), o.bg || C.night);
    },
    // 4 · Recorte: elementos ampliados e cortados pelas bordas
    crop(w, h, o) {
      const k = o.k || (h / 60);
      const [hc, sun, b] = o.colors || [C.white, C.mint, C.wave];
      return svg(w, h, `<g transform="translate(${o.x ?? w * .5} ${o.y ?? h * .62}) scale(${k}) translate(-60 -78)">${SYM(hc, sun, b)}</g>`, o.bg || C.blue);
    }
  };
  A.pattern = (kind, w = 960, h = 540, o = {}) => (PATTERNS[kind] || PATTERNS.symbols)(w, h, o);

  // Hidratação declarativa: data-logo, data-symbol, data-icon, data-pattern
  A.hydrate = (root = document) => {
    if (A.hydrateScreens) A.hydrateScreens(root);
    root.querySelectorAll('[data-logo]').forEach(el => el.innerHTML = A.logo(el.dataset.logo));
    root.querySelectorAll('[data-symbol]').forEach(el => el.innerHTML = A.symbol(el.dataset.symbol));
    root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = A.icon(el.dataset.icon));
    root.querySelectorAll('[data-pattern]').forEach(el => {
      let o = {}; try { o = JSON.parse(el.dataset.opts || '{}'); } catch (e) {}
      el.innerHTML = A.pattern(el.dataset.pattern, +el.dataset.w || 960, +el.dataset.h || 540, o);
    });
  };
})();
