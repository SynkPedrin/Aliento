// Construye la aplicación completa a partir de la configuración. Lo usan el servidor local
// (server/index.js) y la función serverless de Vercel (api/index.js).
import Stripe from 'stripe';
import { createApp } from './app.js';
import { createAuth } from './auth.js';
import { createBilling } from './billing.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { createNotifier } from './services/notifications.js';

export function buildApp(env = process.env, { poolSize = 10 } = {}) {
  const config = loadConfig(env);
  const db = createDb(config.supabase.dbUrl, { max: poolSize });
  const auth = createAuth({ config, db });
  const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;
  if (!stripe) console.warn('[aliento] Sin STRIPE_SECRET_KEY: el pago queda desactivado.');
  else if (!config.stripe.webhookSecret) console.warn('[aliento] Falta STRIPE_WEBHOOK_SECRET: los pagos no se activarán.');
  const notifier = createNotifier({ db, config });
  const billing = createBilling({ db, stripe, config });
  const app = createApp({ db, auth, billing, config, notifier });
  return { app, config, db, notifier };
}
