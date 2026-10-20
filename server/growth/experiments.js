// Experimentos A/B: atribución estable por hash, estadísticas (z de dos proporciones) y promoción del ganador.
import { createHash } from 'node:crypto';
import { HttpError } from '../routes/util.js';

const KINDS = ['quiz', 'price', 'page', 'email'];
const VARIANT_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const STATUSES = ['draft', 'running', 'stopped', 'won'];
const KEY_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
export const DEFAULT_MIN_SAMPLE = 100;

/** Función de error complementaria (Numerical Recipes, error relativo < 1.2e-7). */
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418
    + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}

/** Prueba z de dos proporciones (dos colas, varianza combinada). */
export function zTest(c1, n1, c2, n2) {
  if (!n1 || !n2) return { z: 0, p_value: 1 };
  const p1 = c1 / n1; const p2 = c2 / n2;
  const pool = (c1 + c2) / (n1 + n2);
  const se = Math.sqrt(pool * (1 - pool) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, p_value: 1 };
  const z = (p2 - p1) / se;
  return { z, p_value: Math.min(1, erfc(Math.abs(z) / Math.SQRT2)) };
}

/** Variante determinista: hash(experimento, visitante) → [0,1) → intervalos proporcionales a los pesos. */
export function pickVariant(experimentKey, visitorId, variants) {
  const total = variants.reduce((s, v) => s + (Number(v.weight) > 0 ? Number(v.weight) : 0), 0);
  if (!variants.length || total <= 0) return null;
  const h = createHash('sha256').update(`${experimentKey}:${visitorId}`).digest();
  let r = (h.readUInt32BE(0) / 2 ** 32) * total;
  for (const v of variants) {
    const w = Number(v.weight) > 0 ? Number(v.weight) : 0;
    if (r < w) return v.key;
    r -= w;
  }
  return variants[variants.length - 1].key;
}

export function createExperiments({ db, log = console, settings = null }) {
  const invalid = (msg, field) => new HttpError(422, msg, 'INVALID', { field });

  async function get(key) {
    return db.service.one('select * from growth.experiments where key = $1', [key]);
  }

  async function list() {
    return db.service.rows(`
      select e.*, (select count(*)::int from growth.experiment_assignments a where a.experiment_key = e.key) as visitors
      from growth.experiments e order by e.created_at desc`);
  }

  async function create({ key, name, kind, variants, goal_event = 'purchase', status = 'running' }) {
    if (!KEY_RE.test(String(key ?? ''))) throw invalid('Clave no válida (minúsculas, números, - y _).', 'key');
    if (!String(name ?? '').trim()) throw invalid('Indica un nombre.', 'name');
    if (!KINDS.includes(kind)) throw invalid('Tipo no válido.', 'kind');
    if (!STATUSES.includes(status)) throw invalid('Estado no válido.', 'status');
    if (!Array.isArray(variants) || variants.length < 2) throw invalid('Se necesitan al menos 2 variantes.', 'variants');
    const seen = new Set();
    const clean = variants.map((v) => {
      const k = String(v?.key ?? '');
      const weight = v?.weight == null ? 50 : Number(v.weight);
      if (!VARIANT_RE.test(k) || seen.has(k)) throw invalid('Variantes no válidas o repetidas.', 'variants');
      if (!(weight > 0)) throw invalid('El peso debe ser mayor que 0.', 'variants');
      seen.add(k);
      return { key: k, weight };
    });
    if (await get(key)) throw new HttpError(409, 'Ya existe un experimento con esa clave.', 'EXISTS');
    await db.service.exec(`insert into growth.experiments (key, name, kind, variants, goal_event, status) values ($1, $2, $3, $4::jsonb, $5, $6)`,
      [key, String(name).trim(), kind, JSON.stringify(clean), String(goal_event || 'purchase'), status]);
    return get(key);
  }

  /** Experimentos en marcha para el navegador (sin datos internos). */
  async function publicConfig() {
    const rows = await db.service.rows(`select key, kind, variants from growth.experiments where status = 'running' order by created_at`);
    return rows.map((r) => ({ key: r.key, kind: r.kind, variants: r.variants.map((v) => ({ key: v.key, weight: v.weight })) }));
  }

  async function assign(visitorId, key) {
    if (!visitorId) return null;
    const prev = await db.service.one('select variant from growth.experiment_assignments where visitor_id = $1 and experiment_key = $2', [visitorId, key]);
    if (prev) return prev.variant;
    const exp = await get(key);
    if (!exp || exp.status !== 'running') return null;
    const variant = pickVariant(key, visitorId, exp.variants);
    if (!variant) return null;
    await db.service.exec(`insert into growth.experiment_assignments (visitor_id, experiment_key, variant) values ($1, $2, $3) on conflict do nothing`,
      [visitorId, key, variant]);
    return (await db.service.one('select variant from growth.experiment_assignments where visitor_id = $1 and experiment_key = $2', [visitorId, key])).variant;
  }

  /** {experimento: variante} de lo ya asignado al visitante en experimentos en marcha. */
  async function activeFor(visitorId) {
    if (!visitorId) return {};
    const rows = await db.service.rows(`
      select a.experiment_key, a.variant from growth.experiment_assignments a
      join growth.experiments e on e.key = a.experiment_key
      where a.visitor_id = $1 and e.status = 'running'`, [visitorId]);
    return Object.fromEntries(rows.map((r) => [r.experiment_key, r.variant]));
  }

  async function minSample() {
    try {
      const n = Number((await settings?.get('goals'))?.min_sample);
      return n > 0 ? n : DEFAULT_MIN_SAMPLE;
    } catch { return DEFAULT_MIN_SAMPLE; }
  }

  async function stats(key) {
    const exp = await get(key);
    if (!exp) throw new HttpError(404, 'No existe ese experimento.', 'NOT_FOUND');
    const rows = await db.service.rows(`
      select a.variant, count(*)::int as visitors,
        count(*) filter (where exists (
          select 1 from growth.events ev where ev.visitor_id = a.visitor_id and ev.name = $2 and ev.occurred_at >= a.assigned_at
        ))::int as conversions
      from growth.experiment_assignments a where a.experiment_key = $1 group by a.variant`, [key, exp.goal_event]);
    const by = new Map(rows.map((r) => [r.variant, r]));
    const min = await minSample();
    const variants = exp.variants.map((v) => {
      const r = by.get(v.key);
      const visitors = r?.visitors ?? 0; const conversions = r?.conversions ?? 0;
      return { variant: v.key, weight: v.weight, visitors, conversions, rate: visitors ? conversions / visitors : 0 };
    });
    const control = variants[0];
    for (const v of variants.slice(1)) {
      const t = zTest(control.conversions, control.visitors, v.conversions, v.visitors);
      v.p_value = t.p_value; v.z = t.z;
      v.lift = control.rate > 0 ? v.rate / control.rate - 1 : null;
      v.significant = t.p_value < 0.05 && control.visitors >= min && v.visitors >= min;
    }
    // Comparación principal: la variante con mejor tasa frente al control (o, si lidera el control, frente a la segunda).
    const ranked = [...variants].sort((a, b) => b.rate - a.rate);
    const leader = ranked[0];
    const rival = leader === control ? ranked[1] : control;
    let p_value = 1; let significant = false;
    if (leader && rival) {
      p_value = zTest(rival.conversions, rival.visitors, leader.conversions, leader.visitors).p_value;
      significant = p_value < 0.05 && leader.visitors >= min && rival.visitors >= min && leader.rate > rival.rate;
    }
    return {
      experiment: { key: exp.key, name: exp.name, kind: exp.kind, goal_event: exp.goal_event, status: exp.status, winner: exp.winner },
      variants, leader: leader?.variant ?? null, p_value, significant, min_sample: min,
    };
  }

  async function setStatus(key, status) {
    if (!STATUSES.includes(status)) throw invalid('Estado no válido.', 'status');
    if (!(await get(key))) throw new HttpError(404, 'No existe ese experimento.', 'NOT_FOUND');
    await db.service.exec(
      `update growth.experiments set status = $2, ended_at = case when $2 in ('stopped', 'won') then coalesce(ended_at, now()) else null end where key = $1`,
      [key, status]);
    return get(key);
  }

  async function promote(key, variant) {
    const exp = await get(key);
    if (!exp) throw new HttpError(404, 'No existe ese experimento.', 'NOT_FOUND');
    if (!exp.variants.some((v) => v.key === variant)) throw invalid('Esa variante no existe en el experimento.', 'variant');
    await db.service.exec(`update growth.experiments set status = 'won', winner = $2, ended_at = now() where key = $1`, [key, variant]);
    log.info?.('growth.experiment.promoted', key, variant);
    return get(key);
  }

  return { list, get, create, publicConfig, assign, activeFor, stats, setStatus, promote };
}
