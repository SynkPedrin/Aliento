// Lista os textos em espanhol (fonte das traduções) dos arquivos traduzidos.
//   node scripts/i18n-extract.js            → JSON com as chaves
//   node scripts/i18n-extract.js --missing  → o que falta em cada catálogo
// Literais com ${…} viram modelos: `Hola, ${name}` → 'Hola, {a}'.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Arquivos já traduzidos (cresce por etapa: funil → app → lições → legal).
export const I18N_FILES = [
  'server/quiz.js', 'server/content/funnels/sem-fumo-es.js', 'server/results.js', 'server/routes/public.js', 'server/routes/account.js', 'server/routes/util.js',
  'public/js/ui.js', 'public/js/pages/test.js', 'public/js/pages/resultados.js', 'public/js/paywall.js', 'public/js/lead-gate.js', 'public/js/content/sem-fumo-es.js',
  'public/js/charts.js', 'public/js/pages/bienvenida.js', 'public/js/pages/acceso.js', 'public/js/pages/olvide.js', 'public/js/pages/restablecer.js', 'public/js/pages/soporte.js', 'public/js/install.js',
  'public/test.html', 'public/resultados.html', 'public/acceso.html', 'public/bienvenida.html', 'public/olvide.html', 'public/restablecer.html', 'public/soporte.html',
];

const EN_IDS = new Set(['Ember', 'Clockwork', 'Storm', 'Tribe', 'Edge', 'Savor', 'FALLBACK', 'X-Alento-Lang', 'Escape', 'Tab']);
const SPANISH = /[áéíóúñ¿¡ÁÉÍÓÚÑ]|\b(el|la|los|las|de|del|que|tu|tus|en|con|por|para|un|una|y|es|se|no|sí|más|al|mes|meses|semanas?|días?|años?|horas?|hoy|ver)\b/i;
const looksLikeCode = (s) => /^[\w.\-/:#?=&%[\]@*]+$/.test(s) && !/[A-ZÁÉÍÓÚ]/.test(s[0] ?? '')
  || /^(\.|#|\/|https?:|data:|[a-z-]+:[^ ]|<\/?[a-z]+[^>]*>$)/.test(s) || /^[a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*$/.test(s) && !SPANISH.test(s);

function keysOf(src) {
  const out = new Set();
  const add = (s) => {
    const k = s.trim();
    if (k.length < 2 || !/[A-Za-zÁÉÍÓÚáéíóúñ]/.test(k) || looksLikeCode(k) || k.startsWith('<svg') || k.startsWith('[') || EN_IDS.has(k)) return; // [log] e ids
    // Caminhos SVG, modelos com {a}{b} colados (montados letra a letra) e pedaços de ternário.
    if (/^[MS][\s{\d]/.test(k) || /\}\{/.test(k) || /^[:?]/.test(k)) return;
    // Códigos de erro, cabeçalhos HTTP, ids de tipo (Ember-Storm), nomes de API e moedas.
    if (/^[A-Z0-9_]+$/.test(k) || /^[A-Z][a-z]+(-[A-Z][a-z]+)+$/.test(k) || /^[A-Z][a-z]+[A-Z]\w*$/.test(k) || /^[A-Z][a-z]+$/.test(k) && EN_IDS.has(k)) return;
    if (!/[A-ZÁÉÍÓÚ¿¡]/.test(k[0]) && !SPANISH.test(k)) return;
    out.add(k);
  };
  // '…' e "…" (sem atravessar linhas) e `…` (com ${…} → {a}, {b}…).
  for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g)) add((m[1] ?? m[2]).replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n'));
  for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/g)) {
    let i = 0;
    const tpl = m[1].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, () => `{${String.fromCharCode(97 + i++)}}`);
    if (!/^\s*\{a\}\s*$/.test(tpl)) add(tpl);
  }
  return out;
}
function htmlKeys(src) {
  const out = new Set();
  const body = src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
  for (const m of body.matchAll(/>([^<>]+)</g)) { const k = m[1].trim(); if (/[A-Za-zÁÉÍÓÚáéíóúñ]/.test(k)) out.add(k.replace(/\s+/g, ' ')); }
  for (const m of body.matchAll(/(?:title|placeholder|aria-label|alt|content)="([^"]+)"/g)) if (SPANISH.test(m[1]) || /^[A-ZÁÉÍÓÚ¿¡]/.test(m[1])) out.add(m[1]);
  return out;
}

// Trechos dos outros 4 programas (fora de venda): não entram na tradução por enquanto. [primeira, última linha]
const SKIP_LINES = {
  'server/quiz.js': [[136, 487]],
  'server/results.js': [[187, 462]],
  'public/js/pages/resultados.js': [[20, 58], [128, 251]],
  'public/js/paywall.js': [[19, 50]],
};

export function extract(files = I18N_FILES) {
  const keys = new Map();
  for (const f of files) {
    const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
    for (const [a, b] of SKIP_LINES[f] ?? []) for (let i = a - 1; i < b; i++) lines[i] = '';
    const src = lines.join('\n');
    for (const k of (f.endsWith('.html') ? htmlKeys(src) : keysOf(src))) if (!keys.has(k)) keys.set(k, f);
  }
  return keys;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const keys = extract();
  if (process.argv.includes('--missing')) {
    for (const l of ['en', 'fr', 'de', 'pt-BR', 'pt-PT']) {
      const cat = (await import(join(ROOT, `public/js/lang/${l}.js`))).default;
      const miss = [...keys.keys()].filter((k) => cat[k] == null);
      console.log(`${l}: ${miss.length} faltando de ${keys.size}`);
    }
  } else console.log(JSON.stringify(Object.fromEntries(keys), null, 1));
}
