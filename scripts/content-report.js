// Genera CONTENT_COMPLETENESS_REPORT.md a partir del contenido real y del estado en la base.
//   node --env-file=.env scripts/content-report.js
import { writeFileSync } from 'node:fs';
import { JOURNEY } from '../server/content/journey.js';
import { validateLesson } from '../server/services/journey.js';
import { loadConfig } from '../server/config.js';
import { createDb } from '../server/db.js';

const words = (t) => String(t ?? '').split(/\s+/).filter(Boolean).length;
const db = createDb(loadConfig().supabase.dbUrl, { max: 1 });
const published = new Map((await db.service.rows(`
  select l.slug, l.published and c.published and p.published as published, l.version, l.clinical_review, l.clinical_reviewer
  from public.journey_lessons l join public.journey_chapters c on c.id = l.chapter_id join public.journey_programs p on p.id = c.program_id`))
  .map((r) => [r.slug, r]));
await db.end();

// Lecciones con afirmaciones que el revisor marcó para validación clínica (ver IMPLEMENTATION_STATUS.md).
const CLINICAL_REVIEW = new Set(['apoyo-y-ayuda-profesional', 'sintomas-de-abstinencia', 'beneficios-para-tu-salud', 'estres-sin-cigarrillo', 'animo-y-comunicacion', 'elegir-tu-estrategia']);

let total = { lessons: 0, words: 0, mc: 0, errors: 0 };
const out = [];
out.push('# Aliento: inventario y completitud del contenido', '',
  `Generado automáticamente el ${new Date().toISOString().slice(0, 10)} con \`scripts/content-report.js\` a partir de \`server/content/journey.js\` y de la base de datos.`, '',
  '**Regla de desbloqueo (todas las lecciones):** la primera lección del capítulo 0 está disponible desde el inicio; cada lección se desbloquea al completar la anterior (en orden global); un capítulo está completo cuando lo están todas sus lecciones. El servidor calcula el estado: no se puede abrir ni completar una lección bloqueada.', '',
  '**Criterio de conclusión:** todas las preguntas con respuesta correcta respondidas correctamente; reflexiones obligatorias con texto; ejercicios con el mínimo de selecciones; respiraciones completadas; compromisos aceptados. Validado por el servidor.', '');
for (const ch of JOURNEY.chapters) {
  out.push(`## Capítulo ${ch.number} · ${ch.title}`, '', `${ch.description}`, '',
    '| # | Lección (slug) | Min | Bloques | Interactivos | Preguntas (correcta / feedback) | Palabras | Publicada | Validación automática | Revisión clínica | Afirmaciones señaladas |',
    '|---|---|---|---|---|---|---|---|---|---|---|');
  ch.lessons.forEach((l, i) => {
    const errs = validateLesson(l);
    const mc = l.blocks.filter((b) => b.type === 'multiple_choice');
    const mcOk = mc.filter((b) => (b.correct == null || b.options.some((o) => o.id === b.correct)) && b.options.every((o) => b.feedback?.[o.id]));
    const inter = l.blocks.filter((b) => ['multiple_choice', 'reflection', 'interactive_exercise', 'breathing_exercise', 'commitment'].includes(b.type)).map((b) => b.type.replace('_exercise', '').replace('multiple_choice', 'pregunta').replace('interactive', 'ejercicio').replace('reflection', 'reflexión').replace('commitment', 'compromiso').replace('breathing', 'respiración'));
    const w = l.blocks.reduce((a, b) => a + words(b.body) + words(b.question) + words(b.prompt) + words(b.statement) + words(b.intro)
      + (b.options ?? []).reduce((x, o) => x + words(o.label), 0) + Object.values(b.feedback ?? {}).reduce((x, f) => x + words(f), 0)
      + (b.items ?? []).reduce((x, o) => x + words(o.label), 0), 0);
    const pub = published.get(l.slug);
    total.lessons += 1; total.words += w; total.mc += mc.length; total.errors += errs.length;
    out.push(`| ${i + 1} | ${l.title} (\`${l.slug}\`) | ${l.minutes} | ${l.blocks.length} | ${inter.join(', ')} | ${mc.length ? `${mcOk.length}/${mc.length} completas` : '—'} | ${w} | ${pub ? (pub.published ? `sí (v${pub.version})` : 'no') : 'no cargada'} | ${errs.length ? `❌ ${errs.join('; ')}` : '✅'} | ${pub?.clinical_review === 'approved' ? `✅ ${pub.clinical_reviewer}` : '⏳ pendiente'} | ${CLINICAL_REVIEW.has(l.slug) ? '⚠️ sí' : '—'} |`);
  });
  out.push('');
}
out.unshift('');
out.splice(2, 0, `**Resumen:** ${JOURNEY.chapters.length} capítulos · ${total.lessons} lecciones · ${total.mc} preguntas · ~${total.words.toLocaleString('es')} palabras · errores de validación: **${total.errors}** · lecciones aprobadas por un profesional sanitario: **${[...published.values()].filter((r) => r.clinical_review === 'approved').length}/${total.lessons}** · lecciones con afirmaciones señaladas para el revisor: **${CLINICAL_REVIEW.size}**`, '',
  '**Pruebas que recorren todo el contenido:** `test/flow.test.js` › «jornada completa» abre las 30 lecciones en orden como usuario real, comprueba que la siguiente está bloqueada (también por URL directa), que no se puede completar sin requisitos, que cada respuesta incorrecta se marca como tal con feedback, completa cada lección, verifica el cierre de cada capítulo y la persistencia tras cerrar sesión y entrar desde otro cliente.', '');
out.shift();
writeFileSync('CONTENT_COMPLETENESS_REPORT.md', out.join('\n') + '\n');
console.log(`OK: ${total.lessons} lecciones, ${total.errors} errores, ${total.mc} preguntas, ~${total.words} palabras`);
