// ProgramEntitlementService: Servicio centralizado y unificado de verificación de acceso
// por programa y usuario.
// Ningún acceso se concede por flags del frontend ni por campos booleanos globales sin comprobación en el backend.

export const ACCESS_STATUSES = ['active', 'trialing', 'past_due'];

export function createProgramEntitlementService({ db, billing }) {
  /**
   * Consulta el derecho de acceso de un usuario a un programa determinado.
   * @param {string} userId UUID del usuario
   * @param {string} programSlug Identificador del programa (ej. 'sem-fumo', 'alcohol')
   * @returns {Promise<{
   *   has_access: boolean,
   *   access_status: string,
   *   billing_provider: string|null,
   *   current_period_end: string|null,
   *   cancel_at_period_end: boolean
   * }>}
   */
  async function getEntitlement(userId, programSlug) {
    if (!userId || !programSlug) {
      return {
        has_access: false,
        access_status: 'none',
        billing_provider: null,
        current_period_end: null,
        cancel_at_period_end: false,
      };
    }

    // 1. Acceso por cortesía administrativa vigente
    const grant = await db.service.one(`
      select * from public.access_grants
      where user_id = $1 and program_slug = $2 and revoked_at is null
        and (expires_at is null or expires_at > now())
      order by created_at desc limit 1`, [userId, programSlug]);

    if (grant) {
      return {
        has_access: true,
        access_status: 'active',
        billing_provider: 'courtesy',
        current_period_end: grant.expires_at ? new Date(grant.expires_at).toISOString() : null,
        cancel_at_period_end: false,
      };
    }

    // 2. Suscripción viva (Stripe, StoreKit Apple, Google Play, RevenueCat)
    const activeSub = await billing.activeSubscription(userId, programSlug);
    if (activeSub) {
      return {
        has_access: true,
        access_status: activeSub.cancel_at_period_end ? 'canceled_but_active' : activeSub.status,
        billing_provider: activeSub.billing_provider || 'stripe',
        current_period_end: activeSub.current_period_end ? new Date(activeSub.current_period_end).toISOString() : null,
        cancel_at_period_end: Boolean(activeSub.cancel_at_period_end),
      };
    }

    // 3. Revisar si tuvo suscripción previa expirada o cancelada
    const latest = await db.service.one(`
      select * from public.subscriptions
      where user_id = $1 and program_slug = $2
      order by updated_at desc limit 1`, [userId, programSlug]);

    if (latest) {
      return {
        has_access: false,
        access_status: latest.status === 'canceled' ? 'expired' : latest.status,
        billing_provider: latest.billing_provider || 'stripe',
        current_period_end: latest.current_period_end ? new Date(latest.current_period_end).toISOString() : null,
        cancel_at_period_end: Boolean(latest.cancel_at_period_end),
      };
    }

    return {
      has_access: false,
      access_status: 'none',
      billing_provider: null,
      current_period_end: null,
      cancel_at_period_end: false,
    };
  }

  return { getEntitlement };
}
