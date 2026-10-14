-- Días registrados explícitamente sin fumar ("Hoy no he fumado").
-- Permite distinguir un día sin consumo de un día sin registro.
create table if not exists public.daily_checkins (
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_checkins enable row level security;
create policy daily_checkins_select_own on public.daily_checkins for select to authenticated using (user_id = (select auth.uid()));
create policy daily_checkins_insert_own on public.daily_checkins for insert to authenticated with check (user_id = (select auth.uid()));
create policy daily_checkins_delete_own on public.daily_checkins for delete to authenticated using (user_id = (select auth.uid()));
