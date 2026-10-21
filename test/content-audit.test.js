import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLesson } from '../server/services/journey.js';

for (const [slug, file] of [
  ['sem-fumo', 'journey.js'], ['alcohol', 'programs/alcohol.js'],
  ['azucar', 'programs/azucar.js'], ['ansiedad', 'programs/ansiedad.js'], ['sueno', 'programs/sueno.js'],
]) {
  test(`content: ${slug} has valid interactive lessons and unique identities`, async () => {
    const { JOURNEY } = await import('../server/content/' + file);
    assert.equal(JOURNEY.program.slug, slug);
    assert.equal(JOURNEY.chapters.length, 10);
    const lessons = JOURNEY.chapters.flatMap((chapter) => chapter.lessons);
    assert.equal(lessons.length, 30);
    assert.equal(new Set(lessons.map((lesson) => lesson.slug)).size, lessons.length);
    assert.equal(new Set(JOURNEY.chapters.map((chapter) => chapter.slug)).size, JOURNEY.chapters.length);
    for (const lesson of lessons) assert.deepEqual(validateLesson(lesson), [], lesson.slug);
  });
}
