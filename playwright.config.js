// E2E contra el servidor local real (Supabase local + Stripe en MODO TEST, con `stripe listen`).
//   npm run e2e
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    channel: 'chrome', // Chrome instalado en el sistema (sin descargar navegadores)
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { viewport: { width: 1280, height: 860 } } },
    { name: 'movil', use: { ...devices['Pixel 7'], channel: 'chrome' }, testMatch: /movil|pwa/ },
  ],
});
