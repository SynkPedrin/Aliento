import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ACCESS_COOKIE, AuthError, REFRESH_COOKIE, clearSessionCookies, parseCookies, setSessionCookies } from './auth.js';
import { BillingError } from './billing.js';
import { JourneyError } from './services/journey.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { appRoutes } from './routes/app.js';
import { createAssessmentStore, publicRoutes } from './routes/public.js';
import { HttpError } from './routes/util.js';

const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');

// Rutas antiguas que ahora viven en otra dirección.
const PAGE_ALIASES = {
  '/panel': '/dashboard',
  '/cuenta': '/perfil',
};

const NO_NOTIFIER = { enabled: false, publicKey: '', runDue: async () => ({ disabled: true }), notifyAchievements() {}, test: async () => 'disabled' };

export function createApp({ db, auth, billing, config, notifier = NO_NOTIFIER, log = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "media-src 'self' data:",
        "connect-src 'self'",
        "worker-src 'self'",
        "manifest-src 'self'",
        "form-action 'self' https://checkout.stripe.com",
        "frame-ancestors 'none'",
      ].join('; '),
    });
    if (config.isProduction) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // ---------- Webhook de Stripe (cuerpo sin parsear para verificar la firma) ----------
  app.post('/api/stripe/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
    if (!billing.enabled) return res.status(503).end();
    let event;
    try {
      event = billing.constructEvent(req.body, req.get('stripe-signature'));
    } catch (err) {
      log.warn(`[webhook] Firma no válida: ${err.message}`);
      return res.status(400).send('Firma no válida');
    }
    try {
      await billing.handleEvent(event);
      res.json({ received: true });
    } catch (err) {
      log.error(`[webhook] Error procesando ${event.type} (${event.id}):`, err.message);
      res.status(500).send('Error');
    }
  });

  // ---------- Tarea programada: recordatorios (Vercel Cron o pg_cron de Supabase) ----------
  app.all('/api/cron/notifications', async (req, res) => {
    const given = Buffer.from(String(req.get('authorization') ?? ''));
    const expected = Buffer.from(`Bearer ${config.cronSecret}`);
    if (!config.cronSecret || given.length !== expected.length || !timingSafeEqual(given, expected)) return res.status(401).end();
    try {
      const out = await notifier.runDue();
      // Retención de datos (LGPD): se ejecuta como mucho una vez por hora.
      out.purged = await db.service.one(`select public.purge_stale_data() as r
        where not exists (select 1 from public.rate_limits where key = 'cron:purge' and window_start > now() - interval '1 hour')`)
        .then(async (r) => { await db.service.exec(`select public.hit_rate_limit('cron:purge', 1000000, 3600)`); return r?.r ?? null; })
        .catch(() => null);
      res.json(out);
    } catch (err) {
      log.error('[cron] notificaciones:', err.message);
      res.status(500).json({ error: 'Error' });
    }
  });

  app.use(express.json({ limit: '200kb' }));

  // ---------- Sesión: token de acceso; si caducó, se renueva con el de refresco ----------
  app.use(async (req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    req.user = null;
    if (!req.path.startsWith('/api/')) return next();
    try {
      req.user = await auth.userFromToken(req.cookies[ACCESS_COOKIE]);
      if (!req.user && req.cookies[REFRESH_COOKIE]) {
        // refresh() lanza si el servicio falla (429/5xx): la sesión se conserva y se responde 503.
        const session = await auth.refresh(req.cookies[REFRESH_COOKIE]);
        if (session) {
          setSessionCookies(res, config, session);
          req.user = await auth.userFromToken(session.access_token);
        } else {
          clearSessionCookies(res); // token de refresco inválido de verdad
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  });

  // Protección CSRF: las peticiones que modifican estado deben venir de nuestro origen.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET') return next();
    const origin = req.get('origin');
    if (origin && origin !== new URL(config.appUrl).origin) return res.status(403).json({ error: 'Origen no permitido.' });
    next();
  });

  const store = createAssessmentStore({ db, config });
  app.use('/api', publicRoutes({ db, billing, config, store }));
  app.use('/api', accountRoutes({ db, auth, billing, config, store, log }));
  app.use('/api/admin', adminRoutes({ db }));
  app.use('/api/app', appRoutes({ db, billing, config, notifier }));

  // ---------- Errores de API ----------
  app.use('/api', (req, res) => res.status(404).json({ error: 'No encontrado.' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError || err instanceof BillingError || err instanceof JourneyError || err instanceof AuthError) {
      return res.status(err.status).json({ error: err.message, code: err.code, field: err.field, errors: err.errors, pending: err.pending });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Petición no válida.' });
    if (err.status === 422) return res.status(422).json({ error: err.message });
    log.error('[app] Error inesperado:', err);
    res.status(500).json({ error: 'Algo ha fallado. Inténtalo de nuevo en unos instantes.' });
  });

  // ---------- Páginas ----------
  app.use((req, res, next) => {
    const alias = PAGE_ALIASES[req.path];
    if (alias) return res.redirect(301, alias + (req.url.slice(req.path.length) || ''));
    next();
  });
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html', maxAge: config.isProduction ? '1h' : 0 }));
  app.use((req, res) => res.status(404).sendFile(join(PUBLIC_DIR, '404.html')));

  return app;
}
