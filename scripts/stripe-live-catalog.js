// Catálogo de Aliento en una cuenta Stripe (idempotente: no duplica productos, precios ni cupón).
//   STRIPE_SECRET_KEY=sk_live_… node scripts/stripe-live-catalog.js
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) throw new Error('Falta STRIPE_SECRET_KEY');
const stripe = new Stripe(key);
const PLANS = [
  { lookup: 'folego_semanal', nickname: 'Plan de 1 semana', amount: 799, recurring: { interval: 'week', interval_count: 1 } },
  { lookup: 'folego_mensual', nickname: 'Plan de 1 mes', amount: 1999, recurring: { interval: 'month', interval_count: 1 } },
  { lookup: 'folego_trimestral', nickname: 'Plan de 3 meses', amount: 3499, recurring: { interval: 'month', interval_count: 3 } },
];

let product = (await stripe.products.search({ query: "metadata['app']:'aliento'" })).data[0];
if (!product) {
  product = await stripe.products.create({
    name: 'Aliento Premium',
    description: 'Plan personalizado y herramientas de seguimiento para dejar de fumar.',
    statement_descriptor: 'ALIENTO', // lo que ve el cliente en el extracto de la tarjeta (suscripciones)
    metadata: { app: 'aliento' },
  });
}
console.log('Producto:', product.id, product.name);

const prices = {};
for (const p of PLANS) {
  const existing = (await stripe.prices.list({ lookup_keys: [p.lookup], active: true, limit: 1 })).data[0];
  const same = existing && existing.unit_amount === p.amount && existing.currency === 'usd'
    && existing.recurring.interval === p.recurring.interval && existing.recurring.interval_count === p.recurring.interval_count;
  prices[p.lookup] = same ? existing : await stripe.prices.create({
    product: product.id, currency: 'usd', unit_amount: p.amount, recurring: p.recurring,
    nickname: p.nickname, lookup_key: p.lookup, transfer_lookup_key: true,
  });
  console.log(`${p.nickname.padEnd(17)} ${prices[p.lookup].id} ${(p.amount / 100).toFixed(2)} USD ${same ? '(ya existía)' : '(creado)'}`);
}

let coupon;
try { coupon = await stripe.coupons.retrieve('aliento-salida-20'); } catch {
  coupon = await stripe.coupons.create({ id: 'aliento-salida-20', name: 'Regalo de bienvenida (20 % primer pago)', percent_off: 20, duration: 'once', applies_to: { products: [product.id] } });
}
console.log('Cupón:', coupon.id, `${coupon.percent_off}%`, coupon.duration);
console.log(JSON.stringify({ productId: product.id, prices: Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, v.id])) }));
