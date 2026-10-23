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
    STRIPE_SECRET_KEY: 'sk_test', STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_EXIT_COUPON: 'alento-volta-20',
    CRON_SECRET: 'cron-test', VAPID_SUBJECT: 'mailto:test@example.com',
    VAPID_PUBLIC_KEY: 'BLs0rb7qGq5Ae7oZr3GgOq0h2vrnU2zrYsDYZJqgQzkQ2gO1pJ6s0x7VYb4i9i3Qzq2zK2sY3bJtV3l4n5o6p7Q',
    VAPID_PRIVATE_KEY: 'x7m4uN4mWm1kO6y4rH0q2Jv9cQe1b3d5f7h9j1l3n5p',
    ...localSupabaseEnv(),
  });
  db = createDb(config.supabase.dbUrl, { max: 5 });
  await seedJourney(db, JOURNEY);
  // Los límites de intentos son reales (Postgres); en pruebas se parte de cero en cada ejecución.
  await db.service.exec('delete from public.rate_limits');
  // Estado comercial determinista: solo Sem Fumo a la venta; contenido nuevo en borrador.
  await db.service.exec(`update public.journey_programs set commercial_status = case when slug = 'sem-fumo' then 'active' else 'coming_soon' end,
    published = slug = 'sem-fumo'`);
  await db.service.exec(`update public.journey_chapters set published = (select p.slug = 'sem-fumo' from public.journey_programs p where p.id = program_id)`);
  await db.service.exec(`update public.journey_lessons l set published = (select p.slug = 'sem-fumo' from public.journey_chapters c join public.journey_programs p on p.id = c.program_id where c.id = l.chapter_id)`);
  auth = createAuth({ config, db });
  stripe = fakeStripe({ webhooks: real.webhooks });
  const billing = createBilling({ db, stripe, config, log: silent });
  notifier = createNotifier({ db, config, log: silent, sender: async (sub, body) => { pushed.push({ endpoint: sub.endpoint, body: JSON.parse(body) }); } });
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
  q_diario: 'si', q_genero: 'hombre', q_edad: '35-44', q_medico: 'no', q_producto: 'cigarrillos', q_anios: '6a9',
  q_cantidad: '21mas', q_primer: '30min', q_enfermo: 'no', q_prohibido: 'irritado', q_sin24h: 'cualquiera', q_patron: 'automatico',
  q_gatillos: ['comida', 'estres'], q_preocupacion: 'ansiedad', q_secreto: 'igual', q_amigo: 'no', q_disfrute: ['pausa'],
  q_metodos: ['golpe'], q_objetivo: 'gradual', q_gasto: '150a299', q_ahorro: 'viajar', q_meta3m: 'control',
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
  assert.equal(result.body.result.current.perDay, 25); // rango «Más de 20»

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
  assert.equal(dash.totals.estimated.cigarettesAvoided, 23); // 25 al día (rango «Más de 20») − 2

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
test('oferta de salida: real, una sola vez, 20 % sobre el plan elegido', async () => {
  const c = client();
  await completeQuiz(c);
  const first = await c('/api/exit-offer', { method: 'POST' });
  assert.equal(first.body.offer.plan, 'semanal', 'sin plan elegido se usa EXIT_OFFER_PLAN');
  assert.equal(first.body.offer.discountedAmount, 639);
  assert.equal(first.body.offer.amount, 799);
  assert.equal((await c('/api/exit-offer', { method: 'POST', body: { plan: 'mensual' } })).body.offer, null, 'no vuelve a aparecer');
  await register(c);
  // Vuelve del checkout del plan mensual: el descuento se aplica al plan que eligió.
  const r = await c('/api/checkout', { method: 'POST', body: { plan: 'mensual', exitOffer: true } });
  assert.equal(r.status, 200);
  const s = [...stripe.sessions.values()].find((x) => x.url === r.body.url);
  assert.deepEqual(s.discounts, [{ coupon: 'alento-volta-20' }]);
  assert.equal(s.cancel_url, undefined, 'sin botón «volver» en Stripe');

  // Otro cuestionario que nunca vio la oferta no puede usarla.
  const d = client();
  await completeQuiz(d);
  await register(d);
  assert.equal((await d('/api/checkout', { method: 'POST', body: { plan: 'semanal', exitOffer: true } })).body.code, 'OFFER_UNAVAILABLE');
});

test('precio de introducción: el 2.º período se programa al precio pleno, una sola vez', async () => {
  const plans = (await client()('/api/plans?program=sem-fumo')).body.plans;
  const tri = plans.find((p) => p.id === 'trimestral');
  assert.equal(tri.amount, 3499);
  assert.equal(tri.renewalAmount, 9999);
  const { session, sub } = await payingUser('trimestral');
  assert.match(session.custom_text.submit.message, /99,99/);
  const sched = [...stripe.schedules.values()].find((x) => x.subscription === sub.id);
  assert.ok(sched, 'calendario creado');
  assert.deepEqual(sched.phases.map((ph) => ph.items[0].price), ['price_t', 'price_t_full']);
  assert.equal(sched.end_behavior, 'release');
  // Webhook repetido: no se crea otro calendario.
  const before = stripe.schedules.size;
  assert.equal(await sendEvent('checkout.session.completed', session), 200);
  assert.equal(stripe.schedules.size, before);
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
  const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
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
  // Un endpoint fuera de los servicios push oficiales se rechaza (anti-SSRF).
  assert.equal((await c('/api/app/push/subscriptions', { method: 'POST', body: { endpoint: 'https://169.254.169.254/x', keys: { p256dh: 'p', auth: 'a' } } })).status, 422);
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

test('carga: más peticiones simultáneas que conexiones del pool no bloquean el panel', async () => {
  const { c } = await payingUser();
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: 25 }, () => c('/api/app/dashboard')));
  assert.ok(results.every((r) => r.status === 200), JSON.stringify(results.map((r) => r.status)));
  const lessons = await Promise.all(Array.from({ length: 15 }, () => c('/api/app/journey')));
  assert.ok(lessons.every((r) => r.status === 200));
  assert.ok(Date.now() - started < 15000, 'sin bloqueo mutuo');
});

test('pagos: reembolso y disputa cortan el acceso; webhooks desordenados no reactivan', async () => {
  const { c, sub } = await payingUser();
  // Webhook antiguo (activo) que llega DESPUÉS de la cancelación: se relee Stripe y sigue cancelada.
  const stale = structuredClone(sub);
  stripe.subs.get(sub.id).status = 'canceled';
  assert.equal(await sendEvent('customer.subscription.deleted', stripe.subs.get(sub.id)), 200);
  assert.equal(await sendEvent('customer.subscription.updated', stale), 200);
  assert.equal((await c('/api/app/dashboard')).body.code, 'SUBSCRIPTION_REQUIRED');

  const B = await payingUser();
  stripe.invoiceSubs.set('in_test_1', B.sub.id);
  assert.equal(await sendEvent('charge.refunded', { id: 'ch_1', amount: 3499, amount_refunded: 3499, invoice: 'in_test_1', customer: B.sub.customer }), 200);
  assert.equal((await B.c('/api/app/dashboard')).body.code, 'SUBSCRIPTION_REQUIRED');
  assert.equal(stripe.subs.get(B.sub.id).status, 'canceled');
  const review = await db.service.one('select reason from public.billing_reconciliation_reviews where stripe_subscription_id = $1', [B.sub.id]);
  assert.match(review.reason, /Reembolso/);
});

test('pagos: evento colgado en "processing" se reprocesa; en curso devuelve error para reintento', async () => {
  const { user, session } = await payingUser();
  const id = `evt_${randomUUID()}`;
  await db.service.exec(`insert into public.billing_events (id, type, status, received_at) values ($1, 'checkout.session.completed', 'processing', now())`, [id]);
  assert.equal(await sendEvent('checkout.session.completed', session, id), 500, 'en curso: Stripe debe reintentar');
  await db.service.exec(`update public.billing_events set received_at = now() - interval '5 minutes' where id = $1`, [id]);
  assert.equal(await sendEvent('checkout.session.completed', session, id), 200);
  assert.equal((await db.service.one('select status from public.billing_events where id = $1', [id])).status, 'processed');
  void user;
});

test('seguridad: token de sesión normal no sirve para /auth/reset; checkout simultáneo no se duplica', async () => {
  const c = client();
  await completeQuiz(c);
  const u = await register(c);
  const session = await auth.signIn({ email: u.email, password: 'secreta123' });
  const r = await client()('/api/auth/reset', { method: 'POST', body: { accessToken: session.access_token, password: 'otra-clave-99' } });
  assert.equal(r.body.code, 'INVALID_LINK');
  const [a, b] = await Promise.all([
    c('/api/checkout', { method: 'POST', body: { plan: 'mensual' } }),
    c('/api/checkout', { method: 'POST', body: { plan: 'mensual' } }),
  ]);
  assert.equal(a.body.url, b.body.url);
  const open = await db.service.rows(`select id from public.checkout_sessions where user_id = $1 and status = 'open'`, [u.id]);
  assert.equal(open.length, 1);
});

test('oferta de salida: no se reutiliza tras haber sido cliente', async () => {
  const { c, sub } = await payingUser();
  sub.status = 'canceled';
  await sendEvent('customer.subscription.deleted', sub);
  await c('/api/assessment/reset', { method: 'POST' });
  for (const [questionId, value] of Object.entries(ANSWERS)) await c('/api/assessment/answers', { method: 'PUT', body: { questionId, value } });
  await c('/api/assessment/complete', { method: 'POST' });
  assert.equal((await c('/api/exit-offer', { method: 'POST' })).body.offer, null);
  assert.equal((await c('/api/checkout', { method: 'POST', body: { plan: 'semanal', exitOffer: true } })).body.code, 'OFFER_UNAVAILABLE');
});

test('jornada completa: las 30 lecciones en orden, bloqueos, persistencia tras nuevo login y 100 %', async () => {
  const { c, user } = await payingUser();
  const all = JOURNEY.chapters.flatMap((ch, ci) => ch.lessons.map((l, li) => ({ ch, ci, l, li })));
  for (const [i, { ch, ci, l, li }] of all.entries()) {
    // La lección siguiente a la actual sigue bloqueada (también por URL directa).
    if (all[i + 1]) assert.equal((await c(`/api/app/journey/lessons/${all[i + 1].l.slug}`)).body.code, 'LOCKED', `bloqueada: ${all[i + 1].l.slug}`);
    const opened = await c(`/api/app/journey/lessons/${l.slug}`);
    assert.equal(opened.status, 200, `abre ${l.slug}`);
    assert.equal(opened.body.blocks.length, l.blocks.length);
    // No se puede completar sin cumplir los requisitos.
    assert.equal((await c(`/api/app/journey/lessons/${l.slug}/complete`, { method: 'POST' })).body.code, 'INCOMPLETE', `requisitos ${l.slug}`);
    // Cada pregunta con respuesta correcta: la incorrecta se marca como incorrecta.
    for (const b of l.blocks.filter((x) => x.type === 'multiple_choice' && x.correct)) {
      const wrong = b.options.find((o) => o.id !== b.correct);
      const r = await c(`/api/app/journey/lessons/${l.slug}/responses`, { method: 'POST', body: { blockId: b.id, response: { optionId: wrong.id } } });
      assert.equal(r.body.correct, false);
      assert.ok(r.body.feedback.length > 10, `feedback ${l.slug}/${b.id}`);
    }
    const done = await completeLessonVia(c, ci, li);
    if (li === ch.lessons.length - 1) assert.equal(done.chapterCompleted, true, `capítulo ${ch.number} completo`);
  }
  // Cierra sesión, vuelve a entrar: el progreso sigue ahí (otro "dispositivo").
  await c('/api/auth/logout', { method: 'POST' });
  const d = client();
  assert.equal((await d('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'secreta123' } })).status, 200);
  const j = (await d('/api/app/journey')).body;
  assert.equal(j.totals.completed, 30);
  assert.equal(j.totals.lessons, 30);
  assert.ok(j.chapters.every((ch) => ch.status === 'completed'));
  assert.equal(j.nextLesson, null);
  const ach = (await d('/api/app/achievements')).body.achievements;
  assert.ok(ach.find((a) => a.slug === 'primer-capitulo').unlocked_at);
  // Las lecciones completadas se pueden repasar.
  assert.equal((await d(`/api/app/journey/lessons/${all[0].l.slug}`)).body.lesson.status, 'completed');
});

// ---------------------------------------------------------------- multiprograma
async function buyProgram(c, program, plan = 'mensual') {
  const { body } = await c('/api/checkout', { method: 'POST', body: { program, plan, fromCatalog: true } });
  assert.ok(body.url, `checkout ${program}: ${JSON.stringify(body)}`);
  const sessionId = [...stripe.sessions.values()].find((s) => s.url === body.url).id;
  const { session, sub } = stripe.pay(sessionId);
  assert.equal(await sendEvent('checkout.session.completed', session), 200);
  return { session, sub };
}

/** Usuario que completa el embudo pero compra SOLO el programa indicado. */
async function programOnlyUser(program) {
  const c = client();
  await completeQuiz(c);
  const u = await register(c);
  const { body } = await c('/api/checkout', { method: 'POST', body: { program, plan: 'mensual', fromCatalog: true } });
  const sessionId = [...stripe.sessions.values()].find((s) => s.url === body.url).id;
  const { session, sub } = stripe.pay(sessionId);
  assert.equal(await sendEvent('checkout.session.completed', session), 200);
  return { c, user: u, sub };
}

test('multiprograma: catálogo, compra de un segundo programa y accesos independientes', async () => {
  // Publica alcohol en la base local para la prueba.
  await db.service.exec(`update public.journey_programs set commercial_status = 'active', published = true where slug = 'alcohol'`);
  await db.service.exec(`update public.journey_chapters set published = true where program_id = (select p.id from public.journey_programs p where p.slug = 'alcohol')`);
  await db.service.exec(`update public.journey_lessons set published = true where chapter_id in (select c.id from public.journey_chapters c join public.journey_programs p on p.id = c.program_id where p.slug = 'alcohol')`);

  const { c } = await payingUser();
  let cat = (await c('/api/programs')).body;
  assert.equal(cat.programs.length, 5);
  assert.equal(cat.programs.find((p) => p.slug === 'sem-fumo').state, 'active');
  assert.equal(cat.programs.find((p) => p.slug === 'alcohol').state, 'locked');
  assert.equal(cat.programs.find((p) => p.slug === 'azucar').state, 'coming_soon');

  // Sin acceso a alcohol: su jornada y sus registros responden 402.
  assert.equal((await c('/api/app/journey?program=alcohol')).body.code, 'SUBSCRIPTION_REQUIRED');
  assert.equal((await c('/api/app/programs/alcohol/activity', { method: 'POST', body: { kind: 'consumo', value: { nota: 'x' } } })).status, 402);

  // Compra alcohol desde el catálogo (sin cuestionario).
  const { sub } = await buyProgram(c, 'alcohol');
  assert.equal(sub.metadata.program, 'alcohol');
  cat = (await c('/api/programs')).body;
  assert.equal(cat.programs.find((p) => p.slug === 'alcohol').state, 'active');
  assert.equal(cat.programs.find((p) => p.slug === 'sem-fumo').state, 'active', 'sem-fumo sigue activo');

  // Ahora sí: jornada de alcohol con su propia cadena de desbloqueo (empieza en el capítulo 0).
  const j = (await c('/api/app/journey?program=alcohol')).body;
  assert.equal(j.totals.lessons, 30);
  assert.equal(j.chapters[0].lessons[0].status, 'available');
  assert.equal(j.chapters[0].lessons[1].status, 'locked');

  // Registro genérico de actividad: crear, listar, borrar.
  const created = await c('/api/app/programs/alcohol/activity', { method: 'POST', body: { kind: 'consumo', value: { nota: 'una copa el sábado' } } });
  assert.equal(created.status, 201);
  const list = (await c('/api/app/programs/alcohol/activity')).body.entries;
  assert.equal(list.length, 1);
  assert.equal(list[0].value.nota, 'una copa el sábado');
  assert.equal((await c(`/api/app/programs/alcohol/activity/${list[0].id}`, { method: 'DELETE' })).status, 200);

  // Recompra del mismo programa: bloqueada.
  assert.equal((await c('/api/checkout', { method: 'POST', body: { program: 'alcohol', plan: 'semanal', fromCatalog: true } })).body.code, 'ALREADY_SUBSCRIBED');

  // Último programa usado se guarda.
  await c('/api/programs/alcohol/last', { method: 'POST' });
  assert.equal((await c('/api/programs')).body.lastProgram, 'alcohol');

  // Programa no comercial: no se puede comprar.
  assert.equal((await c('/api/checkout', { method: 'POST', body: { program: 'azucar', plan: 'mensual', fromCatalog: true } })).body.code, 'PROGRAM_NOT_AVAILABLE');
});

test('multiprograma: acceso por programa — con solo Alcohol no hay acceso a las áreas de Sem Fumo', async () => {
  // Publica alcohol (la publicación se hace aquí solo para poder comprarlo en la prueba).
  await db.service.exec(`update public.journey_programs set commercial_status = 'active', published = true where slug = 'alcohol'`);
  await db.service.exec(`update public.journey_chapters set published = true where program_id = (select p.id from public.journey_programs p where slug = 'alcohol')`);
  await db.service.exec(`update public.journey_lessons set published = true where chapter_id in (select c.id from public.journey_chapters c join public.journey_programs p on p.id = c.program_id where p.slug = 'alcohol')`);

  const { c, user } = await programOnlyUser('alcohol');
  // El usuario pagó solo Alcohol: la jornada de ese programa sí está disponible.
  const alcohol = await c('/api/app/journey?program=alcohol');
  assert.equal(alcohol.status, 200, 'la jornada del programa comprado es accesible');
  assert.equal(alcohol.body.totals.lessons, 30);

  // …pero las áreas de Sem Fumo exigen acceso a ese programa concreto.
  assert.equal((await c('/api/app/smoking')).body.code, 'SUBSCRIPTION_REQUIRED', 'los registros de Sem Fumo están bloqueados');
  assert.equal((await c('/api/app/progress?program=sem-fumo')).body.code, 'SUBSCRIPTION_REQUIRED', 'el progreso de Sem Fumo está bloqueado');
  assert.equal((await c('/api/app/goals?program=sem-fumo')).body.code, 'SUBSCRIPTION_REQUIRED', 'los objetivos de Sem Fumo están bloqueados');
  assert.equal((await c('/api/app/dashboard')).body.code, 'SUBSCRIPTION_REQUIRED', 'el panel de Sem Fumo está bloqueado');
  assert.equal((await c('/api/app/onboarding', { method: 'PUT', body: { complete: true } })).body.code, 'SUBSCRIPTION_REQUIRED');

  // Continuar con Alcohol sigue disponible (el acceso no se pierde al usar otro programa).
  const again = await c('/api/app/journey?program=alcohol');
  assert.equal(again.status, 200);
  void user;
});

test('multiprograma: cancelar un programa no cancela los demás', async () => {
  await db.service.exec(`update public.journey_programs set commercial_status = 'active', published = true where slug = 'sueno'`);
  await db.service.exec(`update public.journey_chapters set published = true where program_id = (select p.id from public.journey_programs p where p.slug = 'sueno')`);
  await db.service.exec(`update public.journey_lessons set published = true where chapter_id in (select c.id from public.journey_chapters c join public.journey_programs p on p.id = c.program_id where p.slug = 'sueno')`);
  const { c, sub } = await payingUser();
  await buyProgram(c, 'sueno', 'semanal');
  // Cancela sem-fumo (webhook de Stripe).
  sub.cancel_at_period_end = true;
  assert.equal(await sendEvent('customer.subscription.updated', sub), 200);
  const cat = (await c('/api/programs')).body;
  assert.equal(cat.programs.find((p) => p.slug === 'sem-fumo').state, 'canceled_but_active');
  assert.equal(cat.programs.find((p) => p.slug === 'sueno').state, 'active');
  // Expira sem-fumo: pasa a expired; sueno sigue activo.
  sub.status = 'canceled'; sub.cancel_at_period_end = false;
  assert.equal(await sendEvent('customer.subscription.deleted', sub), 200);
  const cat2 = (await c('/api/programs')).body;
  assert.equal(cat2.programs.find((p) => p.slug === 'sem-fumo').state, 'expired');
  assert.equal(cat2.programs.find((p) => p.slug === 'sueno').state, 'active');
  // Sin acceso a sem-fumo: sus registros quedan bloqueados, la jornada de sueno no.
  assert.equal((await c('/api/app/smoking')).body.code, 'SUBSCRIPTION_REQUIRED');
  const js = (await c('/api/app/journey?program=sueno')).body;
  assert.equal(js.totals.lessons, 30, 'la jornada de sueno sigue accesible');
});

test('multiprograma: admin gestiona estados comerciales y publicación', async () => {
  const { user } = await payingUser();
  await db.service.exec('insert into public.admin_users (user_id) values ($1) on conflict do nothing', [user.id]);
  const c = client();
  assert.equal((await c('/api/auth/login', { method: 'POST', body: { email: user.email, password: 'secreta123' } })).status, 200);
  const programs = (await c('/api/admin/programs')).body.programs;
  assert.equal(programs.length, 5);
  assert.equal((await c('/api/admin/programs/azucar', { method: 'PATCH', body: { commercial_status: 'ready_for_review' } })).status, 200);
  assert.equal((await c('/api/admin/programs/azucar', { method: 'PATCH', body: { commercial_status: 'invalid' } })).status, 422);
  assert.equal((await c('/api/admin/programs/sem-fumo', { method: 'PATCH', body: { commercial_status: 'archived' } })).status, 409);
  // Un administrador no puede publicar ni vender contenido pendiente de revisión.
  await c('/api/admin/programs/azucar/publish-content', { method: 'POST', body: { publish: false } });
  assert.equal((await c('/api/admin/programs/azucar/publish-content', { method: 'POST', body: { publish: true } })).status, 409);
  assert.equal((await c('/api/admin/programs/azucar', { method: 'PATCH', body: { commercial_status: 'active' } })).status, 409);
  const row = await db.service.one(`select p.published as prog,
    (select count(*) from public.journey_lessons l join public.journey_chapters ch on ch.id = l.chapter_id
     where ch.program_id = p.id and l.published)::int as pub
    from public.journey_programs p where p.slug = 'azucar'`);
  assert.equal(row.prog, false);
  assert.equal(row.pub, 0);
  // El contenido por programa se filtra.
  const content = (await c('/api/admin/content?program=azucar')).body;
  assert.equal(content.chapters.length, 10);
});
