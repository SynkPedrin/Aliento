// TEST 1–9, 24, 26: embudo completo con Stripe Checkout REAL en modo test.
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { completeQuiz, PASSWORD, resetRateLimits } from './helpers.js';

test.beforeAll(() => resetRateLimits());

async function payInStripe(page, card) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await page.locator('#cardNumber').waitFor({ timeout: 60_000 });
  await page.fill('#cardNumber', card);
  await page.fill('#cardExpiry', '12/34');
  await page.fill('#cardCvc', '123');
  await page.fill('#billingName', 'Prueba E2E');
  await page.locator('button.SubmitButton').click();
}

test('embudo: cuestionario → resultados → plan → cuenta → pago test → bienvenida → instalación → configuración → panel', async ({ page }) => {
  test.setTimeout(900_000);
  await completeQuiz(page);
  // TEST 2: resultado personalizado (tipo de fumador → explicación → proyección → venta).
  await expect(page.getByText('Tu tipo de fumador')).toBeVisible();
  await page.getByRole('link', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: /Lucía, esto es lo que hace única tu situación/ })).toBeVisible();
  await page.getByRole('link', { name: 'Continuar' }).click();
  await expect(page.getByText('Estimación').first()).toBeVisible();
  await page.getByRole('link', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'No tienes que dejarlo hoy.' })).toBeVisible();
  // TEST 3: selección de plan (solo planes configurados en Stripe).
  await page.locator('#planes').scrollIntoViewIfNeeded();
  const rows = page.locator('#planes .plan-row');
  await expect(rows).toHaveCount(3);
  await page.locator('#planes .plan-row[data-id="mensual"]').click();
  await page.getByRole('button', { name: 'Comenzar mi transformación' }).click();
  // TEST 6: creación de cuenta.
  await page.waitForURL(/\/acceso\?plan=mensual/);
  const email = `e2e-${randomUUID().slice(0, 8)}@example.com`;
  await page.fill('#name', 'Mateo');
  await page.fill('#email', email);
  await page.fill('#emailConfirm', email);
  await page.fill('#password', PASSWORD);
  await page.check('input[name=acceptTerms]');
  await page.check('input[name=healthConsent]');
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  // TEST 4–5: Stripe Checkout (modo test) y confirmación por webhook.
  await payInStripe(page, '4242424242424242');
  await page.waitForURL(/\/bienvenida/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: '¡Tu camino comienza aquí!' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Gracias por dar este primer paso.')).toBeVisible();
  await expect(page.getByText('Tu programa está listo.')).toBeVisible();
  // TEST 8: oferta de instalación (no obligatoria).
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Lleva Alento contigo.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Instalar Alento' })).toBeVisible();
  await page.getByRole('link', { name: 'Continuar sin instalar' }).click();
  // Configuración inicial.
  await page.getByRole('button', { name: 'Confirmar mi meta' }).click();
  await page.getByRole('button', { name: 'Guardar fecha' }).click();
  await page.getByRole('button', { name: 'Guardar preferencias' }).click();
  await page.getByRole('button', { name: 'Acceder a mi panel' }).click();
  // TEST 9: panel.
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { name: /Mateo/ })).toBeVisible();
  await expect(page.getByText('Cada paso cuenta.')).toBeVisible();
  // TEST 26: ya suscrito → no se le vuelve a cobrar.
  const again = await page.request.post('/api/checkout', { data: { plan: 'semanal' } });
  expect((await again.json()).code).toBe('ALREADY_SUBSCRIBED');
  // Mi suscripción → portal de Stripe (modo test).
  await page.goto('/suscripcion');
  await expect(page.getByText('Plan de 1 mes')).toBeVisible();
  await page.getByRole('button', { name: 'Gestionar suscripción y facturas' }).click();
  await page.waitForURL(/billing\.stripe\.com/, { timeout: 30_000 });
});

test('pago rechazado: la tarjeta se rechaza en Stripe y no se activa nada (TEST 24)', async ({ page }) => {
  test.setTimeout(900_000);
  await completeQuiz(page);
  await page.goto('/resultados?program=sem-fumo#planes');
  await page.locator('#planes .plan-row[data-id="semanal"]').click();
  await page.getByRole('button', { name: 'Comenzar mi transformación' }).click();
  const email = `e2e-${randomUUID().slice(0, 8)}@example.com`;
  await page.fill('#name', 'Rechazo'); await page.fill('#email', email); await page.fill('#emailConfirm', email);
  await page.fill('#password', PASSWORD); await page.check('input[name=acceptTerms]'); await page.check('input[name=healthConsent]');
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await payInStripe(page, '4000000000000002'); // tarjeta rechazada (modo test)
  await expect(page.getByText(/rechaz|declin/i).first()).toBeVisible({ timeout: 30_000 });
  const me = await (await page.request.get('/api/me')).json();
  expect(me.access).toBe(false);
});
