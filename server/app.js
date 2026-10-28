import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ACCESS_COOKIE, AuthError, REFRESH_COOKIE, clearSessionCookies, isValidEmail, parseCookies, setSessionCookies, sharedRateLimiter } from './auth.js';
import { BillingError } from './billing.js';
import { JourneyError } from './services/journey.js';
import { accountRoutes } from './routes/account.js';
import { adminRoutes } from './routes/admin.js';
import { appRoutes } from './routes/app.js';
import { createAssessmentStore, publicRoutes } from './routes/public.js';
import { storeRoutes } from './routes/store.js';
import { trackRoutes } from './routes/track.js';
import { growthRoutes, growthCron } from './routes/growth.js';
import { HttpError } from './routes/util.js';
import { createMailer, purchaseEmail } from './services/mailer.js';
import { langOf, localizeFor } from './i18n.js';

const PUBLIC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');

// Rutas antiguas que ahora viven en otra dirección.
const PAGE_ALIASES = {
  '/panel': '/dashboard',
  '/cuenta': '/perfil',
};

// Pixels de Meta y TikTok: el navegador solo los carga si la persona aceptó cookies de marketing.
const PIXEL_SCRIPT = ' https://connect.facebook.net https://analytics.tiktok.com';
const PIXEL_IMG = ' https://www.facebook.com https://analytics.tiktok.com';
const PIXEL_CONN = ' https://www.facebook.com https://*.facebook.com https://analytics.tiktok.com https://*.tiktok.com';

// Traducción de pantalla (Google Translate, solo si la persona la activa).

const NO_NOTIFIER = { enabled: false, publicKey: '', runDue: async () => ({ disabled: true }), notifyAchievements() {}, test: async () => 'disabled' };

export function createApp({ db, auth, billing, config, notifier = NO_NOTIFIER, programs, storeSync = null, apple = null, googlePlay = null, growth = null, mailer = null, log = console }) {
  mailer ??= createMailer({ config, log });
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // CSP por rota: a landing (SITE-HOME) usa estilos inline e fontes Google (animações,
  // custom properties dinâmicas); o resto da aplicação mantém o policy estrito.
  app.use((req, res, next) => {
    const isLanding = req.path === '/' || req.path === '/index.html';
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': [
        "default-src 'self'",
        `script-src 'self'${PIXEL_SCRIPT}`,
        isLanding ? `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` : `style-src 'self'`,
        isLanding ? "font-src 'self' https://fonts.gstatic.com" : "font-src 'self'",
        `img-src 'self' data:${PIXEL_IMG}${req.path === '/growth' ? ' https:' : ''}`, // /growth: miniaturas de anuncios (CDN de Meta/TikTok)
        "media-src 'self' data:",
        `connect-src 'self'${PIXEL_CONN}`,
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
      if (growth) await growth.hooks.onStripeEvent(event); // rastreo/atribución: nunca bloquea el cobro
      if (growth) await growth.forwarders.processOutbox({ limit: 25 }).catch(() => null); // compra vai na hora para Meta/TikTok
      await sendPurchaseEmail(event).catch((err) => log.warn(`[mail] compra ${event.id}: ${err.message}`)); // e-mail nunca bloqueia o cobro
      res.json({ received: true });
    } catch (err) {
      log.error(`[webhook] Error procesando ${event.type} (${event.id}):`, err.message);
      res.status(500).send('Error');
    }
  });

  /** Primeira compra paga: e-mail com o acesso (criar senha, se comprou sem cadastro). */
  async function sendPurchaseEmail(event) {
    if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return;
    const s = event.data.object;
    if (s.mode !== 'subscription' || !['paid', 'no_payment_required'].includes(s.payment_status)) return;
    const email = s.customer_details?.email ?? s.customer_email;
    if (!email) return;
    const p = await db.service.one(`select p.user_id, p.name, p.locale, p.needs_password, u.email from public.profiles p join auth.users u on u.id = p.user_id
      where ${s.metadata?.user_id ? 'p.user_id = $1' : 'lower(u.email) = lower($1)'}`, [s.metadata?.user_id ?? email]);
    const needsPassword = Boolean(p?.needs_password);
    // Comprou sem cadastro e digitou outro e-mail na Stripe: a conta passa a usar o do pagamento.
    if (needsPassword && p.email.toLowerCase() !== email.toLowerCase()) {
      if (await auth.setEmail(p.user_id, email).catch(() => false)) p.email = email;
      else log.warn(`[mail] compra ${s.id}: o e-mail do pagamento já tem outra conta; a conta segue com o do quiz.`);
    }
    const account = p?.email ?? email;
    const link = (needsPassword && await auth.recoveryLink(account)) || `${config.appUrl}/acceso?modo=entrar&email=${encodeURIComponent(account)}`;
    const msg = purchaseEmail({ locale: p?.locale, name: p?.name, plan: s.metadata?.plan, amountCents: s.amount_total, currency: s.currency,
      link, needsPassword, supportUrl: `${config.appUrl}/soporte`, appUrl: config.appUrl });
    await mailer.send({ to: email, ...msg, idempotencyKey: `purchase-${s.id}` });
  }

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

  app.use(express.json({ limit: '200kb', verify: (req, res, buf) => { req.rawBody = buf; } })); // rawBody: firma de webhooks de terceros

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

  // Por defecto, ninguna respuesta de la API se guarda en cachés (datos personales).
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  // Idioma: o navegador manda X-Alento-Lang; toda resposta JSON (textos, erros) sai traduzida pelo catálogo.
  // O painel growth fica de fora (é em português e não tem catálogo).
  app.use('/api', (req, res, next) => {
    req.lang = langOf(req.get('x-alento-lang'));
    res.vary('X-Alento-Lang');
    if (req.lang !== 'es' && !req.path.startsWith('/growth')) { const json = res.json.bind(res); res.json = (body) => json(localizeFor(req.lang, body)); }
    next();
  });

  // Protección CSRF: las peticiones que modifican estado deben venir de nuestro origen.
  app.use('/api', (req, res, next) => {
    if (req.method === 'GET') return next();
    const origin = req.get('origin');
    if (origin && origin !== new URL(config.appUrl).origin) return res.status(403).json({ error: 'Origen no permitido.' });
    next();
  });

  // Suporte (página pública /soporte): o formulário vira e-mail para a caixa do suporte.
  const supportLimiter = sharedRateLimiter(db, { windowSeconds: 60 * 60, max: 5 });
  app.post('/api/support', async (req, res, next) => {
    try {
      const b = req.body ?? {};
      if (b.website) return res.json({ ok: true }); // campo-isca: robô
      const name = String(b.name ?? '').trim().slice(0, 80), email = String(b.email ?? '').trim().toLowerCase();
      const orderId = String(b.orderId ?? '').trim().slice(0, 80), message = String(b.message ?? '').trim();
      if (!name) throw new HttpError(422, 'Escribe tu nombre.', 'INVALID', { field: 'name' });
      if (!isValidEmail(email)) throw new HttpError(422, 'Revisa tu correo electrónico.', 'INVALID', { field: 'email' });
      if (message.length < 10 || message.length > 4000) throw new HttpError(422, 'Cuéntanos un poco más (entre 10 y 4000 caracteres).', 'INVALID', { field: 'message' });
      if (!(await supportLimiter(`support:${req.ip}`))) throw new HttpError(429, 'Has enviado varios mensajes. Inténtalo de nuevo en una hora.', 'RATE_LIMITED');
      await mailer.sendSupport({ name, email, orderId, message, page: String(b.page ?? '').slice(0, 200) });
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  const store = createAssessmentStore({ db, config });
  app.use('/api', publicRoutes({ db, billing, config, store, programs }));
  app.use('/api', accountRoutes({ db, auth, billing, config, store, programs, growth, log }));
  if (growth) {
    app.use('/api', trackRoutes({ db, config, growth, store, log }));
    app.use('/api/growth', growthRoutes({ db, config, growth, auth, billing, log }));
    const cron = growthCron({ config, growth, log });
    app.use('/api/cron', cron);
    app.use('/api/webhooks', cron); // /api/webhooks/customerio (firma HMAC propia)
  }
  app.use('/api', storeRoutes({ db, billing, config, storeSync, apple, googlePlay, log }));
  app.use('/api/admin', adminRoutes({ db }));
  app.use('/api/app', appRoutes({ db, billing, config, notifier, programs }));

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
  app.get('/quiz/:program', (req, res, next) => {
    const slug = req.params.program;
    if (['sem-fumo', 'alcohol', 'azucar', 'ansiedad', 'sueno'].includes(slug)) {
      return res.sendFile(join(PUBLIC_DIR, 'test.html'));
    }
    next();
  });
  app.use((req, res, next) => {
    const alias = PAGE_ALIASES[req.path];
    if (alias) return res.redirect(301, alias + (req.url.slice(req.path.length) || ''));
    next();
  });
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html', maxAge: config.isProduction ? '1h' : 0 }));
  app.use((req, res) => res.status(404).sendFile(join(PUBLIC_DIR, '404.html')));

  return app;
}
