// Personas: búsqueda por e-mail, línea de tiempo, exportación y supresión (RGPD).
import { HttpError, UUID_RE } from '../routes/util.js';

const CIO_HOST = { eu: 'https://track-eu.customer.io', us: 'https://track.customer.io' };

export function createPeople({ db, tracker, auth, log = console, settings = null, config = null, fetchImpl = globalThis.fetch }) {
  /** Resuelve una clave (lead_id o user_id) a todos los identificadores de la misma persona. */
  async function resolve(key) {
    if (!UUID_RE.test(String(key ?? ''))) return null;
    const leads = await db.service.rows(`
      select l.lead_id, l.visitor_id, l.user_id from growth.leads l
      where l.lead_id = $1 or l.user_id = $1
         or l.user_id = (select user_id from growth.leads where lead_id = $1)`, [key]);
    const userId = leads.find((l) => l.user_id)?.user_id
      ?? (await db.service.one('select id from auth.users where id = $1', [key]))?.id
      ?? (await db.service.one('select user_id as id from growth.orders where user_id = $1 limit 1', [key]))?.id
      ?? null;
    if (!leads.length && !userId) return null;
    const visitors = new Set(leads.map((l) => l.visitor_id).filter(Boolean));
    if (userId) {
      const vs = await db.service.rows(`
        select visitor_id from growth.checkouts where user_id = $1 and visitor_id is not null
        union select visitor_id from growth.orders where user_id = $1 and visitor_id is not null
        union select visitor_id from growth.events where user_id = $1 and visitor_id is not null`, [userId]);
      for (const v of vs) visitors.add(v.visitor_id);
    }
    const leadIds = leads.map((l) => l.lead_id);
    const email = (leadIds.length
      ? (await db.service.one('select email from growth_pii.lead_pii where lead_id = any($1::uuid[]) limit 1', [leadIds]))?.email
      : null)
      ?? (userId ? (await db.service.one('select email from auth.users where id = $1', [userId]))?.email : null) ?? null;
    return { key, leadIds, userId, visitorIds: [...visitors], email, leads };
  }

  async function search(q) {
    const term = String(q ?? '').trim().toLowerCase();
    if (term.length < 2) return [];
    const like = `%${term.replace(/[\\%_]/g, '\\$&')}%`;
    const leadRows = await db.service.rows(`
      select l.lead_id, l.user_id, p.email, l.topic, l.language, l.created_at
      from growth.leads l join growth_pii.lead_pii p on p.lead_id = l.lead_id
      where lower(p.email) like $1 order by l.created_at desc limit 50`, [like]);
    const userRows = await db.service.rows(`
      select u.id as user_id, u.email, u.created_at from auth.users u
      where lower(u.email) like $1 order by u.created_at desc limit 50`, [like]);
    const byUser = new Map();
    const rows = leadRows.map((r) => ({ key: r.lead_id, lead_id: r.lead_id, user_id: r.user_id, email: r.email, topic: r.topic, language: r.language, created_at: r.created_at }));
    for (const r of rows) if (r.user_id) byUser.set(r.user_id, r);
    for (const u of userRows) {
      if (byUser.has(u.user_id)) continue;
      rows.push({ key: u.user_id, lead_id: null, user_id: u.user_id, email: u.email, topic: null, language: null, created_at: u.created_at });
    }
    const ids = rows.flatMap((r) => [r.user_id, r.lead_id]).filter(Boolean);
    const paid = ids.length
      ? await db.service.rows('select distinct user_id, lead_id from growth.orders where user_id = any($1::uuid[]) or lead_id = any($1::uuid[])', [ids])
      : [];
    const buyers = new Set(paid.flatMap((p) => [p.user_id, p.lead_id]).filter(Boolean));
    return rows.slice(0, 50).map((r) => ({
      ...r,
      status: buyers.has(r.user_id) || buyers.has(r.lead_id) ? 'customer' : r.user_id ? 'user' : 'lead',
    }));
  }

  async function collect(id) {
    const { leadIds, userId, visitorIds } = id;
    const L = leadIds; const V = visitorIds; const U = userId ? [userId] : [];
    const events = await db.service.rows(`
      select * from growth.events where lead_id = any($1::uuid[]) or user_id = any($2::uuid[]) or visitor_id = any($3::uuid[])
      order by occurred_at limit 2000`, [L, U, V]);
    const answers = await db.service.rows(`
      select * from growth.quiz_answers where lead_id = any($1::uuid[]) or visitor_id = any($2::uuid[]) order by answered_at`, [L, V]);
    const emails = await db.service.rows(`
      select * from growth.email_events where lead_id = any($1::uuid[]) or user_id = any($2::uuid[]) order by occurred_at`, [L, U]);
    const orders = await db.service.rows(`
      select * from growth.orders where lead_id = any($1::uuid[]) or user_id = any($2::uuid[]) order by paid_at`, [L, U]);
    const refunds = await db.service.rows(`
      select * from growth.refunds where user_id = any($1::uuid[]) or order_id = any($2::text[]) order by refunded_at`, [U, orders.map((o) => o.order_id)]);
    const consents = await db.service.rows(`
      select * from growth.consents where lead_id = any($1::uuid[]) or user_id = any($2::uuid[]) or visitor_id = any($3::uuid[]) order by created_at`, [L, U, V]);
    const subscriptions = await db.service.rows('select * from growth.subscriptions where user_id = any($1::uuid[]) order by started_at', [U]);
    return { events, answers, emails, orders, refunds, consents, subscriptions };
  }

  async function timeline(key) {
    const id = await resolve(key);
    if (!id) return null;
    return {
      person: { key, email: id.email, lead_ids: id.leadIds, user_id: id.userId, visitor_ids: id.visitorIds },
      ...(await collect(id)),
    };
  }

  /** Copia completa de los datos del titular (derecho de acceso/portabilidad). */
  async function exportData(key) {
    const t = await timeline(key);
    if (!t) return null;
    const id = await resolve(key);
    const leads = await db.service.rows('select * from growth.leads where lead_id = any($1::uuid[])', [id.leadIds]);
    const visitors = await db.service.rows('select * from growth.visitors where visitor_id = any($1::uuid[])', [id.visitorIds]);
    const checkouts = id.userId || id.leadIds.length
      ? await db.service.rows('select * from growth.checkouts where user_id = $1 or lead_id = any($2::uuid[])', [id.userId, id.leadIds]) : [];
    return { exported_at: new Date().toISOString(), ...t, leads, visitors, checkouts };
  }

  /** Borra a la persona en Customer.io (mejor esfuerzo: nunca bloquea la supresión local). */
  async function eraseCustomerio(ids) {
    try {
      const cio = (settings ? await settings.get('customerio') : null) ?? {};
      const siteId = cio.siteId || config?.growth?.customerio?.siteId;
      const apiKey = cio.apiKey || config?.growth?.customerio?.apiKey;
      if (!siteId || !apiKey || typeof fetchImpl !== 'function') return { skipped: true };
      const region = cio.region || config?.growth?.customerio?.region || 'eu';
      const host = CIO_HOST[region] ?? CIO_HOST.eu;
      const authz = `Basic ${Buffer.from(`${siteId}:${apiKey}`).toString('base64')}`;
      let failed = 0;
      for (const id of ids) {
        const r = await fetchImpl(`${host}/api/v1/customers/${encodeURIComponent(id)}`, {
          method: 'DELETE', headers: { Authorization: authz }, signal: AbortSignal.timeout(8000),
        }).catch(() => null);
        if (!r || !(r.ok || r.status === 404)) failed++;
      }
      return { failed };
    } catch (err) {
      log.warn?.('growth.people.customerio_erase_failed', err?.message);
      return { error: true };
    }
  }

  async function erase(key, actor = null) {
    const id = await resolve(key);
    if (!id) throw new HttpError(404, 'No existe esa persona.', 'NOT_FOUND');
    const cioIds = [...new Set([id.userId, ...id.leadIds].filter(Boolean))];
    const counts = { leads: id.leadIds.length, visitors: id.visitorIds.length, user: !!id.userId };
    const calls = id.leads.map((l) => [l.lead_id, id.userId, l.visitor_id]);
    const used = new Set(id.leads.map((l) => l.visitor_id).filter(Boolean));
    for (const v of id.visitorIds) if (!used.has(v)) calls.push([null, id.userId, v]);
    if (!calls.length) calls.push([null, id.userId, null]);
    for (const [lead, user, visitor] of calls) {
      await db.service.exec('select growth.erase_person($1::uuid, $2::uuid, $3::uuid)', [lead, user, visitor]);
    }
    const cio = await eraseCustomerio(cioIds);
    await db.service.exec(`insert into growth.audit_log (actor, action, entity, entity_id, details) values ($1, 'person.erase', 'person', $2, $3::jsonb)`,
      [actor, key, JSON.stringify({ ...counts, customerio: cio })]);
    return { ok: true };
  }

  return { search, timeline, export: exportData, exportData, erase };
}
