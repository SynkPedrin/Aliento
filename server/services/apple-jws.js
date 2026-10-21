// Verificación criptográfica de JWS firmados por Apple (StoreKit 2 / App Store Server).
//
// Todos los datos que Apple firma (transacciones de StoreKit 2 y notificaciones de servidor
// v2) llegan como JWS compactos (header.payload.signature) cuya cabecera incluye la cadena
// de certificados X.509 (`x5c`) de Apple. La seguridad se apoya en:
//   1. Verificar la firma ES256 del JWS con la clave pública del certificado final.
//   2. Verificar que la cadena X.509 es válida: cada certificado lo firmó el siguiente,
//      los certificados estén vigentes y la raíz sea EXACTAMENTE la Apple Root CA - G3
//      (huella fijada; fetched de https://www.apple.com/certificateauthority/AppleRootCA-G3.cer).
//   3. Comparar el bundle id y el entorno (sandbox / production) con la configuración.
// Si cualquier paso falla, la transacción NO se procesa (no se confía en el cliente).

import { createVerify, X509Certificate } from 'node:crypto';

// Huella SHA-256 del certificado raíz "Apple Root CA - G3" (CN=Apple Root CA - G3,
// notBefore=2014-04-30, notAfter=2039-04-30).
export const APPLE_ROOT_CA_G3_SHA256 = '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179';

export class AppleJwsError extends Error {
  constructor(message, status = 403) {
    super(message);
    this.status = status;
  }
}

/** Decodifica el JWS compacto sin verificar (solo estructura). */
function splitJws(jws) {
  if (typeof jws !== 'string') throw new AppleJwsError('signedPayload no válido.');
  const parts = jws.split('.');
  if (parts.length !== 3) throw new AppleJwsError('signedPayload no válido.');
  const decode = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
  let header, payload;
  try {
    header = decode(parts[0]);
    payload = decode(parts[1]);
  } catch {
    throw new AppleJwsError('signedPayload no decodificable.');
  }
  if (header.alg !== 'ES256') throw new AppleJwsError('Firma no soportada.');
  if (!Array.isArray(header.x5c) || !header.x5c.length) throw new AppleJwsError('Falta la cadena de certificados.');
  return { parts, header, payload };
}

const ms = (value) => {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : null;
};

/**
 * Verificador de JWS de Apple. `verify(jws)` devuelve el payload decodificado
 * solo si la firma y la cadena son válidas.
 */
export function createAppleJwsVerifier({ rootCaPem = null, bundleId = null, now = null } = {}) {
  const pinnedFingerprint = rootCaPem
    ? new X509Certificate(rootCaPem).fingerprint256.replaceAll(':', '').toUpperCase()
    : APPLE_ROOT_CA_G3_SHA256;

  function verifyGws(jws) {
    const { parts, header, payload } = splitJws(jws);

    // 1. Cadena de certificados: el primero es el que firma el JWS.
    const chain = header.x5c.map((b64) => new X509Certificate(Buffer.from(b64, 'base64')));
    for (let i = 0; i < chain.length - 1; i += 1) {
      const issuer = chain[i + 1];
      // Cada certificado debe estar firmado por el siguiente de la cadena.
      try {
        if (!chain[i].verify(issuer.publicKey)) {
          throw new AppleJwsError('Cadena de certificados rota.');
        }
      } catch (err) {
        if (err instanceof AppleJwsError) throw err;
        throw new AppleJwsError('Cadena de certificados no verificable.');
      }
    }
    const last = chain[chain.length - 1];
    const rootFingerprint = last.fingerprint256.replaceAll(':', '').toUpperCase();
    if (rootFingerprint !== pinnedFingerprint) {
      throw new AppleJwsError('Raíz de confianza de Apple no reconocida.');
    }

    // Vigencia de cada certificado de la cadena.
    for (const cert of chain) {
      if (Date.parse(cert.validFrom) > (now ?? new Date()).getTime() || Date.parse(cert.validTo) < (now ?? new Date()).getTime()) {
        throw new AppleJwsError('Certificado fuera de su periodo de validez.');
      }
    }

    // 2. Firma ES256 del JWS (r||s en formato IEEE P1363).
    const signature = Buffer.from(parts[2], 'base64url');
    const ok = createVerify('SHA256')
      .update(`${parts[0]}.${parts[1]}`)
      .verify({ key: chain[0].publicKey, dsaEncoding: 'ieee-p1363' }, signature);
    if (!ok) throw new AppleJwsError('Firma del JWS no válida.');

    // 3. Bundle id: obligatorio cuando está configurado (nunca se confía en el cliente sin él).
    if (bundleId && (payload.transactionId || payload.bundleId) && payload.bundleId !== bundleId) {
      throw new AppleJwsError(`Bundle id no válido: ${payload.bundleId}.`);
    }
    return payload;
  }

  /** Transacción de StoreKit 2 → forma plana que usa store-sync. */
  function transactionFromPayload(t) {
    return {
      provider: 'apple',
      transactionId: t.transactionId,
      originalTransactionId: t.originalTransactionId ?? t.transactionId,
      bundleId: t.bundleId,
      productId: t.productId,
      environment: typeof t.environment === 'string' ? t.environment.toLowerCase() : null,
      expiresAt: ms(t.expiresDate),
      purchasedAt: ms(t.purchaseDate),
      revokedAt: ms(t.revocationDate),
      subscriptionGroup: t.subscriptionGroupIdentifier,
      payload: t,
    };
  }

  /** Notificación de servidor v2 → acciones de negocio equivalentes. */
  function notificationFromPayload(n) {
    if (bundleId && n?.data?.bundleId && n.data.bundleId !== bundleId) throw new AppleJwsError('Bundle id no válido.');
    const renewal = n?.data?.signedRenewalInfo ? verifyGws(n.data.signedRenewalInfo) : null;
    const transaction = n?.data?.signedTransactionInfo ? transactionFromPayload(verifyGws(n.data.signedTransactionInfo)) : null;
    return {
      notificationUUID: n?.notificationUUID ?? null,
      type: n?.notificationType ?? null,
      subtype: n?.subtype ?? null,
      environment: n?.data?.environment ?? n?.summary?.environment ?? transaction?.environment ?? null,
      transaction,
      status: n?.data?.status,
      renewal,
      signedDate: n?.signedDate,
    };
  }

  return { verify: verifyGws, transactionFromPayload, notificationFromPayload };
}
