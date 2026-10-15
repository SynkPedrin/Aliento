// Motor de la jornada: capítulos → lecciones → bloques.
// El estado (bloqueada / disponible / en curso / completada) se calcula siempre en el servidor;
// el progreso solo lo escribe el servidor tras validar las respuestas.

export const BLOCK_TYPES = ['educational_text', 'multiple_choice', 'reflection', 'interactive_exercise',
  'breathing_exercise', 'commitment', 'feedback', 'completion'];
const INTERACTIVE = new Set(['multiple_choice', 'reflection', 'interactive_exercise', 'breathing_exercise', 'commitment']);

export class JourneyError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ------------------------------------------------------------------ validación de contenido
/** Comprueba la estructura de una lección. Devuelve la lista de errores (vacía si es válida). */
export function validateLesson(lesson) {
  const errors = [];
  const where = `Lección «${lesson?.slug ?? '?'}»`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(lesson?.slug ?? '')) errors.push(`${where}: slug no válido`);
  if (!lesson?.title?.trim()) errors.push(`${where}: falta el título`);
  if (!lesson?.description?.trim()) errors.push(`${where}: falta la descripción`);
  if (!Number.isInteger(lesson?.minutes) || lesson.minutes < 1 || lesson.minutes > 60) errors.push(`${where}: duración no válida`);
  const blocks = Array.isArray(lesson?.blocks) ? lesson.blocks : [];
  if (!blocks.length) errors.push(`${where}: no tiene bloques`);
  const ids = new Set();
  blocks.forEach((b, i) => {
    const w = `${where}, bloque ${i + 1}`;
    if (!BLOCK_TYPES.includes(b?.type)) { errors.push(`${w}: tipo no válido`); return; }
    if (!b.id || ids.has(b.id)) errors.push(`${w}: id vacío o repetido`);
    ids.add(b.id);
    if (b.type === 'educational_text' && !b.body?.trim()) errors.push(`${w}: texto vacío`);
    if (b.type === 'multiple_choice') {
      const opts = Array.isArray(b.options) ? b.options : [];
      if (!b.question?.trim() || opts.length < 2) errors.push(`${w}: pregunta u opciones incompletas`);
      if (b.correct != null && !opts.some((o) => o.id === b.correct)) errors.push(`${w}: respuesta correcta inexistente`);
      if (opts.some((o) => !b.feedback?.[o.id])) errors.push(`${w}: falta la retroalimentación de alguna opción`);
    }
    if (b.type === 'reflection' && !b.prompt?.trim()) errors.push(`${w}: falta la pregunta`);
    if (b.type === 'interactive_exercise') {
      const items = Array.isArray(b.items) ? b.items : [];
      if (!(b.prompt ?? b.title)?.trim()) errors.push(`${w}: ejercicio sin título`);
      if (!items.length || !(b.minSelected >= 0) || b.minSelected > items.length) errors.push(`${w}: ejercicio incompleto`);
    }
    if (b.type === 'breathing_exercise' && !(b.pattern?.inhale > 0 && b.pattern?.exhale > 0 && b.cycles > 0)) errors.push(`${w}: patrón no válido`);
    if (b.type === 'commitment' && !b.statement?.trim()) errors.push(`${w}: compromiso vacío`);
  });
  if (blocks.at(-1)?.type !== 'completion' || blocks.filter((b) => b.type === 'completion').length !== 1) {
    errors.push(`${where}: debe terminar con un único bloque de cierre`);
  }
  if (!blocks.some((b) => INTERACTIVE.has(b.type))) errors.push(`${where}: necesita al menos un bloque interactivo`);
  // Debe haber al menos un paso obligatorio: si todo es opcional, la lección se "completa" sin hacer nada.
  const required = blocks.some((b) => ['multiple_choice', 'breathing_exercise', 'commitment'].includes(b.type)
    || (b.type === 'reflection' && b.required !== false) || (b.type === 'interactive_exercise' && b.minSelected > 0));
  if (!required) errors.push(`${where}: necesita al menos un paso obligatorio para poder completarse`);
  const text = JSON.stringify(lesson ?? {}).toLowerCase();
  for (const bad of ['lorem', 'próximamente', 'texto pendiente', 'contenido pendiente']) {
    if (text.includes(bad)) errors.push(`${where}: contiene texto provisional («${bad}»)`);
  }
  return errors;
}

// ------------------------------------------------------------------ carga de contenido
/**
 * Carga (o actualiza) el programa en la base. No destructivo para los usuarios: las respuestas y el
 * progreso se conservan; si cambian los bloques de una lección, su versión aumenta.
 */
export async function seedJourney(db, journey, { publish = true } = {}) {
  const errors = journey.chapters.flatMap((c) => c.lessons.flatMap(validateLesson));
  if (errors.length) throw new Error(`Contenido no válido:\n- ${errors.join('\n- ')}`);
  return db.tx(async (q) => {
    const program = await q.one(`
      insert into public.journey_programs (slug, title, version, published) values ($1, $2, $3, $4)
      on conflict (slug) do update set title = excluded.title, version = excluded.version, published = excluded.published
      returning id`, [journey.program.slug, journey.program.title, journey.program.version, publish]);
    let lessonsChanged = 0;
    for (const ch of journey.chapters) {
      const chapter = await q.one(`
        insert into public.journey_chapters (program_id, slug, number, title, description, published)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (program_id, slug) do update set number = excluded.number, title = excluded.title,
          description = excluded.description, published = excluded.published, updated_at = now()
        returning id`, [program.id, ch.slug, ch.number, ch.title, ch.description, publish]);
      for (const [i, l] of ch.lessons.entries()) {
        const lesson = await q.one(`
          insert into public.journey_lessons (chapter_id, slug, position, title, description, minutes, published)
          values ($1, $2, $3, $4, $5, $6, $7)
          on conflict (slug) do update set chapter_id = excluded.chapter_id, position = excluded.position,
            title = excluded.title, description = excluded.description, minutes = excluded.minutes,
            published = excluded.published, updated_at = now()
          returning id, version, (xmax = 0) as inserted`, [chapter.id, l.slug, i + 1, l.title, l.description, l.minutes, publish]);
        const changed = await replaceBlocks(q, lesson.id, l.blocks);
        if (changed && !lesson.inserted) {
          // Contenido modificado: nueva versión y la revisión clínica vuelve a quedar pendiente.
          await q.exec(`update public.journey_lessons set version = version + 1, clinical_review = 'pending',
            clinical_reviewer = null, clinical_reviewed_at = null where id = $1`, [lesson.id]);
        }
        if (changed) lessonsChanged += 1;
      }
    }
    return { chapters: journey.chapters.length, lessons: journey.chapters.reduce((a, c) => a + c.lessons.length, 0), lessonsChanged };
  });
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Sustituye los bloques de una lección si su contenido cambió. Devuelve true si hubo cambios. */
export async function replaceBlocks(q, lessonId, blocks) {
  const current = await q.rows('select block_key, type, content from public.lesson_blocks where lesson_id = $1 order by position', [lessonId]);
  const normalized = blocks.map(({ id, type, ...content }) => ({ block_key: id, type, content }));
  // jsonb reordena las claves: se compara en forma canónica.
  if (canonical(current) === canonical(normalized)) return false;
  await q.exec('delete from public.lesson_blocks where lesson_id = $1', [lessonId]);
  for (const [i, b] of normalized.entries()) {
    await q.exec('insert into public.lesson_blocks (lesson_id, block_key, position, type, content) values ($1, $2, $3, $4, $5)',
      [lessonId, b.block_key, i + 1, b.type, JSON.stringify(b.content)]);
  }
  return true;
}

// ------------------------------------------------------------------ estado del usuario
/**
 * Mapa completo de la jornada con estados. `q` debe ser una consulta con el rol del usuario
 * (RLS solo deja ver contenido publicado a quien tiene suscripción activa).
 */
export async function journeyState(q, userId, programSlug = null) {
  const lessons = await q.rows(`
    select l.id, l.slug, l.title, l.description, l.minutes, l.position, l.version, l.clinical_review,
           c.id as chapter_id, c.slug as chapter_slug, c.number as chapter_number, c.title as chapter_title,
           c.description as chapter_description
    from public.journey_lessons l
    join public.journey_chapters c on c.id = l.chapter_id
    join public.journey_programs p on p.id = c.program_id
    where l.published and c.published and p.published
      and ($1::text is null or p.slug = $1)
    order by c.number, l.position`, [programSlug]);
  const progress = new Map((await q.rows(
    'select lesson_id, status, completed_at from public.user_lesson_progress where user_id = $1', [userId]))
    .map((r) => [r.lesson_id, r]));

  let prevCompleted = true;
  const chapters = [];
  for (const l of lessons) {
    const p = progress.get(l.id);
    const status = p?.status === 'completed' ? 'completed'
      : prevCompleted ? (p ? 'in_progress' : 'available') : 'locked';
    prevCompleted = status === 'completed';
    let ch = chapters.at(-1);
    if (!ch || ch.id !== l.chapter_id) {
      ch = { id: l.chapter_id, slug: l.chapter_slug, number: l.chapter_number, title: l.chapter_title, description: l.chapter_description, lessons: [] };
      chapters.push(ch);
    }
    ch.lessons.push({ id: l.id, slug: l.slug, title: l.title, description: l.description, minutes: l.minutes, status,
      completedAt: p?.completed_at ?? null, clinicalReview: l.clinical_review });
  }
  for (const ch of chapters) {
    const st = ch.lessons.map((l) => l.status);
    ch.completedLessons = st.filter((s) => s === 'completed').length;
    ch.status = st.every((s) => s === 'completed') ? 'completed'
      : st.every((s) => s === 'locked') ? 'locked'
        : st.some((s) => s === 'completed' || s === 'in_progress') ? 'in_progress' : 'available';
  }
  const all = chapters.flatMap((c) => c.lessons);
  const next = all.find((l) => l.status === 'in_progress' || l.status === 'available') ?? null;
  const nextChapter = next && chapters.find((c) => c.lessons.includes(next));
  return {
    chapters,
    totals: { lessons: all.length, completed: all.filter((l) => l.status === 'completed').length },
    nextLesson: next && { ...next, chapter: { slug: nextChapter.slug, number: nextChapter.number, title: nextChapter.title } },
    currentChapter: chapters.find((c) => c.status === 'in_progress' || c.status === 'available') ?? chapters.at(-1) ?? null,
  };
}

/** Programa al que pertenece una lección (los slugs de lección son únicos). */
export async function programOfLesson(q, slug) {
  return (await q.one(`
    select p.slug from public.journey_lessons l
    join public.journey_chapters c on c.id = l.chapter_id
    join public.journey_programs p on p.id = c.program_id
    where l.slug = $1`, [slug]))?.slug ?? null;
}

async function lessonWithStatus(q, userId, slug) {
  // La cadena de desbloqueo es por programa: cada programa empieza en su capítulo 0.
  const program = await programOfLesson(q, slug);
  const state = await journeyState(q, userId, program);
  for (const ch of state.chapters) {
    const l = ch.lessons.find((x) => x.slug === slug);
    if (l) return { lesson: l, chapter: ch, state, program };
  }
  throw new JourneyError('NOT_FOUND', 'Lección no encontrada.', 404);
}

/** Lección con bloques y respuestas guardadas. Las lecciones bloqueadas no se pueden abrir. */
export async function getLesson(q, userId, slug) {
  const { lesson, chapter, state } = await lessonWithStatus(q, userId, slug);
  if (lesson.status === 'locked') throw new JourneyError('LOCKED', 'Completa la lección anterior para desbloquear esta.', 403);
  const blocks = await q.rows('select block_key, type, content from public.lesson_blocks where lesson_id = $1 order by position', [lesson.id]);
  const responses = Object.fromEntries((await q.rows(
    'select block_key, response from public.lesson_responses where user_id = $1 and lesson_id = $2', [userId, lesson.id]))
    .map((r) => [r.block_key, r.response]));
  const all = state.chapters.flatMap((c) => c.lessons);
  const idx = all.findIndex((l) => l.id === lesson.id);
  return {
    lesson: { ...lesson, chapter: { slug: chapter.slug, number: chapter.number, title: chapter.title } },
    // Las respuestas correctas no se envían al cliente: se evalúan en el servidor.
    blocks: blocks.map(({ block_key, type, content }) => {
      const { correct, feedback, ...publicContent } = content;
      return { id: block_key, type, ...publicContent };
    }),
    responses,
    feedback: Object.fromEntries(Object.entries(responses).map(([key, r]) => {
      const b = blocks.find((x) => x.block_key === key);
      return b?.type === 'multiple_choice' ? [key, evaluateChoice(b.content, r.optionId)] : [key, null];
    }).filter(([, v]) => v)),
    previous: all[idx - 1]?.slug ?? null,
    next: all[idx + 1] ? { slug: all[idx + 1].slug, status: all[idx + 1].status } : null,
  };
}

function evaluateChoice(content, optionId) {
  return {
    correct: content.correct == null ? null : content.correct === optionId,
    feedback: content.feedback?.[optionId] ?? '',
  };
}

/** Valida la forma de una respuesta según el tipo de bloque. */
function normalizeResponse(block, response) {
  const c = block.content;
  switch (block.type) {
    case 'multiple_choice':
      if (!c.options.some((o) => o.id === response?.optionId)) throw new JourneyError('INVALID', 'Opción no válida.', 422);
      return { optionId: response.optionId };
    case 'reflection': {
      const text = String(response?.text ?? '').trim();
      if (text.length > 2000) throw new JourneyError('INVALID', 'El texto es demasiado largo (máximo 2000 caracteres).', 422);
      return { text };
    }
    case 'interactive_exercise': {
      const sel = Array.isArray(response?.selected) ? [...new Set(response.selected)] : [];
      if (!sel.every((id) => c.items.some((i) => i.id === id))) throw new JourneyError('INVALID', 'Selección no válida.', 422);
      return { selected: sel };
    }
    case 'breathing_exercise':
      if (response?.completed !== true) throw new JourneyError('INVALID', 'Respuesta no válida.', 422);
      return { completed: true };
    case 'commitment':
      if (response?.accepted !== true) throw new JourneyError('INVALID', 'Respuesta no válida.', 422);
      return { accepted: true };
    default:
      throw new JourneyError('INVALID', 'Este bloque no admite respuestas.', 422);
  }
}

/** Guarda la respuesta de un bloque (con el rol del usuario) y devuelve su evaluación. */
export async function saveResponse(qUser, qService, userId, slug, blockKey, response) {
  const { lesson } = await lessonWithStatus(qUser, userId, slug);
  if (lesson.status === 'locked') throw new JourneyError('LOCKED', 'Esta lección todavía está bloqueada.', 403);
  const block = await qUser.one('select block_key, type, content from public.lesson_blocks where lesson_id = $1 and block_key = $2', [lesson.id, blockKey]);
  if (!block) throw new JourneyError('NOT_FOUND', 'Bloque no encontrado.', 404);
  const value = normalizeResponse(block, response);
  await qUser.exec(`
    insert into public.lesson_responses (user_id, lesson_id, block_key, response) values ($1, $2, $3, $4)
    on conflict (user_id, lesson_id, block_key) do update set response = excluded.response, responded_at = now()`,
  [userId, lesson.id, blockKey, JSON.stringify(value)]);
  await qService.exec(`
    insert into public.user_lesson_progress (user_id, lesson_id, status, lesson_version) values ($1, $2, 'in_progress',
      (select version from public.journey_lessons where id = $2))
    on conflict (user_id, lesson_id) do nothing`, [userId, lesson.id]);
  return block.type === 'multiple_choice' ? evaluateChoice(block.content, value.optionId) : { saved: true };
}

/** Bloques cuyo requisito aún no se cumple. */
function pendingBlocks(blocks, responses) {
  return blocks.filter((b) => {
    const r = responses[b.block_key];
    switch (b.type) {
      case 'multiple_choice': return !r || (b.content.correct != null && r.optionId !== b.content.correct);
      case 'reflection': return b.content.required !== false && !r?.text;
      case 'interactive_exercise': return (r?.selected?.length ?? 0) < (b.content.minSelected ?? 0);
      case 'breathing_exercise': return !r?.completed;
      case 'commitment': return !r?.accepted;
      default: return false;
    }
  }).map((b) => b.block_key);
}

/**
 * Completa una lección si todos los requisitos están cumplidos. Actualiza el capítulo.
 * Devuelve la siguiente lección (si existe) y si el capítulo quedó completado.
 */
export async function completeLesson(qUser, qService, userId, slug) {
  const { lesson, chapter, program } = await lessonWithStatus(qUser, userId, slug);
  if (lesson.status === 'locked') throw new JourneyError('LOCKED', 'Esta lección todavía está bloqueada.', 403);
  const blocks = await qUser.rows('select block_key, type, content from public.lesson_blocks where lesson_id = $1 order by position', [lesson.id]);
  const responses = Object.fromEntries((await qUser.rows(
    'select block_key, response from public.lesson_responses where user_id = $1 and lesson_id = $2', [userId, lesson.id]))
    .map((r) => [r.block_key, r.response]));
  const pending = pendingBlocks(blocks, responses);
  if (pending.length) {
    throw Object.assign(new JourneyError('INCOMPLETE', 'Te falta completar algunos pasos de la lección.', 422), { pending });
  }
  await qService.exec(`
    insert into public.user_lesson_progress (user_id, lesson_id, status, lesson_version, completed_at)
    values ($1, $2, 'completed', (select version from public.journey_lessons where id = $2), now())
    on conflict (user_id, lesson_id) do update set status = 'completed',
      completed_at = coalesce(public.user_lesson_progress.completed_at, now()), lesson_version = excluded.lesson_version`,
  [userId, lesson.id]);

  const after = await journeyState(qUser, userId, await programOfLesson(qUser, slug));
  const ch = after.chapters.find((c) => c.id === chapter.id);
  const chapterCompleted = ch.status === 'completed';
  await qService.exec(`
    insert into public.user_chapter_progress (user_id, chapter_id, status, completed_at)
    values ($1, $2, $3, case when $3 = 'completed' then now() end)
    on conflict (user_id, chapter_id) do update set status = excluded.status,
      completed_at = coalesce(public.user_chapter_progress.completed_at, excluded.completed_at)`,
  [userId, chapter.id, chapterCompleted ? 'completed' : 'in_progress']);
  return { next: after.nextLesson, chapterCompleted, totals: after.totals };
}
