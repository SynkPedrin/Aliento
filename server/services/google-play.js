// Verificación de compras de Google Play con la API oficial de Android Publisher.
// No se confía en el cliente: la compra solo desbloquea acceso si Google responde
// `SUBSCRIPTION_STATE_ACTIVE` (o renovación en gracia) para el purchaseToken indicado.
// Requiere credenciales de service account (GOOGLE_SERVICE_ACCOUNT_JSON) y
// GOOGLE_PLAY_PACKAGE_NAME; sin ellas el módulo queda deshabilitado (503), no simulado.

import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
/** Estados que conceden acceso; el resto no desbloquea nada. */
const ACCESS_STATES = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'];

export class GooglePlayError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}

function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

/**
 * Verificador de Google Play. `enabled` indica si hay credenciales; `verify(...)`
 * consulta siempre a Google (red real), nunca simula una respuesta.
 */
export function createGooglePlayVerifier({ env = process.env, log = console } = {}) {
  let credentials = null;
  try {
    credentials = env.GOOGLE_SERVICE_ACCOUNT_JSON ? JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) : null;
  } catch (err) {
    log.error('[google-play] GOOGLE_SERVICE_ACCOUNT_JSON no es JSON válido:', err.message);
  }
  const packageName = env.GOOGLE_PLAY_PACKAGE_NAME || '';
  const enabled = Boolean(credentials?.client_email && credentials?.private_key && packageName);

  let accessToken = null;
  let tokenExp = 0;

  async function token() {
    if (accessToken && Date.now() < tokenExp - 60_000) return accessToken;
    const now = Math.floor(Date.now() / 1000);
    const assertion = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({
      iss: credentials.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
    })}`;
    const signed = createSign('RSA-SHA256').update(assertion).sign(credentials.private_key, 'base64url');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${assertion}.${signed}` }),
    });
    if (!res.ok) throw new GooglePlayError(`No se pudo autenticar con Google (${res.status}).`, 503);
    const out = await res.json();
    accessToken = out.access_token;
    tokenExp = Date.now() + (out.expires_in ?? 3600) * 1000;
    return accessToken;
  }

  /** Consulta real a Google: subscriptionsv2 para el token y para el producto pedido. */
  async function verify({ productId, purchaseToken }) {
    if (!enabled) throw new GooglePlayError('La verificación de Google Play no está configurada en este servidor.', 503);
    if (!productId || !purchaseToken) throw new GooglePlayError('Compra incompleta.', 422);
    const auth = await token();
    const url = `${API_BASE}/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${auth}` } });
    if (res.status === 401) {
      accessToken = null;
      throw new GooglePlayError('Google rechazó la autenticación del servidor.', 503);
    }
    if (res.status === 404) throw new GooglePlayError('Compra no encontrada en Google Play.', 404);
    if (!res.ok) throw new GooglePlayError(`Google Play respondió ${res.status}.`, 503);
    const data = await res.json();
    if (!ACCESS_STATES.includes(data.subscriptionState)) {
      throw new GooglePlayError('La suscripción no está activa en Google Play.', 409);
    }
    const lineItem = data.lineItems ?? [];
    const matching = lineItem.find((li) => (li.productId ?? li.autoRenewingPlan?.productId) === productId) ?? lineItem[0];
    if (!matching) throw new GooglePlayError('Producto no coincide con la compra verificada.', 409);
    return {
      provider: 'google',
      productId,
      purchaseToken,
      transactionId: `${purchaseToken}:${productId}`,
      originalTransactionId: data.linkedPurchaseToken || purchaseToken,
      expiresAt: matching.expiryTime ?? null,
      acknowledged: data.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_PENDING',
      payload: data,
    };
  }

  return { enabled, verify };
}
