// Canal de notificaciones Web Push (VAPID). Solo envía a quien dio su consentimiento,
// en las categorías elegidas y una sola vez por recordatorio (clave de deduplicación).
import webpush from 'web-push';

const WINDOW_MIN = 30; // el recordatorio sale si la tarea programada pasa dentro de esta ventana

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
          JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'normal', timeout: 5000 });
        ok += 1;
        await db.service.exec('update public.push_subscriptions set last_success_at = now(), failures = 0 where id = $1', [s.id]);
      } catch (err) {
        lastError = err.statusCode ? `HTTP ${err.statusCode}` : 'error de red'; // sin guardar el cuerpo remoto
        // 404/410: el navegador anuló la suscripción → se elimina.
        if (err.statusCode === 404 || err.statusCode === 410) await db.service.exec('delete from public.push_subscriptions where id = $1', [s.id]);
        else await db.service.exec('update public.push_subscriptions set failures = failures + 1 where id = $1', [s.id]);
      }
    }
    await db.service.exec(`update public.notification_deliveries set status = $2, sent_at = case when $2 = 'sent' then now() end, error = $3 where id = $1`,
      [row.id, ok ? 'sent' : 'failed', ok ? null : lastError]);
    return ok ? 'sent' : 'failed';
  }

  /**
   * Destinatarios a los que les toca AHORA (hora local dentro de la ventana) y que aún no
   * recibieron el recordatorio de hoy. Selección en SQL, por lotes.
   */
  async function dueRecipients(limit) {
    return db.service.rows(`
      select n.*, p.name, (now() at time zone n.timezone)::date::text as local_day,
             trim(to_char(now() at time zone n.timezone, 'Dy')) as local_weekday
      from public.notification_preferences n
      join public.profiles p on p.user_id = n.user_id
      where n.enabled and n.consent_at is not null
        and (extract(epoch from ((now() at time zone n.timezone)::time - n.reminder_time))::int + 86400) % 86400 < $1
        and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)
        and not exists (select 1 from public.notification_deliveries d where d.user_id = n.user_id and d.category = 'daily'
                        and d.dedupe_key = 'daily:' || (now() at time zone n.timezone)::date::text)
        and public.has_premium(n.user_id)
      order by n.user_id
      limit $2`, [WINDOW_MIN * 60, limit]);
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

  async function processRecipient(r) {
    const results = [];
    const day = r.local_day;
    const daily = await dailyMessage(r, day);
    // Siempre se marca el día (aunque no haya nada que decir) para no volver a evaluarlo.
    results.push(daily ? await send(r.user_id, 'daily', `daily:${day}`, daily)
      : await markSkipped(r.user_id, 'daily', `daily:${day}`));
    if (r.weekly_summary && r.local_weekday === 'Mon') {
      results.push(await send(r.user_id, 'weekly_summary', `weekly:${day}`, {
        // Sin cifras de salud en la pantalla de bloqueo.
        title: 'Tu resumen semanal está listo', url: '/progreso', tag: 'weekly',
        body: 'Mira cómo fue tu semana y qué puedes ajustar en la próxima.',
      }));
    }
    if (r.exercises && r.local_weekday === 'Thu') {
      const g = await db.service.one(`select g.exercise_per_week as goal,
        (select count(*) from public.breathing_sessions b where b.user_id = $1 and b.completed_at > now() - interval '7 days')::int as done
        from public.user_goals g where g.user_id = $1 and g.superseded_at is null`, [r.user_id]);
      if (g && g.done < g.goal) {
        results.push(await send(r.user_id, 'exercises', `exercises:${day}`, {
          title: 'Un minuto para ti', url: '/respirar', tag: 'exercise',
          body: 'Un ejercicio de respiración corto puede ayudarte hoy. ¿Lo hacemos?',
        }));
      }
    }
    return results;
  }

  async function markSkipped(userId, category, dedupeKey) {
    await db.service.exec(`insert into public.notification_deliveries (user_id, category, channel, status, scheduled_for, dedupe_key)
      values ($1, $2, 'push', 'skipped', now(), $3) on conflict (user_id, category, dedupe_key) where dedupe_key is not null do nothing`,
    [userId, category, dedupeKey]);
    return 'skipped';
  }

  /**
   * Ejecutar periódicamente (cada 5–15 min). Procesa por lotes, con envíos en paralelo y un
   * presupuesto de tiempo dentro del límite de la función; si no termina, `more: true` y la
   * siguiente ejecución continúa (los ya enviados no se repiten).
   */
  async function runDue({ budgetMs = 22_000, batch = 200, concurrency = 20 } = {}) {
    const out = { checked: 0, sent: 0, skipped: 0, more: false };
    if (!enabled) return { ...out, disabled: true };
    const started = Date.now();
    // Envíos que quedaron "pending" (la función se cortó a medias): se liberan para reintentar.
    await db.service.exec(`delete from public.notification_deliveries where status = 'pending' and scheduled_for < now() - interval '15 minutes'`);
    while (Date.now() - started < budgetMs) {
      const list = await dueRecipients(batch);
      if (!list.length) return out;
      for (let i = 0; i < list.length; i += concurrency) {
        const results = await Promise.allSettled(list.slice(i, i + concurrency).map(processRecipient));
        for (const r of results) {
          out.checked += 1;
          const vals = r.status === 'fulfilled' ? r.value : ['failed'];
          out.sent += vals.filter((x) => x === 'sent').length;
          out.skipped += vals.filter((x) => x !== 'sent').length;
        }
        if (Date.now() - started >= budgetMs) { out.more = true; return out; }
      }
      if (list.length < batch) return out;
    }
    out.more = true;
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
      title: 'Alento', body: 'Las notificaciones funcionan en este dispositivo.', url: '/notificaciones', tag: 'test',
    });
  }

  return { enabled, publicKey, send, runDue, notifyAchievements, test };
}
