-- Canal de notificaciones Web Push: suscripciones por dispositivo y envíos sin duplicados.
create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failures        int not null default 0
);
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- Clave de deduplicación: un mismo recordatorio (p. ej. "daily:2026-10-14") se envía una sola vez.
alter table public.notification_deliveries add column if not exists dedupe_key text;
alter table public.notification_deliveries add column if not exists title text;
create unique index if not exists notification_deliveries_dedupe
  on public.notification_deliveries(user_id, category, dedupe_key) where dedupe_key is not null;
create policy notification_deliveries_select_own on public.notification_deliveries for select to authenticated using (user_id = (select auth.uid()));
