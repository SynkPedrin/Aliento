// PWA (TEST 20–22): instalabilidad comprobada con Chrome, responsividad y tutorial iOS.
import { test, expect } from '@playwright/test';
import { createAccount, login } from './helpers.js';

test('manifest válido, service worker activo y Chrome sin errores de instalabilidad', async ({ page }) => {
  await page.goto('/');
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('Aliento');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toMatch(/^\/dashboard/);
  for (const size of ['192x192', '512x512']) expect(manifest.icons.some((i) => i.sizes === size && i.purpose === 'any')).toBe(true);
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker?.getRegistration().then((r) => r?.active), null, { timeout: 15_000 });
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // «in-incognito» es propio de Playwright (contexto de incógnito): no es un fallo de la app.
  const real = installabilityErrors.filter((e) => e.errorId !== 'in-incognito');
  expect(real, JSON.stringify(installabilityErrors)).toEqual([]);
});

test('el service worker nunca guarda respuestas de /api', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15_000 }).catch(() => page.reload());
  await page.request.get('/api/config');
  const cachedApi = await page.evaluate(async () => {
    const out = [];
    for (const name of await caches.keys()) for (const req of await (await caches.open(name)).keys()) if (new URL(req.url).pathname.startsWith('/api/')) out.push(req.url);
    return out;
  });
  expect(cachedApi).toEqual([]);
});

test('sin conexión: página clara, no se simula ningún guardado', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15_000 }).catch(async () => { await page.reload(); });
  await context.setOffline(true);
  await page.goto('/una-pagina-no-visitada').catch(() => {});
  await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
  await context.setOffline(false);
});

for (const width of [360, 390, 412, 768]) {
  test(`responsividad ${width}px: sin desbordamiento horizontal en las páginas principales`, async ({ browser }) => {
    const email = createAccount();
    const ctx = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await ctx.newPage();
    for (const path of ['/', '/test', '/terminos']) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
    }
    await login(page, email);
    for (const path of ['/dashboard', '/jornada', '/leccion?l=bienvenida', '/registro', '/respirar', '/objetivos', '/diario', '/progreso', '/logros', '/ayuda', '/notificaciones', '/perfil', '/suscripcion']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
    }
    await ctx.close();
  });
}

test('iPhone (Safari): el botón Instalar muestra el tutorial en lugar de prometer instalación automática', async ({ browser }) => {
  const email = createAccount();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  await login(page, email, '/perfil');
  await page.getByRole('button', { name: 'Instalar Aliento' }).click();
  await expect(page.getByRole('heading', { name: 'Instala Aliento en tu iPhone' })).toBeVisible();
  await expect(page.getByText('Selecciona «Añadir a pantalla de inicio».')).toBeVisible();
  await ctx.close();
});
