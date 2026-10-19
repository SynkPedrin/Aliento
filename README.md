# Aliento

SaaS en español para dejar de fumar: cuestionario y resultados gratuitos → suscripción con Stripe → jornada de lecciones, registros, objetivos, respiración, diario, progreso y logros.

Node 22.13+ · Express 5 · Supabase (Postgres + Auth + RLS) · Stripe · HTML/CSS/JS sin build.

## Desarrollo local

```bash
npm install
npx supabase start            # Supabase local en puertos 555xx (Docker)
npm run db:migrate:local      # aplica supabase/migrations
npm run content:seed          # carga la jornada (10 capítulos, 30 lecciones)
npm test                      # 20 pruebas end-to-end contra el Supabase local
npm start                     # servidor real (Stripe en modo test) — ver .env
npm run demo                  # mismo producto con pagos simulados (webhook firmado)
```

Webhook local de Stripe (CLI v1.53+ necesita `--events`; con la clave del `.env`, sin exponerla):

```bash
set -a; source .env; set +a
.tools/stripe listen --api-key "$STRIPE_SECRET_KEY" \
  --events "checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,charge.refunded" \
  --forward-to localhost:3100/api/stripe/webhook
# arranca después el servidor con el secret que imprime el listener: STRIPE_WEBHOOK_SECRET=whsec_… npm start
```

## Scripts de operación

| Comando | Qué hace |
|---|---|
| `npm run db:migrate` | Aplica las migraciones al proyecto de `SUPABASE_DB_URL` |
| `npm run content:seed` | Carga/actualiza la jornada sin borrar progreso (versiona lecciones cambiadas) |
| `npm run admin:grant -- correo` | Concede (o `--revoke`) acceso a /admin |
| `npm run billing:reconcile [-- --apply]` | Concilia suscripciones de Stripe con la base (solo por identificadores verificables) |
| `npm run stripe:setup -- …` | Crea producto y precios en una cuenta Stripe |

## Documentación

- `PRODUCTION_AUDIT.md`: auditoría inicial.
- `IMPLEMENTATION_STATUS.md`: qué está hecho y probado.
- `DATABASE_SCHEMA.md`: tablas, RLS y modelo de acceso.
- `STRIPE_INTEGRATION.md`: pagos, webhooks y conciliación.
- `USER_JOURNEY.md`: rutas y experiencia.
- `PRODUCTION_CHECKLIST.md`: pasos para el lanzamiento.
