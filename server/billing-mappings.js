// Mapeo canónico entre programas, planes e identificadores comerciales de pago
// (Stripe, Apple StoreKit 2, Google Play Billing, RevenueCat).
// Respeta variables de entorno cuando están configuradas y nunca inventa IDs ficticios.

import { PLAN_IDS, PROGRAM_IDS, priceRefFor } from './config.js';

export const BILLING_PROVIDERS = ['stripe', 'apple', 'google', 'revenuecat', 'courtesy'];

/**
 * Genera el mapa canónico de identificadores para un programa y un plan.
 */
export function canonicalMapping(program, plan, env = process.env) {
  const stripePriceRef = priceRefFor(env, program, plan);
  const progNorm = program.replace(/-/g, '_');

  const appleId = env[`APPLE_PRODUCT_${progNorm.toUpperCase()}_${plan.toUpperCase()}`]
    || `app.alento.${progNorm}.${plan}`;

  const googleId = env[`GOOGLE_PRODUCT_${progNorm.toUpperCase()}_${plan.toUpperCase()}`]
    || `alento_${progNorm}_${plan}`;

  const rcEntitlement = env[`REVENUECAT_ENTITLEMENT_${progNorm.toUpperCase()}`]
    || `alento_${progNorm}`;

  return {
    program_id: program,
    plan,
    stripe_price_id: stripePriceRef,
    apple_product_id: appleId,
    google_product_id: googleId,
    revenuecat_entitlement_id: rcEntitlement,
  };
}

/**
 * Devuelve todos los mapeos de producto del catálogo.
 */
export function getAllProductMappings(env = process.env) {
  const mappings = [];
  for (const prog of PROGRAM_IDS) {
    for (const plan of PLAN_IDS) {
      mappings.push(canonicalMapping(prog, plan, env));
    }
  }
  return mappings;
}

/**
 * Resuelve el programa y plan correspondiente a partir de un identificador de tienda (Apple o Google).
 */
export function resolveFromStoreProductId(storeProductId, env = process.env) {
  const all = getAllProductMappings(env);
  return all.find((m) => m.apple_product_id === storeProductId || m.google_product_id === storeProductId) || null;
}
