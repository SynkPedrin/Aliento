-- Acceso de cortesía (sin cobro): cuentas internas, prensa, soporte. Auditable y separado de Stripe.
create table if not exists public.access_grants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  reason     text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists access_grants_user on public.access_grants(user_id);
alter table public.access_grants enable row level security;
create policy access_grants_select_own on public.access_grants for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.has_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = uid and status in ('active', 'trialing', 'past_due')
  ) or exists (
    select 1 from public.access_grants
    where user_id = uid and revoked_at is null and (expires_at is null or expires_at > now())
  );
$$;
