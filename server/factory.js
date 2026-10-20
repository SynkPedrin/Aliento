// Construye la aplicación completa a partir de la configuración. Lo usan el servidor local
// (server/index.js) y la función serverless de Vercel (api/index.js).
import Stripe from 'stripe';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { createBilling } from './billing.js';
import { createPrograms } from './programs.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createNotifier } from './services/notifications.js';

import { createGrowth } from './growth/index.js';
import { createStoreSync } from './services/store-sync.js';
import { createAppleJwsVerifier } from './services/apple-jws.js';
import { createGooglePlayVerifier } from './services/google-play.js';

export function buildApp(env = process.env, { poolSize = 10 } = {}) {
  const config = loadConfig(env);
  const db = createDb(config.supabase.dbUrl, { max: poolSize });
  const auth = createAuth({ config, db });
  // Timeout corto con reintentos: nunca más que el límite de la función serverless (30 s).
  const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey, { timeout: 8000, maxNetworkRetries: 2 }) : null;
  if (!stripe) console.warn('[aliento] Sin STRIPE_SECRET_KEY: el pago queda desactivado.');
  else if (!config.stripe.webhookSecret) console.warn('[aliento] Falta STRIPE_WEBHOOK_SECRET: los pagos no se activarán.');
  const notifier = createNotifier({ db, config });
  const billing = createBilling({ db, stripe, config });
  const programs = createPrograms({ db, billing });
  // Verificación de compras nativas: el cliente nunca define el acceso por sí solo.
  const storeSync = createStoreSync({ db, billing });
  const apple = config.apple.bundleId ? createAppleJwsVerifier({ bundleId: config.apple.bundleId }) : null;
  if (!config.apple.bundleId) console.warn('[alento] Falta APPLE_BUNDLE_ID: la verificación de App Store queda desactivada.');
  const googlePlay = createGooglePlayVerifier({ env, log: console });
  if (!googlePlay.enabled) console.warn('[alento] Google Play sin credenciales: la verificación de Android queda desactivada.');
  const growth = createGrowth({ db, config, auth });
  const app = createApp({ db, auth, billing, config, notifier, programs, storeSync, apple, googlePlay, growth });
  return { app, growth, config, db, notifier, storeSync, apple, googlePlay };
}
