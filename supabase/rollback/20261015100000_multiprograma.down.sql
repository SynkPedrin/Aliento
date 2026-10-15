-- Rollback de 20261015100000_multiprograma.sql
alter table public.profiles drop column if exists last_program_slug;
alter table public.achievements drop column if exists program_slug;
alter table public.notification_deliveries drop column if exists program_slug;
alter table public.notification_preferences drop constraint if exists notification_preferences_pkey;
alter table public.notification_preferences drop column if exists program_slug;
alter table public.notification_preferences add primary key (user_id);
alter table public.breathing_sessions drop column if exists program_slug;
alter table public.mood_entries drop column if exists program_slug;
drop table if exists public.program_activity_entries;
drop index if exists public.user_goals_one_active;
create unique index if not exists user_goals_one_active on public.user_goals(user_id) where superseded_at is null;
drop index if exists public.personalized_plans_user_program;
alter table public.personalized_plans add constraint personalized_plans_user_id_key unique (user_id);
alter table public.daily_goals drop column if exists program_slug;
alter table public.user_goals drop column if exists program_slug;
alter table public.personalized_plans drop column if exists program_slug;
alter table public.user_assessments drop column if exists program_slug;
alter table public.questionnaire_sessions drop column if exists program_slug;
drop index if exists public.checkout_sessions_one_open;
create unique index if not exists checkout_sessions_one_open on public.checkout_sessions(user_id) where status = 'open';
delete from public.checkout_sessions where assessment_id is null;
alter table public.checkout_sessions alter column assessment_id set not null;
alter table public.checkout_sessions drop column if exists program_slug;
alter table public.access_grants drop column if exists program_slug;
create or replace function public.has_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.subscriptions where user_id = uid and status in ('active', 'trialing', 'past_due'));
$$;
drop function if exists public.has_program_access(uuid, text);
alter table public.subscriptions drop constraint if exists subscriptions_program_fk;
alter table public.subscriptions drop column if exists program_slug;
delete from public.journey_programs where slug in ('alcohol', 'azucar', 'ansiedad', 'sueno');
update public.journey_programs set slug = 'aliento-base' where slug = 'sem-fumo';
alter table public.journey_programs
  drop column if exists name, drop column if exists tagline, drop column if exists description,
  drop column if exists color, drop column if exists icon, drop column if exists position,
  drop column if exists theme, drop column if exists commercial_status;
