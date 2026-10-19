// Rutas de facturación nativa: App Store (StoreKit 2) y Google Play.
// Principios:
//  · El retorno del cliente NUNCA activa acceso: siempre verificación real
//    (JWS firmado por Apple cotejado con su raíz publicada, o API de Google Play).
//  · Idempotencia por id de transacción (billing_events + store_transactions).
//  · Las notificaciones de servidor de Apple sincronizan renovaciones y reembolsos.

import { Router } from 'express';
import { resolveFromStoreProductId, getAllProductMappings } from '../billing-mappings.js';
import { AppleJwsError } from '../services/apple-jws.js';
import { GooglePlayError } from '../services/google-play.js';

export function storeRoutes({ db, config, storeSync, apple, googlePlay, log = console }) {
  const r = Router();

  /**
   * El cliente (app iOS/Android) registra una compra verificada para su usuario.
   * body: { provider: 'apple'|'google', signedTransaction?: JWS, productId?, purchaseToken? }
   */
  r.post('/store/transactions', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Identifícate para registrar tu compra.', code: 'AUTH_REQUIRED' });
      const { provider, signedTransaction, productId, purchaseToken } = req.body ?? {};

      let verified;
      if (provider === 'apple') {
        if (!apple) return res.status(503).json({ error: 'La verificación de App Store no está configurada en este servidor.', code: 'STORE_DISABLED' });
        if (!signedTransaction) return res.status(422).json({ error: 'Falta signedTransaction.', code: 'INVALID' });
        const tx = apple.verify(signedTransaction);
        if (tx.environment && tx.environment !== config.apple.environment) {
          throw new AppleJwsError(`Entorno no compatible: ${tx.environment}.`, 409);
        }
        verified = apple.transactionFromPayload(tx);
        if (!verified.transactionId) throw new AppleJwsError('Transacción sin identificador.', 422);
        if (tx.revocationDate) throw new AppleJwsError('La transacción está revocada.', 409);
      } else if (provider === 'google') {
        verified = await googlePlay.verify({ productId, purchaseToken });
      } else {
        return res.status(422).json({ error: 'Proveedor de tienda no soportado.', code: 'INVALID' });
      }

      const mapping = resolveFromStoreProductId(verified.productId);
      if (!mapping) {
        return res.status(404).json({ error: 'Producto de tienda no reconocido.', code: 'PRODUCT_UNKNOWN' });
      }
      await db.service.exec(`
        insert into public.store_transactions
          (provider, transaction_id, original_transaction_id, bundle_id, product_id, program_slug, plan, environment, user_id, payload, status, processed_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'processed', now())
        on conflict (transaction_id) do nothing`,
      [verified.provider, verified.transactionId, verified.originalTransactionId, verified.bundleId ?? null, verified.productId,
        mapping.program_id, mapping.plan, verified.environment ?? config.apple.environment, req.user.id, JSON.stringify(verified.payload ?? {})]);

      await storeSync.syncStorePurchase({
        userId: req.user.id,
        provider: verified.provider,
        productId: verified.productId,
        transactionId: verified.transactionId,
        originalTransactionId: verified.originalTransactionId,
        expiresAt: verified.expiresAt,
        environment: verified.environment ?? config.apple.environment,
        bundleId: verified.bundleId ?? null,
        payload: verified.payload ?? {},
      });
      res.json({ ok: true, program: mapping.program_id });
    } catch (err) {
      if (err instanceof AppleJwsError || err instanceof GooglePlayError) {
        log.warn(`[store] ${err.message}`);
        return res.status(err.status).json({ error: err.message, code: 'STORE_VERIFICATION_FAILED' });
      }
      next(err);
    }
  });

  /**
   * Notificaciones de servidor de App Store (App Store Server Notifications v2).
   * Autenticación real: el cuerpo conlleva un JWS firmado por Apple con su cadena pública.
   * Se responde 200 salvo error técnico (para evitar reintentos infinitos por eventos no
   * aplicables); los eventos no reconciliables quedan auditablemente marcados.
   */
  r.post('/store/notifications/apple', async (req, res, next) => {
    try {
      if (!apple) return res.status(503).json({ error: 'La verificación de App Store no está configurada en este servidor.' });
      const { signedPayload } = req.body ?? {};
      const notification = apple.notificationFromPayload(apple.verify(signedPayload));

      if (notification.type === 'TEST') return res.json({ ok: true, test: true });

      const acting = async ({ userId, expiresAt, revoked, reason, cancelAtPeriodEnd }) => {
        const tx = notification.transaction;
        if (revoked) {
          await storeSync.syncStoreRevocation({
            provider: 'apple', originalTransactionId: tx.originalTransactionId, reason: reason ?? notification.type ?? 'revoke',
            transactionId: tx.transactionId, payload: tx.payload,
          });
          return;
        }
        // Recuperar el usuario dueño de la suscripción original: las notificaciones de
        // Apple no llegan autenticadas como usuario.
        const owner = userId ? { id: userId } : await db.service.one(`
          select user_id from public.subscriptions where billing_provider = 'apple' and (store_original_transaction_id = $1 or store_transaction_id = $1)
          order by updated_at desc limit 1`, [tx.originalTransactionId]);
        if (!owner) {
          await db.service.exec(`
            insert into public.store_transactions (provider, transaction_id, original_transaction_id, product_id, program_slug, environment, payload, status)
            values ('apple', $1, $2, $3, null, $4, $5::jsonb, 'unmatched') on conflict (transaction_id) do nothing`,
          [tx.transactionId, tx.originalTransactionId, tx.productId, tx.environment ?? 'production', JSON.stringify(tx.payload ?? {})]).catch(() => {});
          log.warn(`[store] Notificación ${notification.type} sin usuario asociado (txn ${tx.transactionId}).`);
          return { unmatched: true };
        }
        const mapping = resolveFromStoreProductId(tx.productId);
        const expires = expiresAt ?? new Date(Date.now() + 30 * 86400 * 1000).toISOString();
        await storeSync.syncStorePurchase({
          userId: owner.id, provider: 'apple', productId: tx.productId, transactionId: tx.transactionId,
          originalTransactionId: tx.originalTransactionId, expiresAt: expires, cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd),
          environment: tx.environment ?? 'production', bundleId: tx.bundleId ?? null, payload: tx.payload ?? {},
        });
        return { ok: true, program: mapping?.program_id };
      };

      switch (notification.type) {
        case 'SUBSCRIBED':
        case 'DID_RENEW':
        case 'OFFER_REDEEMED':
          await acting({ expiresAt: notification.transaction.expiresAt ?? undefined });
          break;
        case 'DID_FAIL_TO_RENEW': {
          // Grace period: Apple mantiene el acceso; sin grace, cesa el periodo actual.
          const grace = notification.subtype === 'GRACE_PERIOD';
          await acting({ expiresAt: grace ? notification.transaction.expiresAt ?? undefined : new Date().toISOString() });
          break;
        }
        case 'REFUND':
        case 'EXPIRED':
        case 'REFUND_REVERSED':
          await acting({ revoked: true, reason: notification.type });
          break;
        case 'DID_CHANGE_RENEWAL_STATUS': {
          const cancel = notification.subtype === 'AUTO_RENEW_DISABLED';
          if (notification.transaction) {
            await db.service.exec(`update public.subscriptions set cancel_at_period_end = $2, updated_at = now()
              where billing_provider = 'apple' and store_original_transaction_id = $1`,
            [notification.transaction.originalTransactionId, cancel]);
          }
          break;
        }
        default:
          break; // tipos informativos (PRICE_INCREASE, TEST, …): sin acción comercial
      }
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof AppleJwsError) {
        log.warn(`[store] Notificación no verificable: ${err.message}`);
        return res.status(400).json({ error: 'Payload no verificado.' });
      }
      next(err);
    }
  });

  /** Restauración de compras: devuelve por qué programas tiene derecho el propio usuario. */
  r.get('/store/restore', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'Identifícate para restaurar tus compras.', code: 'AUTH_REQUIRED' });
    res.json({ purchases: await storeSync.restoreUserPurchases(req.user.id) });
  });

  /** Mapeo de productos de tienda para el cliente móvil (sin precios ni datos personales). */
  r.get('/store/products', (req, res) => {
    const isApple = String(req.query.store || 'apple') === 'apple';
    const products = getAllProductMappings().map((m) => ({
      program: m.program_id, plan: m.plan,
      productId: isApple ? m.apple_product_id : m.google_product_id,
    }));
    res.json({ store: isApple ? 'apple' : 'google', environment: config.apple.environment, products });
  });

  return r;
}
