// Núcleo das traduções (navegador e servidor). O texto-fonte é o espanhol escrito no código;
// cada idioma tem um catálogo { 'texto em espanhol': 'tradução' }. Sem tradução, fica o espanhol.
// Chaves com {x} são modelos: 'Baja de {a} a {b} cigarrillos' também traduz 'Baja de 12 a 9 cigarrillos'.

export const LOCALES = ['es', 'en', 'fr', 'de', 'pt-BR', 'pt-PT'];
export const LOCALE_NAMES = { es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch', 'pt-BR': 'Português (Brasil)', 'pt-PT': 'Português (Portugal)' };

/** Normaliza qualquer código ('pt', 'pt-br', 'en-US'…) para um dos LOCALES, ou null. */
export function normLocale(code) {
  const c = String(code ?? '').trim().toLowerCase().replace('_', '-');
  if (!c) return null;
  if (c === 'pt-pt') return 'pt-PT';
  if (c.startsWith('pt')) return 'pt-BR';
  const base = c.split('-')[0];
  return LOCALES.includes(base) ? base : null;
}

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : s);

/** Prepara um catálogo: separa as chaves-modelo e compila cada uma em regex. */
export function compile(dict = {}) {
  const templates = [];
  for (const [key, val] of Object.entries(dict)) {
    if (!/\{\w+\}/.test(key)) continue;
    const names = [];
    const rx = key.split(/(\{\w+\})/).map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (m) { names.push(m[1]); return '([\\s\\S]+?)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('');
    templates.push({ rx: new RegExp(`^${rx}$`), names, val });
  }
  templates.sort((x, y) => y.rx.source.length - x.rx.source.length); // o modelo mais específico primeiro
  return { dict, templates };
}

/** Traduz um texto. vars preenche {x}; sem vars, tenta casar um modelo (texto já montado). */
export function translate(cat, s, vars) {
  if (typeof s !== 'string' || !cat) return s;
  const hit = cat.dict[s];
  if (hit != null) return fill(hit, vars);
  if (vars) return fill(s, vars);
  for (const tpl of cat.templates) {
    const m = tpl.rx.exec(s);
    if (!m) continue;
    const v = {};
    tpl.names.forEach((n, i) => { v[n] = translateValue(cat, m[i + 1]); });
    return fill(tpl.val, v);
  }
  return s;
}

// Um pedaço dentro de um modelo (ex.: o nome de um gatilho em minúsculas) também é traduzido.
function translateValue(cat, raw) {
  const direct = cat.dict[raw];
  if (direct != null) return direct;
  const cap = raw.charAt(0).toUpperCase() + raw.slice(1);
  const viaCap = cat.dict[cap];
  return viaCap != null ? viaCap.charAt(0).toLowerCase() + viaCap.slice(1) : raw;
}

// Campos estruturais (ids, valores de resposta, links): nunca são traduzidos.
const KEEP = new Set(['id', 'slug', 'code', 'key', 'value', 'plan', 'program', 'program_slug', 'email', 'url', 'href', 'image', 'icon', 'status',
  'type', 'layout', 'group', 'step', 'tone', 'personalize', 'currency', 'interval', 'kind', 'lookup', 'priceId']);

/** Traduz, em profundidade, todas as strings de um objeto (dados vindos do servidor). */
export function localize(cat, value) {
  if (!cat || value == null) return value;
  if (typeof value === 'string') return translate(cat, value);
  if (Array.isArray(value)) return value.map((v) => localize(cat, v));
  if (typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = KEEP.has(k) ? v : localize(cat, v);
    return out;
  }
  return value;
}
