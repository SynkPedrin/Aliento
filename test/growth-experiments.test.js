// Experimentos A/B contra el Supabase local.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createExperiments, zTest, pickVariant } from '../server/growth/experiments.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const silent = { log() {}, info() {}, warn() {}, error() {} };
let db, ex;
const tag = randomUUID().slice(0, 8);
const keys = []; const visitors = [];
const k = (n) => { const key = `gx-${n}-${tag}`; keys.push(key); return key; };

before(async () => {
  const config = loadConfig({ APP_URL: 'http://localhost', ...localSupabaseEnv() });
  db = createDb(config.supabase.dbUrl, { max: 3 });
  ex = createExperiments({ db, log: silent });
});

after(async () => {
  await db.service.exec('delete from growth.experiments where key = any($1::text[])', [keys]);
  for (const v of visitors) await db.service.exec('select growth.erase_person(null, null, $1::uuid)', [v]);
  await db.end();
});

test('zTest: valores conocidos', () => {
  assert.ok(Math.abs(zTest(50, 1000, 50, 1000).p_value - 1) < 1e-9);
  // 100/1000 vs 140/1000: z ~ 2.67, p ~ 0.0076
  const t = zTest(100, 1000, 140, 1000);
  assert.ok(Math.abs(t.z - 2.7) < 0.1 && t.p_value > 0.005 && t.p_value < 0.01, JSON.stringify(t));
  assert.equal(zTest(0, 0, 0, 0).p_value, 1);
  assert.equal(zTest(0, 100, 0, 100).p_value, 1);
});

test('create valida y publicConfig solo expone los en marcha', async () => {
  const key = k('cfg'); const draft = k('draft');
  await assert.rejects(ex.create({ key: 'X', name: 'n', kind: 'quiz', variants: [] }), (e) => e.status === 422);
  await assert.rejects(ex.create({ key, name: 'n', kind: 'quiz', variants: [{ key: 'a' }] }), (e) => e.status === 422);
  await assert.rejects(ex.create({ key, name: 'n', kind: 'otro', variants: [{ key: 'a' }, { key: 'b' }] }), (e) => e.status === 422);
  await ex.create({ key, name: 'Prueba', kind: 'page', variants: [{ key: 'a', weight: 50 }, { key: 'b', weight: 50 }] });
  await ex.create({ key: draft, name: 'Borrador', kind: 'page', status: 'draft', variants: [{ key: 'a' }, { key: 'b' }] });
  await assert.rejects(ex.create({ key, name: 'n', kind: 'page', variants: [{ key: 'a' }, { key: 'b' }] }), (e) => e.status === 409);
  const cfg = await ex.publicConfig();
  assert.ok(cfg.find((c) => c.key === key));
  assert.ok(!cfg.find((c) => c.key === draft));
  assert.deepEqual(Object.keys(cfg.find((c) => c.key === key)).sort(), ['key', 'kind', 'variants']);
  assert.ok((await ex.list()).some((e) => e.key === key));
  assert.equal(await ex.assign(randomUUID(), draft), null, 'borrador no asigna');
});

test('assign: estable por visitante y proporcional a los pesos', async () => {
  const key = k('w');
  await ex.create({ key, name: 'Pesos', kind: 'quiz', variants: [{ key: 'a', weight: 70 }, { key: 'b', weight: 30 }] });
  const count = { a: 0, b: 0 };
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const v = randomUUID();
    const first = await ex.assign(v, key);
    if (i < 50) assert.equal(await ex.assign(v, key), first, 'estable');
    count[first]++;
  }
  const share = count.a / N;
  assert.ok(share > 0.65 && share < 0.75, `a=${share}`);
  assert.equal(count.a + count.b, N);
  // hash puro determinista aunque no haya fila guardada
  const v = randomUUID();
  const vars = [{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }];
  assert.equal(pickVariant(key, v, vars), pickVariant(key, v, vars));
  const stored = Number((await db.service.one('select count(*) n from growth.experiment_assignments where experiment_key = $1', [key])).n);
  assert.equal(stored, N);
  // activeFor
  const vid = randomUUID();
  const var1 = await ex.assign(vid, key);
  assert.deepEqual(await ex.activeFor(vid), { [key]: var1 });
  assert.deepEqual(await ex.activeFor(randomUUID()), {});
});

async function seedConversions(key, goal, variant, total, converted) {
  for (let i = 0; i < total; i++) {
    const v = randomUUID(); visitors.push(v);
    await db.service.exec(`insert into growth.experiment_assignments (visitor_id, experiment_key, variant, assigned_at) values ($1, $2, $3, now() - interval '1 hour')`, [v, key, variant]);
    if (i < converted) await db.service.exec(`insert into growth.events (event_id, name, visitor_id) values ($1, $2, $3)`, [randomUUID(), goal, v]);
  }
}

test('stats: z de dos proporciones, significant a 95% y muestra mínima', async () => {
  const key = k('st'); const goal = `goal_${tag}`;
  await ex.create({ key, name: 'Stats', kind: 'price', goal_event: goal, variants: [{ key: 'a' }, { key: 'b' }] });
  await seedConversions(key, goal, 'a', 200, 30);
  await seedConversions(key, goal, 'b', 200, 60);
  // un evento anterior a la atribución no cuenta
  const late = randomUUID(); visitors.push(late);
  await db.service.exec(`insert into growth.events (event_id, name, visitor_id, occurred_at) values ($1, $2, $3, now() - interval '5 days')`, [randomUUID(), goal, late]);
  await db.service.exec(`insert into growth.experiment_assignments (visitor_id, experiment_key, variant) values ($1, $2, 'a')`, [late, key]);

  const s = await ex.stats(key);
  const a = s.variants.find((v) => v.variant === 'a'); const b = s.variants.find((v) => v.variant === 'b');
  assert.equal(a.visitors, 201); assert.equal(a.conversions, 30);
  assert.equal(b.visitors, 200); assert.equal(b.conversions, 60);
  assert.ok(Math.abs(b.rate - 0.3) < 1e-9);
  assert.equal(s.leader, 'b');
  assert.ok(s.p_value < 0.01);
  assert.equal(s.significant, true);
  assert.equal(s.min_sample, 100);
  assert.equal(b.significant, true);

  // misma diferencia con muestra pequeña: no es significativo (por p y por mínimo)
  const small = k('sm');
  await ex.create({ key: small, name: 'Small', kind: 'price', goal_event: goal, variants: [{ key: 'a' }, { key: 'b' }] });
  await seedConversions(small, goal, 'a', 20, 3);
  await seedConversions(small, goal, 'b', 20, 8);
  const s2 = await ex.stats(small);
  assert.equal(s2.significant, false);

  // sin diferencia real con muestra grande
  const flat = k('fl');
  await ex.create({ key: flat, name: 'Flat', kind: 'price', goal_event: goal, variants: [{ key: 'a' }, { key: 'b' }] });
  await seedConversions(flat, goal, 'a', 150, 30);
  await seedConversions(flat, goal, 'b', 150, 31);
  const s3 = await ex.stats(flat);
  assert.equal(s3.significant, false);
  assert.ok(s3.p_value > 0.05);
  await assert.rejects(ex.stats(`nope-${tag}`), (e) => e.status === 404);
});

test('setStatus y promote marcan el ganador', async () => {
  const key = k('pr');
  await ex.create({ key, name: 'Promo', kind: 'email', variants: [{ key: 'a' }, { key: 'b' }] });
  const stopped = await ex.setStatus(key, 'stopped');
  assert.equal(stopped.status, 'stopped'); assert.ok(stopped.ended_at);
  assert.equal((await ex.setStatus(key, 'running')).ended_at, null);
  await assert.rejects(ex.setStatus(key, 'raro'), (e) => e.status === 422);
  await assert.rejects(ex.promote(key, 'zzz'), (e) => e.status === 422);
  const won = await ex.promote(key, 'b');
  assert.equal(won.status, 'won'); assert.equal(won.winner, 'b'); assert.ok(won.ended_at);
  assert.ok(!(await ex.publicConfig()).some((c) => c.key === key));
  // una vez ganado ya no asigna a nuevos visitantes
  assert.equal(await ex.assign(randomUUID(), key), null);
});
