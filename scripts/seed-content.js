// Carga o actualiza el programa de la jornada en Supabase (no borra progreso ni respuestas).
//   npm run content:seed            → publica el contenido
//   npm run content:seed -- --draft → lo carga sin publicar
import { createDb } from '../server/db.js';
import { loadConfig } from '../server/config.js';
import { seedJourney } from '../server/services/journey.js';
import { JOURNEY as SEM_FUMO } from '../server/content/journey.js';
import { JOURNEY as ALCOHOL } from '../server/content/programs/alcohol.js';
import { JOURNEY as AZUCAR } from '../server/content/programs/azucar.js';
import { JOURNEY as ANSIEDAD } from '../server/content/programs/ansiedad.js';
import { JOURNEY as SUENO } from '../server/content/programs/sueno.js';

const config = loadConfig();
const db = createDb(config.supabase.dbUrl, { max: 2 });
const draft = process.argv.includes('--draft');
try {
  // Sem Fumo es el único publicado por defecto; los demás se cargan en borrador
  // hasta completar la revisión clínica (ver /admin).
  for (const [journey, publish] of [[SEM_FUMO, !draft], [ALCOHOL, false], [AZUCAR, false], [ANSIEDAD, false], [SUENO, false]]) {
    const r = await seedJourney(db, journey, { publish });
    console.log(`${journey.program.slug}: ${r.chapters} capítulos, ${r.lessons} lecciones (${r.lessonsChanged} con cambios)${publish ? ' · PUBLICADO' : ' · borrador'}.`);
  }
} finally {
  await db.end();
}
