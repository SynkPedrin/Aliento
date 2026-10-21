// Sincronización financiera universal: Apple StoreKit 2, Google Play, RevenueCat y reconciliación.
// Garantiza idempotencia, auditoría, prevención de duplicados, renovaciones, cancelaciones y reembolsos.

import { resolveFromStoreProductId } from '../billing-mappings.js';
import { unlockAchievement } from './achievements.js';

export function createStoreSync({ db, billing, log = console }) {
  /**
   * Procesa de forma idempotente una transacción de compra nativa (StoreKit 2 / Google Play).
   * @param {Object} params
   * @param {string} params.userId UUID del usuario autenticado
   * @param {string} params.provider 'apple' | 'google' | 'revenuecat'
   * @param {string} params.productId Identificador del producto en la tienda
   * @param {string} params.transactionId Identificador de la transacción
   * @param {string} [params.originalTransactionId] Identificador original de la suscripción
   * @param {number|string|Date} [params.expiresAt] Fecha de expiración del período
   * @param {boolean} [params.cancelAtPeriodEnd] Si la renovación automática está desactivada
   */
  async function syncStorePurchase({
    userId,
    provider,
    productId,
    transactionId,
    originalTransactionId,
    expiresAt,
    cancelAtPeriodEnd = false,
    environment = 'production',
    bundleId = null,
    payload = {},
    eventKey = null,
    signedAt = Number(payload.signedDate) || Date.now(),
  }) {
    if (!userId || !provider || !productId || !transactionId) {
      throw new Error('Parámetros de compra nativa incompletos.');
    }

    const mapping = resolveFromStoreProductId(productId);
    if (!mapping) {
      throw new Error(`Producto de tienda no reconocido: ${productId}`);
    }

    const programSlug = mapping.program_id;
    const plan = mapping.plan;
    const origTx = originalTransactionId || transactionId;
    const subId = `sub_${provider}_${origTx}`;
    const eventId = `evt_${provider}_${eventKey || `tx_${transactionId}`}`;

    // Serialize the entire subscription stream, including first ownership claim.
    return db.tx(async (q) => {
    await q.exec('select pg_advisory_xact_lock(hashtextextended($1, 0))', [subId]);
    const owner = await q.one('select user_id, store_event_at from public.subscriptions where id = $1', [subId]);
    if (owner && owner.user_id !== userId) throw new Error('La compra pertenece a otra cuenta.');
    const auditOwner = await q.one('select user_id from public.store_transactions where provider = $1 and original_transaction_id = $2 and user_id is not null limit 1', [provider, origTx]);
    if (auditOwner && auditOwner.user_id !== userId) throw new Error('La compra pertenece a otra cuenta.');

    if (owner && Number(owner.store_event_at) > signedAt) return { status: 'stale', programSlug };

    // 1. Idempotencia en billing_events
    const claimed = await q.one(`
      insert into public.billing_events (id, type, object_id, status, received_at)
      values ($1, $2, $3, 'processing', now())
      on conflict (id) do update set status = 'processing', error = null
      where public.billing_events.status = 'failed'
         or (public.billing_events.status = 'processing' and public.billing_events.received_at < now() - interval '2 minutes')
      returning id`, [eventId, `${provider}.purchase`, transactionId]);

    if (!claimed) {
      const existing = await q.one('select status from public.billing_events where id = $1', [eventId]);
      if (existing?.status === 'processed') return { status: 'already_processed', programSlug };
      if (existing?.status === 'processing') throw new Error('Transacción en proceso de verificación.');
    }

    try {
      if (!expiresAt || !Number.isFinite(new Date(expiresAt).getTime())) throw new Error('Falta la expiración verificada.');
      const periodEnd = new Date(expiresAt).toISOString();

      await q.exec(`
        insert into public.subscriptions (
          id, user_id, stripe_customer_id, program_slug, plan, price_id,
          billing_provider, store_transaction_id, store_original_transaction_id,
          status, current_period_end, cancel_at_period_end, updated_at, store_event_at, last_verified_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, $11, now(), $12, now()
        )
        on conflict (id) do update set
          status = 'active',
          current_period_end = excluded.current_period_end,
          cancel_at_period_end = excluded.cancel_at_period_end,
          store_transaction_id = excluded.store_transaction_id,
          updated_at = now(), store_event_at = excluded.store_event_at, last_verified_at = now()
        where public.subscriptions.user_id = excluded.user_id
          and public.subscriptions.current_period_end <= excluded.current_period_end`,
      [
        subId, userId, `${provider}_cust_${userId}`, programSlug, plan, productId,
        provider, transactionId, origTx, periodEnd, Boolean(cancelAtPeriodEnd), signedAt
      ]);

      // Desbloquear el logro de bienvenida, igual que la vía Stripe.
      await unlockAchievement(q, userId, 'primer-paso');

      // Auditoría de la transacción (tabla store_transactions, migración 20261018100000).
      await q.exec(`
        insert into public.store_transactions
          (provider, transaction_id, original_transaction_id, bundle_id, product_id, program_slug, plan, environment, user_id, payload, status, processed_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'processed', now())
        on conflict (transaction_id) do update set
          status = 'processed', processed_at = now(), user_id = public.store_transactions.user_id,
          environment = excluded.environment, original_transaction_id = excluded.original_transaction_id`,
      [provider, String(transactionId), origTx, bundleId, productId, programSlug, plan, environment, userId, JSON.stringify(payload ?? {})]);

      // Igual que la vía Stripe: vincula la suscripción y activa el programa
      // (plan, preferencias y logro), aunque no hubo evaluación previa.
      if (billing?.ensureActivated) {
        await billing.ensureActivated(q, userId, null, programSlug);
      }

      // Marcar evento procesado
      await q.exec(`
        update public.billing_events
        set status = 'processed', processed_at = now()
        where id = $1`, [eventId]);

      return { status: 'success', programSlug, subId };
    } catch (err) {
      await q.exec(`
        update public.billing_events
        set status = 'failed', error = $2
        where id = $1`, [eventId, String(err.message).slice(0, 500)]);
      throw err;
    }
    });
  }

  /**
   * Procesa revocación o reembolso en tiendas nativas.
   */
  async function syncStoreRevocation({ provider, originalTransactionId, reason = 'refund', transactionId = null, payload = {}, signedAt = Number(payload.signedDate) || Date.now() }) {
    const subId = `sub_${provider}_${originalTransactionId}`;
    return db.tx(async (q) => {
    await q.exec('select pg_advisory_xact_lock(hashtextextended($1, 0))', [subId]);
    const sub = await q.one('select * from public.subscriptions where id = $1', [subId]);
    if (!sub) return { status: 'not_found' };
    if (Number(sub.store_event_at) > signedAt) return { status: 'stale' };
    if (transactionId && sub.store_transaction_id !== String(transactionId) && reason !== 'REVOKE') return { status: 'stale' };

    await q.exec(`
      update public.subscriptions
      set status = 'canceled', cancel_at_period_end = false, updated_at = now(), store_event_at = $2, last_verified_at = now()
      where id = $1`, [subId, signedAt]);

    if (transactionId) {
      // La fila del producto exacto vive en billing_product_mappings; para la auditoría
      // de revocación basta provider + ids + sub afectada.
      await q.exec(`
        insert into public.store_transactions
          (provider, transaction_id, original_transaction_id, product_id, program_slug, environment, user_id, payload, status, error, processed_at)
        values ($1, $2, $3, $8, $4, 'production', $5, $6::jsonb, 'processed', $7, now())
        on conflict (transaction_id) do update set status = 'processed', processed_at = now()`,
      [provider, String(transactionId), originalTransactionId, sub.program_slug, sub.user_id, JSON.stringify(payload ?? {}), `revocación en ${provider}: ${reason}`, sub.price_id]);
    }

    await q.exec(`
      insert into public.billing_reconciliation_reviews (stripe_subscription_id, stripe_customer_id, reason)
      values ($1, $2, $3)
      on conflict (stripe_subscription_id) do update
      set reason = excluded.reason, status = 'open'`,
    [subId, sub.stripe_customer_id, `Revocación / Reembolso en ${provider}: ${reason}`]);

    return { status: 'revoked', programSlug: sub.program_slug };
    });
  }

  /**
   * Restaura compras anteriores de un usuario verificando todas sus suscripciones registradas.
   */
  async function restoreUserPurchases(userId) {
    const rows = await db.service.rows(`
      select program_slug, billing_provider, status, current_period_end, cancel_at_period_end
      from public.subscriptions
      where user_id = $1 and status in ('active', 'trialing', 'past_due')
        and (current_period_end is null or current_period_end > now())
      order by updated_at desc`, [userId]);

    return rows.map((r) => ({
      program_slug: r.program_slug,
      provider: r.billing_provider,
      status: r.status,
      current_period_end: r.current_period_end,
      cancel_at_period_end: r.cancel_at_period_end,
    }));
  }

  return { syncStorePurchase, syncStoreRevocation, restoreUserPurchases };
}
