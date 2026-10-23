import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/** Los límites de intentos son reales (Postgres). En E2E se parte de cero. */
export function resetRateLimits() {
  execFileSync('node', ['--env-file=.env', '--input-type=module', '-e',
    "import { createDb } from './server/db.js'; import { loadConfig } from './server/config.js'; const db = createDb(loadConfig().supabase.dbUrl, { max: 1 }); await db.service.exec('delete from public.rate_limits'); await db.end();"], { stdio: 'ignore' });
}

export const PASSWORD = 'prueba-E2E-123';

/** Cuenta con acceso de cortesía lista para usar (sin cobros). */
export function createAccount() {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.com`;
  execFileSync('node', ['--env-file=.env', 'scripts/create-comp-account.js', email, PASSWORD, 'Lucía'], { stdio: 'ignore' });
  return email;
}

export async function login(page, email, next = '/dashboard') {
  await page.goto(`/acceso?modo=entrar&next=${encodeURIComponent(next)}`);
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('[data-submit]');
  await page.waitForURL((u) => u.pathname === next.split('?')[0]);
}

/** Responde el cuestionario completo por la interfaz (SEM FUMO, v3): primera opción de cada pantalla,
 *  «Sí» en los micro-compromisos del análisis y e-mail + nombre antes del resultado. */
export async function completeQuiz(page) {
  await page.goto('/test?nuevo');
  const options = '.option, .option-card, .option-pair';
  for (let i = 0; i < 80 && !/\/resultados/.test(page.url()); i++) {
    if (await page.locator('#lead-email').isVisible()) {
      await page.fill('#lead-email', `e2e-${randomUUID().slice(0, 8)}@example.com`);
      await page.check('#lead-health');
      await page.getByRole('button', { name: 'Ver mi resultado' }).click();
      await page.fill('#lead-name', 'Lucía');
      await page.getByRole('button', { name: 'Continuar' }).click();
      break;
    }
    const commit = page.locator('.commit button', { hasText: 'Sí' });
    if (await commit.isVisible()) { await commit.click(); continue; }
    const hash = await page.evaluate(() => location.hash);
    const screen = page.locator('.quiz__screen');
    if (await screen.locator('.option__check').count()) {
      await screen.locator('.option').first().click();
      await screen.getByRole('button', { name: 'Continuar' }).click();
    } else if (await screen.locator(options).count()) {
      await screen.locator(options).first().click();
    } else if (await screen.getByRole('button', { name: 'Continuar' }).count()) {
      await screen.getByRole('button', { name: 'Continuar' }).click();
    }
    await page.waitForFunction((prev) => location.hash !== prev || document.querySelector('.commit, #lead-email') || location.pathname.startsWith('/resultados'), hash, { timeout: 30_000 });
  }
  await page.waitForURL(/\/resultados/, { timeout: 30_000 });
}
