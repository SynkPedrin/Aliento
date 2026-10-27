// Gera os ícones PNG do e-mail (clientes de e-mail não mostram SVG). Traço da marca: arredondado, Azul Fôlego, sol Menta.
import { chromium } from 'playwright';
const out = process.argv[2];
const B = '#1E3FFF', M = '#3EE0B5', R = '#8E9DFF';
const s = (d) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="96" height="96" fill="none" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const icons = {
  app: s(`<rect x="13" y="5" width="22" height="38" rx="6" stroke="${B}" stroke-width="3.5"/><circle cx="24" cy="20" r="4.5" fill="${M}"/><path d="M17.5 29 C 21 27, 27 27, 30.5 29" stroke="${B}" stroke-width="3"/><path d="M20.5 34 C 22.5 33, 25.5 33, 27.5 34" stroke="${R}" stroke-width="3"/>`),
  jornada: s(`<path d="M5 36 C 15 24, 33 24, 43 36" stroke="${B}" stroke-width="3.5"/><circle cx="31" cy="20" r="6" fill="${M}"/><circle cx="10" cy="31" r="2" fill="${B}"/><circle cx="18" cy="27" r="2" fill="${B}"/>`),
  diario: s(`<rect x="9" y="6" width="30" height="36" rx="6" stroke="${B}" stroke-width="3.5"/><path d="M16 17 H32 M16 24 H32 M16 31 H25" stroke="${B}" stroke-width="3"/><circle cx="32" cy="32" r="4" fill="${M}"/>`),
  volta: s(`<circle cx="24" cy="22" r="7" fill="${M}"/><path d="M6 32 C 16 26, 32 26, 42 32" stroke="${B}" stroke-width="3.5"/><path d="M13 40 C 19 37, 29 37, 35 40" stroke="${R}" stroke-width="3.5"/><path d="M24 6 V9 M11 11 L13 13 M37 11 L35 13" stroke="${B}" stroke-width="3"/>`),
};
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [name, svg] of Object.entries(icons)) {
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.locator('svg').screenshot({ path: `${out}/passo-${name}.png`, omitBackground: true });
}
await browser.close();
