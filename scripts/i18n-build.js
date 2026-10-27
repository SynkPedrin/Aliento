// Gera os catálogos public/js/lang/<idioma>.js a partir das tabelas i18n/*.json.
// Cada tabela: lista de linhas [espanhol, en, fr, de, pt-BR, pt-PT]. Edite as tabelas, não os catálogos.
//   npm run i18n:build
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const COLUMNS = ['en', 'fr', 'de', 'pt-BR', 'pt-PT'];

export function loadRows() {
  const rows = [];
  for (const f of readdirSync(join(ROOT, 'i18n')).filter((x) => x.endsWith('.json')).sort()) {
    for (const r of JSON.parse(readFileSync(join(ROOT, 'i18n', f), 'utf8'))) {
      if (!Array.isArray(r) || r.length !== 6) throw new Error(`${f}: linha inválida ${JSON.stringify(r).slice(0, 80)}`);
      rows.push(r);
    }
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = loadRows();
  COLUMNS.forEach((lang, i) => {
    const dict = {};
    for (const r of rows) if (r[i + 1]) dict[r[0]] = r[i + 1];
    writeFileSync(join(ROOT, 'public/js/lang', `${lang}.js`),
      `// Gerado por scripts/i18n-build.js a partir de i18n/*.json — não editar à mão.\nexport default ${JSON.stringify(dict, null, 0).replace(/","/g, '",\n"')};\n`);
  });
  console.log(`${rows.length} textos → ${COLUMNS.join(', ')}`);
}
