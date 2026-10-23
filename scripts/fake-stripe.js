// Doble de Stripe en memoria para pruebas y para el modo demo local.
// Nunca se usa en producción.

export function fakeStripe({ webhooks, baseUrl = 'https://checkout.stripe.test' }) {
  const prices = {
    folego_semanal: { id: 'price_s', active: true, unit_amount: 799, currency: 'usd', recurring: { interval: 'week', interval_count: 1 } },
    folego_mensual: { id: 'price_m', active: true, unit_amount: 1999, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } },
    folego_trimestral: { id: 'price_t', active: true, unit_amount: 3499, currency: 'usd', recurring: { interval: 'month', interval_count: 3 } },
  };
  // Programas adicionales (mismos importes que Sem Fumo).
  for (const program of ['alcohol', 'azucar', 'ansiedad', 'sueno']) {
    for (const [plan, base] of [['semanal', 'folego_semanal'], ['mensual', 'folego_mensual'], ['trimestral', 'folego_trimestral']]) {
      prices[`alento_${program}_${plan}`] = { ...prices[base], id: `price_${program.slice(0, 3)}_${plan.slice(0, 1)}`, lookup_key: `alento_${program}_${plan}` };
    }
  }
  const sessions = new Map();
  const subs = new Map();
  const invoiceSubs = new Map();
  let n = 0;
  // Prefijo aleatorio por ejecución: IDs únicos aunque varios procesos compartan la base local.
  const run = Math.random().toString(36).slice(2, 8);
  const calls = { sessionsCreated: 0, expired: 0 };
  return {
    calls, sessions, subs, invoiceSubs,
    webhooks,
    prices: {
      list: async ({ lookup_keys }) => ({ data: lookup_keys.map((k) => prices[k]).filter(Boolean) }),
      retrieve: async (id) => Object.values(prices).find((p) => p.id === id),
    },
    customers: {
      create: async () => ({ id: `cus_${run}${++n}` }),
      del: async (id) => { for (const sub of subs.values()) if (sub.customer === id) sub.status = 'canceled'; calls.deletedCustomers = (calls.deletedCustomers ?? 0) + 1; return { id, deleted: true }; },
    },
    invoices: { retrieve: async (id) => ({ id, parent: { subscription_details: { subscription: invoiceSubs.get(id) } } }) },
    coupons: { retrieve: async (id) => (id === 'alento-volta-10' ? { id, valid: true, duration: 'once', percent_off: 10 } : Promise.reject(new Error('No such coupon'))) },
    subscriptions: {
      list: ({ customer } = {}) => {
        const data = [...subs.values()].filter((s) => !customer || s.customer === customer);
        // Igual que el SDK: se puede usar con await o con for await (paginación automática).
        return Object.assign(Promise.resolve({ data }), { [Symbol.asyncIterator]: async function* () { yield* data; } });
      },
      retrieve: async (id) => structuredClone(subs.get(id)),
      cancel: async (id) => { const sub = subs.get(id); sub.status = 'canceled'; return structuredClone(sub); },
    },
    checkout: {
      sessions: {
        create: async (params) => {
          calls.sessionsCreated += 1;
          const s = { id: `cs_${run}_${++n}`, url: `${baseUrl}/${n}`, status: 'open', expires_at: Math.floor(Date.now() / 1000) + 86400, ...params };
          sessions.set(s.id, s);
          return s;
        },
        retrieve: async (id) => sessions.get(id),
        expire: async (id) => { calls.expired += 1; sessions.get(id).status = 'expired'; return sessions.get(id); },
      },
    },
    billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.test/portal' }) } },
    /** Simula que el cliente paga en Checkout. */
    pay(sessionId) {
      const s = sessions.get(sessionId);
      const sub = {
        id: `sub_${run}${++n}`, customer: s.customer, status: 'active', cancel_at_period_end: false, metadata: s.subscription_data.metadata,
        items: { data: [{ price: { id: s.line_items[0].price }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
      };
      subs.set(sub.id, sub);
      Object.assign(s, { status: 'complete', payment_status: 'paid', subscription: sub.id });
      return { session: s, sub };
    },
  };
}

