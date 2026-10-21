-- Additive ordering metadata for verified store events. No user data is removed.
alter table public.subscriptions
  add column if not exists store_event_at bigint not null default 0,
  add column if not exists last_verified_at timestamptz;
