// Área de administración. Acceso: tabla admin_users (nadie puede escribirla desde la app).
// Toda modificación queda en admin_audit_logs.
import { Router } from 'express';
import { replaceBlocks, validateLesson } from '../services/journey.js';
import { HttpError, int, requireAdmin, text, uuid, wrap } from './util.js';

export function adminRoutes({ db }) {
  const r = Router();
  r.use(requireAdmin(db));
  const q = db.service;

  const audit = (qq, req, action, entity, entityId, details = {}) => qq.exec(`
    insert into public.admin_audit_logs (admin_user_id, action, entity, entity_id, details) values ($1, $2, $3, $4, $5)`,
  [req.user.id, action, entity, entityId, JSON.stringify(details)]);

  r.get('/overview', wrap(async (req, res) => {
    const one = (sql) => q.one(sql);
    const [funnel, subs, revenue, retention, errors] = await Promise.all([
      one(`select
        (select count(*) from public.questionnaire_sessions)::int as started,
        (select count(*) from public.questionnaire_sessions where completed_at is not null)::int as completed,
        (select count(*) from public.profiles)::int as accounts,
        (select count(distinct user_id) from public.subscriptions)::int as paying`),
      q.rows(`select status, count(*)::int as total from public.subscriptions group by status order by total desc`),
      // Ingreso recurrente mensual normalizado (suscripciones con acceso), en céntimos por moneda.
      q.rows(`select currency, round(sum(case interval
          when 'week' then amount * 52.0 / 12 / interval_count
          when 'month' then amount * 1.0 / interval_count
          when 'year' then amount / 12.0 / interval_count end))::int as mrr
        from public.subscriptions where status in ('active', 'trialing', 'past_due') and amount is not null group by currency`),
      one(`select
        (select count(distinct user_id) from public.subscriptions where status in ('active','trialing','past_due'))::int as active_users,
        (select count(distinct user_id) from (
          select user_id from public.smoking_entries where created_at > now() - interval '7 days'
          union select user_id from public.daily_checkins where created_at > now() - interval '7 days'
          union select user_id from public.user_lesson_progress where started_at > now() - interval '7 days'
          union select user_id from public.mood_entries where updated_at > now() - interval '7 days') t)::int as active_7d`),
      q.rows(`select id, type, error, received_at from public.billing_events where status = 'failed' order by received_at desc limit 20`),
    ]);
    const reviews = await one(`select count(*)::int as open from public.billing_reconciliation_reviews where status = 'open'`);
    res.json({ funnel, subscriptions: subs, revenue, retention, failedWebhooks: errors, openReviews: reviews.open });
  }));

  r.get('/users', wrap(async (req, res) => {
    const search = text(req.query.q, { max: 120 });
    const rows = await q.rows(`
      select p.user_id, u.email, p.name, p.created_at, p.onboarded_at,
        (select status from public.subscriptions s where s.user_id = p.user_id order by updated_at desc limit 1) as subscription,
        (select count(*) from public.user_lesson_progress l where l.user_id = p.user_id and l.status = 'completed')::int as lessons
      from public.profiles p join auth.users u on u.id = p.user_id
      where $1::text is null or u.email ilike '%' || $1 || '%' or p.name ilike '%' || $1 || '%'
      order by p.created_at desc limit 100`, [search]);
    res.json({ users: rows });
  }));

  r.get('/subscriptions', wrap(async (req, res) => {
    res.json({
      subscriptions: await q.rows(`select s.id, u.email, s.plan, s.status, s.amount, s.currency, s.interval, s.current_period_end,
          s.cancel_at_period_end, s.updated_at
        from public.subscriptions s join auth.users u on u.id = s.user_id order by s.updated_at desc limit 200`),
      reviews: await q.rows('select * from public.billing_reconciliation_reviews order by status, created_at desc limit 100'),
    });
  }));

  r.post('/reviews/:id/resolve', wrap(async (req, res) => {
    const id = uuid(req.params.id);
    await db.tx(async (qq) => {
      const n = await qq.exec(`update public.billing_reconciliation_reviews set status = 'resolved', resolved_at = now() where id = $1`, [id]);
      if (!n) throw new HttpError(404, 'Revisión no encontrada.');
      await audit(qq, req, 'review.resolved', 'billing_review', id, { note: text(req.body?.note, { max: 500 }) });
    });
    res.json({ ok: true });
  }));

  // ---------------------------------------------------------------- contenido
  // ------------------------------------------------------------- programas
  r.get('/programs', wrap(async (req, res) => {
    const rows = await q.rows(`
      select p.slug, p.title, p.name, p.tagline, p.color, p.icon, p.position, p.theme, p.commercial_status, p.published,
        (select count(*) from public.journey_chapters c where c.program_id = p.id)::int as chapters,
        (select count(*) from public.journey_lessons l join public.journey_chapters c on c.id = l.chapter_id where c.program_id = p.id)::int as lessons,
        (select count(*) from public.journey_lessons l join public.journey_chapters c on c.id = l.chapter_id
          where c.program_id = p.id and l.clinical_review = 'approved')::int as reviewed
      from public.journey_programs p order by p.position`);
    res.json({ programs: rows });
  }));

  const COMMERCIAL = ['coming_soon', 'ready_for_review', 'active', 'paused', 'archived'];
  r.patch('/programs/:slug', wrap(async (req, res) => {
    const slug = String(req.params.slug);
    const status = String(req.body?.commercial_status ?? '');
    if (!COMMERCIAL.includes(status)) throw new HttpError(422, 'Estado no válido.', 'INVALID', { field: 'commercial_status' });
    if (slug === 'sem-fumo' && status === 'archived') throw new HttpError(409, 'Sem Fumo no se puede archivar.');
    await db.tx(async (qq) => {
      if (status === 'active') {
        const readiness = await qq.one(`select count(*)::int as total,
          count(*) filter (where l.clinical_review = 'approved' and l.published)::int as approved
          from public.journey_lessons l join public.journey_chapters c on c.id = l.chapter_id
          join public.journey_programs p on p.id = c.program_id where p.slug = $1`, [slug]);
        if (!readiness.total || readiness.approved !== readiness.total) throw new HttpError(409, 'El contenido requiere revisión clínica y publicación.', 'CLINICAL_REVIEW_REQUIRED');
      }
      const n = await qq.exec('update public.journey_programs set commercial_status = $1 where slug = $2', [status, slug]);
      if (!n) throw new HttpError(404, 'Programa no encontrado.');
      await audit(qq, req, 'program.commercial_status', 'program', slug, { status });
    });
    res.json({ ok: true });
  }));

  // Publica (o despublica) TODO el contenido de un programa de una vez.
  r.post('/programs/:slug/publish-content', wrap(async (req, res) => {
    const slug = String(req.params.slug);
    const publish = req.body?.publish !== false;
    await db.tx(async (qq) => {
      const p = await qq.one('select id, commercial_status from public.journey_programs where slug = $1', [slug]);
      if (!p) throw new HttpError(404, 'Programa no encontrado.');
      if (publish) {
        const readiness = await qq.one(`select count(*)::int as total,
          count(*) filter (where clinical_review = 'approved')::int as approved
          from public.journey_lessons where chapter_id in (select id from public.journey_chapters where program_id = $1)`, [p.id]);
        if (!readiness.total || readiness.approved !== readiness.total) throw new HttpError(409, 'Hay lecciones pendientes de revisión clínica.', 'CLINICAL_REVIEW_REQUIRED');
      }
      await qq.exec('update public.journey_chapters set published = $2, updated_at = now() where program_id = $1', [p.id, publish]);
      await qq.exec(`update public.journey_lessons set published = $2, updated_at = now()
        where chapter_id in (select id from public.journey_chapters where program_id = $1)`, [p.id, publish]);
      await qq.exec('update public.journey_programs set published = $2 where id = $1', [p.id, publish]);
      await audit(qq, req, publish ? 'program.content_published' : 'program.content_unpublished', 'program', slug, {});
    });
    res.json({ ok: true });
  }));

  r.get('/content', wrap(async (req, res) => {
    const program = String(req.query.program ?? 'sem-fumo');
    const chapters = await q.rows(`select c.id, c.slug, c.number, c.title, c.description, c.published
      from public.journey_chapters c join public.journey_programs p on p.id = c.program_id
      where p.slug = $1 order by c.number`, [program]);
    const lessons = await q.rows(`select l.id, l.chapter_id, l.slug, l.position, l.title, l.minutes, l.published, l.version, l.clinical_review, l.clinical_reviewer,
      (select count(*) from public.user_lesson_progress p where p.lesson_id = l.id and p.status = 'completed')::int as completions
      from public.journey_lessons l where l.chapter_id = any($1) order by l.position`,
    [chapters.map((c) => c.id)]);
    res.json({ chapters: chapters.map((c) => ({ ...c, lessons: lessons.filter((l) => l.chapter_id === c.id) })) });
  }));

  r.post('/chapters', wrap(async (req, res) => {
    const program = await q.one('select id from public.journey_programs where slug = $1', [String(req.body?.program ?? 'sem-fumo')]);
    if (!program) throw new HttpError(409, 'Primero carga el programa (npm run content:seed).');
    const slug = slugify(req.body?.slug || req.body?.title);
    const row = await db.tx(async (qq) => {
      const max = await qq.one('select coalesce(max(number), -1) + 1 as n from public.journey_chapters where program_id = $1', [program.id]);
      const c = await qq.one(`insert into public.journey_chapters (program_id, slug, number, title, description, published)
        values ($1, $2, $3, $4, $5, false) returning *`,
      [program.id, slug, max.n, text(req.body?.title, { max: 120, required: true }), text(req.body?.description, { max: 400, required: true })]);
      await audit(qq, req, 'chapter.created', 'chapter', c.id, { slug });
      return c;
    });
    res.status(201).json({ chapter: row });
  }));

  r.patch('/chapters/:id', wrap(async (req, res) => {
    const id = uuid(req.params.id);
    const b = req.body ?? {};
    const row = await db.tx(async (qq) => {
      const c = await qq.one(`update public.journey_chapters set
        title = coalesce($2, title), description = coalesce($3, description),
        published = coalesce($4, published), number = coalesce($5, number), updated_at = now()
        where id = $1 returning *`,
      [id, text(b.title, { max: 120 }), text(b.description, { max: 400 }), typeof b.published === 'boolean' ? b.published : null,
        b.number == null ? null : int(b.number, { min: 0, max: 999, field: 'number' })]);
      if (!c) throw new HttpError(404, 'Capítulo no encontrado.');
      await audit(qq, req, 'chapter.updated', 'chapter', id, b);
      return c;
    });
    res.json({ chapter: row });
  }));

  r.get('/lessons/:id', wrap(async (req, res) => {
    const id = uuid(req.params.id);
    const lesson = await q.one('select * from public.journey_lessons where id = $1', [id]);
    if (!lesson) throw new HttpError(404, 'Lección no encontrada.');
    const blocks = await q.rows('select block_key, type, content from public.lesson_blocks where lesson_id = $1 order by position', [id]);
    res.json({ lesson, blocks: blocks.map((b) => ({ id: b.block_key, type: b.type, ...b.content })) });
  }));

  r.post('/lessons', wrap(async (req, res) => {
    const chapterId = uuid(req.body?.chapterId, 'chapterId');
    const draft = lessonInput(req.body, { slug: slugify(req.body?.slug || req.body?.title) });
    const row = await db.tx(async (qq) => {
      const pos = await qq.one('select coalesce(max(position), 0) + 1 as n from public.journey_lessons where chapter_id = $1', [chapterId]);
      const l = await qq.one(`insert into public.journey_lessons (chapter_id, slug, position, title, description, minutes, published)
        values ($1, $2, $3, $4, $5, $6, false) returning *`, [chapterId, draft.slug, pos.n, draft.title, draft.description, draft.minutes]);
      await replaceBlocks(qq, l.id, draft.blocks);
      await audit(qq, req, 'lesson.created', 'lesson', l.id, { slug: draft.slug });
      return l;
    });
    res.status(201).json({ lesson: row });
  }));

  r.put('/lessons/:id', wrap(async (req, res) => {
    const id = uuid(req.params.id);
    const row = await db.tx(async (qq) => {
      const cur = await qq.one('select * from public.journey_lessons where id = $1 for update', [id]);
      if (!cur) throw new HttpError(404, 'Lección no encontrada.');
      const draft = lessonInput(req.body, { slug: cur.slug });
      const changed = await replaceBlocks(qq, id, draft.blocks);
      const contentChanged = changed || draft.title !== cur.title || draft.description !== cur.description;
      if (req.body?.published === true && !cur.published && (contentChanged || cur.clinical_review !== 'approved')) throw new HttpError(409, 'Guarda el borrador y solicita revisión antes de publicar.', 'CLINICAL_REVIEW_REQUIRED');
      if (contentChanged) await qq.exec("update public.journey_lessons set clinical_review = 'pending', clinical_reviewer = null, clinical_reviewed_at = null where id = $1", [id]);
      const l = await qq.one(`update public.journey_lessons set title = $2, description = $3, minutes = $4,
        published = $5, version = version + $6, updated_at = now() where id = $1 returning *`,
      [id, draft.title, draft.description, draft.minutes, req.body?.published === true, contentChanged ? 1 : 0]);
      await audit(qq, req, 'lesson.updated', 'lesson', id, { blocksChanged: changed, published: l.published });
      return l;
    });
    res.json({ lesson: row });
  }));

  // Revisión clínica: solo con el nombre del profesional que la realizó (queda en la auditoría).
  r.post('/lessons/:id/review', wrap(async (req, res) => {
    const id = uuid(req.params.id);
    const approved = req.body?.status === 'approved';
    const reviewer = text(req.body?.reviewer, { max: 120, required: approved, field: 'reviewer' });
    await db.tx(async (qq) => {
      const n = await qq.exec(`update public.journey_lessons set clinical_review = $2, clinical_reviewer = $3,
        clinical_reviewed_at = case when $2 = 'approved' then now() end,
        published = case when $2 = 'approved' then published else false end where id = $1`, [id, approved ? 'approved' : 'pending', approved ? reviewer : null]);
      if (!n) throw new HttpError(404, 'Lección no encontrada.');
      await audit(qq, req, approved ? 'lesson.clinical_approved' : 'lesson.clinical_pending', 'lesson', id, { reviewer });
    });
    res.json({ ok: true });
  }));

  r.post('/lessons/:id/move', wrap(async (req, res) => {
    const id = uuid(req.params.id);
    const dir = req.body?.direction === 'up' ? -1 : 1;
    await db.tx(async (qq) => {
      const l = await qq.one('select * from public.journey_lessons where id = $1', [id]);
      if (!l) throw new HttpError(404, 'Lección no encontrada.');
      const other = await qq.one(`select * from public.journey_lessons where chapter_id = $1 and position ${dir < 0 ? '<' : '>'} $2
        order by position ${dir < 0 ? 'desc' : 'asc'} limit 1`, [l.chapter_id, l.position]);
      if (!other) return;
      await qq.exec('update public.journey_lessons set position = $2 where id = $1', [l.id, other.position]);
      await qq.exec('update public.journey_lessons set position = $2 where id = $1', [other.id, l.position]);
      await audit(qq, req, 'lesson.moved', 'lesson', id, { direction: req.body?.direction });
    });
    res.json({ ok: true });
  }));

  r.get('/audit', wrap(async (req, res) => {
    res.json({ logs: await q.rows(`select l.action, l.entity, l.entity_id, l.details, l.created_at, u.email as admin
      from public.admin_audit_logs l left join auth.users u on u.id = l.admin_user_id order by l.created_at desc limit 200`) });
  }));

  return r;
}

function slugify(v) {
  const s = String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!s) throw new HttpError(422, 'Escribe un título.', 'INVALID', { field: 'title' });
  return s;
}

/** Valida una lección editada: misma validación que el contenido cargado por script. */
function lessonInput(body, { slug }) {
  const lesson = {
    slug,
    title: String(body?.title ?? '').trim(),
    description: String(body?.description ?? '').trim(),
    minutes: Number(body?.minutes),
    blocks: Array.isArray(body?.blocks) ? body.blocks : [],
  };
  const errors = validateLesson(lesson);
  if (errors.length) throw new HttpError(422, 'La lección tiene errores.', 'INVALID_CONTENT', { errors });
  return lesson;
}
