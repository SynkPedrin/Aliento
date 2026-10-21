// Crea en Stripe (modo de la clave que uses: test o live) los productos y precios de Alcohol, Azúcar, Ansiedad y Sueño.
// Idempotente: si ya existe un precio activo con la misma lookup_key e importe, no lo duplica.
// Sem Fumo conserva sus claves `folego_*` (npm run stripe:setup). Precios en USD, iguales a los de Sem Fumo.
//   STRIPE_SECRET_KEY=sk_live_… node scripts/stripe-programs.js
import { pathToFileURL } from 'node:url';

export const PROGRAMS = [
  { slug: 'alcohol', name: 'Alento · Alcohol', description: 'Programa de apoyo para cambiar tu relación con el alcohol: plan, registro, lecciones y herramientas.' },
  { slug: 'azucar', name: 'Alento · Azúcar', description: 'Programa de apoyo para equilibrar tu relación con el azúcar: plan, registro, lecciones y herramientas.' },
  { slug: 'ansiedad', name: 'Alento · Ansiedad', description: 'Programa de apoyo para gestionar la ansiedad del día a día: plan, registro, lecciones y herramientas.' },
  { slug: 'sueno', name: 'Alento · Sueño', description: 'Programa de apoyo para mejorar tu descanso: plan, registro, lecciones y herramientas.' },
];
export const PLANS = [
  { id: 'semanal', nickname: 'Semanal', amount: 799, recurring: { interval: 'week', interval_count: 1 } },
  { id: 'mensual', nickname: 'Mensual', amount: 1999, recurring: { interval: 'month', interval_count: 1 } },
  { id: 'trimestral', nickname: 'Trimestral', amount: 3499, recurring: { interval: 'month', interval_count: 3 } },
];

export async function ensureProgramPrices(stripe, { currency = 'usd', log = console.log } = {}) {
  const out = [];
  for (const prog of PROGRAMS) {
    let product = (await stripe.products.search({ query: `metadata['app']:'alento' AND metadata['program']:'${prog.slug}'` })).data[0];
    if (!product) {
      product = await stripe.products.create({ name: prog.name, description: prog.description, statement_descriptor: 'ALENTO', metadata: { app: 'alento', program: prog.slug } });
    }
    for (const plan of PLANS) {
      const lookup = `alento_${prog.slug}_${plan.id}`;
      const found = (await stripe.prices.list({ lookup_keys: [lookup], active: true, limit: 1 })).data[0];
      if (found && found.unit_amount === plan.amount && found.currency === currency) { out.push({ lookup, id: found.id, created: false }); log(`= ${lookup} ${found.id}`); continue; }
      const price = await stripe.prices.create({
        product: product.id, currency, unit_amount: plan.amount, recurring: plan.recurring, nickname: plan.nickname,
        lookup_key: lookup, transfer_lookup_key: true, // reemplaza el precio anterior con la misma clave
      });
      out.push({ lookup, id: price.id, created: true });
      log(`+ ${lookup} ${price.id} ${(plan.amount / 100).toFixed(2)} ${currency.toUpperCase()}`);
    }
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Falta STRIPE_SECRET_KEY');
  const { default: Stripe } = await import('stripe');
  console.log(`Modo: ${key.startsWith('sk_live') ? 'LIVE (cobros reales)' : 'test'}`);
  await ensureProgramPrices(new Stripe(key), { currency: (process.env.APP_CURRENCY || 'USD').toLowerCase() });
}
