// Gráficos SVG ligeros, sin dependencias. Marcas finas, rejilla discreta,
// tooltip al pasar el cursor y tabla accesible con los datos.
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  return el;
};

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function dataTable(caption, headers, rows) {
  return h('details', { class: 'chart-table' },
    h('summary', {}, 'Ver datos en tabla'),
    h('table', {},
      h('caption', { class: 'sr-only' }, caption),
      h('thead', {}, h('tr', {}, headers.map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))),
    ));
}

/**
 * Gráfico de líneas / columnas sobre un eje X categórico.
 * series: [{ key, label, kind: 'line'|'area'|'dashed'|'bars', values: [number|null] }]
 */
export function xyChart({ labels, series, format = (v) => v, caption, height = 240, endLabel }) {
  const W = 640, H = height, m = { t: 16, r: 16, b: 30, l: 44 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const all = series.flatMap((x) => x.values).filter((v) => v != null);
  const max = niceMax(Math.max(...all, 0));
  const n = labels.length;
  const hasBars = series.some((x) => x.kind === 'bars');
  const band = iw / (hasBars ? n : Math.max(1, n - 1));
  const xAt = (i) => m.l + (hasBars ? band * (i + 0.5) : band * i);
  const yAt = (v) => m.t + ih - (v / max) * ih;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': caption });
  // 5 intervalos si dan valores redondos (0-2-4-6-8-10), si no 4.
  const ticks = Number.isInteger(max / 5) && max >= 5 ? 5 : 4;
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i, y = yAt(v);
    svg.append(s('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: i === 0 ? 'axis-line' : 'grid-line' }));
    const t = s('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end' });
    t.textContent = format(v, true);
    svg.append(t);
  }
  const step = hasBars && n <= 20 ? 1 : Math.ceil(n / 7); // barras: todas las etiquetas (p. ej. P1…P20 del quiz)
  labels.forEach((l, i) => {
    if (i % step && i !== n - 1) return;
    const t = s('text', { x: xAt(i), y: H - 8, 'text-anchor': 'middle' });
    t.textContent = l;
    svg.append(t);
  });

  for (const ser of series) {
    if (ser.kind === 'bars') {
      const bw = Math.min(24, band - 4);
      ser.values.forEach((v, i) => {
        if (v == null) return;
        const x = xAt(i) - bw / 2, y = yAt(v), hgt = Math.max(0, m.t + ih - y);
        const r = Math.min(4, hgt);
        // Extremo redondeado arriba, base recta.
        svg.append(s('path', {
          class: ser.muted?.[i] ? 'bar-muted' : 'bar-1',
          d: `M${x},${m.t + ih} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${m.t + ih} Z`,
        }));
      });
      continue;
    }
    const pts = ser.values.map((v, i) => (v == null ? null : [xAt(i), yAt(v)]));
    const segs = [];
    let cur = [];
    for (const p of pts) { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } }
    if (cur.length) segs.push(cur);
    for (const seg of segs) {
      const d = seg.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
      if (ser.kind === 'area') svg.append(s('path', { class: 'area-1', d: `${d} L${seg.at(-1)[0]},${m.t + ih} L${seg[0][0]},${m.t + ih} Z` }));
      svg.append(s('path', { class: ser.kind === 'dashed' ? 'line-2' : 'line-1', d }));
    }
    if (ser.kind !== 'dashed') {
      const last = pts.findLast?.((p) => p) ?? pts.filter(Boolean).at(-1);
      if (last) {
        svg.append(s('circle', { cx: last[0], cy: last[1], r: 5, class: 'dot-1' }));
        if (endLabel) {
          const t = s('text', { x: last[0] - 8, y: last[1] - 12, 'text-anchor': 'end', class: 'value-label' });
          t.textContent = endLabel;
          svg.append(t);
        }
      }
    }
  }

  // Capa interactiva: guía vertical + tooltip con todas las series.
  const cross = s('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' });
  svg.append(cross);
  const wrap = h('div', { class: 'chart' }, svg);
  const tip = h('div', { class: 'chart-tooltip', hidden: true });
  wrap.append(tip);
  const hit = s('rect', { x: m.l, y: m.t, width: iw, height: ih, fill: 'transparent' });
  svg.append(hit);
  const show = (evt) => {
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(hasBars ? (px - m.l) / band - 0.5 : (px - m.l) / band)));
    const x = xAt(i);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
    tip.replaceChildren(h('strong', {}, labels[i]),
      ...series.map((ser) => h('div', {}, `${ser.label}: ${ser.values[i] == null ? 'sin registro' : format(ser.values[i])}`)));
    tip.hidden = false;
    const top = Math.min(...series.map((ser) => (ser.values[i] == null ? m.t + ih : yAt(ser.values[i]))));
    tip.style.left = `${Math.min(Math.max((x / W) * 100, 14), 86)}%`;
    tip.style.top = `${(top / H) * 100}%`;
  };
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); };
  hit.addEventListener('pointermove', show);
  hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', hide);

  const frag = h('div', {}, wrap);
  if (series.length > 1) {
    frag.append(h('div', { class: 'legend' }, series.map((ser) => h('span', {},
      h('i', { class: ser.kind === 'dashed' ? 'key-2' : ser.kind === 'bars' ? 'key-bar' : '' }), ser.label))));
  }
  frag.append(dataTable(caption, ['', ...series.map((x) => x.label)],
    labels.map((l, i) => [l, ...series.map((x) => (x.values[i] == null ? '—' : format(x.values[i])))])));
  return frag;
}

/** Barras horizontales con porcentaje. La fila principal se resalta y se nombra. */
export function hbars(items) {
  const list = h('ul', { class: 'hbars' }, items.map((it, i) => h('li', { class: `hbars__row${i === 0 ? ' is-top' : ''}` },
    h('span', { class: 'hbars__label' }, it.label, i === 0 ? h('span', { class: 'muted small' }, ' · principal') : null),
    h('span', { class: 'hbars__value' }, `${it.value}%`),
    h('span', { class: 'hbars__track', 'aria-hidden': 'true' }, h('span', { class: 'hbars__fill', 'data-w': it.value })),
  )));
  requestAnimationFrame(() => setTimeout(() => list.querySelectorAll('.hbars__fill').forEach((f) => { f.style.width = `${f.dataset.w}%`; }), 80));
  return list;
}

/** Indicador segmentado 0–max. */
export function gauge(score, max, labels) {
  return h('div', { class: 'gauge', role: 'img', 'aria-label': `${score} de ${max}` },
    h('div', { class: 'gauge__track' }, Array.from({ length: max + 1 }, (_, i) => h('span', { class: `gauge__seg${i <= score ? ' is-on' : ''}` }))),
    h('div', { class: 'gauge__scale' }, labels.map((l) => h('span', {}, l))));
}

/**
 * Radar (araña) de 0–100 por eje, con etiqueta y porcentaje en cada vértice. Crece desde el centro.
 * cycle: lista de perfiles (arrays de valores) que se van alternando con transición suave (portada del quiz).
 */
export function radarChart(axes, { caption = 'Perfil', size = 320, cycle = null } = {}) {
  const c = size / 2, R = size * 0.3, n = axes.length;
  const at = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const ring = (k) => axes.map((_, i) => at(i, R * k).join(',')).join(' ');
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': `${caption}: ${axes.map((x) => `${x.label} ${x.value}%`).join(', ')}`, class: 'radar' });
  for (const k of [1 / 3, 2 / 3, 1]) svg.append(s('polygon', { points: ring(k), class: 'radar__grid' }));
  axes.forEach((_, i) => { const [x, y] = at(i, R); svg.append(s('line', { x1: c, y1: c, x2: x, y2: y, class: 'radar__grid' })); });
  const shape = s('polygon', { points: ring(0), class: 'radar__shape' });
  svg.append(shape);
  const dots = axes.map(() => { const d = s('circle', { cx: c, cy: c, r: 4, class: 'radar__dot' }); svg.append(d); return d; });
  const valueEls = axes.map((x, i) => {
    const [lx, ly] = at(i, R + 34);
    const t = s('text', { x: lx, y: ly - 4, 'text-anchor': 'middle', class: 'radar__label' }); t.textContent = x.label;
    const v = s('text', { x: lx, y: ly + 14, 'text-anchor': 'middle', class: 'radar__value' });
    svg.append(t, v);
    return v;
  });
  const draw = (vals) => {
    const pts = vals.map((v, i) => at(i, R * Math.max(0.04, v / 100)));
    shape.setAttribute('points', pts.map((q) => q.join(',')).join(' '));
    pts.forEach(([x, y], i) => { dots[i].setAttribute('cx', x); dots[i].setAttribute('cy', y); valueEls[i].textContent = `${Math.round(vals[i])}%`; });
  };
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const tween = (from, to, ms, done) => {
    if (reduced) { draw(to); done?.(); return; }
    const t0 = performance.now();
    const step = (t) => {
      if (!svg.isConnected && t - t0 > 100) return;
      const p = Math.min(1, (t - t0) / ms), e = -(Math.cos(Math.PI * p) - 1) / 2;
      draw(from.map((v, i) => v + (to[i] - v) * e));
      if (p < 1) requestAnimationFrame(step); else done?.();
    };
    requestAnimationFrame(step);
  };
  const zero = axes.map(() => 0);
  if (cycle?.length) {
    let k = 0;
    const next = () => { if (!svg.isConnected) return; const from = cycle[k]; k = (k + 1) % cycle.length; tween(from, cycle[k], 2200, () => setTimeout(next, 1600)); };
    draw(cycle[0]);
    setTimeout(next, 1600);
  } else {
    tween(zero, axes.map((x) => x.value), 900);
  }
  return h('div', { class: 'radar-wrap' }, svg);
}
