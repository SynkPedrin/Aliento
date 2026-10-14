// Pruebas end-to-end contra un Supabase LOCAL real (Postgres + Auth + RLS).
// Requisito: `npx supabase start` (puertos 555xx). Stripe se simula con firmas de webhook reales.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import { createBilling } from '../server/billing.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';
import { seedJourney } from '../server/services/journey.js';
import { JOURNEY } from '../server/content/journey.js';
import { fakeStripe } from '../scripts/fake-stripe.js';
import { createNotifier } from '../server/services/notifications.js';
import { localSupabaseEnv } from '../scripts/local-supabase.js';

const WEBHOOK_SECRET = 'whsec_test_secret';
const real = new Stripe('sk_test_dummy');
const silent = process.env.TEST_VERBOSE ? console : { log() {}, info() {}, warn() {}, error() {} };

let server, base, stripe, db, auth, config, notifier;
const pushed = [];
const createdUsers = [];

before(async () => {
  config = loadConfig({
    APP_URL: 'http://localhost',
    STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_EXIT_COUPON: 'aliento-salida-20',
    CRON_SECRET: 'cron-test', VAPID_SUBJECT: 'mailto:test@example.com',
    VAPID_PUBLIC_KEY: 'BLs0rb7qGq5Ae7oZr3GgOq0h2vrnU2zrYsDYZJqgQzkQ2gO1pJ6s0x7VYb4i9i3Qzq2zK2sY3bJtV3l4n5o6p7Q',
    VAPID_PRIVATE_KEY: 'x7m4uN4mWm1kO6y4rH0q2Jv9cQe1b3d5f7h9j1l3n5p',
    ...localSupabaseEnv(),
  });
  db = createDb(config.supabase.dbUrl, { max: 5 });
  await seedJourney(db, JOURNEY);
  auth = createAuth({ config, db });
  stripe = fakeStripe({ webhooks: real.webhooks });
  const billing = createBilling({ db, stripe, config, log: silent });
  notifier = createNotifier({ db, config, log: silent, sender: async (sub, body) => { pushed.push({ endpoint: sub.endpoint, body: JSON.parse(body) }); } });
  server = createApp({ db, auth, billing, config, notifier, log: silent }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  for (const id of createdUsers) await auth.deleteUser(id).catch(() => {});
  server.close();
  await db.end();
});

/** Cliente con tarro de cookies, como un navegador. */
function client() {
  const jar = new Map();
  return async (path, { method = 'GET', body, headers = {} } = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i);
      const v = pair.slice(i + 1);
      if (v) jar.set(k, v); else jar.delete(k);
    }
    const textBody = await res.text();
    let json; try { json = JSON.parse(textBody); } catch { json = textBody; }
    return { status: res.status, body: json };
  };
}

const ANSWERS = {
  q_producto: 'cigarrillos', q_cantidad: 20, q_gasto: 35, q_anios: '10-19', q_primer: '30min',
  q_gatillos: ['cafe', 'estres'], q_dificil: 'cafe', q_intentos: ['solo'], q_preocupacion: 'ansiedad',
  q_motivos: ['salud', 'dinero'], q_objetivo: 'gradual', q_edad: '35-44',
};

async function completeQuiz(c) {
  for (const [questionId, value] of Object.entries(ANSWERS)) {
    const r = await c('/api/assessment/answers', { method: 'PUT', body: { questionId, value } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.equal((await c('/api/assessment/complete', { method: 'POST' })).status, 200);
}

const email = () => `prueba-${randomUUID().slice(0, 8)}@example.com`;
const madridToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

async function register(c, mail = email()) {
  const r = await c('/api/auth/register', { method: 'POST', body: { name: 'Ana', email: mail, password: 'secreta123', acceptTerms: true, healthConsent: true, timezone: 'Europe/Madrid' } });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const u = await db.service.one('select id from auth.users where email = $1', [mail]);
  createdUsers.push(u.id);
  return { email: mail, id: u.id };
}

async function sendEvent(type, object, id = `evt_${randomUUID()}`) {
  const payload = JSON.stringify({ id, type, data: { object } });
  const signature = real.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
  return res.status;
}

/** Usuario nuevo con suscripción activa y configuración inicial completa. */
async function payingUser(plan = 'trimestral') {
  const c = client();
  await completeQuiz(c);
  const u = await register(c);
  const { body } = await c('/api/checkout', { method: 'POST', body: { plan } });
  const sessionId = [...stripe.sessions.values()].find((s) => s.url === body.url).id;
  const { session, sub } = stripe.pay(sessionId);
  assert.equal(await sendEvent('checkout.session.completed', session), 200);
  const today = madridToday();
  await c('/api/app/onboarding', { method: 'PUT', body: { startDate: today, notifications: { enabled: false, time: '09:00' }, complete: true } });
  return { c, user: u, session, sub, today };
}

function answerFor(block) {
  switch (block.type) {
    case 'multiple_choice': return { optionId: block.correct ?? block.options[0].id };
    case 'reflection': return { text: 'Quiero respirar mejor y ahorrar.' };
    case 'interactive_exercise': return { selected: block.items.slice(0, Math.max(1, block.minSelected)).map((i) => i.id) };
    case 'breathing_exercise': return { completed: true };
    case 'commitment': return { accepted: true };
    default: return null;
  }
}

async function completeLessonVia(c, chapterIdx, lessonIdx) {
  const lesson = JOURNEY.chapters[chapterIdx].lessons[lessonIdx];
  for (const b of lesson.blocks) {
    const response = answerFor(b);
    if (response) {
      const r = await c(`/api/app/journey/lessons/${lesson.slug}/responses`, { method: 'POST', body: { blockId: b.id, response } });
      assert.equal(r.status, 200, JSON.stringify(r.body));
    }
  }
  const done = await c(`/api/app/journey/lessons/${lesson.slug}/complete`, { method: 'POST' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return done.body;
}

// ------------------------------------------------------------------ PRUEBA 1
test('1 · nuevo usuario: cuestionario → resultados → cuenta → checkout → webhook → panel', async () => {
  const c = client();
  await completeQuiz(c);
  const result = await c('/api/assessment/result');
  assert.equal(result.status, 200);
  assert.equal(result.body.result.current.perDay, 20);

  assert.equal((await c('/api/checkout', { method: 'POST', body: { plan: 'trimestral' } })).body.code, 'AUTH_REQUIRED');
  await register(c);
  const checkout = await c('/api/checkout', { method: 'POST', body: { plan: 'trimestral' } });
  assert.equal(checkout.status, 200);
  const sessionId = [...stripe.sessions.values()].find((s) => s.url === checkout.body.url).id;

  // Volver del checkout sin pagar: se reutiliza la misma sesión, sin duplicar.
  const again = await c('/api/checkout', { method: 'POST', body: { plan: 'trimestral' } });
  assert.equal(again.body.url, checkout.body.url);

  // La redirección de éxito por sí sola NO activa nada.
  assert.equal((await c(`/api/checkout/status?session_id=${sessionId}`)).body.state, 'pending');
  assert.equal((await c('/api/app/dashboard')).body.code, 'SUBSCRIPTION_REQUIRED');

  const { session } = stripe.pay(sessionId);
  assert.equal(await sendEvent('checkout.session.completed', session), 200);
  assert.equal((await c(`/api/checkout/status?session_id=${sessionId}`)).body.state, 'active');
  assert.equal((await c('/api/me')).body.access, true);

  assert.equal((await c('/api/app/dashboard')).body.code, 'ONBOARDING_REQUIRED');
  await c('/api/app/onboarding', { method: 'PUT', body: { goal: 'parar', startDate: madridToday(), notifications: { enabled: true, time: '08:30' }, complete: true } });
  const dash = await c('/api/app/dashboard');
  assert.equal(dash.status, 200, JSON.stringify(dash.body));
  assert.equal(dash.body.strategy.id, 'parar');
  assert.equal(dash.body.journey.nextLesson.slug, JOURNEY.chapters[0].lessons[0].slug);
  assert.ok(dash.body.tasks.length >= 3, 'metas iniciales creadas');
  const ach = await c('/api/app/achievements');
  assert.ok(ach.body.achievements.find((a) => a.slug === 'primer-paso').unlocked_at);
});

// ------------------------------------------------------------------ PRUEBA 2
test('2 · usuario existente: login con suscripción activa → acceso premium', async () => {
  const { user } = await payingUser();
  const c = client();
  assert.equal((await c('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'mala-clave' } })).status, 401);
  assert.equal((await c('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'secreta123' } })).status, 200);
  assert.equal((await c('/api/me')).body.access, true);
  assert.equal((await c('/api/app/journey')).status, 200);
  // Ya pagó: no se le vuelve a cobrar.
  assert.equal((await c('/api/checkout', { method: 'POST', body: { plan: 'mensual' } })).body.code, 'ALREADY_SUBSCRIBED');
});

// ------------------------------------------------------------------ PRUEBA 3
test('3 · usuario sin suscripción: el área premium queda bloqueada (API y RLS)', async () => {
  const c = client();
  const u = await register(c);
  for (const path of ['/api/app/dashboard', '/api/app/journey', '/api/app/progress', '/api/app/smoking']) {
    assert.equal((await c(path)).body.code, 'SUBSCRIPTION_REQUIRED', path);
  }
  // Cuenta y datos personales siguen accesibles.
  assert.equal((await c('/api/profile')).status, 200);
  assert.equal((await c('/api/subscription')).status, 200);
  // RLS: sin suscripción, el contenido de la jornada no es visible ni consultando la base como el usuario.
  const lessons = await db.asUser(u.id, (q) => q.rows('select id from public.journey_lessons'));
  assert.equal(lessons.length, 0);
});

// ------------------------------------------------------------------ PRUEBAS 4 y 5
test('4 y 5 · lecciones: progreso guardado, desbloqueo de la siguiente y del siguiente capítulo', async () => {
  const { c } = await payingUser();
  const ch0 = JOURNEY.chapters[0];
  // La segunda lección empieza bloqueada y no se puede abrir.
  assert.equal((await c(`/api/app/journey/lessons/${ch0.lessons[1].slug}`)).body.code, 'LOCKED');
  // Completar sin responder no está permitido.
  assert.equal((await c(`/api/app/journey/lessons/${ch0.lessons[0].slug}/complete`, { method: 'POST' })).body.code, 'INCOMPLETE');

  // Una respuesta incorrecta se evalúa en el servidor.
  const mc = ch0.lessons[0].blocks.find((b) => b.type === 'multiple_choice' && b.correct);
  if (mc) {
    const wrong = mc.options.find((o) => o.id !== mc.correct);
    const r = await c(`/api/app/journey/lessons/${ch0.lessons[0].slug}/responses`, { method: 'POST', body: { blockId: mc.id, response: { optionId: wrong.id } } });
    assert.equal(r.body.correct, false);
  }

  const first = await completeLessonVia(c, 0, 0);
  assert.equal(first.next.slug, ch0.lessons[1].slug);
  assert.ok(first.achievements.some((a) => a.slug === 'primera-leccion'));
  const lesson = await c(`/api/app/journey/lessons/${ch0.lessons[0].slug}`);
  assert.equal(lesson.body.lesson.status, 'completed', 'se puede revisar una lección completada');
  assert.ok(Object.keys(lesson.body.responses).length > 0, 'las respuestas quedan guardadas');
  assert.ok(lesson.body.blocks.every((b) => !('correct' in b)), 'la respuesta correcta no se envía al cliente');

  await completeLessonVia(c, 0, 1);
  const last = await completeLessonVia(c, 0, 2);
  assert.equal(last.chapterCompleted, true);
  assert.equal(last.next.slug, JOURNEY.chapters[1].lessons[0].slug, 'se libera el capítulo 1');
  const journey = await c('/api/app/journey');
  assert.equal(journey.body.chapters[0].status, 'completed');
  assert.equal(journey.body.chapters[1].status, 'available');
  assert.equal(journey.body.chapters[2].status, 'locked');
  assert.equal((await c('/api/app/dashboard')).body.journey.currentChapter.number, 1);
});

// ------------------------------------------------------------------ PRUEBA 6
test('6 · registrar cigarrillo actualiza panel y gráficos; sin duplicados por doble clic', async () => {
  const { c, today } = await payingUser();
  const body = { quantity: 2, trigger: 'cafe', mood: 'estres', note: 'Con el café de la mañana', clientRequestId: randomUUID() };
  const [a, b] = await Promise.all([c('/api/app/smoking', { method: 'POST', body }), c('/api/app/smoking', { method: 'POST', body })]);
  assert.equal(a.body.entry.id, b.body.entry.id, 'el mismo clientRequestId no duplica');

  const dash = (await c('/api/app/dashboard')).body;
  assert.equal(dash.todayStatus.cigarettes, 2);
  assert.equal(dash.week.at(-1).cigarettes, 2);
  assert.equal(dash.totals.estimated.cigarettesAvoided, 18);

  const progress = (await c('/api/app/progress?days=7')).body;
  assert.equal(progress.series.at(-1).cigarettes, 2);
  assert.equal(progress.triggers[0].trigger, 'cafe');

  // Editar y borrar.
  assert.equal((await c(`/api/app/smoking/${a.body.entry.id}`, { method: 'PATCH', body: { ...body, quantity: 1 } })).body.entry.quantity, 1);
  assert.equal((await c('/api/app/checkins', { method: 'POST', body: { day: today } })).body.code, 'HAS_ENTRIES');
  assert.equal((await c(`/api/app/smoking/${a.body.entry.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await c('/api/app/checkins', { method: 'POST', body: { day: today } })).status, 201);
  const after = (await c('/api/app/dashboard')).body;
  assert.equal(after.todayStatus.checkedIn, true);
  assert.equal(after.totals.recorded.smokeFreeDays, 1);
  const achs = (await c('/api/app/achievements')).body.achievements;
  assert.ok(achs.find((x) => x.slug === 'primer-dia-sin-fumar').unlocked_at);
  assert.ok(achs.find((x) => x.slug === 'primer-registro').unlocked_at);

  // Ganas de fumar (distinto de consumo).
  const crav = await c('/api/app/cravings', { method: 'POST', body: { feeling: 'ansiedad', trigger: 'estres', intensity: 4, clientRequestId: randomUUID() } });
  assert.equal(crav.status, 201);
  const upd = await c(`/api/app/cravings/${crav.body.craving.id}`, { method: 'PATCH', body: { outcome: 'resisted', strategy: 'respiración' } });
  assert.ok(upd.body.achievements.some((x) => x.slug === 'ganas-superadas'));
  assert.equal((await c('/api/app/dashboard')).body.todayStatus.cigarettes, 0, 'las ganas no cuentan como consumo');
});

// ------------------------------------------------------------------ PRUEBA 7
test('7 · objetivos: cambio persistido, historial conservado e indicadores actualizados', async () => {
  const { c } = await payingUser();
  const before = (await c('/api/app/goals')).body;
  const r = await c('/api/app/goals', { method: 'PUT', body: { strategy: 'reducir', maxDaily: 8, exercisePerWeek: 5, moneyGoal: 150, moneyGoalLabel: 'Unas zapatillas' } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = (await c('/api/app/goals')).body;
  assert.equal(after.current.strategy, 'reducir');
  assert.equal(after.current.max_daily, 8);
  assert.ok(after.history.length >= before.history.length + 1, 'la versión anterior queda en el historial');
  const dash = (await c('/api/app/dashboard')).body;
  assert.equal(dash.todayStatus.target, 8);
  assert.equal(dash.strategy.id, 'reducir');
  assert.equal(dash.exercises.goal, 5);
});

// ------------------------------------------------------------------ PRUEBA 8
test('8 · cancelación: se aplica la política de acceso y la cuenta sigue disponible', async () => {
  const { c, sub } = await payingUser();
  sub.cancel_at_period_end = true;
  assert.equal(await sendEvent('customer.subscription.updated', sub), 200);
  const s = (await c('/api/subscription')).body;
  assert.equal(s.access, true, 'mantiene acceso hasta el fin del período pagado');
  assert.equal(s.subscription.cancelAtPeriodEnd, true);

  sub.status = 'canceled';
  assert.equal(await sendEvent('customer.subscription.deleted', sub), 200);
  assert.equal((await c('/api/app/dashboard')).body.code, 'SUBSCRIPTION_REQUIRED');
  assert.equal((await c('/api/profile')).status, 200);
  assert.equal((await c('/api/assessment/result')).status, 200);
  assert.equal((await c('/api/billing/portal', { method: 'POST' })).body.url, 'https://billing.stripe.test/portal');
  const exp = await c('/api/account/export');
  assert.equal(exp.status, 200);
  assert.ok(Array.isArray(exp.body.smoking));
});

// ------------------------------------------------------------------ PRUEBA 9
test('9 · aislamiento: el usuario A no puede ver ni tocar datos del usuario B', async () => {
  const A = await payingUser();
  const B = await payingUser();
  const entry = (await B.c('/api/app/smoking', { method: 'POST', body: { quantity: 3, clientRequestId: randomUUID() } })).body.entry;
  await B.c(`/api/app/mood/${B.today}`, { method: 'PUT', body: { mood: 2, note: 'Privado de B' } });

  // Por la API: no lo ve, no lo edita, no lo borra.
  assert.ok(!(await A.c('/api/app/smoking?days=7')).body.entries.some((e) => e.id === entry.id));
  assert.equal((await A.c(`/api/app/smoking/${entry.id}`, { method: 'PATCH', body: { quantity: 9 } })).status, 404);
  assert.equal((await A.c(`/api/app/smoking/${entry.id}`, { method: 'DELETE' })).status, 404);
  assert.equal((await A.c('/api/app/mood?days=7')).body.entries.length, 0);

  // Directamente en la base, con el rol del usuario A (RLS).
  const seen = await db.asUser(A.user.id, (q) => q.rows('select * from public.smoking_entries where user_id = $1', [B.user.id]));
  assert.equal(seen.length, 0);
  const moods = await db.asUser(A.user.id, (q) => q.rows('select * from public.mood_entries'));
  assert.equal(moods.length, 0);
  const forged = await db.asUser(A.user.id, (q) => q.exec('update public.smoking_entries set quantity = 50 where id = $1', [entry.id]));
  assert.equal(forged, 0);
  await assert.rejects(db.asUser(A.user.id, (q) => q.exec(
    'insert into public.smoking_entries (user_id, smoked_at, client_request_id) values ($1, now(), $2)', [B.user.id, randomUUID()])));
  // El usuario no puede concederse progreso, logros, administración ni tocar su facturación.
  await assert.rejects(db.asUser(A.user.id, (q) => q.exec(`insert into public.user_achievements (user_id, achievement_slug) values ($1, 'un-mes')`, [A.user.id])));
  await assert.rejects(db.asUser(A.user.id, (q) => q.exec('insert into public.admin_users (user_id) values ($1)', [A.user.id])));
  await assert.rejects(db.asUser(A.user.id, (q) => q.exec(`update public.profiles set stripe_customer_id = 'cus_x' where user_id = $1`, [A.user.id])));
  assert.equal((await A.c('/api/admin/overview')).status, 403);
});

// ------------------------------------------------------------------ PRUEBA 10
test('10 · webhook duplicado o fuera de orden: una sola suscripción, firma obligatoria', async () => {
  const { c, session, sub, user } = await payingUser();
  const eventId = `evt_${randomUUID()}`;
  assert.equal(await sendEvent('customer.subscription.updated', sub, eventId), 200);
  assert.equal(await sendEvent('customer.subscription.updated', sub, eventId), 200);
  assert.equal(await sendEvent('checkout.session.completed', session), 200);
  const rows = await db.service.rows('select id from public.subscriptions where user_id = $1', [user.id]);
  assert.equal(rows.length, 1);
  const bad = await fetch(`${base}/api/stripe/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=bad' }, body: '{}' });
  assert.equal(bad.status, 400);
  assert.equal((await c('/api/me')).body.access, true);
});

// ------------------------------------------------------------------ extras
test('oferta de salida: real, una sola vez, solo para el plan semanal', async () => {
  const c = client();
  await completeQuiz(c);
  const first = await c('/api/exit-offer', { method: 'POST' });
  assert.equal(first.body.offer.discountedAmount, 639);
  assert.equal(first.body.offer.amount, 799);
  assert.equal((await c('/api/exit-offer', { method: 'POST' })).body.offer, null, 'no vuelve a aparecer');
  await register(c);
  assert.equal((await c('/api/checkout', { method: 'POST', body: { plan: 'mensual', exitOffer: true } })).body.code, 'OFFER_UNAVAILABLE');
  const r = await c('/api/checkout', { method: 'POST', body: { plan: 'semanal', exitOffer: true } });
  assert.equal(r.status, 200);
  const s = [...stripe.sessions.values()].find((x) => x.url === r.body.url);
  assert.deepEqual(s.discounts, [{ coupon: 'aliento-salida-20' }]);

  // Otro cuestionario que nunca vio la oferta no puede usarla.
  const d = client();
  await completeQuiz(d);
  await register(d);
  assert.equal((await d('/api/checkout', { method: 'POST', body: { plan: 'semanal', exitOffer: true } })).body.code, 'OFFER_UNAVAILABLE');
});

test('respiración: no se registra como completada si no pasó el tiempo', async () => {
  const { c } = await payingUser();
  const s = (await c('/api/app/breathing/sessions', { method: 'POST', body: { exercise: 'calma-4-6', plannedSeconds: 60 } })).body.session;
  assert.equal((await c(`/api/app/breathing/sessions/${s.id}/complete`, { method: 'POST', body: { activeSeconds: 60 } })).body.code, 'INCOMPLETE_SESSION');
  await db.service.exec(`update public.breathing_sessions set started_at = now() - interval '70 seconds' where id = $1`, [s.id]);
  const ok = await c(`/api/app/breathing/sessions/${s.id}/complete`, { method: 'POST', body: { activeSeconds: 60 } });
  assert.equal(ok.status, 200);
  assert.equal((await c('/api/app/progress?days=7')).body.summary.recorded.breathingSessions, 1);
});

test('perfil: cambio de contraseña, diario y baja con salvaguardas', async () => {
  const { c, user, sub, today } = await payingUser();
  assert.equal((await c('/api/profile/password', { method: 'POST', body: { current: 'mala', next: 'nueva-clave-1' } })).status, 422);
  assert.equal((await c('/api/profile/password', { method: 'POST', body: { current: 'secreta123', next: 'nueva-clave-1' } })).status, 200);
  assert.equal((await c(`/api/app/mood/${today}`, { method: 'PUT', body: { mood: 4, note: 'Buen día' } })).status, 200);
  assert.equal((await c(`/api/app/mood/${today}`, { method: 'PUT', body: { mood: 5 } })).status, 200);
  assert.equal((await c('/api/app/mood?days=7')).body.entries[0].mood, 5);

  // No se puede borrar la cuenta con una renovación pendiente.
  assert.equal((await c('/api/account', { method: 'DELETE', body: { password: 'nueva-clave-1', confirm: 'ELIMINAR' } })).body.code, 'ACTIVE_SUBSCRIPTION');
  sub.status = 'canceled';
  await sendEvent('customer.subscription.deleted', sub);
  assert.equal((await c('/api/account', { method: 'DELETE', body: { password: 'nueva-clave-1', confirm: 'ELIMINAR' } })).status, 200);
  assert.equal(await db.service.one('select 1 from auth.users where id = $1', [user.id]), null);
  assert.equal((await c('/api/me')).body.user, null);
});

test('contenido: la carga es idempotente y admin requiere permiso explícito', async () => {
  const again = await seedJourney(db, JOURNEY);
  assert.equal(again.lessonsChanged, 0);
  const { c, user } = await payingUser();
  assert.equal((await c('/api/admin/content')).status, 403);
  await db.service.exec('insert into public.admin_users (user_id) values ($1)', [user.id]);
  const content = await c('/api/admin/content');
  assert.equal(content.body.chapters.length, 10);
  const bad = await c(`/api/admin/lessons/${content.body.chapters[0].lessons[0].id}`, { method: 'PUT', body: { title: 'X', description: 'Y', minutes: 5, blocks: [] } });
  assert.equal(bad.body.code, 'INVALID_CONTENT');
  assert.equal((await c('/api/admin/overview')).status, 200);
});

test('conciliación: vincula solo por identificadores verificables', async () => {
  const { user, sub } = await payingUser();
  await db.service.exec('delete from public.subscriptions where id = $1', [sub.id]);
  const billing = createBilling({ db, stripe, config, log: silent });
  // Suscripción huérfana: sin metadata ni customer conocido.
  stripe.subs.set('sub_huerfana', { ...sub, id: 'sub_huerfana', customer: 'cus_desconocido', metadata: {} });
  try {
    const report = await billing.reconcile({ apply: true });
    assert.ok(report.linked.some((l) => l.subscription === sub.id && l.user === user.id));
    assert.ok(report.review.some((r) => r.subscription === 'sub_huerfana'));
    assert.ok(await db.service.one('select 1 from public.subscriptions where id = $1', [sub.id]));
    assert.ok(await db.service.one(`select 1 from public.billing_reconciliation_reviews where stripe_subscription_id = 'sub_huerfana'`));
  } finally {
    stripe.subs.delete('sub_huerfana');
    await db.service.exec(`delete from public.billing_reconciliation_reviews where stripe_subscription_id = 'sub_huerfana'`);
  }
});

test('origen ajeno bloqueado y páginas servidas', async () => {
  assert.equal((await client()('/api/auth/login', { method: 'POST', body: {}, headers: { origin: 'https://evil.example' } })).status, 403);
  for (const p of ['/', '/test', '/resultados', '/planes', '/acceso', '/terminos', '/privacidad']) {
    assert.equal((await fetch(base + p)).status, 200, p);
  }
});

test('notificaciones push: consentimiento, hora local, sin duplicados y cron protegido', async () => {
  const { c, user } = await payingUser();
  assert.equal((await c('/api/app/push')).body.available, true);
  // Sin dispositivo no se envía nada.
  assert.equal((await c('/api/app/push/test', { method: 'POST' })).body.code, 'PUSH_FAILED');
  const endpoint = `https://push.example.com/${randomUUID()}`;
  assert.equal((await c('/api/app/push/subscriptions', { method: 'POST', body: { endpoint, keys: { p256dh: 'p', auth: 'a' } } })).status, 201);
  assert.equal((await c('/api/app/push/test', { method: 'POST' })).status, 200);
  assert.ok(pushed.some((p) => p.endpoint === endpoint && p.body.tag === 'test'));

  // Recordatorio diario: solo con consentimiento y a la hora local elegida.
  const madridNow = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  pushed.length = 0;
  await c('/api/app/notifications', { method: 'PUT', body: { enabled: false, time: madridNow, timezone: 'Europe/Madrid' } });
  await notifier.runDue();
  assert.ok(!pushed.some((p) => p.endpoint === endpoint), 'sin consentimiento no hay envío');
  await c('/api/app/notifications', { method: 'PUT', body: { enabled: true, time: madridNow, timezone: 'Europe/Madrid' } });
  await notifier.runDue();
  const daily = pushed.filter((p) => p.endpoint === endpoint && p.body.tag === 'daily');
  assert.equal(daily.length, 1);
  assert.match(daily[0].body.body, /lección|Registra/);
  await notifier.runDue();
  assert.equal(pushed.filter((p) => p.endpoint === endpoint && p.body.tag === 'daily').length, 1, 'no se repite el mismo día');

  // Logro → aviso inmediato.
  await c('/api/app/checkins', { method: 'POST', body: {} });
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(pushed.some((p) => p.endpoint === endpoint && p.body.tag?.startsWith('ach-')));

  // El cron exige el secreto.
  assert.equal((await fetch(`${base}/api/cron/notifications`)).status, 401);
  assert.equal((await fetch(`${base}/api/cron/notifications`, { headers: { authorization: 'Bearer cron-test' } })).status, 200);
  void user;
});
