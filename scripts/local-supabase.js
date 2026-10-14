// Credenciales del Supabase LOCAL (`npx supabase start`), leídas en tiempo de ejecución.
// Así no se guardan claves en el repositorio, aunque sean las de desarrollo.
import { execFileSync } from 'node:child_process';

export function localSupabaseEnv() {
  const out = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const s = JSON.parse(out.slice(out.indexOf('{')));
  return {
    SUPABASE_URL: s.API_URL,
    SUPABASE_PUBLISHABLE_KEY: s.PUBLISHABLE_KEY || s.ANON_KEY,
    SUPABASE_SECRET_KEY: s.SECRET_KEY || s.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: s.DB_URL,
  };
}
