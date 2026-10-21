import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureProgramPrices, PLANS, PROGRAMS } from '../scripts/stripe-programs.js';

function stub() {
  const products = [], prices = [];
  return {
    products: { search: async ({ query }) => ({ data: products.filter((p) => query.includes(`'${p.metadata.program}'`)) }), create: async (p) => { const x = { id: `prod_${products.length}`, ...p }; products.push(x); return x; } },
    prices: { list: async ({ lookup_keys: [k] }) => ({ data: prices.filter((p) => p.lookup_key === k && p.active) }), create: async (p) => { const x = { id: `price_${prices.length}`, active: true, unit_amount: p.unit_amount, ...p }; prices.push(x); return x; } },
    _: { products, prices },
  };
}

test('stripe-programs: crea 4 productos y 12 precios con las claves que usa la app, y no duplica', async () => {
  const s = stub();
  const first = await ensureProgramPrices(s, { log() {} });
  assert.equal(first.length, PROGRAMS.length * PLANS.length);
  assert.equal(s._.products.length, 4);
  assert.ok(first.every((p) => p.created));
  assert.ok(first.some((p) => p.lookup === 'alento_sueno_trimestral'));
  const second = await ensureProgramPrices(s, { log() {} });
  assert.ok(second.every((p) => !p.created), 'segunda ejecución no crea nada');
  assert.equal(s._.prices.length, 12);
  assert.deepEqual(s._.prices.filter((p) => p.lookup_key.endsWith('_mensual')).map((p) => p.unit_amount), [1999, 1999, 1999, 1999]);
});
