// Canal de notificaciones Web Push (VAPID). Solo envía a quien dio su consentimiento,
// en las categorías elegidas y una sola vez por recordatorio (clave de deduplicación).
import webpush from 'web-push';
import { addDays, todayIn } from './stats.js';

const WINDOW_MIN = 30; // el recordatorio sale si la tarea programada pasa dentro de esta ventana

function localClock(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { minutes: Number(get('hour')) * 60 + Number(get('minute')), weekday: get('weekday'), day: todayIn(tz, date) };
}

const toMinutes = (time) => { const [h, m] = String(time).slice(0, 5).split(':').map(Number); return h * 60 + m; };

export function createNotifier({ db, config, log = console, sender = (sub, body, opts) => webpush.sendNotification(sub, body, opts) }) {
  const { publicKey, privateKey, subject } = config.push;
  const enabled = Boolean(publicKey && privateKey);
  if (enabled) webpush.setVapidDetails(subject, publicKey, privateKey);

  /** Envía a todos los dispositivos del usuario. Devuelve 'sent' | 'duplicate' | 'no-devices' | 'failed' | 'disabled'. */
  async function send(userId, category, dedupeKey, payload) {
    if (!enabled) return 'disabled';
    const row = await db.service.one(`
      insert into public.notification_deliveries (user_id, category, channel, status, scheduled_for, dedupe_key, title)
      values ($1, $2, 'push', 'pending', now(), $3, $4)
      on conflict (user_id, category, dedupe_key) where dedupe_key is not null do nothing returning id`,
    [userId, category, dedupeKey, payload.title]);
    if (!row) return 'duplicate';
    const subs = await db.service.rows('select * from public.push_subscriptions where user_id = $1', [userId]);
    if (!subs.length) {
      await db.service.exec(`update public.notification_deliveries set status = 'skipped', error = 'sin dispositivos' where id = $1`, [row.id]);
      return 'no-devices';
    }
    let ok = 0;
    let lastError = null;
    for (const s of subs) {
      try {
        await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal' });
        ok += 1;
        await db.service.exec('update public.push_subscriptions set last_success_at = now(), failures = 0 where id = $1', [s.id]);
      } catch (err) {
        lastError = `${err.statusCode ?? ''} ${err.body ?? err.message}`.trim().slice(0, 300);
        // 404/410: el navegador anuló la suscripción → se elimina.
        if (err.statusCode === 404 || err.statusCode === 410) await db.service.exec('delete from public.push_subscriptions where id = $1', [s.id]);
        else await db.service.exec('update public.push_subscriptions set failures = failures + 1 where id = $1', [s.id]);
      }
    }
    await db.service.exec(`update public.notification_deliveries set status = $2, sent_at = case when $2 = 'sent' then now() end, error = $3 where id = $1`,
      [row.id, ok ? 'sent' : 'failed', ok ? null : lastError]);
    return ok ? 'sent' : 'failed';
  }

  /** Destinatarios: consentimiento activo, acceso premium y al menos un dispositivo. */
  async function recipients() {
    return db.service.rows(`
      select n.*, p.name from public.notification_preferences n
      join public.profiles p on p.user_id = n.user_id
      where n.enabled and n.consent_at is not null and public.has_premium(n.user_id)
        and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)`);
  }

  async function dailyMessage(r, day) {
    const parts = [];
    if (r.tracking) {
      const logged = await db.service.one(`select (exists (select 1 from public.smoking_entries where user_id = $1 and (smoked_at at time zone $2)::date = $3::date)
        or exists (select 1 from public.daily_checkins where user_id = $1 and day = $3::date)) as ok`, [r.user_id, r.timezone, day]);
      if (!logged.ok) parts.push('Registra cómo va tu día: cada dato cuenta.');
    }
    if (r.lessons) {
      const next = await db.service.one(`
        select l.title from public.journey_lessons l join public.journey_chapters c on c.id = l.chapter_id
        where l.published and c.published and not exists (
          select 1 from public.user_lesson_progress p where p.user_id = $1 and p.lesson_id = l.id and p.status = 'completed')
        order by c.number, l.position limit 1`, [r.user_id]);
      if (next) parts.push(`Tu próxima lección: «${next.title}».`);
    }
    return parts.length ? { title: `Hola, ${r.name.split(' ')[0]}`, body: parts.join(' '), url: '/dashboard', tag: 'daily' } : null;
  }

  /** Ejecutar periódicamente (cada 5–15 min). Envía lo que toque según la hora local de cada usuario. */
  async function runDue(now = new Date()) {
    const out = { checked: 0, sent: 0, skipped: 0 };
    if (!enabled) return { ...out, disabled: true };
    for (const r of await recipients()) {
      out.checked += 1;
      const clock = localClock(r.timezone, now);
      const due = clock.minutes >= toMinutes(r.reminder_time) && clock.minutes < toMinutes(r.reminder_time) + WINDOW_MIN;
      if (!due) continue;
      const results = [];
      const daily = await dailyMessage(r, clock.day);
      if (daily) results.push(await send(r.user_id, 'daily', `daily:${clock.day}`, daily));
      if (r.weekly_summary && clock.weekday === 'Mon') {
        const s = await db.service.one(`
          select coalesce(sum(quantity), 0)::int as cigs,
            (select count(*) from public.daily_checkins where user_id = $1 and day between $3::date and $4::date)::int as free_days
          from public.smoking_entries where user_id = $1 and (smoked_at at time zone $2)::date between $3::date and $4::date`,
        [r.user_id, r.timezone, addDays(clock.day, -7), addDays(clock.day, -1)]);
        results.push(await send(r.user_id, 'weekly_summary', `weekly:${clock.day}`, {
          title: 'Tu resumen semanal', url: '/progreso', tag: 'weekly',
          body: `La semana pasada registraste ${s.cigs} ${s.cigs === 1 ? 'cigarrillo' : 'cigarrillos'} y ${s.free_days} ${s.free_days === 1 ? 'día' : 'días'} sin fumar. Mira tu evolución.`,
        }));
      }
      if (r.exercises && clock.weekday === 'Thu') {
        const g = await db.service.one(`select g.exercise_per_week as goal,
          (select count(*) from public.breathing_sessions b where b.user_id = $1 and b.completed_at > now() - interval '7 days')::int as done
          from public.user_goals g where g.user_id = $1 and g.superseded_at is null`, [r.user_id]);
        if (g && g.done < g.goal) {
          results.push(await send(r.user_id, 'exercises', `exercises:${clock.day}`, {
            title: 'Un minuto para ti', url: '/respirar', tag: 'exercise',
            body: `Llevas ${g.done} de ${g.goal} ejercicios de respiración esta semana. ¿Hacemos uno ahora?`,
          }));
        }
      }
      out.sent += results.filter((x) => x === 'sent').length;
      out.skipped += results.filter((x) => x !== 'sent').length;
    }
    return out;
  }

  /** Aviso inmediato de logro desbloqueado (si el usuario lo eligió). No bloquea la petición. */
  function notifyAchievements(userId, achievements) {
    if (!enabled || !achievements?.length) return;
    (async () => {
      const p = await db.service.one('select enabled, consent_at, achievements from public.notification_preferences where user_id = $1', [userId]);
      if (!p?.enabled || !p.consent_at || !p.achievements) return;
      for (const a of achievements) {
        await send(userId, 'achievements', `ach:${a.slug}`, { title: '¡Nuevo logro!', body: `${a.title}: ${a.description}`, url: '/logros', tag: `ach-${a.slug}` });
      }
    })().catch((err) => log.error('[push] logro:', err.message));
  }

  async function test(userId) {
    return send(userId, 'test', `test:${Date.now()}`, {
      title: 'Aliento', body: 'Las notificaciones funcionan en este dispositivo.', url: '/notificaciones', tag: 'test',
    });
  }

  return { enabled, publicKey, send, runDue, notifyAchievements, test };
}
