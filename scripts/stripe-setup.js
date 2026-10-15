// Crea en Stripe el producto Alento y los tres precios recurrentes.
// Los importes los decides tú; este script no inventa precios.
//
//   npm run stripe:setup -- --currency usd --semanal 7.99 --mensual 19.99 --trimestral 34.99
//
// Usa lookup_keys (folego_semanal, folego_mensual, folego_trimestral), así que
// el servidor los encuentra sin copiar IDs. Ejecútalo primero en modo test.
import Stripe from 'stripe';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    currency: { type: 'string' },
    semanal: { type: 'string' },
    mensual: { type: 'string' },
    trimestral: { type: 'string' },
  },
});

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('Define STRIPE_SECRET_KEY en .env');
for (const k of ['currency', 'semanal', 'mensual', 'trimestral']) {
  if (!values[k]) throw new Error(`Falta --${k}. Ejemplo: --currency usd --semanal 7.99 --mensual 19.99 --trimestral 34.99`);
}

const stripe = new Stripe(key);
const currency = values.currency.toLowerCase();
const toCents = (v) => {
  const n = Math.round(Number(v.replace(',', '.')) * 100);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Importe no válido: ${v}`);
  return n;
};

const PLANS = [
  { key: 'folego_semanal', nickname: 'Semanal', amount: toCents(values.semanal), recurring: { interval: 'week', interval_count: 1 } },
  { key: 'folego_mensual', nickname: 'Mensual', amount: toCents(values.mensual), recurring: { interval: 'month', interval_count: 1 } },
  { key: 'folego_trimestral', nickname: 'Trimestral', amount: toCents(values.trimestral), recurring: { interval: 'month', interval_count: 3 } },
];

const existing = await stripe.products.search({ query: "metadata['app']:'folego'" });
const product = existing.data[0] ?? await stripe.products.create({
  name: 'Alento Premium',
  description: 'Plan personalizado y herramientas de seguimiento para dejar de fumar.',
  metadata: { app: 'folego' },
});

for (const p of PLANS) {
  const price = await stripe.prices.create({
    product: product.id,
    currency,
    unit_amount: p.amount,
    recurring: p.recurring,
    nickname: p.nickname,
    lookup_key: p.key,
    transfer_lookup_key: true, // el nuevo precio sustituye al anterior con la misma clave
  });
  console.log(`${p.nickname.padEnd(11)} ${price.id}  ${(p.amount / 100).toFixed(2)} ${currency.toUpperCase()}`);
}
console.log(`\nProducto: ${product.id}. Listo.`);
