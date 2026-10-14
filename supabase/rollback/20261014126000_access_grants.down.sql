create or replace function public.has_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subscriptions where user_id = uid and status in ('active', 'trialing', 'past_due'));
$$;
drop table if exists public.access_grants;
