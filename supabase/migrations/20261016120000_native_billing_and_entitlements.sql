-- Migración para soporte de facturación nativa (StoreKit 2 / Google Play / RevenueCat) y mapeo unificado de productos.
-- Incremental y reversible (ver rollback/20261016120000_native_billing_and_entitlements.down.sql).

-- 1) Proveedor de cobro en suscripciones
alter table public.subscriptions
  add column if not exists billing_provider text not null default 'stripe'
    check (billing_provider in ('stripe', 'apple', 'google', 'revenuecat', 'courtesy')),
  add column if not exists store_transaction_id text,
  add column if not exists store_original_transaction_id text;

create index if not exists subscriptions_provider_tx
  on public.subscriptions(billing_provider, store_transaction_id)
  where store_transaction_id is not null;

-- 2) Mapeo comercial de productos entre proveedores (Stripe, Apple, Google, RevenueCat)
create table if not exists public.billing_product_mappings (
  id                          uuid primary key default gen_random_uuid(),
  program_slug                text not null references public.journey_programs(slug) on delete cascade,
  plan                        text not null check (plan in ('semanal', 'mensual', 'trimestral', 'anual')),
  stripe_product_id           text,
  stripe_price_id             text,
  apple_product_id            text not null,
  google_product_id           text not null,
  revenuecat_entitlement_id   text not null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (program_slug, plan)
);

create index if not exists billing_mappings_lookup
  on public.billing_product_mappings(apple_product_id, google_product_id);

alter table public.billing_product_mappings enable row level security;
-- Solo lectura pública de identificadores de tienda para el cliente móvil:
create policy billing_mappings_select on public.billing_product_mappings
  for select to authenticated, anon using (true);

-- Sembrar mapeos estándar oficiales
insert into public.billing_product_mappings (program_slug, plan, stripe_price_id, apple_product_id, google_product_id, revenuecat_entitlement_id)
values
  -- Sem Fumo
  ('sem-fumo', 'semanal', 'lookup:folego_semanal', 'app.aliento.sem_fumo.semanal', 'aliento_sem_fumo_semanal', 'aliento_sem_fumo'),
  ('sem-fumo', 'mensual', 'lookup:folego_mensual', 'app.aliento.sem_fumo.mensual', 'aliento_sem_fumo_mensual', 'aliento_sem_fumo'),
  ('sem-fumo', 'trimestral', 'lookup:folego_trimestral', 'app.aliento.sem_fumo.trimestral', 'aliento_sem_fumo_trimestral', 'aliento_sem_fumo'),
  ('sem-fumo', 'anual', 'lookup:folego_anual', 'app.aliento.sem_fumo.anual', 'aliento_sem_fumo_anual', 'aliento_sem_fumo'),
  -- Alcohol
  ('alcohol', 'semanal', 'lookup:alento_alcohol_semanal', 'app.aliento.alcohol.semanal', 'aliento_alcohol_semanal', 'aliento_alcohol'),
  ('alcohol', 'mensual', 'lookup:alento_alcohol_mensual', 'app.aliento.alcohol.mensual', 'aliento_alcohol_mensual', 'aliento_alcohol'),
  ('alcohol', 'trimestral', 'lookup:alento_alcohol_trimestral', 'app.aliento.alcohol.trimestral', 'aliento_alcohol_trimestral', 'aliento_alcohol'),
  ('alcohol', 'anual', 'lookup:alento_alcohol_anual', 'app.aliento.alcohol.anual', 'aliento_alcohol_anual', 'aliento_alcohol'),
  -- Azúcar
  ('azucar', 'semanal', 'lookup:alento_azucar_semanal', 'app.aliento.azucar.semanal', 'aliento_azucar_semanal', 'aliento_azucar'),
  ('azucar', 'mensual', 'lookup:alento_azucar_mensual', 'app.aliento.azucar.mensual', 'aliento_azucar_mensual', 'aliento_azucar'),
  ('azucar', 'trimestral', 'lookup:alento_azucar_trimestral', 'app.aliento.azucar.trimestral', 'aliento_azucar_trimestral', 'aliento_azucar'),
  ('azucar', 'anual', 'lookup:alento_azucar_anual', 'app.aliento.azucar.anual', 'aliento_azucar_anual', 'aliento_azucar'),
  -- Ansiedad
  ('ansiedad', 'semanal', 'lookup:alento_ansiedad_semanal', 'app.aliento.ansiedad.semanal', 'aliento_ansiedad_semanal', 'aliento_ansiedad'),
  ('ansiedad', 'mensual', 'lookup:alento_ansiedad_mensual', 'app.aliento.ansiedad.mensual', 'aliento_ansiedad_mensual', 'aliento_ansiedad'),
  ('ansiedad', 'trimestral', 'lookup:alento_ansiedad_trimestral', 'app.aliento.ansiedad.trimestral', 'aliento_ansiedad_trimestral', 'aliento_ansiedad'),
  ('ansiedad', 'anual', 'lookup:alento_ansiedad_anual', 'app.aliento.ansiedad.anual', 'aliento_ansiedad_anual', 'aliento_ansiedad'),
  -- Sueño
  ('sueno', 'semanal', 'lookup:alento_sueno_semanal', 'app.aliento.sueno.semanal', 'aliento_sueno_semanal', 'aliento_sueno'),
  ('sueno', 'mensual', 'lookup:alento_sueno_mensual', 'app.aliento.sueno.mensual', 'aliento_sueno_mensual', 'aliento_sueno'),
  ('sueno', 'trimestral', 'lookup:alento_sueno_trimestral', 'app.aliento.sueno.trimestral', 'aliento_sueno_trimestral', 'aliento_sueno'),
  ('sueno', 'anual', 'lookup:alento_sueno_anual', 'app.aliento.sueno.anual', 'aliento_sueno_anual', 'aliento_sueno')
on conflict (program_slug, plan) do update set
  apple_product_id = excluded.apple_product_id,
  google_product_id = excluded.google_product_id,
  revenuecat_entitlement_id = excluded.revenuecat_entitlement_id;
