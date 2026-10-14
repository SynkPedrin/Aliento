// Carga o actualiza el programa de la jornada en Supabase (no borra progreso ni respuestas).
//   npm run content:seed            → publica el contenido
//   npm run content:seed -- --draft → lo carga sin publicar
import { createDb } from '../server/db.js';
import { loadConfig } from '../server/config.js';
import { seedJourney } from '../server/services/journey.js';
import { JOURNEY } from '../server/content/journey.js';

const config = loadConfig();
const db = createDb(config.supabase.dbUrl, { max: 2 });
try {
  const r = await seedJourney(db, JOURNEY, { publish: !process.argv.includes('--draft') });
  console.log(`Programa cargado: ${r.chapters} capítulos, ${r.lessons} lecciones (${r.lessonsChanged} con cambios).`);
} finally {
  await db.end();
}
