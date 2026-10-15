import { PLAN_IDS, PLAN_META } from './config.js';
import { computeResult } from './results.js';
import { unlockAchievement } from './services/achievements.js';

// Estados de Stripe que dan acceso premium.
// past_due: Stripe sigue reintentando el cobro; mantenemos acceso y avisamos.
export const ACCESS_STATUSES = ['active', 'trialing', 'past_due'];
const PRICE_CACHE_MS = 10 * 60_000;
const REUSE_MARGIN_S = 5 * 60;
const EXIT_OFFER_WINDOW_MS = 24 * 60 * 60_000;

export class BillingError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const toDate = (unix) => (unix ? new Date(unix * 1000).toISOString() : null);

export function createBilling({ db, stripe, config, log = console }) {
  const priceCaches = new Map(); // por programa
  let couponCache = null;
  const userLocks = new Map();

  /** Serializa operaciones por usuario (evita sesiones duplicadas por doble clic). */
  function withUserLock(userId, fn) {
    const prev = userLocks.get(userId) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    userLocks.set(userId, next);
    next.finally(() => { if (userLocks.get(userId) === next) userLocks.delete(userId); }).catch(() => {});
    return next;
  }

  async function resolvePrice(ref) {
    if (ref.startsWith('lookup:')) {
      const list = await stripe.prices.list({ lookup_keys: [ref.slice(7)], active: true, limit: 1 });
      return list.data[0] ?? null;
    }
    return stripe.prices.retrieve(ref);
  }

  /** Planes de un programa con el precio real de Stripe. Nunca se muestran importes que no vengan de Stripe. */
  async function getPlans(program = 'sem-fumo') {
    const refs = config.stripe.prices[program] ?? config.stripe.prices['sem-fumo'];
    if (!stripe) return PLAN_IDS.map((id) => ({ id, ...PLAN_META[id], available: false, recommended: id === config.recommendedPlan }));
    const cache = priceCaches.get(program);
    if (cache && cache.at > Date.now() - PRICE_CACHE_MS) return cache.plans;
    const plans = await Promise.all(PLAN_IDS.map(async (id) => {
      const meta = PLAN_META[id];
      const base = { id, ...meta, recommended: id === config.recommendedPlan, available: false };
      try {
        const price = await resolvePrice(refs[id]);
        const rec = price?.recurring;
        if (!price || !price.active || price.unit_amount == null || !rec
          || rec.interval !== meta.interval || rec.interval_count !== meta.intervalCount) {
          log.error(`[billing] El precio del plan "${id}" no existe o no coincide con la periodicidad esperada.`);
          return base;
        }
        return { ...base, available: true, priceId: price.id, amount: price.unit_amount, currency: price.currency.toUpperCase() };
      } catch (err) {
        log.error(`[billing] No se pudo cargar el precio "${program}/${id}": ${err.message}`);
        return base;
      }
    }));
    // Se cachea siempre (planes no configurados son normales). Si Stripe falla por completo,
    // se usa el último resultado válido en vez de consultar en cada petición.
    if (plans.some((p) => p.available)) priceCaches.set(program, { at: Date.now(), plans });
    else if (cache) return cache.plans;
    else priceCaches.set(program, { at: Date.now() - PRICE_CACHE_MS + 60_000, plans });
    return plans;
  }

  // ------------------------------------------------------------ oferta de salida
  /** Oferta real (cupón de Stripe de un solo uso por suscripción) o null si no está configurada. */
  async function getExitOffer() {
    const { couponId, plan } = config.stripe.exitOffer;
    if (!stripe || !couponId) return null;
    try {
      if (!couponCache || couponCache.at < Date.now() - PRICE_CACHE_MS) {
        couponCache = { at: Date.now(), coupon: await stripe.coupons.retrieve(couponId) };
      }
      const { coupon } = couponCache;
      const planInfo = (await getPlans('sem-fumo')).find((p) => p.id === plan);
      if (!coupon?.valid || coupon.duration !== 'once' || !planInfo?.available) return null;
      const discounted = coupon.percent_off
        ? Math.round(planInfo.amount * (100 - coupon.percent_off) / 100)
        : Math.max(0, planInfo.amount - (coupon.amount_off ?? 0));
      return {
        plan, couponId, percentOff: coupon.percent_off ?? null,
        amount: planInfo.amount, discountedAmount: discounted, currency: planInfo.currency,
        title: planInfo.title, periodLabel: planInfo.periodLabel,
      };
    } catch (err) {
      log.error(`[billing] Cupón de la oferta de salida no disponible: ${err.message}`);
      return null;
    }
  }

  /** Marca la oferta como mostrada para esta sesión de cuestionario. Solo devuelve la oferta la primera vez. */
  /** ¿Ya usó la oferta o fue cliente alguna vez? Entonces no hay oferta (evita reutilizar el cupón). */
  async function offerBlockedFor(userId) {
    if (!userId) return false;
    const r = await db.service.one(`select (select exit_offer_used_at from public.profiles where user_id = $1) is not null
      or exists (select 1 from public.subscriptions where user_id = $1) as blocked`, [userId]);
    return r.blocked;
  }

  async function claimExitOffer(sessionId, userId) {
    const offer = await getExitOffer();
    if (!offer || !sessionId) return null;
    if (await offerBlockedFor(userId)) return null;
    const row = await db.service.one(`
      update public.questionnaire_sessions set exit_offer_shown_at = now()
      where id = $1 and exit_offer_shown_at is null and user_id is null returning id`, [sessionId]);
    return row ? offer : null;
  }

  async function exitOfferUsable(sessionId) {
    const row = await db.service.one('select exit_offer_shown_at from public.questionnaire_sessions where id = $1', [sessionId]);
    return Boolean(row?.exit_offer_shown_at && Date.now() - new Date(row.exit_offer_shown_at).getTime() < EXIT_OFFER_WINDOW_MS);
  }

  // ------------------------------------------------------------ estado de suscripción
  async function activeSubscription(userId, program = null, q = db.service) {
    const sub = program
      ? await q.one(`select * from public.subscriptions where user_id = $1 and program_slug = $3 and status = any($2)
          order by created_at desc limit 1`, [userId, ACCESS_STATUSES, program])
      : await q.one(`select * from public.subscriptions where user_id = $1 and status = any($2)
          order by created_at desc limit 1`, [userId, ACCESS_STATUSES]);
    if (sub) return sub;
    // Acceso de cortesía: da acceso sin suscripción de pago (por programa si se indica).
    const grant = program
      ? await q.one(`select * from public.access_grants where user_id = $1 and program_slug = $2 and revoked_at is null
          and (expires_at is null or expires_at > now()) order by created_at desc limit 1`, [userId, program])
      : await q.one(`select * from public.access_grants where user_id = $1 and revoked_at is null
          and (expires_at is null or expires_at > now()) order by created_at desc limit 1`, [userId]);
    return grant && { id: `grant_${grant.id}`, plan: 'cortesia', status: 'active', amount: null, currency: null, interval: null,
      interval_count: null, current_period_end: grant.expires_at, cancel_at_period_end: false, created_at: grant.created_at };
  }

  async function latestSubscription(userId, program = null) {
    return program
      ? db.service.one('select * from public.subscriptions where user_id = $1 and program_slug = $2 order by updated_at desc limit 1', [userId, program])
      : db.service.one('select * from public.subscriptions where user_id = $1 order by updated_at desc limit 1', [userId]);
  }

  /** Suscripciones del usuario agrupadas por programa (para «Mis suscripciones»). */
  async function subscriptionsByProgram(userId) {
    return db.service.rows(`select * from public.subscriptions where user_id = $1
      order by program_slug, updated_at desc`, [userId]);
  }

  async function customerIdOf(userId) {
    return (await db.service.one('select stripe_customer_id from public.profiles where user_id = $1', [userId]))?.stripe_customer_id ?? null;
  }

  async function ensureCustomer(user) {
    // Siempre desde la base (la sesión puede tener datos en caché).
    const existing = await customerIdOf(user.id);
    if (existing) return existing;
    const customer = await stripe.customers.create(
      { email: user.email, name: user.name, preferred_locales: ['es'], metadata: { user_id: user.id } },
      { idempotencyKey: `customer-${user.id}` },
    );
    await db.service.exec('update public.profiles set stripe_customer_id = $1 where user_id = $2 and stripe_customer_id is null', [customer.id, user.id]);
    return customer.id;
  }

  /**
   * Crea (o reutiliza) una sesión de Stripe Checkout.
   * Garantías: no se crea si hay suscripción activa; una sesión abierta del mismo plan,
   * evaluación y descuento se reutiliza; cualquier otra sesión abierta se expira.
   */
  function startCheckout({ user, program = 'sem-fumo', plan, assessment = null, useExitOffer = false }) {
    // Candado en memoria (misma instancia). Entre instancias protege el índice único
    // checkout_sessions_one_open: solo puede existir un checkout abierto por usuario y programa.
    return withUserLock(user.id, () => startCheckoutLocked({ user, program, plan, assessment, useExitOffer }));
  }

  async function startCheckoutLocked({ user, program, plan, assessment, useExitOffer }) {
    {
      if (!stripe) throw new BillingError('PAYMENTS_DISABLED', 'Los pagos no están configurados todavía.', 503);
      if (!PLAN_IDS.includes(plan)) throw new BillingError('INVALID_PLAN', 'Plan no válido.');
      if (await activeSubscription(user.id, program)) {
        throw new BillingError('ALREADY_SUBSCRIBED', 'Ya tienes este programa activo.', 409);
      }

      const planInfo = (await getPlans(program)).find((p) => p.id === plan);
      if (!planInfo?.available) throw new BillingError('PLAN_UNAVAILABLE', 'Este plan no está disponible en este momento.', 503);

      let couponId = null;
      if (useExitOffer) {
        // La oferta de salida solo existe en el embudo del cuestionario de Sem Fumo.
        const offer = program === 'sem-fumo' && assessment ? await getExitOffer() : null;
        if (!offer || offer.plan !== plan || !(await exitOfferUsable(assessment.session_id)) || await offerBlockedFor(user.id)) {
          throw new BillingError('OFFER_UNAVAILABLE', 'Esta oferta ya no está disponible.', 409);
        }
        couponId = offer.couponId;
      }

      const open = await db.service.rows(
        `select * from public.checkout_sessions where user_id = $1 and program_slug = $2 and status = 'open' order by created_at desc`,
      [user.id, program]);
      for (const row of open) {
        const remote = await stripe.checkout.sessions.retrieve(row.id);
        if (remote.status === 'complete') {
          throw new BillingError('PAYMENT_PROCESSING', 'Tu pago se está confirmando. En unos instantes tendrás acceso.', 409);
        }
        const reusable = remote.status === 'open' && remote.expires_at > Date.now() / 1000 + REUSE_MARGIN_S;
        if (reusable && row.plan === plan && (row.assessment_id ?? null) === (assessment?.id ?? null)
          && row.price_id === planInfo.priceId && (row.coupon_id ?? null) === couponId) {
          return { url: remote.url, reused: true };
        }
        if (remote.status === 'open') await stripe.checkout.sessions.expire(row.id);
        await db.service.exec(`update public.checkout_sessions set status = 'expired' where id = $1`, [row.id]);
      }

      const hadCustomer = Boolean(await customerIdOf(user.id));
      const customer = await ensureCustomer(user);
      // Defensa adicional: si Stripe ya tiene una suscripción viva de ESTE programa (p. ej.
      // webhook pendiente), no crear otra. Suscripciones de otros programas son independientes.
      if (hadCustomer) {
        const remoteSubs = await stripe.subscriptions.list({ customer, status: 'all', limit: 20 });
        for (const live of remoteSubs.data.filter((s) => ACCESS_STATUSES.includes(s.status))) {
          await syncSubscriptionRow(db.service, live, user.id);
          if ((await programFromSubscription(live)) === program) {
            throw new BillingError('ALREADY_SUBSCRIBED', 'Ya tienes este programa activo.', 409);
          }
        }
      }

      const metadata = { user_id: user.id, plan, program };
      if (assessment) metadata.assessment_id = assessment.id;
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer,
        client_reference_id: user.id,
        line_items: [{ price: planInfo.priceId, quantity: 1 }],
        ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
        metadata,
        subscription_data: { metadata },
        locale: 'es',
        custom_text: {
          submit: { message: 'El acceso a Aliento empieza de inmediato. La suscripción se renueva automáticamente al mismo precio hasta que la canceles desde «Mi suscripción».' },
        },
        success_url: `${config.appUrl}/bienvenida?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${config.appUrl}/programas?pago=cancelado`,
      }, {
        // Misma petición repetida (reintento de red) → misma sesión. Ventana de 10 min.
        idempotencyKey: `checkout-${user.id}-${program}-${plan}-${assessment?.id ?? 'catalogo'}-${couponId ?? 'none'}-${Math.floor(Date.now() / 600_000)}`,
      });
      try {
        await db.service.exec(`
          insert into public.checkout_sessions (id, user_id, assessment_id, program_slug, plan, price_id, coupon_id, url, status, expires_at)
          values ($1, $2, $3, $4, $5, $6, $7, $8, 'open', to_timestamp($9))`,
        [session.id, user.id, assessment?.id ?? null, program, plan, planInfo.priceId, couponId, session.url, session.expires_at]);
      } catch (err) {
        if (err.code !== '23505') throw err;
        // Otra instancia creó un checkout a la vez: se anula este y se devuelve el existente.
        await stripe.checkout.sessions.expire(session.id).catch(() => {});
        const existing = await db.service.one(`select url from public.checkout_sessions where user_id = $1 and program_slug = $2 and status = 'open'`, [user.id, program]);
        if (existing?.url) return { url: existing.url, reused: true };
        throw err;
      }
      return { url: session.url, reused: false };
    }
  }

  async function planFromSubscription(sub) {
    if (PLAN_IDS.includes(sub.metadata?.plan)) return sub.metadata.plan;
    const priceId = sub.items?.data?.[0]?.price?.id;
    const row = await db.service.one('select plan from public.checkout_sessions where price_id = $1 limit 1', [priceId]);
    if (row) return row.plan;
    for (const program of Object.keys(config.stripe.prices)) {
      const found = (await getPlans(program)).find((p) => p.priceId === priceId);
      if (found) return found.id;
    }
    return 'mensual';
  }

  /** Programa al que pertenece una suscripción: metadata → fila de checkout → lookup_key → sem-fumo. */
  async function programFromSubscription(sub) {
    const meta = sub.metadata?.program;
    if (meta && config.stripe.prices[meta]) return meta;
    const priceId = sub.items?.data?.[0]?.price?.id;
    if (priceId) {
      const row = await db.service.one('select program_slug from public.checkout_sessions where price_id = $1 limit 1', [priceId]);
      if (row) return row.program_slug;
      try {
        const price = await stripe.prices.retrieve(priceId);
        const key = price.lookup_key ?? '';
        const m = key.match(/^alento_([a-z-]+)_(semanal|mensual|trimestral|anual)$/);
        if (m && config.stripe.prices[m[1]]) return m[1];
        if (key.startsWith('folego_')) return 'sem-fumo';
      } catch { /* precio inaccesible: se usa el valor por defecto */ }
    }
    return 'sem-fumo';
  }

  async function userIdForSubscription(sub) {
    const fromMeta = sub.metadata?.user_id;
    if (fromMeta && /^[0-9a-f-]{36}$/i.test(fromMeta)
      && await db.service.one('select 1 from public.profiles where user_id = $1', [fromMeta])) return fromMeta;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    return (await db.service.one('select user_id from public.profiles where stripe_customer_id = $1', [customerId]))?.user_id ?? null;
  }

  async function syncSubscriptionRow(q, sub, userId) {
    const item = sub.items?.data?.[0];
    const price = item?.price;
    const periodEnd = item?.current_period_end ?? sub.current_period_end ?? null;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
    await q.exec(`
      insert into public.subscriptions (id, user_id, stripe_customer_id, program_slug, plan, price_id, amount, currency,
        interval, interval_count, status, current_period_end, cancel_at_period_end)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, to_timestamp($12), $13)
      on conflict (id) do update set
        status = excluded.status, plan = excluded.plan, price_id = excluded.price_id, amount = excluded.amount,
        currency = excluded.currency, interval = excluded.interval, interval_count = excluded.interval_count,
        current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end`,
    [sub.id, userId, customerId, await programFromSubscription(sub), await planFromSubscription(sub), price?.id ?? '',
      price?.unit_amount ?? null, price?.currency?.toUpperCase() ?? null, price?.recurring?.interval ?? null,
      price?.recurring?.interval_count ?? null, sub.status, periodEnd, Boolean(sub.cancel_at_period_end || sub.cancel_at)]);
    if (customerId) {
      await q.exec('update public.profiles set stripe_customer_id = $1 where user_id = $2 and stripe_customer_id is null', [customerId, userId]);
    }
  }

  /**
   * Activación (idempotente): vincula la evaluación a la cuenta, crea el plan personalizado,
   * los objetivos y metas iniciales y concede el primer logro.
   */
  async function ensureActivated(q, userId, assessmentId, program = 'sem-fumo') {
    const assessment = assessmentId
      ? await q.one('select * from public.user_assessments where id = $1', [assessmentId])
      : null;
    if (assessment) {
      await q.exec('update public.user_assessments set user_id = $1 where id = $2', [userId, assessment.id]);
      await q.exec('update public.questionnaire_sessions set user_id = $1, claimed_user_id = $1 where id = $2', [userId, assessment.session_id]);
    }
    // Compra desde el catálogo (sin cuestionario): el plan se crea en el onboarding del programa.
    if (!(await q.one('select 1 from public.personalized_plans where user_id = $1 and program_slug = $2', [userId, program])) && assessment) {
      await buildPersonalPlan(q, userId, assessment, { reason: 'Activación de la suscripción' });
    }
    await q.exec('insert into public.notification_preferences (user_id, program_slug) values ($1, $2) on conflict do nothing', [userId, program]);
    await unlockAchievement(q, userId, 'primer-paso');
  }

  async function activateFromCheckout(session) {
    const userId = session.client_reference_id ?? session.metadata?.user_id;
    if (!userId || !(await db.service.one('select 1 from public.profiles where user_id = $1', [userId]))) {
      throw new Error(`Usuario desconocido en la sesión ${session.id}`);
    }
    const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    const sub = await stripe.subscriptions.retrieve(subId);
    const program = session.metadata?.program
      ?? (await db.service.one('select program_slug from public.checkout_sessions where id = $1', [session.id]))?.program_slug
      ?? 'sem-fumo';
    const other = await activeSubscription(userId, program);
    if (other && other.id !== sub.id && !String(other.id).startsWith('grant_')) {
      log.warn(`[billing] REVISAR: el usuario ${userId} tiene dos suscripciones activas de ${program} (${other.id}, ${sub.id}).`);
      await db.service.exec(`
        insert into public.billing_reconciliation_reviews (stripe_subscription_id, stripe_customer_id, reason)
        values ($1, $2, 'Segunda suscripción activa del mismo programa') on conflict do nothing`,
      [sub.id, typeof sub.customer === 'string' ? sub.customer : sub.customer?.id]);
    }
    await db.tx(async (q) => {
      await syncSubscriptionRow(q, sub, userId);
      await q.exec(`update public.checkout_sessions set status = 'complete' where id = $1`, [session.id]);
      if (session.discounts?.length || session.total_details?.amount_discount > 0) {
        await q.exec('update public.profiles set exit_offer_used_at = coalesce(exit_offer_used_at, now()) where user_id = $1', [userId]);
      }
      if (ACCESS_STATUSES.includes(sub.status)) await ensureActivated(q, userId, session.metadata?.assessment_id, program);
    });
  }

  async function syncFromStripe(sub) {
    const userId = await userIdForSubscription(sub);
    if (!userId) {
      log.warn(`[billing] Suscripción ${sub.id} sin usuario asociado; queda para revisión.`);
      await db.service.exec(`
        insert into public.billing_reconciliation_reviews (stripe_subscription_id, stripe_customer_id, reason)
        values ($1, $2, 'Webhook sin usuario verificable') on conflict do nothing`,
      [sub.id, typeof sub.customer === 'string' ? sub.customer : sub.customer?.id]);
      return;
    }
    await db.tx(async (q) => {
      await syncSubscriptionRow(q, sub, userId);
      if (ACCESS_STATUSES.includes(sub.status) && sub.metadata?.assessment_id) {
        await ensureActivated(q, userId, sub.metadata.assessment_id, await programFromSubscription(sub));
      }
    });
  }

  async function processEvent(event) {
    const obj = event.data.object;
    switch (event.type) {
      case 'checkout.session.completed':
        if (obj.mode !== 'subscription') return;
        if (obj.payment_status === 'paid' || obj.payment_status === 'no_payment_required') await activateFromCheckout(obj);
        else await db.service.exec(`update public.checkout_sessions set status = 'complete' where id = $1`, [obj.id]);
        return;
      case 'checkout.session.async_payment_succeeded':
        await activateFromCheckout(obj);
        return;
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        await db.service.exec(`update public.checkout_sessions set status = 'expired' where id = $1`, [obj.id]);
        return;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        // Los eventos pueden llegar desordenados: se relee siempre el estado actual en Stripe.
        await syncFromStripe(await stripe.subscriptions.retrieve(obj.id));
        return;
      case 'charge.refunded':
      case 'charge.dispute.created': {
        // Reembolso total o disputa: se cancela la suscripción al momento (no se vuelve a cobrar).
        if (event.type === 'charge.refunded' && obj.amount_refunded < obj.amount) return;
        const subId = await subscriptionForCharge(obj);
        if (!subId) return;
        const sub = await stripe.subscriptions.retrieve(subId);
        const canceled = ['canceled', 'incomplete_expired'].includes(sub.status) ? sub : await stripe.subscriptions.cancel(subId);
        await syncFromStripe(canceled);
        await db.service.exec(`insert into public.billing_reconciliation_reviews (stripe_subscription_id, stripe_customer_id, reason)
          values ($1, $2, $3) on conflict (stripe_subscription_id) do update set reason = excluded.reason, status = 'open'`,
        [subId, typeof obj.customer === 'string' ? obj.customer : obj.customer?.id,
          event.type === 'charge.refunded' ? 'Reembolso total: suscripción cancelada' : 'Disputa abierta: suscripción cancelada; preparar evidencias']);
        return;
      }
      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const subId = obj.parent?.subscription_details?.subscription ?? obj.subscription;
        const id = typeof subId === 'string' ? subId : subId?.id;
        if (id) await syncFromStripe(await stripe.subscriptions.retrieve(id));
        return;
      }
      default:
    }
  }

  async function subscriptionForCharge(charge) {
    const invoiceId = typeof charge.invoice === 'string' ? charge.invoice : charge.invoice?.id;
    if (invoiceId) {
      const inv = await stripe.invoices.retrieve(invoiceId);
      const s = inv.parent?.subscription_details?.subscription ?? inv.subscription;
      if (s) return typeof s === 'string' ? s : s.id;
    }
    const customer = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
    if (!customer) return null;
    const row = await db.service.one(`select id from public.subscriptions where stripe_customer_id = $1 order by updated_at desc limit 1`, [customer]);
    return row?.id ?? null;
  }

  /** Procesa un evento verificado una sola vez; si falla o quedó colgado, se puede reintentar. */
  async function handleEvent(event) {
    const claimed = await db.service.one(`
      insert into public.billing_events (id, type, object_id) values ($1, $2, $3)
      on conflict (id) do update set status = 'processing', error = null, received_at = now()
        where public.billing_events.status = 'failed'
           or (public.billing_events.status = 'processing' and public.billing_events.received_at < now() - interval '2 minutes')
      returning id`, [event.id, event.type, event.data?.object?.id ?? null]);
    if (!claimed) {
      const row = await db.service.one('select status from public.billing_events where id = $1', [event.id]);
      // En proceso ahora mismo en otra instancia: que Stripe lo reintente más tarde.
      if (row?.status === 'processing') throw Object.assign(new Error('Evento en proceso'), { inFlight: true });
      return 'duplicate';
    }
    try {
      await processEvent(event);
      await db.service.exec(`update public.billing_events set status = 'processed', processed_at = now() where id = $1`, [event.id]);
      return 'processed';
    } catch (err) {
      await db.service.exec(`update public.billing_events set status = 'failed', error = $2 where id = $1`, [event.id, String(err.message).slice(0, 500)]);
      throw err;
    }
  }

  function constructEvent(rawBody, signature) {
    return stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  }

  async function portalUrl(user) {
    const customer = await customerIdOf(user.id);
    if (!stripe || !customer) throw new BillingError('NO_CUSTOMER', 'Todavía no tienes datos de facturación.', 404);
    const session = await stripe.billingPortal.sessions.create({
      customer,
      return_url: `${config.appUrl}/suscripcion`,
      locale: 'es',
    });
    return session.url;
  }

  /** Al eliminar la cuenta: cancela cualquier suscripción restante y borra el cliente en Stripe. */
  async function deleteCustomer(userId) {
    const customer = await customerIdOf(userId);
    if (!stripe || !customer) return;
    try {
      await stripe.customers.del(customer); // cancela al instante sus suscripciones
    } catch (err) {
      if (err?.code !== 'resource_missing') throw err;
    }
  }

  /** Estado del pago para la página de bienvenida. Solo lee la base de datos: activa el webhook. */
  async function checkoutState(userId, sessionId) {
    const row = await db.service.one('select * from public.checkout_sessions where id = $1 and user_id = $2', [sessionId, userId]);
    if (!row) return { state: 'unknown' };
    if (await activeSubscription(userId)) return { state: 'active', plan: row.plan };
    if (row.status === 'expired') return { state: 'failed' };
    return { state: 'pending' };
  }

  async function pendingCheckout(userId) {
    return db.service.one(`
      select id, plan, created_at from public.checkout_sessions
      where user_id = $1 and status = 'open' and expires_at > now() order by created_at desc limit 1`, [userId]);
  }

  /**
   * Conciliación: busca suscripciones de Aliento en Stripe sin vínculo correcto en la base.
   * Solo vincula por identificadores verificables (metadata.user_id que puso nuestro servidor
   * o el customer de Stripe guardado en el perfil). Nunca por nombre o correo.
   * No crea cobros ni modifica nada en Stripe. `apply=false` solo informa.
   */
  async function reconcile({ apply = false } = {}) {
    const plans = await getPlans();
    const priceIds = new Set(plans.filter((p) => p.priceId).map((p) => p.priceId));
    const report = { checked: 0, ok: 0, linked: [], review: [] };
    for await (const sub of stripe.subscriptions.list({ status: 'all', limit: 100 })) {
      if (!sub.items.data.some((i) => priceIds.has(i.price.id))) continue;
      report.checked += 1;
      const userId = await userIdForSubscription(sub);
      if (!userId) {
        report.review.push({ subscription: sub.id, status: sub.status, reason: 'Sin vínculo verificable' });
        if (apply) {
          await db.service.exec(`
            insert into public.billing_reconciliation_reviews (stripe_subscription_id, stripe_customer_id, reason)
            values ($1, $2, 'Conciliación: sin vínculo verificable') on conflict do nothing`,
          [sub.id, typeof sub.customer === 'string' ? sub.customer : sub.customer?.id]);
        }
        continue;
      }
      const row = await db.service.one('select status, user_id from public.subscriptions where id = $1', [sub.id]);
      if (row && row.status === sub.status && row.user_id === userId) { report.ok += 1; continue; }
      report.linked.push({ subscription: sub.id, user: userId, from: row?.status ?? 'sin registro', to: sub.status });
      if (apply) {
        await db.tx(async (q) => {
          await syncSubscriptionRow(q, sub, userId);
          if (ACCESS_STATUSES.includes(sub.status)) await ensureActivated(q, userId, sub.metadata?.assessment_id);
        });
      }
    }
    return report;
  }

  return {
    getPlans, getExitOffer, claimExitOffer, startCheckout, handleEvent, constructEvent, portalUrl, checkoutState,
    activeSubscription, latestSubscription, subscriptionsByProgram, pendingCheckout, reconcile, ensureActivated, customerIdOf, deleteCustomer, offerBlockedFor, programFromSubscription,
    enabled: Boolean(stripe),
  };
}

/** Crea una nueva versión del plan personalizado (historial en plan_versions) y sus metas semanales. */
export async function buildPersonalPlan(q, userId, assessment, { strategyOverride, reason }) {
  const answers = await q.rows('select question_id, value from public.questionnaire_answers where session_id = $1', [assessment.session_id]);
  const result = computeResult(Object.fromEntries(answers.map((a) => [a.question_id, a.value])), { strategyOverride });
  const data = {
    strategy: result.plan.strategy,
    triggers: result.plan.triggers,
    tools: result.plan.tools,
    tracking: result.plan.tracking,
    motives: result.plan.motives,
    schedule: result.projection.schedule,
    baseline: { perDay: result.current.perDay, weeklySpend: result.current.weeklySpend },
  };
  let plan = await q.one('select * from public.personalized_plans where user_id = $1', [userId]);
  if (!plan) {
    plan = await q.one('insert into public.personalized_plans (user_id, assessment_id) values ($1, $2) returning *', [userId, assessment.id]);
  } else {
    plan = await q.one(`update public.personalized_plans set current_version = current_version + 1, assessment_id = $2
      where id = $1 returning *`, [plan.id, assessment.id]);
  }
  await q.exec('insert into public.plan_versions (plan_id, version, data, reason) values ($1, $2, $3, $4)',
    [plan.id, plan.current_version, JSON.stringify(data), reason]);

  // Metas semanales: se sustituyen las pendientes; las completadas se conservan.
  await q.exec('delete from public.daily_goals where user_id = $1 and done_at is null', [userId]);
  for (const g of result.plan.goals) {
    await q.exec('insert into public.daily_goals (user_id, week, title, detail) values ($1, $2, $3, $4)', [userId, g.week, g.title, g.detail]);
  }

  // Objetivo principal: nueva versión, la anterior queda en el historial.
  const current = await q.one('select * from public.user_goals where user_id = $1 and superseded_at is null', [userId]);
  if (!current || current.strategy !== data.strategy.id) {
    await q.exec('update public.user_goals set superseded_at = now() where user_id = $1 and superseded_at is null', [userId]);
    await q.exec(`insert into public.user_goals (user_id, strategy, start_date, quit_date, max_daily, exercise_per_week, money_goal, money_goal_label)
      values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, data.strategy.id, current?.start_date ?? new Date().toISOString().slice(0, 10), current?.quit_date ?? null,
      current?.max_daily ?? null, current?.exercise_per_week ?? 3, current?.money_goal ?? null, current?.money_goal_label ?? null]);
  }
  return data;
}
