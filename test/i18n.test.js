// Traduções: todo texto dos arquivos já traduzidos tem versão nos 5 idiomas; modelos e API traduzem certo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract } from '../scripts/i18n-extract.js';
import { loadRows } from '../scripts/i18n-build.js';
import { compile, localize, normLocale, translate } from '../public/js/lang/core.js';
import en from '../public/js/lang/en.js';
import de from '../public/js/lang/de.js';

const CATS = Object.fromEntries(await Promise.all(['en', 'fr', 'de', 'pt-BR', 'pt-PT'].map(async (l) => [l, (await import(`../public/js/lang/${l}.js`)).default])));

test('i18n: nenhum texto sem tradução (rode npm run i18n:build depois de editar i18n/*.json)', () => {
  const keys = [...extract().keys()];
  for (const [lang, cat] of Object.entries(CATS)) {
    const missing = keys.filter((k) => cat[k] == null);
    assert.deepEqual(missing.slice(0, 10), [], `${lang}: ${missing.length} sem tradução`);
  }
});

test('i18n: tabelas sem chave repetida e modelos com os mesmos {x}', () => {
  const seen = new Set();
  for (const row of loadRows()) {
    assert.ok(!seen.has(row[0]), `repetido: ${row[0]}`); seen.add(row[0]);
    const vars = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join();
    for (const tr of row.slice(1)) assert.equal(vars(tr), vars(row[0]), `variáveis diferentes em: ${row[0]}`);
  }
});

test('i18n: modelos traduzem textos já montados, inclusive o pedaço de dentro', () => {
  const cat = compile(en);
  assert.equal(translate(cat, 'Baja de 12 a 9 cigarrillos al día'), 'Go from 12 to 9 cigarettes a day');
  assert.equal(translate(cat, 'Prepara una alternativa para «con el café»'), 'Prepare an alternative for “with coffee”');
  assert.equal(translate(cat, 'texto que no existe'), 'texto que no existe');
  // ids e valores de resposta nunca mudam; só os textos
  const out = localize(compile(de), { id: 'si', label: 'Sí', value: 'Sí', options: [{ id: 'no', label: 'No' }] });
  assert.deepEqual(out, { id: 'si', label: 'Ja', value: 'Sí', options: [{ id: 'no', label: 'Nein' }] });
  assert.equal(normLocale('pt'), 'pt-BR'); assert.equal(normLocale('pt-PT'), 'pt-PT'); assert.equal(normLocale('en-US'), 'en'); assert.equal(normLocale('it'), null);
});
