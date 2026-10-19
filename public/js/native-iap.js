// Compras dentro de la app iOS (StoreKit 2). En el navegador no hace nada: allí se paga con Stripe.
// Apple exige IAP para suscripciones digitales (App Review 3.1.1): en la app nativa nunca se abre Stripe.
import { api } from './ui.js';

const plugin = () => window.Capacitor?.Plugins?.AlentoStore;
export const isNativeApp = () => Boolean(window.Capacitor?.isNativePlatform?.() && plugin());

async function productIdFor(program, plan) {
  const { products } = await api('/api/store/products?store=apple');
  return products.find((p) => p.program === program && p.plan === plan)?.productId;
}

async function register(signedTransaction, transactionId) {
  const out = await api('/api/store/transactions', { method: 'POST', body: { provider: 'apple', signedTransaction } });
  await plugin().finish({ transactionId }); // solo tras confirmar el servidor
  return out;
}

/** Devuelve { status: 'success'|'pending'|'cancelled', program? }. Lanza AUTH_REQUIRED si no hay sesión. */
export async function nativePurchase(program, plan) {
  const me = await api('/api/me'); // sin sesión no se cobra
  if (!me.user) throw Object.assign(new Error('Identifícate para continuar.'), { code: 'AUTH_REQUIRED' });
  const productId = await productIdFor(program, plan);
  if (!productId) throw Object.assign(new Error('Este plan no está disponible en la App Store.'), { code: 'PRODUCT_UNKNOWN' });
  const res = await plugin().purchase({ productId });
  if (res.status !== 'success') return { status: res.status };
  const out = await register(res.signedTransaction, res.transactionId);
  return { status: 'success', program: out.program ?? program };
}

export async function nativeRestore() {
  const { transactions } = await plugin().restore();
  let restored = 0;
  for (const t of transactions) { try { await register(t.signedTransaction, t.transactionId); restored += 1; } catch { /* producto ajeno o ya registrado */ } }
  return restored;
}

/** Renovaciones/aprobaciones que llegan con la app abierta. */
export function listenNativeUpdates() {
  if (!isNativeApp()) return;
  plugin().addListener?.('transactionUpdate', (t) => { register(t.signedTransaction, t.transactionId).catch(() => {}); });
}
