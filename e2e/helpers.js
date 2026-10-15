import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

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

/** Responde el cuestionario completo por la interfaz. */
export async function completeQuiz(page) {
  await page.goto('/test?nuevo');
  await page.getByRole('button', { name: 'Cigarrillos de cajetilla' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click(); // cantidad
  await page.getByRole('heading', { name: /semana/ }).waitFor();
  await page.getByRole('button', { name: 'Continuar' }).click(); // gasto
  await page.getByRole('button', { name: 'Entre 10 y 19 años' }).click();
  await page.getByRole('button', { name: 'Entre 6 y 30 minutos' }).click();
  await page.getByRole('button', { name: 'Con el café' }).click();
  await page.getByRole('button', { name: 'Estrés o ansiedad' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'El del café' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click(); // info
  await page.getByRole('button', { name: 'Sí, por mi cuenta' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Sentir más ansiedad' }).click();
  await page.getByRole('button', { name: 'Mi salud' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Reducir poco a poco hasta dejarlo' }).click();
  await page.getByRole('button', { name: 'De 35 a 44 años' }).click();
  await page.waitForURL('**/resultados', { timeout: 30_000 });
}
