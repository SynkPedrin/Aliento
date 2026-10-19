-- Registro de transacciones de tiendas nativas (App Store / Google Play) para auditoría
-- y reconciliación. Incremental y no destructiva.
-- Referencia: supabase/rollback/20261018100000_store_transactions.down.sql

create table if not exists public.store_transactions (
  id                       uuid primary key default gen_random_uuid(),
  provider                 text not null check (provider in ('apple', 'google', 'revenuecat')),
  transaction_id           text not null unique,
  original_transaction_id  text,
  bundle_id                text,
  product_id               text not null,
  program_slug             text references public.journey_programs(slug),
  plan                     text,
  environment              text not null default 'production',
  user_id                  uuid,
  payload                  jsonb not null default '{}'::jsonb,
  status                   text not null default 'processed'
                             check (status in ('processed', 'failed', 'unverified', 'unmatched')),
  error                    text,
  received_at              timestamptz not null default now(),
  processed_at             timestamptz,
  created_at               timestamptz not null default now()
);

create index if not exists store_transactions_original
  on public.store_transactions(provider, original_transaction_id);

-- Solo el backend (service_role) consulta la auditoría de transacciones:
-- ninguna app del cliente necesita leerlas.
alter table public.store_transactions enable row level security;
