// Conciliación de suscripciones Stripe ↔ Supabase.
//   npm run billing:reconcile             → solo informa (no escribe nada)
//   npm run billing:reconcile -- --apply  → sincroniza lo verificable y abre revisiones para lo ambiguo
// Nunca crea cobros ni modifica suscripciones en Stripe.
import Stripe from 'stripe';
import { createBilling } from '../server/billing.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';

const config = loadConfig();
if (!config.stripe.secretKey) throw new Error('Falta STRIPE_SECRET_KEY');
const db = createDb(config.supabase.dbUrl, { max: 2 });
const billing = createBilling({ db, stripe: new Stripe(config.stripe.secretKey), config });
const apply = process.argv.includes('--apply');
try {
  const r = await billing.reconcile({ apply });
  console.log(`Modo: ${apply ? 'APLICAR' : 'solo informe'}`);
  console.log(`Suscripciones de Aliento revisadas: ${r.checked} · correctas: ${r.ok}`);
  for (const l of r.linked) console.log(`  ${apply ? 'sincronizada' : 'a sincronizar'}: ${l.subscription} → usuario ${l.user} (${l.from} → ${l.to})`);
  for (const v of r.review) console.log(`  REVISIÓN MANUAL: ${v.subscription} (${v.status}) — ${v.reason}`);
} finally {
  await db.end();
}
