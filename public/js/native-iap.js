// Native billing never falls back to web checkout when the bridge is unavailable.
import { api } from './ui.js';

export const isNativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.());
const plugin = () => {
  const store = window.Capacitor?.Plugins?.AlentoStore;
  if (!store) throw Object.assign(new Error('Las compras de App Store no están disponibles. Vuelve a intentarlo.'), { code: 'STORE_UNAVAILABLE' });
  return store;
};
const requireUser = async () => {
  const me = await api('/api/me');
  if (!me.user) throw Object.assign(new Error('Identifícate para continuar.'), { code: 'AUTH_REQUIRED' });
  return me.user;
};

export async function loadNativePlans(program) {
  const { products, enabled } = await api('/api/store/products?store=apple');
  const mappings = products.filter((p) => p.program === program && p.purchasable);
  if (!enabled || !mappings.length) return { plans: [], paymentsEnabled: false, purchasable: false };
  const result = await plugin().getProducts({ productIds: mappings.map((p) => p.productId) });
  const units = { day: 'día(s)', week: 'semana(s)', month: 'mes(es)', year: 'año(s)' };
  const plans = mappings.flatMap((mapping) => {
    const product = result.products.find((p) => p.productId === mapping.productId);
    if (!product?.periodUnit || !product.periodValue) return [];
    const period = `${product.periodValue} ${units[product.periodUnit] ?? product.periodUnit}`;
    return [{ id: mapping.plan, productId: product.productId, title: product.displayName,
      displayPrice: product.displayPrice, periodLabel: `cada ${period}`, unit: period, available: true, native: true }];
  });
  return { plans, paymentsEnabled: plans.length > 0, purchasable: true };
}

async function register(signedTransaction, transactionId) {
  const out = await api('/api/store/transactions', { method: 'POST', body: { provider: 'apple', signedTransaction } });
  await plugin().finish({ transactionId });
  window.dispatchEvent(new CustomEvent('alento:entitlements-updated'));
  return out;
}

export async function nativePurchase(program, plan) {
  await requireUser();
  const context = await api('/api/store/purchase-context', { method: 'POST', body: { program, plan } });
  const { plans } = await loadNativePlans(program);
  const selected = plans.find((p) => p.id === plan);
  if (!selected) throw Object.assign(new Error('Este plan no está disponible en la App Store.'), { code: 'PRODUCT_UNKNOWN' });
  const res = await plugin().purchase({ productId: selected.productId, appAccountToken: context.appAccountToken });
  if (res.status !== 'success') return { status: res.status };
  const out = await register(res.signedTransaction, res.transactionId);
  return { status: 'success', program: out.program ?? program };
}

export async function nativeRestore() {
  await requireUser();
  const { transactions } = await plugin().restore();
  let restored = 0;
  for (const t of transactions) {
    await register(t.signedTransaction, t.transactionId);
    restored += 1;
  }
  return restored;
}

let listening = false;
export async function listenNativeUpdates() {
  if (!isNativeApp() || listening) return;
  listening = true;
  try {
    await plugin().addListener('transactionUpdate', (t) => {
      register(t.signedTransaction, t.transactionId).catch(() => {
        window.dispatchEvent(new CustomEvent('alento:purchase-sync-pending'));
      });
    });
    await requireUser();
    const { transactions } = await plugin().unfinished();
    for (const t of transactions) await register(t.signedTransaction, t.transactionId);
  } catch {
    // StoreKit retains unfinished transactions; retry on next page load or manual restore.
    window.dispatchEvent(new CustomEvent('alento:purchase-sync-pending'));
  }
}
