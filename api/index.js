// Función serverless de Vercel: toda la API (/api/*) la atiende la misma app Express.
import { buildApp } from '../server/factory.js';

// Pool pequeño: cada instancia serverless abre pocas conexiones (el pooler de Supabase hace el resto).
const { app } = buildApp(process.env, { poolSize: 3 });

export default app;
