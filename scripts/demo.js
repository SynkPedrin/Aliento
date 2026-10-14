// Modo demo local: recorre el embudo completo sin claves de Stripe.
// Un Checkout simulado "paga" enviando un webhook FIRMADO a la propia app,
// exactamente el mismo camino de activación que en producción.
// Los precios son de ejemplo. No usar en producción.
import express from 'express';
import Stripe from 'stripe';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { createBilling } from '../server/billing.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { fakeStripe } from './fake-stripe.js';
import { localSupabaseEnv } from './local-supabase.js';

if (process.env.NODE_ENV === 'production') throw new Error('El modo demo no puede ejecutarse en producción.');

const WEBHOOK_SECRET = 'whsec_demo_local';
// Usa el Supabase local (`npx supabase start`) y Stripe simulado.
const config = loadConfig({
  ...process.env,
  STRIPE_SECRET_KEY: 'sk_test_demo', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_EXIT_COUPON: 'aliento-salida-20',
  ...localSupabaseEnv(),
});
if (!/127\.0\.0\.1|localhost/.test(config.supabase.url)) throw new Error('El modo demo solo funciona con el Supabase local.');
const webhooks = new Stripe('sk_test_demo').webhooks;
const stripe = fakeStripe({ webhooks, baseUrl: `${config.appUrl}/demo-checkout` });
const db = createDb(config.supabase.dbUrl);
const app = createApp({ db, auth: createAuth({ config, db }), billing: createBilling({ db, stripe, config }), config });

const demo = express();
demo.use(express.urlencoded({ extended: false }));

const page = (body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Checkout simulado · Aliento</title><link rel="stylesheet" href="/css/app.css"></head><body>
<main class="auth-wrap"><div class="container narrow"><div class="card stack" style="--gap:16px">${body}</div></div></main></body></html>`;

demo.get('/demo-checkout/:n', (req, res) => {
  const s = [...stripe.sessions.values()].find((x) => x.url.endsWith(`/${req.params.n}`));
  if (!s) return res.status(404).send(page('<h1 class="title-md">Sesión no encontrada</h1>'));
  if (s.status !== 'open') return res.send(page(`<h1 class="title-md">Esta sesión ya no está abierta (${s.status})</h1><a class="btn" href="/planes">Volver a los planes</a>`));
  res.send(page(`
    <p class="estimate-tag">Modo demo · ningún cobro real</p>
    <h1 class="title-md">Checkout simulado</h1>
    <p class="muted">Plan <strong>${s.metadata.plan}</strong>. En producción aquí aparece Stripe Checkout. Los importes del modo demo son de ejemplo.</p>
    <form method="post" action="/demo-checkout/${req.params.n}/pagar"><button class="btn btn--lg btn--block">Pagar (simulado)</button></form>
    <a class="btn btn--ghost btn--block" href="${s.cancel_url}">Cancelar y volver</a>`));
});

demo.post('/demo-checkout/:n/pagar', async (req, res) => {
  const id = [...stripe.sessions.values()].find((x) => x.url.endsWith(`/${req.params.n}`))?.id;
  if (!id || stripe.sessions.get(id)?.status !== 'open') return res.redirect('/planes');
  const { session } = stripe.pay(id);
  const payload = JSON.stringify({ id: `evt_demo_${Date.now()}`, type: 'checkout.session.completed', data: { object: session } });
  // El webhook llega con un pequeño retraso, como en la vida real: la página de
  // bienvenida mostrará "Confirmando tu pago…" hasta que se procese.
  setTimeout(() => {
    fetch(`http://127.0.0.1:${config.port}/api/stripe/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }) },
      body: payload,
    }).catch((err) => console.error('[demo] webhook:', err.message));
  }, 2500);
  res.redirect(session.success_url.replace('{CHECKOUT_SESSION_ID}', id));
});

demo.use(app);
demo.listen(config.port, (err) => {
  if (err) throw err;
  console.log(`[aliento demo] ${config.appUrl}  (pagos simulados, precios de ejemplo, Supabase local)`);
});
