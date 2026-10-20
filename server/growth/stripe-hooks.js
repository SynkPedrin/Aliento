// Puente Stripe → growth: checkout abierto, compra, renovación, fallo de cobro, cancelación y reembolso.
// Siempre "best effort": un fallo aquí nunca debe romper el webhook de pagos.
import { cleanTouch, eventIdFor } from './context.js';

const up = (c) => String(c ?? '').toUpperCase();
const taxOf = (inv) => Number(inv.tax ?? (inv.total_taxes ?? []).reduce((a, t) => a + (t.amount ?? 0), 0) ?? 0) || 0;
const subIdOf = (inv) => {
  const s = inv.parent?.subscription_details?.subscription ?? inv.subscription;
  return typeof s === 'string' ? s : s?.id ?? null;
};

export function createStripeHooks({ db, tracker, log = console }) {
  const q = db.service;
  const safe = (fn) => async (...a) => { try { return await fn(...a); } catch (err) { log.warn?.(`[growth] ${err.message}`); return null; } };

  /** Metadatos cortos para el checkout de Stripe (límite de 500 caracteres por valor). */
  function checkoutMetadata(tracking) {
    if (!tracking) return {};
    const m = {};
    if (tracking.visitorId) m.vid = tracking.visitorId;
    if (tracking.leadId) m.lid = tracking.leadId;
    for (const [pre, t] of [['l', tracking.last], ['f', tracking.first]]) {
      for (const k of ['utm_source', 'utm_campaign', 'utm_term', 'utm_content']) if (t?.[k]) m[`${pre}_${k.slice(4)}`] = String(t[k]).slice(0, 100);
    }
    return m;
  }

  /** Tras crear la sesión de Stripe: fila growth.checkouts + evento checkout_started. */
  const onCheckoutStarted = safe(async ({ user, program, plan, url, tracking, ctx }) => {
    const row = await q.one(`select cs.id, cs.price_id from public.checkout_sessions cs where cs.url = $1 order by cs.created_at desc limit 1`, [url]);
    const id = await tracker.identityFor({ userId: user.id, visitorId: tracking?.visitorId, leadId: tracking?.leadId });
    const first = cleanTouch(tracking?.first ?? id.first), last = cleanTouch(tracking?.last ?? id.last);
    if (row?.id) {
      await q.exec(`insert into growth.checkouts (stripe_session_id, user_id, lead_id, visitor_id, program_slug, plan, status, first_touch, last_touch)
        values ($1,$2,$3,$4,$5,$6,'open',$7::jsonb,$8::jsonb) on conflict (stripe_session_id) do nothing`,
      [row.id, user.id, id.leadId, id.visitorId, program, plan, JSON.stringify(first), JSON.stringify(last)]);
    }
    const rec = await tracker.record({
      name: 'checkout_started', eventId: undefined, visitorId: id.visitorId, userId: user.id, leadId: id.leadId, program,
      props: { plan, checkout: row?.id ?? null }, touch: { first, last }, ctx,
      consentMarketing: await tracker.adConsent({ visitorId: id.visitorId, leadId: id.leadId }),
    });
    return rec?.eventId ?? null;
  });

  async function identityForSession(obj) {
    const c = await q.one('select * from growth.checkouts where stripe_session_id = $1', [obj.id]);
    const md = obj.metadata ?? {};
    const userId = md.user_id ?? c?.user_id ?? null;
    const id = await tracker.identityFor({ userId, visitorId: c?.visitor_id ?? md.vid, leadId: c?.lead_id ?? md.lid });
    return { userId, program: md.program ?? c?.program_slug ?? null, plan: md.plan ?? c?.plan ?? null,
      ...id, first: Object.keys(c?.first_touch ?? {}).length ? c.first_touch : id.first, last: Object.keys(c?.last_touch ?? {}).length ? c.last_touch : id.last };
  }

  async function identityForSubscription(subId, user) {
    const s = await q.one('select user_id, program_slug, plan from growth.subscriptions where subscription_id = $1', [subId]);
    const last = await q.one(`select o.visitor_id, o.lead_id, o.first_touch, o.last_touch, o.program_slug, o.plan from growth.orders o
      where o.user_id = $1 order by o.paid_at desc limit 1`, [user ?? s?.user_id ?? null]);
    return { userId: user ?? s?.user_id ?? null, program: s?.program_slug ?? last?.program_slug ?? null, plan: s?.plan ?? last?.plan ?? null,
      visitorId: last?.visitor_id ?? null, leadId: last?.lead_id ?? null, first: last?.first_touch ?? {}, last: last?.last_touch ?? {} };
  }

  async function upsertSubscription(sub, extra = {}) {
    const item = sub.items?.data?.[0];
    const md = sub.metadata ?? {};
    await q.exec(`
      insert into growth.subscriptions (subscription_id, provider, user_id, program_slug, plan, status, amount_cents, currency, started_at, next_billing_at, canceled_at, cancel_reason, updated_at)
      values ($1,'stripe',$2,$3,$4,$5,$6,$7,to_timestamp($8),to_timestamp($9),to_timestamp($10),$11,now())
      on conflict (subscription_id) do update set status = excluded.status, amount_cents = coalesce(excluded.amount_cents, growth.subscriptions.amount_cents),
        next_billing_at = excluded.next_billing_at, canceled_at = excluded.canceled_at,
        cancel_reason = coalesce(excluded.cancel_reason, growth.subscriptions.cancel_reason), updated_at = now()`,
    [sub.id, md.user_id ?? extra.userId ?? null, md.program ?? null, md.plan ?? null, sub.status, item?.price?.unit_amount ?? null, up(sub.currency ?? item?.price?.currency) || null,
      sub.start_date ?? sub.created ?? null, item?.current_period_end ?? sub.current_period_end ?? null,
      sub.canceled_at ?? (sub.cancel_at_period_end ? (item?.current_period_end ?? sub.current_period_end ?? null) : null),
      sub.cancellation_details?.feedback ?? sub.cancellation_details?.reason ?? null]);
  }

  const onStripeEvent = safe(async (event) => {
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        if (obj.mode !== 'subscription' || !['paid', 'no_payment_required'].includes(obj.payment_status)) return;
        const id = await identityForSession(obj);
        const amount = obj.amount_total ?? 0, orderId = (typeof obj.invoice === 'string' ? obj.invoice : obj.invoice?.id) ?? obj.id;
        const fresh = await q.exec(`insert into growth.orders (order_id, provider, user_id, lead_id, visitor_id, program_slug, plan, kind, amount_cents, tax_cents, currency, first_touch, last_touch)
          values ($1,'stripe',$2,$3,$4,$5,$6,'first',$7,$8,$9,$10::jsonb,$11::jsonb) on conflict (order_id) do nothing`,
        [orderId, id.userId, id.leadId, id.visitorId, id.program, id.plan, amount, obj.total_details?.amount_tax ?? 0, up(obj.currency), JSON.stringify(id.first), JSON.stringify(id.last)]);
        await q.exec(`update growth.checkouts set status = 'paid', paid_at = now(), amount_cents = $2, currency = $3 where stripe_session_id = $1`, [obj.id, amount, up(obj.currency)]);
        if (fresh) {
          await tracker.record({
            name: 'purchase', eventId: eventIdFor('purchase', obj.id), visitorId: id.visitorId, userId: id.userId, leadId: id.leadId, program: id.program,
            valueCents: amount, currency: up(obj.currency), props: { plan: id.plan, order_id: orderId, kind: 'first' },
            touch: { first: id.first, last: id.last }, consentMarketing: await tracker.adConsent({ visitorId: id.visitorId, leadId: id.leadId }),
          });
        }
        return;
      }
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        await q.exec(`update growth.checkouts set status = $2 where stripe_session_id = $1 and status = 'open'`, [obj.id, event.type.endsWith('expired') ? 'expired' : 'failed']);
        return;
      case 'invoice.paid': {
        if (obj.billing_reason === 'subscription_create' || !obj.amount_paid) return; // la primera la cuenta el checkout
        const subId = subIdOf(obj);
        const id = await identityForSubscription(subId, null);
        const fresh = await q.exec(`insert into growth.orders (order_id, provider, user_id, lead_id, visitor_id, program_slug, plan, kind, amount_cents, tax_cents, currency, first_touch, last_touch)
          values ($1,'stripe',$2,$3,$4,$5,$6,'renewal',$7,$8,$9,$10::jsonb,$11::jsonb) on conflict (order_id) do nothing`,
        [obj.id, id.userId, id.leadId, id.visitorId, id.program, id.plan, obj.amount_paid, taxOf(obj), up(obj.currency), JSON.stringify(id.first), JSON.stringify(id.last)]);
        if (fresh) await tracker.record({ name: 'subscription_renewed', visitorId: id.visitorId, userId: id.userId, leadId: id.leadId, program: id.program,
          valueCents: obj.amount_paid, currency: up(obj.currency), props: { plan: id.plan, order_id: obj.id }, touch: { first: id.first, last: id.last } });
        return;
      }
      case 'invoice.payment_failed': {
        const subId = subIdOf(obj);
        const id = await identityForSubscription(subId, null);
        await tracker.record({ name: 'payment_failed', visitorId: id.visitorId, userId: id.userId, leadId: id.leadId, program: id.program,
          valueCents: obj.amount_due ?? null, currency: up(obj.currency), props: { plan: id.plan, attempt: obj.attempt_count ?? null }, touch: { first: id.first, last: id.last } });
        return;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const prev = event.data.previous_attributes ?? {};
        await upsertSubscription(obj);
        const becameCancel = event.type === 'customer.subscription.deleted' || (obj.cancel_at_period_end === true && prev.cancel_at_period_end === false);
        if (becameCancel) {
          const id = await identityForSubscription(obj.id, obj.metadata?.user_id);
          await tracker.record({ name: 'subscription_canceled', visitorId: id.visitorId, userId: id.userId, leadId: id.leadId, program: id.program,
            props: { plan: id.plan, at_period_end: event.type !== 'customer.subscription.deleted', reason: obj.cancellation_details?.feedback ?? obj.cancellation_details?.reason ?? null },
            touch: { first: id.first, last: id.last } });
        }
        return;
      }
      case 'charge.refunded': {
        const orderId = typeof obj.invoice === 'string' ? obj.invoice : obj.invoice?.id ?? null;
        const last = obj.refunds?.data?.[0];
        const refundId = last?.id ?? `${obj.id}:${obj.amount_refunded}`;
        const o = orderId ? await q.one('select user_id, visitor_id, lead_id, program_slug, plan, first_touch, last_touch from growth.orders where order_id = $1', [orderId]) : null;
        const fresh = await q.exec(`insert into growth.refunds (refund_id, order_id, user_id, amount_cents, currency, reason) values ($1,$2,$3,$4,$5,$6) on conflict (refund_id) do nothing`,
          [refundId, orderId, o?.user_id ?? null, last?.amount ?? obj.amount_refunded, up(obj.currency), last?.reason ?? null]);
        if (fresh) await tracker.record({ name: 'refund', visitorId: o?.visitor_id, userId: o?.user_id, leadId: o?.lead_id, program: o?.program_slug,
          valueCents: last?.amount ?? obj.amount_refunded, currency: up(obj.currency), props: { plan: o?.plan, order_id: orderId, reason: last?.reason ?? null },
          touch: { first: o?.first_touch, last: o?.last_touch } });
        return;
      }
      default:
    }
  });

  return { checkoutMetadata, onCheckoutStarted, onStripeEvent };
}
