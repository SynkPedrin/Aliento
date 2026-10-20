// Companheiro de programa (alcohol, azúcar, ansiedad, sueño) contra el Supabase LOCAL real (RLS incluida).
// Requisito: `npx supabase start`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { createBilling } from '../server/billing.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { createNotifier } from '../server/services/notifications.js';
import { fakeStripe } from '../scripts/fake-stripe.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';
import { COMPANIONS } from '../server/content/companions/index.js';
import { QUIZ_VERSION } from '../server/quiz.js';
import { addDays, todayIn } from '../server/services/stats.js';

const silent = process.env.TEST_VERBOSE ? console : { log() {}, info() {}, warn() {}, error() {} };
const SLUGS = ['alcohol', 'azucar', 'ansiedad', 'sueno'];
const TZ = 'Europe/Madrid';

let server, base, db, auth;
const createdUsers = [];

before(async () => {
  const config = loadConfig({
    APP_URL: 'http://localhost', STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
    CRON_SECRET: 'cron-test', ...localSupabaseEnv(),
  });
  db = createDb(config.supabase.dbUrl, { max: 5 });
  auth = createAuth({ config, db });
  const billing = createBilling({ db, stripe: fakeStripe({ webhooks: new Stripe('sk_test_dummy').webhooks }), config, log: silent });
  const notifier = createNotifier({ db, config, log: silent, sender: async () => {} });
  const { createPrograms } = await import('../server/programs.js');
  server = createApp({ db, auth, billing, config, notifier, programs: createPrograms({ db, billing }), log: silent }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const id of createdUsers) await auth.deleteUser(id).catch(() => {});
  server.close();
  await db.end();
});

function client() {
  const jar = new Map();
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const v = pair.slice(i + 1);
      if (v) jar.set(pair.slice(0, i), v); else jar.delete(pair.slice(0, i));
    }
    const t = await res.text();
    let json; try { json = JSON.parse(t); } catch { json = t; }
    return { status: res.status, body: json };
  };
}

/** Usuario nuevo con cortesía (acceso) a los programas indicados. */
async function userWith(programs) {
  await db.service.exec('delete from public.rate_limits'); // los límites de intentos son reales (Postgres)
  const c = client();
  const mail = `comp-${randomUUID().slice(0, 8)}@example.com`;
  const r = await c('/api/auth/register', { method: 'POST', body: { name: 'Ana', email: mail, password: 'secreta123', acceptTerms: true, healthConsent: true, timezone: TZ } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const u = await db.service.one('select id from auth.users where email = $1', [mail]);
  createdUsers.push(u.id);
  for (const p of programs) await db.service.exec(`insert into public.access_grants (user_id, reason, program_slug) values ($1, 'test', $2)`, [u.id, p]);
  return { c, id: u.id };
}

const today = () => todayIn(TZ);
const P = (slug, path = '') => `/api/app/programs/${slug}${path}`;

const SETUP = {
  alcohol: { strategy: 'moderar', target: 2 },
  azucar: { strategy: 'equilibrio', target: 3 },
  ansiedad: { strategy: 'herramientas', target: 4 },
  sueno: { strategy: 'rutina', target: 7.5 },
};
const LOGS = {
  alcohol: { bebidas: 1.5, contexto: 'amigos', gatillo: 'social', ganas: 3 },
  azucar: { porciones: 2, tipo: 'cafe', hora: '16:30', gatillo: 'bajon', hambre: 2 },
  ansiedad: { nivel: 3, gatillo: 'trabajo', sintomas: ['tension'], tecnica: 'respiracion', despues: 2 },
  sueno: { acostarse: '23:30', despertar: '07:00', calidad: 4, despertares: 1, pantallas: 'menos-30', cafeina: 'manana' },
};
const BAD_LOGS = {
  alcohol: { bebidas: 99 },
  azucar: { porciones: 0 },
  ansiedad: { nivel: 11 },
  sueno: { acostarse: '23:30', despertar: '23:30', calidad: 3 },
};

async function configured(slug, extra = {}) {
  const u = await userWith([slug]);
  const r = await u.c(P(slug, '/setup'), { method: 'PUT', body: { ...SETUP[slug], startDate: today(), exercisePerWeek: 3, notifications: { enabled: false, time: '20:00' }, ...extra } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return u;
}

// ------------------------------------------------------------------ definiciones
test('definiciones: 8-12 semanas, 8-10 logros, formularios completos y textos de seguridad', () => {
  for (const [slug, d] of Object.entries(COMPANIONS)) {
    assert.equal(d.slug, slug);
    assert.ok(d.weeklyTasks.length >= 8 && d.weeklyTasks.length <= 12, `${slug} semanas`);
    assert.ok(d.achievements.length >= 8 && d.achievements.length <= 10, `${slug} logros`);
    assert.equal(new Set(d.achievements.map((a) => a.slug)).size, d.achievements.length);
    assert.ok(d.log.fields.some((f) => f.required));
    assert.ok(d.urge.feelings.length >= 4 && d.urge.techniques.length >= 4);
    assert.ok(d.safety.text.length > 50 && d.safety.resources.length >= 1);
    assert.equal(d.strategies.length, 3);
  }
  assert.match(COMPANIONS.ansiedad.safety.text, /024/);
  assert.match(COMPANIONS.ansiedad.safety.text, /112/);
  assert.match(COMPANIONS.alcohol.safety.text, /no pares de golpe/);
});

// ------------------------------------------------------------------ setup
for (const slug of SLUGS) {
  test(`${slug} · setup → plan + metas semanales, idempotente y editable`, async () => {
    const u = await userWith([slug]);
    const s0 = (await u.c(P(slug, '/setup'))).body;
    assert.equal(s0.completed, false);
    assert.equal(s0.strategies.length, 3);
    assert.ok(s0.form.fields.find((f) => f.id === 'strategy'));
    assert.equal((await u.c(P(slug, '/dashboard'))).body.code, 'ONBOARDING_REQUIRED');
    assert.equal((await u.c(P(slug, '/dashboard'))).status, 409);

    // Validación
    assert.equal((await u.c(P(slug, '/setup'), { method: 'PUT', body: { strategy: 'parar', startDate: today() } })).status, 422);
    assert.equal((await u.c(P(slug, '/setup'), { method: 'PUT', body: { ...SETUP[slug], startDate: addDays(today(), 90) } })).status, 422);
    assert.equal((await u.c(P(slug, '/setup'), { method: 'PUT', body: { ...SETUP[slug], startDate: today(), target: 'x' } })).status, 422);
    assert.equal((await u.c(P(slug, '/setup'), { method: 'PUT', body: { ...SETUP[slug], startDate: today(), notifications: { enabled: true, time: '25:00' } } })).status, 422);

    const body = { ...SETUP[slug], startDate: today(), exercisePerWeek: 4, notifications: { enabled: true, time: '21:15' } };
    const put = await u.c(P(slug, '/setup'), { method: 'PUT', body });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    assert.equal(put.body.completed, true);
    assert.equal(put.body.goal.strategy, SETUP[slug].strategy);
    assert.equal(put.body.goal.exercisePerWeek, 4);
    assert.deepEqual(put.body.notifications, { enabled: true, time: '21:15' });

    const count = async () => ({
      goals: (await db.service.one('select count(*)::int n from public.user_goals where user_id = $1 and program_slug = $2', [u.id, slug])).n,
      active: (await db.service.one('select count(*)::int n from public.user_goals where user_id = $1 and program_slug = $2 and superseded_at is null', [u.id, slug])).n,
      versions: (await db.service.one(`select count(*)::int n from public.plan_versions v join public.personalized_plans p on p.id = v.plan_id where p.user_id = $1 and p.program_slug = $2`, [u.id, slug])).n,
      tasks: (await db.service.one('select count(*)::int n from public.daily_goals where user_id = $1 and program_slug = $2', [u.id, slug])).n,
    });
    const first = await count();
    assert.deepEqual(first, { goals: 1, active: 1, versions: 1, tasks: COMPANIONS[slug].weeklyTasks.length });
    assert.ok((await db.service.one('select onboarded_at from public.profiles where user_id = $1', [u.id])).onboarded_at);

    // Idempotente: repetir no crea versiones ni metas duplicadas.
    assert.equal((await u.c(P(slug, '/setup'), { method: 'PUT', body })).status, 200);
    assert.deepEqual(await count(), first);
    const prefs = await db.service.one('select enabled, reminder_time from public.notification_preferences where user_id = $1 and program_slug = $2', [u.id, slug]);
    assert.equal(prefs.enabled, true);

    // Editar el objetivo crea versión nueva y conserva el historial.
    const other = COMPANIONS[slug].strategies[1].id;
    const upd = await u.c(P(slug, '/goals'), { method: 'PUT', body: { strategy: other } });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));
    assert.equal(upd.body.goal.strategy, other);
    assert.equal(upd.body.goal.exercisePerWeek, 4, 'lo no enviado se conserva');
    const goals = (await u.c(P(slug, '/goals'))).body;
    assert.equal(goals.goal.strategy, other);
    assert.equal(goals.history.length, 1);
    assert.equal(goals.tasks.length, COMPANIONS[slug].weeklyTasks.length);
    assert.deepEqual(await count(), { goals: 2, active: 1, versions: 2, tasks: first.tasks });

    // Metas semanales: marcar y desmarcar.
    const task = goals.tasks[0];
    assert.equal((await u.c(P(slug, `/tasks/${task.id}`), { method: 'PATCH', body: { done: true } })).body.done, true);
    assert.equal((await u.c(P(slug, '/goals'))).body.tasks[0].done, true);
    assert.equal((await u.c(P(slug, `/tasks/${task.id}`), { method: 'PATCH', body: { done: 'si' } })).status, 422);
    assert.equal((await u.c(P(slug, `/tasks/${randomUUID()}`), { method: 'PATCH', body: { done: true } })).status, 404);
  });
}

// ------------------------------------------------------------------ registro
for (const slug of SLUGS) {
  test(`${slug} · registro: validación, listado, edición y borrado`, async () => {
    const u = await configured(slug);
    const base = P(slug, '/log');
    assert.equal((await u.c(base, { method: 'POST', body: { value: { ...LOGS[slug], inventado: 1 } } })).status, 422, 'campo desconocido');
    assert.equal((await u.c(base, { method: 'POST', body: { value: BAD_LOGS[slug] } })).status, 422, 'fuera de rango o incoherente');
    assert.equal((await u.c(base, { method: 'POST', body: {} })).status, 422);
    assert.equal((await u.c(base, { method: 'POST', body: { value: LOGS[slug], at: new Date(Date.now() + 3600_000).toISOString() } })).status, 422, 'futuro');
    assert.equal((await u.c(base, { method: 'POST', body: { value: LOGS[slug], at: new Date(Date.now() - 500 * 86400_000).toISOString() } })).status, 422, '>400 días');
    const required = COMPANIONS[slug].log.fields.find((f) => f.required);
    const missing = { ...LOGS[slug] }; delete missing[required.id];
    const rMissing = await u.c(base, { method: 'POST', body: { value: missing } });
    assert.equal(rMissing.status, 422);
    assert.equal(rMissing.body.field, required.id);
    assert.equal((await u.c(base, { method: 'POST', body: { value: { ...LOGS[slug], nota: 'x'.repeat(2000) } } })).status, 422, 'texto largo');

    const ok = await u.c(base, { method: 'POST', body: { value: LOGS[slug] } });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    assert.ok(ok.body.entry.summary.length > 3);
    assert.ok(ok.body.achievements.some((a) => a.slug.endsWith('-primer-registro') || a.slug.endsWith('-primera-noche')));
    const id = ok.body.entry.id;

    const list = (await u.c(base)).body.entries;
    assert.equal(list.length, 1);
    assert.equal(list[0].id, id);
    assert.equal((await u.c(`${base}?limit=0`)).status, 422);

    const edited = { ...LOGS[slug], nota: 'editado' };
    const patch = await u.c(`${base}/${id}`, { method: 'PATCH', body: { value: edited } });
    assert.equal(patch.status, 200);
    assert.equal(patch.body.entry.value.nota, 'editado');
    assert.equal((await u.c(`${base}/${randomUUID()}`, { method: 'PATCH', body: { value: edited } })).status, 404);
    assert.equal((await u.c(`${base}/${id}`, { method: 'DELETE' })).status, 200);
    assert.equal((await u.c(`${base}/${id}`, { method: 'DELETE' })).status, 404);
    assert.equal((await u.c(base)).body.entries.length, 0);
  });
}

// ------------------------------------------------------------------ momento difícil
for (const slug of SLUGS) {
  test(`${slug} · momento difícil: crear, resolver y listar`, async () => {
    const u = await configured(slug);
    const def = COMPANIONS[slug];
    const base = P(slug, '/urge');
    const feeling = def.urge.feelings[0].id;
    assert.equal((await u.c(base, { method: 'POST', body: { feeling: 'nada', intensity: 3 } })).status, 422);
    assert.equal((await u.c(base, { method: 'POST', body: { feeling, intensity: def.urge.intensity.max + 1 } })).status, 422);
    const technique = def.urge.techniques[0].id;
    const created = await u.c(base, { method: 'POST', body: { feeling, intensity: def.urge.intensity.max, technique, note: 'ahora mismo' } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.urge.id;
    assert.equal((await u.c(`${base}/${id}`, { method: 'PATCH', body: { outcome: 'quizas' } })).status, 422);
    const res = await u.c(`${base}/${id}`, { method: 'PATCH', body: { outcome: 'resolved', afterIntensity: def.urge.intensity.min } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.achievements.length >= 1, 'primer momento superado concede logro');
    const list = (await u.c(base)).body.urges;
    assert.equal(list.length, 1);
    assert.equal(list[0].outcome, 'resolved');
    assert.equal(list[0].technique, technique);
    const dash = (await u.c(P(slug, '/dashboard'))).body;
    assert.equal(dash.todayStatus.urges, 1);
    assert.equal(dash.todayStatus.urgesResolved, 1);
    assert.equal((await u.c(`${base}/${randomUUID()}`, { method: 'PATCH', body: { outcome: 'resolved' } })).status, 404);
  });
}

// ------------------------------------------------------------------ check-in
test('check-in: idempotente, borrable, y coherente con los registros del día', async () => {
  const u = await configured('alcohol');
  const c1 = await u.c(P('alcohol', '/checkin'), { method: 'POST', body: {} });
  assert.equal(c1.status, 201);
  const c2 = await u.c(P('alcohol', '/checkin'), { method: 'POST', body: {} });
  assert.equal(c2.status, 200);
  assert.equal(c2.body.already, true);
  assert.equal((await db.service.one(`select count(*)::int n from public.program_activity_entries where user_id = $1 and kind = 'checkin'`, [u.id])).n, 1);
  let dash = (await u.c(P('alcohol', '/dashboard'))).body;
  assert.equal(dash.todayStatus.checkedIn, true);
  assert.equal(dash.todayStatus.value, 0);
  assert.equal(dash.todayStatus.status, 'ok');
  assert.equal(dash.streak.current, 1);

  // Registrar una bebida después contradice "hoy no bebí": el check-in se retira.
  assert.equal((await u.c(P('alcohol', '/log'), { method: 'POST', body: { value: { bebidas: 3 } } })).status, 201);
  dash = (await u.c(P('alcohol', '/dashboard'))).body;
  assert.equal(dash.todayStatus.checkedIn, false);
  assert.equal(dash.todayStatus.value, 3);
  assert.equal(dash.todayStatus.status, 'warn');
  // Y no se puede marcar un día sin beber si ya hay bebidas.
  const blocked = await u.c(P('alcohol', '/checkin'), { method: 'POST', body: {} });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, 'HAS_ENTRIES');

  // Día pasado, futuro y formato inválido.
  assert.equal((await u.c(P('alcohol', '/checkin'), { method: 'POST', body: { day: addDays(today(), -2) } })).status, 201);
  assert.equal((await u.c(P('alcohol', '/checkin'), { method: 'POST', body: { day: addDays(today(), 1) } })).status, 422);
  assert.equal((await u.c(P('alcohol', '/checkin'), { method: 'POST', body: { day: 'ayer' } })).status, 422);
  assert.equal((await u.c(P('alcohol', `/checkin/${addDays(today(), -2)}`), { method: 'DELETE' })).status, 200);
  assert.equal((await db.service.one(`select count(*)::int n from public.program_activity_entries where user_id = $1 and kind = 'checkin'`, [u.id])).n, 0);

  // Ansiedad y azúcar también aceptan check-in; sueño no cuenta como cumplido sin horas.
  const s = await configured('sueno');
  assert.equal((await s.c(P('sueno', '/checkin'), { method: 'POST', body: {} })).status, 201);
  const sd = (await s.c(P('sueno', '/dashboard'))).body;
  assert.equal(sd.todayStatus.checkedIn, true);
  assert.equal(sd.todayStatus.value, null);
  assert.equal(sd.todayStatus.status, 'none');
});

// ------------------------------------------------------------------ dashboard y progreso coherentes
test('alcohol · dashboard y progreso coherentes con lo registrado', async () => {
  const u = await configured('alcohol', { strategy: 'reducir', target: 1, start: 4 });
  const t = today();
  const at = (days, h = 12) => new Date(`${addDays(t, -days)}T${String(h).padStart(2, '0')}:00:00Z`).toISOString();
  for (const [d, n] of [[0, 1], [0, 1.5], [1, 2], [2, 0.5], [3, 3]]) {
    assert.equal((await u.c(P('alcohol', '/log'), { method: 'POST', body: { value: { bebidas: n, gatillo: 'estres' }, at: d === 0 ? undefined : at(d) } })).status, 201);
  }
  const dash = (await u.c(P('alcohol', '/dashboard'))).body;
  assert.equal(dash.program.slug, 'alcohol');
  assert.equal(dash.today, t);
  assert.equal(dash.dayNumber, 1);
  assert.equal(dash.week.length, 7);
  assert.equal(dash.week.at(-1).day, t);
  assert.equal(dash.todayStatus.value, 2.5);
  assert.equal(dash.todayStatus.target, 4, 'la reducción parte de 4 y baja poco a poco');
  assert.equal(dash.todayStatus.entries.length, 2);
  assert.equal(dash.week.at(-2).value, 2);
  assert.equal(dash.strategy.id, 'reducir');
  assert.equal(dash.logForm.fields[0].id, 'bebidas');
  assert.ok(dash.urgeForm.techniques.length >= 4);
  assert.ok(dash.checkinLabel);
  assert.equal(dash.tasks.length, 10);
  assert.equal(dash.safety.resources.length >= 1, true);
  assert.equal(dash.subscription.status, 'active');
  assert.equal(dash.recommendedExercise, 'calma-4-6');
  assert.ok(dash.totals.cards.every((c) => c.id && c.label && 'value' in c && typeof c.estimate === 'boolean'));
  assert.ok(!dash.totals.cards.some((c) => c.estimate), 'sin cuestionario no hay estimaciones inventadas');
  const bebidas = dash.totals.cards.find((c) => c.id === 'bebidas-periodo');
  assert.equal(bebidas.value, 2.5, 'el panel cuenta desde la fecha de inicio (hoy)');
  assert.equal(dash.achievements.total, 10);
  assert.ok(dash.achievements.unlocked >= 2);

  const prog = (await u.c(P('alcohol', '/progress?range=7'))).body;
  assert.equal(prog.series.length, 7);
  assert.equal(prog.series.at(-1).value, 2.5);
  assert.equal(prog.series.at(-4).value, 3);
  assert.equal(prog.series.at(-5).value, null);
  assert.equal(prog.totals.trackedDays, 4);
  assert.equal(prog.topTriggers[0].id, 'estres');
  assert.equal(prog.topTriggers[0].count, 5);
  assert.equal(prog.byWeekday.length, 7);
  assert.ok(prog.timeline.length >= 5);
  assert.ok(prog.insights.length >= 1 && prog.insights.every((i) => typeof i.text === 'string'));
  assert.equal((await u.c(P('alcohol', '/progress?range=30'))).body.series.length, 30);
  assert.equal((await u.c(P('alcohol', '/progress?range=365'))).body.series.length, 365);
  assert.equal((await u.c(P('alcohol', '/progress?range=5'))).status, 422);
  assert.equal(prog.goalHistory.length, 1);
});

test('azúcar, ansiedad y sueño · el valor del día sale del registro', async () => {
  const az = await configured('azucar');
  for (const n of [2, 3]) await az.c(P('azucar', '/log'), { method: 'POST', body: { value: { porciones: n } } });
  const d1 = (await az.c(P('azucar', '/dashboard'))).body;
  assert.equal(d1.todayStatus.value, 5);
  assert.equal(d1.todayStatus.status, 'warn');
  assert.equal(d1.weekMeta.direction, 'max');

  const an = await configured('ansiedad');
  for (const n of [6, 2]) await an.c(P('ansiedad', '/log'), { method: 'POST', body: { value: { nivel: n, tecnica: 'respiracion', despues: n - 1 } } });
  const d2 = (await an.c(P('ansiedad', '/dashboard'))).body;
  assert.equal(d2.todayStatus.value, 4, 'media del día');
  assert.equal(d2.todayStatus.status, 'ok');
  assert.match(d2.safety.text, /024/);
  assert.ok(d2.safety.resources.some((r) => r.tel === '024') && d2.safety.resources.some((r) => r.tel === '112'));

  const su = await configured('sueno');
  const night = await su.c(P('sueno', '/log'), { method: 'POST', body: { value: LOGS.sueno } });
  assert.equal(night.status, 201);
  assert.match(night.body.entry.summary, /7 h 30 min/);
  const d3 = (await su.c(P('sueno', '/dashboard'))).body;
  assert.equal(d3.todayStatus.value, 7.5);
  assert.equal(d3.todayStatus.status, 'ok');
  assert.equal(d3.weekMeta.direction, 'min');
  assert.equal(d3.weekMeta.format, 'hours');
  assert.equal(d3.program.theme, 'night');
  assert.equal(d3.recommendedExercise, 'sueno-4-7-8');
  assert.ok(d3.totals.cards.find((c) => c.id === 'deuda-sueno').estimate === true);
  // Pasarse de cama y quedarse corto cambia el estado.
  await su.c(P('sueno', '/log'), { method: 'POST', body: { value: { acostarse: '02:00', despertar: '07:00', calidad: 2 } } });
  assert.equal((await su.c(P('sueno', '/dashboard'))).body.todayStatus.value, 5, 'la última noche del día manda');
  assert.equal((await su.c(P('sueno', '/dashboard'))).body.todayStatus.status, 'warn');
});

test('estimaciones: con cuestionario se rotulan como estimación y salen del cuestionario', async () => {
  const u = await configured('alcohol', { strategy: 'moderar', target: 2 });
  // Cuestionario del programa (datos del usuario) → plan con estimaciones prudentes.
  const ses = await db.service.one(`insert into public.questionnaire_sessions (quiz_version, user_id, claimed_user_id, completed_at, current_step, program_slug)
    values ($2, $1, $1, now(), 'analisis', 'alcohol') returning id`, [u.id, QUIZ_VERSION]);
  const answers = { q_alc_frecuencia: 'semanal', q_alc_cantidad: '5-6', q_alc_gasto: 130 };
  for (const [k, v] of Object.entries(answers)) await db.service.exec('insert into public.questionnaire_answers (session_id, question_id, value) values ($1, $2, $3)', [ses.id, k, JSON.stringify(v)]);
  await db.service.exec(`insert into public.user_assessments (session_id, user_id, result, program_slug) values ($1, $2, '{}', 'alcohol')`, [ses.id, u.id]);
  assert.equal((await u.c(P('alcohol', '/setup'), { method: 'PUT', body: { strategy: 'moderar', target: 1, startDate: today() } })).status, 200);
  await u.c(P('alcohol', '/checkin'), { method: 'POST', body: {} });
  const cards = (await u.c(P('alcohol', '/dashboard'))).body.totals.cards;
  const avoided = cards.find((c) => c.id === 'bebidas-evitadas');
  assert.ok(avoided && avoided.estimate === true && /Estimación/.test(avoided.sub));
  assert.equal(avoided.value, 1.4, '2 días/sem × 5 bebidas = 10/sem = 1,43/día; hoy 0 bebidas → 1,4 evitadas');
  const money = cards.find((c) => c.id === 'dinero-ahorrado');
  assert.equal(money.estimate, true);
  assert.ok(money.value > 0 && money.unit);
  assert.equal(cards.find((c) => c.id === 'dias-sin-beber').estimate, false);
});

// ------------------------------------------------------------------ logros
test('logros: se conceden solos, una sola vez, por programa', async () => {
  const u = await userWith(['alcohol', 'azucar']);
  await u.c(P('alcohol', '/setup'), { method: 'PUT', body: { ...SETUP.alcohol, startDate: today() } });
  const before = (await u.c(P('alcohol', '/achievements'))).body.achievements;
  assert.equal(before.length, 10);
  assert.ok(before.find((a) => a.slug === 'alc-plan-listo').unlocked);
  assert.ok(!before.find((a) => a.slug === 'alc-primer-registro').unlocked);

  const r1 = await u.c(P('alcohol', '/log'), { method: 'POST', body: { value: { bebidas: 1 } } });
  assert.ok(r1.body.achievements.some((a) => a.slug === 'alc-primer-registro'));
  const r2 = await u.c(P('alcohol', '/log'), { method: 'POST', body: { value: { bebidas: 1 } } });
  assert.ok(!r2.body.achievements.some((a) => a.slug === 'alc-primer-registro'), 'no se vuelve a conceder');
  await u.c(P('alcohol', '/achievements'));
  await u.c(P('alcohol', '/achievements'));
  const rows = await db.service.rows(`select achievement_slug from public.user_achievements where user_id = $1 and achievement_slug like 'alc-%'`, [u.id]);
  assert.equal(new Set(rows.map((x) => x.achievement_slug)).size, rows.length);

  // Aislamiento entre programas: lo de alcohol no desbloquea nada en azúcar.
  await u.c(P('azucar', '/setup'), { method: 'PUT', body: { ...SETUP.azucar, startDate: today() } });
  const az = (await u.c(P('azucar', '/achievements'))).body.achievements;
  assert.ok(az.every((a) => a.slug.startsWith('azu-')));
  assert.ok(!az.find((a) => a.slug === 'azu-primer-registro').unlocked);
  // Y los logros de Sem Fumo siguen siendo solo los 9 originales.
  const semFumo = (await u.c('/api/app/achievements')).body.achievements;
  assert.equal(semFumo.length, 9);
  assert.ok(semFumo.every((a) => !/^(alc|azu|ans|sue)-/.test(a.slug)));
});

// ------------------------------------------------------------------ aislamiento y suscripción
test('aislamiento entre usuarios y programas; 402 sin suscripción del programa', async () => {
  const a = await configured('alcohol');
  const b = await configured('alcohol');
  const logA = await a.c(P('alcohol', '/log'), { method: 'POST', body: { value: { bebidas: 2 } } });
  const urgeA = await a.c(P('alcohol', '/urge'), { method: 'POST', body: { feeling: 'estres', intensity: 3 } });
  await a.c(P('alcohol', '/checkin'), { method: 'POST', body: { day: addDays(today(), -1) } });
  const goalsA = (await a.c(P('alcohol', '/goals'))).body;

  // B no ve ni toca lo de A.
  assert.equal((await b.c(P('alcohol', '/log'))).body.entries.length, 0);
  assert.equal((await b.c(P('alcohol', '/urge'))).body.urges.length, 0);
  assert.equal((await b.c(P('alcohol', `/log/${logA.body.entry.id}`), { method: 'PATCH', body: { value: { bebidas: 9 } } })).status, 404);
  assert.equal((await b.c(P('alcohol', `/log/${logA.body.entry.id}`), { method: 'DELETE' })).status, 404);
  assert.equal((await b.c(P('alcohol', `/urge/${urgeA.body.urge.id}`), { method: 'PATCH', body: { outcome: 'resolved' } })).status, 404);
  assert.equal((await b.c(P('alcohol', `/tasks/${goalsA.tasks[0].id}`), { method: 'PATCH', body: { done: true } })).status, 404);
  const dashB = (await b.c(P('alcohol', '/dashboard'))).body;
  assert.equal(dashB.todayStatus.value, null);
  assert.equal(dashB.todayStatus.urges, 0);
  assert.equal((await b.c(P('alcohol', '/progress?range=30'))).body.totals.trackedDays, 0);
  assert.equal((await a.c(P('alcohol', `/log/${logA.body.entry.id}`))).status, 404, 'GET por id no existe');
  // Ni siquiera con RLS desde la base se ven filas ajenas.
  const seenByB = await db.asUser(b.id, (q) => q.rows('select id from public.program_activity_entries'));
  assert.equal(seenByB.length, 0);
  assert.equal((await db.asUser(b.id, (q) => q.exec(`delete from public.program_activity_entries where id = $1`, [logA.body.entry.id]))), 0);

  // Programa sin acceso: 402 en TODAS las rutas del programa, aunque tenga otro programa activo.
  const routes = [['GET', '/setup'], ['PUT', '/setup'], ['GET', '/dashboard'], ['POST', '/log'], ['GET', '/log'], ['POST', '/urge'], ['GET', '/urge'],
    ['POST', '/checkin'], ['GET', '/progress'], ['GET', '/goals'], ['PUT', '/goals'], ['GET', '/achievements']];
  for (const [method, path] of routes) {
    const r = await a.c(P('azucar', path), { method, body: method === 'GET' ? undefined : {} });
    assert.equal(r.status, 402, `${method} ${path}`);
    assert.equal(r.body.code, 'SUBSCRIPTION_REQUIRED');
  }
  // Sin ningún acceso: tampoco hay panel.
  const none = await userWith([]);
  assert.equal((await none.c(P('alcohol', '/dashboard'))).status, 402);
  // Sin sesión: 401.
  assert.equal((await client()(P('alcohol', '/dashboard'))).status, 401);

  // Datos separados por programa para un mismo usuario.
  const both = await userWith(['alcohol', 'sueno']);
  await both.c(P('alcohol', '/setup'), { method: 'PUT', body: { ...SETUP.alcohol, startDate: today() } });
  await both.c(P('sueno', '/setup'), { method: 'PUT', body: { ...SETUP.sueno, startDate: today() } });
  await both.c(P('alcohol', '/log'), { method: 'POST', body: { value: { bebidas: 4 } } });
  assert.equal((await both.c(P('sueno', '/log'))).body.entries.length, 0);
  assert.equal((await both.c(P('sueno', '/dashboard'))).body.todayStatus.entries.length, 0);
  // Una entrada de alcohol no se puede editar a través de otro programa.
  const id = (await both.c(P('alcohol', '/log'))).body.entries[0].id;
  assert.equal((await both.c(P('sueno', `/log/${id}`), { method: 'PATCH', body: { value: LOGS.sueno } })).status, 404);
});

// ------------------------------------------------------------------ Sem Fumo y rutas genéricas intactas
test('Sem Fumo y las rutas genéricas siguen funcionando', async () => {
  const u = await userWith(['sem-fumo', 'alcohol']);
  // sem-fumo no pasa por el companheiro: no existe /setup ahí (la ruta genérica es /onboarding).
  assert.equal((await u.c(P('sem-fumo', '/setup'))).status, 404);
  assert.equal((await u.c(P('sem-fumo', '/dashboard'))).status, 404);
  assert.equal((await u.c('/api/app/onboarding')).status, 200);

  // Registros genéricos de actividad: siguen disponibles para los programas acompañados.
  const gen = await u.c('/api/app/programs/alcohol/activity', { method: 'POST', body: { kind: 'consumo', value: { nota: 'x' } } });
  assert.equal(gen.status, 201);
  assert.equal((await u.c('/api/app/programs/alcohol/activity')).body.entries.length, 1);
  assert.equal((await u.c(`/api/app/programs/alcohol/activity/${gen.body.entry.id}`, { method: 'DELETE' })).status, 200);
  // Un registro genérico mal formado no rompe el panel.
  await u.c(P('alcohol', '/setup'), { method: 'PUT', body: { ...SETUP.alcohol, startDate: today() } });
  await u.c('/api/app/programs/alcohol/activity', { method: 'POST', body: { kind: 'consumo', value: { bebidas: 'mucho', basura: [1, 2] } } });
  assert.equal((await u.c(P('alcohol', '/dashboard'))).status, 200);
  assert.equal((await u.c(P('alcohol', '/progress?range=7'))).status, 200);

  // Humor y respiración aceptan ?program= sin mezclar con Sem Fumo.
  const t = today();
  assert.equal((await u.c(`/api/app/mood/${t}`, { method: 'PUT', body: { mood: 5 } })).status, 200);
  assert.equal((await u.c(`/api/app/mood/${t}?program=alcohol`, { method: 'PUT', body: { mood: 2, note: 'dura' } })).status, 200);
  assert.equal((await u.c(`/api/app/mood/${t}`, { method: 'PUT', body: { mood: 4 } })).status, 200);
  const moodSf = (await u.c('/api/app/mood')).body;
  const moodAl = (await u.c('/api/app/mood?program=alcohol')).body;
  assert.equal(moodSf.entries.length, 1);
  assert.equal(moodSf.entries[0].mood, 4);
  assert.equal(moodAl.entries.length, 1);
  assert.equal(moodAl.entries[0].mood, 2);
  assert.equal((await u.c(P('alcohol', '/dashboard'))).body.todayStatus.mood, 2);
  assert.equal((await u.c(`/api/app/mood?program=azucar`)).status, 402, 'programa sin acceso');
  assert.equal((await u.c(`/api/app/mood?program=nada`)).status, 404);

  const sess = await u.c('/api/app/breathing/sessions?program=alcohol', { method: 'POST', body: { exercise: 'calma-4-6', plannedSeconds: 30 } });
  assert.equal(sess.status, 201, JSON.stringify(sess.body));
  assert.equal((await db.service.one('select program_slug from public.breathing_sessions where id = $1', [sess.body.session.id])).program_slug, 'alcohol');
  const sess2 = await u.c('/api/app/breathing/sessions', { method: 'POST', body: { exercise: 'calma-4-6', plannedSeconds: 30 } });
  assert.equal((await db.service.one('select program_slug from public.breathing_sessions where id = $1', [sess2.body.session.id])).program_slug, 'sem-fumo');
  assert.equal((await u.c('/api/app/breathing/sessions?program=azucar', { method: 'POST', body: { exercise: 'calma-4-6', plannedSeconds: 30 } })).status, 402);
  assert.ok((await u.c('/api/app/breathing')).body.exercises.some((e) => e.slug === 'sueno-4-7-8'));

  // Notificaciones por programa.
  const np = await u.c('/api/app/notifications?program=alcohol', { method: 'PUT', body: { enabled: true, time: '19:30' } });
  assert.equal(np.status, 200);
  assert.equal((await u.c('/api/app/notifications?program=alcohol')).body.time, '19:30');
  assert.equal((await u.c('/api/app/notifications')).body.enabled, false);
});
