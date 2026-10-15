// TEST 10, 12–19, 27–30: área del suscriptor (cuenta de cortesía, sin cobros).
import { test, expect } from '@playwright/test';
import { createAccount, login, PASSWORD } from './helpers.js';

let email;
test.beforeAll(() => { email = createAccount(); });

test('primera lección por la interfaz, progreso guardado y capítulo bloqueado por URL directa', async ({ page }) => {
  await login(page, email, '/jornada');
  await expect(page.getByRole('heading', { name: 'Mi jornada' })).toBeVisible();
  // TEST 29: lección bloqueada por URL directa.
  await page.goto('/leccion?l=tus-razones');
  await expect(page.getByText('Esta lección todavía está bloqueada')).toBeVisible();
  // TEST 10: primera lección.
  await page.goto('/leccion?l=bienvenida');
  const finish = page.getByRole('button', { name: 'Completar lección' });
  await expect(finish).toBeDisabled();
  // Responde cada pregunta: prueba opciones hasta que el servidor confirma la correcta.
  for (const block of await page.locator('[data-type="multiple_choice"]').all()) {
    for (const opt of await block.locator('.option').all()) {
      await opt.click();
      await block.locator('.choice-feedback').waitFor();
      if (!(await block.locator('.choice-feedback--no').count())) break;
    }
  }
  for (const ta of await page.locator('[data-type="reflection"] textarea').all()) {
    await ta.fill('Quiero respirar mejor y estar presente con mi familia.');
    await page.getByText('Guardado.').first().waitFor();
  }
  for (const block of await page.locator('[data-type="interactive_exercise"]').all()) await block.locator('.option').first().click();
  for (const btn of await page.locator('[data-type="commitment"] button').all()) await btn.click();
  // TEST 27: cerrar a mitad y volver → las respuestas siguen ahí.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Completar lección' })).toBeEnabled();
  await page.getByRole('button', { name: 'Completar lección' }).click();
  await expect(page.getByText('Siguiente: Tus razones para cambiar')).toBeVisible();
  await page.goto('/jornada');
  await expect(page.getByText('1 de 3 lecciones · En curso')).toBeVisible();
});

test('registro de cigarrillo, edición y gráficos que se recalculan (TEST 13, 30)', async ({ page }) => {
  await login(page, email, '/registro');
  await page.getByRole('button', { name: 'Registrar cigarrillo' }).first().click();
  await page.fill('#qty', '2');
  await page.selectOption('#trig', 'cafe');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect(page.getByText(/2 cigarrillos$/).first()).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.locator('.today-card .big-number')).toContainText('2');
  // Edición → el panel se recalcula.
  await page.goto('/registro');
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await page.fill('#qty', '1');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await page.goto('/dashboard');
  await expect(page.locator('.today-card .big-number')).toContainText('1');
  await page.goto('/progreso');
  await expect(page.getByRole('heading', { name: 'Mi progreso' })).toBeVisible();
  await expect(page.getByText('Tus gatillos más frecuentes')).toBeVisible();
});

test('objetivos, respiración y persistencia tras cerrar sesión (TEST 14, 15, 16, 18)', async ({ page }) => {
  await login(page, email, '/objetivos');
  await page.getByRole('radio', { name: /Reducir a la mitad primero/ }).click();
  await page.fill('#max', '6');
  await page.getByRole('button', { name: 'Guardar objetivos' }).click();
  await expect(page.getByText('Historial de cambios')).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByText('máximo 6')).toBeVisible();
  // Respiración: iniciar, pausar, continuar y finalizar antes de tiempo → no cuenta como completada.
  await page.goto('/respirar');
  await page.getByRole('button', { name: 'Iniciar' }).click();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Finalizar' }).click();
  await expect(page.getByText('Solo se registran los ejercicios completos')).toBeVisible();
  // TEST 18: cerrar sesión y volver a entrar.
  await page.goto('/perfil');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.waitForURL('**/');
  await login(page, email, '/objetivos');
  await expect(page.locator('#max')).toHaveValue('6');
});

test('aislamiento: sin sesión no hay datos y otra cuenta no ve los registros (TEST 19)', async ({ page, browser }) => {
  const other = createAccount();
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await login(p2, other, '/registro');
  await expect(p2.getByText('Sin cigarrillos registrados en este período')).toBeVisible();
  await ctx.close();
  const anon = await page.request.get('/api/app/smoking');
  expect(anon.status()).toBe(401);
  void PASSWORD;
});
