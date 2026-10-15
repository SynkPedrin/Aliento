// Catálogo de programas y control de acceso por programa (ProgramEntitlementService).
import { HttpError } from './routes/util.js';
// El catálogo vive en public.journey_programs; el acceso, en subscriptions + access_grants.

const ACCESS_STATUSES = ['active', 'trialing', 'past_due'];

export function createPrograms({ db, billing }) {
  /** Catálogo público (sin datos de usuario): solo lo comercial y editorial. */
  async function publicCatalog() {
    const rows = await db.service.rows(`
      select slug, name, tagline, description, color, icon, position, theme, commercial_status
      from public.journey_programs where commercial_status <> 'archived' order by position`);
    return rows.map(publicView);
  }

  function publicView(p) {
    return {
      slug: p.slug, name: p.name ?? p.title, tagline: p.tagline, description: p.description,
      color: p.color, icon: p.icon, position: p.position, theme: p.theme,
      purchasable: p.commercial_status === 'active',
      comingSoon: p.commercial_status !== 'active',
    };
  }

  async function get(slug) {
    const p = await db.service.one('select * from public.journey_programs where slug = $1', [slug]);
    return p ?? null;
  }

  /** ¿Se puede vender ahora? Solo programas habilitados comercialmente. */
  async function assertPurchasable(slug) {
    const p = await get(slug);
    if (!p) throw new HttpError(404, 'Programa no encontrado.', 'PROGRAM_NOT_FOUND');
    if (p.commercial_status !== 'active') {
      throw new HttpError(409, 'Este programa todavía no está disponible.', 'PROGRAM_NOT_AVAILABLE');
    }
    return p;
  }

  /**
   * Catálogo con el estado de acceso del usuario:
   * active | locked | pending_payment | expired | canceled_but_active | coming_soon
   */
  async function catalogFor(userId) {
    const [programs, subs, grants, open, profile] = await Promise.all([
      db.service.rows(`select * from public.journey_programs where commercial_status <> 'archived' order by position`),
      db.service.rows('select * from public.subscriptions where user_id = $1', [userId]),
      db.service.rows(`select * from public.access_grants where user_id = $1 and revoked_at is null
        and (expires_at is null or expires_at > now())`, [userId]),
      db.service.rows(`select program_slug from public.checkout_sessions where user_id = $1 and status = 'open'`, [userId]),
      db.service.one('select last_program_slug from public.profiles where user_id = $1', [userId]),
    ]);
    const cards = programs.map((p) => {
      const sub = subs.filter((s) => s.program_slug === p.slug).sort((a, b) => b.updated_at - a.updated_at)[0];
      const grant = grants.find((g) => g.program_slug === p.slug);
      let state;
      if (sub && ACCESS_STATUSES.includes(sub.status)) {
        state = sub.cancel_at_period_end ? 'canceled_but_active' : 'active';
      } else if (grant) {
        state = 'active';
      } else if (sub) {
        state = 'expired';
      } else if (open.some((c) => c.program_slug === p.slug)) {
        state = 'pending_payment';
      } else if (p.commercial_status !== 'active') {
        state = 'coming_soon';
      } else {
        state = 'locked';
      }
      return {
        ...publicView(p), state,
        subscription: sub && {
          plan: sub.plan, status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodEnd: sub.current_period_end, amount: sub.amount, currency: sub.currency,
          interval: sub.interval, intervalCount: sub.interval_count,
        },
        courtesy: Boolean(grant) && !sub,
      };
    });
    return { programs: cards, lastProgram: profile?.last_program_slug ?? null };
  }

  /** Registra el último programa usado (para abrir directamente ahí la próxima vez). */
  async function setLastProgram(userId, slug) {
    await db.service.exec('update public.profiles set last_program_slug = $1 where user_id = $2', [slug, userId]);
  }

  /** Acceso efectivo del usuario a un programa (suscripción viva o cortesía). */
  async function hasAccess(userId, slug) {
    return Boolean(await billing.activeSubscription(userId, slug));
  }

  return { publicCatalog, catalogFor, get, assertPurchasable, setLastProgram, hasAccess };
}
