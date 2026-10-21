// Isolated bridge tests only: these are NOT StoreKit sandbox purchases.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isNativeApp, loadNativePlans, nativePurchase, nativeRestore } from '../public/js/native-iap.js';

const originalFetch = globalThis.fetch;
afterEach(() => { delete globalThis.window; globalThis.fetch = originalFetch; });
function setup(store, routes) {
  globalThis.window = { Capacitor: { isNativePlatform: () => true, Plugins: store ? { AlentoStore: store } : {} }, dispatchEvent() {} };
  globalThis.fetch = async (path, options) => {
    assert.ok(Object.hasOwn(routes, path), path);
    const data = typeof routes[path] === 'function' ? await routes[path](options) : routes[path];
    return new Response(JSON.stringify(data.body ?? data), { status: data.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
}
const mappings = { enabled: true, products: [{ program: 'sem-fumo', plan: 'mensual', purchasable: true, productId: 'test.monthly' }] };
const product = { productId: 'test.monthly', displayName: 'Plan mensual', displayPrice: '9,99 €', periodUnit: 'month', periodValue: 1 };

test('native detection stays native when plugin is missing', async () => {
  setup(null, { '/api/store/products?store=apple': mappings });
  assert.equal(isNativeApp(), true);
  await assert.rejects(loadNativePlans('sem-fumo'), { code: 'STORE_UNAVAILABLE' });
});
test('native prices and periods come exclusively from StoreKit', async () => {
  setup({ getProducts: async () => ({ products: [product] }) }, { '/api/store/products?store=apple': mappings });
  const { plans } = await loadNativePlans('sem-fumo');
  assert.equal(plans[0].displayPrice, '9,99 €');
  assert.equal(plans[0].periodLabel, 'cada 1 mes(es)');
  assert.equal(plans[0].amount, undefined);
});
test('unavailable StoreKit products are never offered', async () => {
  setup({ getProducts: async () => ({ products: [] }) }, { '/api/store/products?store=apple': mappings });
  assert.deepEqual((await loadNativePlans('sem-fumo')).plans, []);
});
test('server rejection leaves purchase unfinished for retry', async () => {
  let finished = false;
  setup({ getProducts: async () => ({ products: [product] }),
    purchase: async ({ appAccountToken }) => { assert.equal(appAccountToken, 'user-id'); return { status: 'success', transactionId: '1', signedTransaction: 'signed' }; },
    finish: async () => { finished = true; }
  }, { '/api/me': { user: { id: 'user-id' } },
    '/api/store/purchase-context': { appAccountToken: 'user-id', productId: 'test.monthly' },
    '/api/store/products?store=apple': mappings,
    '/api/store/transactions': { status: 503, body: { error: 'Retry', code: 'STORE_DISABLED' } }
  });
  await assert.rejects(nativePurchase('sem-fumo', 'mensual'), { code: 'STORE_DISABLED' });
  assert.equal(finished, false);
});
test('restore surfaces ownership errors instead of reporting success', async () => {
  setup({ restore: async () => ({ transactions: [{ signedTransaction: 'foreign', transactionId: '2' }] }) },
    { '/api/me': { user: { id: 'user-id' } }, '/api/store/transactions': { status: 403, body: { error: 'Otra cuenta', code: 'STORE_VERIFICATION_FAILED' } } });
  await assert.rejects(nativeRestore(), { code: 'STORE_VERIFICATION_FAILED' });
});
