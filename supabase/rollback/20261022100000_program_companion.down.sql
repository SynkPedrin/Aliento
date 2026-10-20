-- Revierte 20261022100000_program_companion.sql
drop index if exists public.program_activity_recent;
drop index if exists public.program_activity_one_checkin_per_day;
drop policy if exists program_activity_delete_own on public.program_activity_entries;
drop policy if exists program_activity_update_own on public.program_activity_entries;
drop policy if exists program_activity_insert_own on public.program_activity_entries;

drop index if exists public.breathing_sessions_program;
alter table public.breathing_sessions alter column program_slug drop not null;
alter table public.breathing_sessions alter column program_slug drop default;

-- Un solo ánimo por usuario y día: se conserva el más reciente.
delete from public.mood_entries m using public.mood_entries n
  where m.user_id = n.user_id and m.day = n.day and m.id <> n.id
    and (m.updated_at, m.id) < (n.updated_at, n.id);
drop index if exists public.mood_entries_user_program_day;
alter table public.mood_entries add constraint mood_entries_user_id_day_key unique (user_id, day);
alter table public.mood_entries alter column program_slug drop not null;
alter table public.mood_entries alter column program_slug drop default;

-- Los objetivos de otros programas usan estrategias que el check original no admite.
delete from public.user_goals where strategy not in ('parar', 'gradual', 'reducir');
alter table public.user_goals drop column if exists settings;
alter table public.user_goals drop constraint if exists user_goals_strategy_check;
alter table public.user_goals add constraint user_goals_strategy_check check (strategy in ('parar', 'gradual', 'reducir'));

delete from public.user_achievements where achievement_slug in (select slug from public.achievements where program_slug <> 'sem-fumo');
delete from public.achievements where program_slug <> 'sem-fumo';
delete from public.breathing_exercises where slug = 'sueno-4-7-8' and not exists (select 1 from public.breathing_sessions where exercise_slug = 'sueno-4-7-8');
