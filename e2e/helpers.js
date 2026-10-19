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

/** Responde el cuestionario completo por la interfaz (SEM FUMO).
 *  Sincronizado por título de paso (h1) para no competir con el auto-avance del cuestionario. */
export async function completeQuiz(page) {
  await page.goto('/test?nuevo');
  const step = (title) => page.getByRole('heading', { level: 1, name: title }).waitFor({ timeout: 30_000 });
  // q_producto (single → avanza solo con la opción)
  await page.getByRole('button', { name: 'Cigarrillos de cajetilla' }).click();
  await step('En un día normal, ¿cuántos cigarrillos fumas?');
  // q_cantidad (number → Continuar con el default válido)
  await page.getByRole('button', { name: 'Continuar' }).click();
  await step('¿Cuánto gastas en tabaco a la semana?');
  // q_gasto (number → Continuar con el default válido)
  await page.getByRole('button', { name: 'Continuar' }).click();
  await step('¿Cuántos años llevas fumando?');
  // q_anios (single)
  await page.getByRole('button', { name: 'Entre 1 y 5 años' }).click();
  await step('¿Cuánto tardas en fumar el primer cigarrillo tras despertar?');
  // q_primer (single)
  await page.getByRole('button', { name: 'Entre 6 y 30 minutos' }).click();
  await step('Cada persona tiene su propio patrón');
  // info_dependencia
  await page.getByRole('button', { name: 'Continuar' }).click();
  await step('¿En qué momentos te cuesta más no fumar?');
  // q_gatillos (multi → selecciona 1 y Continuar)
  await page.getByRole('button', { name: 'Con el café' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await step('De todos ellos, ¿cuál es el más difícil de evitar?');
  // q_dificil (single)
  await page.getByRole('button', { name: 'Con el café' }).click();
  await step('Saberlo es el 50 % del camino');
  // info_gatillos
  await page.getByRole('button', { name: 'Continuar' }).click();
  await step('¿Cuántas veces has intentado dejarlo antes?');
  // q_intentos (single)
  await page.getByRole('button', { name: 'Es mi primera vez' }).click();
  await step('¿Qué es lo que más te preocupa de dejarlo?');
  // q_preocupacion (single)
  await page.getByRole('button', { name: 'La ansiedad y el estrés' }).click();
  await step('¿Cuáles son tus principales motivos para dejar de fumar?');
  // q_motivos (multi → selecciona 1 y Continuar)
  await page.getByRole('button', { name: 'Mejorar mi salud y respirar mejor' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await step('¿Qué ritmo encaja mejor contigo?');
  // q_objetivo (single)
  await page.getByRole('button', { name: 'Reducir poco a poco hasta llegar a cero' }).click();
  await step('¿Cuál es tu rango de edad?');
  // q_edad (single → completo, redirige a resultados)
  await page.getByRole('button', { name: 'De 25 a 34 años' }).click();
  await page.waitForURL(/\/resultados/, { timeout: 30_000 });
}
