// Configuración centralizada a partir de variables de entorno (ver .env.example).

export const PLAN_IDS = ['semanal', 'mensual', 'trimestral'];

export const PLAN_META = {
  // unit: texto para "precio por …"; charge: periodicidad visible en la tarjeta;
  // months: solo si el período es de varios meses (muestra el equivalente mensual).
  // days: duración del período para el precio por día que se muestra en el paywall.
  semanal: { name: 'Semanal', title: 'Plan de 1 semana', interval: 'week', intervalCount: 1, periodLabel: 'cada semana', unit: 'semana', charge: 'Se cobra cada semana', months: null, days: 7 },
  mensual: { name: 'Mensual', title: 'Plan de 1 mes', interval: 'month', intervalCount: 1, periodLabel: 'cada mes', unit: 'mes', charge: 'Se cobra cada mes', months: null, days: 30 },
  trimestral: { name: 'Trimestral', title: 'Plan de 3 meses', interval: 'month', intervalCount: 3, periodLabel: 'cada 3 meses', unit: '3 meses', charge: 'Se cobra cada 3 meses', months: 3, days: 90 },
};

export function loadConfig(env = process.env) {
  const recommended = env.RECOMMENDED_PLAN || 'trimestral';
  const exitPlan = env.EXIT_OFFER_PLAN || 'semanal';
  return {
    port: Number(env.PORT ?? 3000),
    appUrl: (env.APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')).replace(/\/$/, ''),
    isProduction: env.NODE_ENV === 'production',
    // Moneda en la que el usuario indica su gasto en el cuestionario.
    currency: (env.APP_CURRENCY || 'USD').toUpperCase(),
    locale: env.APP_LOCALE || 'es-US',
    recommendedPlan: PLAN_IDS.includes(recommended) ? recommended : 'trimestral',
    // Nombres propios o los que inyecta la integración Supabase de Vercel.
    supabase: {
      url: env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '',
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      secretKey: env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '',
      // Pooler en modo transacción (serverless) o conexión directa.
      dbUrl: env.SUPABASE_DB_URL || env.POSTGRES_URL || env.POSTGRES_URL_NON_POOLING || '',
    },
    // Notificaciones push (Web Push con claves VAPID propias; sin proveedor externo).
    push: {
      publicKey: env.VAPID_PUBLIC_KEY || '',
      privateKey: env.VAPID_PRIVATE_KEY || '',
      subject: env.VAPID_SUBJECT || 'mailto:soporte@aliento.app',
    },
    cronSecret: env.CRON_SECRET || '',
    // Identidad legal del responsable (se muestra en Términos y Privacidad).
    legal: {
      name: env.LEGAL_NAME || '',
      taxId: env.LEGAL_TAX_ID || '',
      address: env.LEGAL_ADDRESS || '',
      email: env.LEGAL_EMAIL || '',
      country: env.LEGAL_COUNTRY || '',
      updatedAt: env.LEGAL_UPDATED_AT || '2026-10-14',
    },
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY ?? '',
      webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? '',
      // Precios por lookup_key (creados con `npm run stripe:setup`) o por ID explícito.
      prices: {
        semanal: env.STRIPE_PRICE_SEMANAL || 'lookup:folego_semanal',
        mensual: env.STRIPE_PRICE_MENSUAL || 'lookup:folego_mensual',
        trimestral: env.STRIPE_PRICE_TRIMESTRAL || 'lookup:folego_trimestral',
      },
      // Oferta de salida: cupón real de Stripe aplicado solo al primer pago de un plan.
      exitOffer: {
        couponId: env.STRIPE_EXIT_COUPON || '',
        plan: PLAN_IDS.includes(exitPlan) ? exitPlan : 'semanal',
      },
    },
  };
}
