-- Companheiro de programa (Alcohol, Azúcar, Ansiedad, Sueño): ajustes aditivos e idempotentes.
-- Reversible: supabase/rollback/20261022100000_program_companion.down.sql

-- 1) Estrategias por programa (alcohol: pausa|reducir|moderar, etc.). Antes solo parar|gradual|reducir.
alter table public.user_goals drop constraint if exists user_goals_strategy_check;
alter table public.user_goals add constraint user_goals_strategy_check check (char_length(strategy) between 2 and 40);
-- Parámetros propios del programa (objetivo numérico, punto de partida...). Sem Fumo no lo usa.
alter table public.user_goals add column if not exists settings jsonb not null default '{}';

-- 2) Humor y respiración etiquetados por programa. Un registro de ánimo por usuario, programa y día.
update public.mood_entries set program_slug = 'sem-fumo' where program_slug is null;
alter table public.mood_entries alter column program_slug set default 'sem-fumo';
alter table public.mood_entries alter column program_slug set not null;
alter table public.mood_entries drop constraint if exists mood_entries_user_id_day_key;
create unique index if not exists mood_entries_user_program_day on public.mood_entries(user_id, program_slug, day);

update public.breathing_sessions set program_slug = 'sem-fumo' where program_slug is null;
alter table public.breathing_sessions alter column program_slug set default 'sem-fumo';
alter table public.breathing_sessions alter column program_slug set not null;
create index if not exists breathing_sessions_program on public.breathing_sessions(user_id, program_slug, started_at);

-- 3) Registros del programa: el dueño puede escribir los suyos (RLS); un check-in por día y programa.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'program_activity_entries' and policyname = 'program_activity_insert_own') then
    create policy program_activity_insert_own on public.program_activity_entries
      for insert to authenticated with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'program_activity_entries' and policyname = 'program_activity_update_own') then
    create policy program_activity_update_own on public.program_activity_entries
      for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'program_activity_entries' and policyname = 'program_activity_delete_own') then
    create policy program_activity_delete_own on public.program_activity_entries
      for delete to authenticated using (user_id = (select auth.uid()));
  end if;
end $$;
create unique index if not exists program_activity_one_checkin_per_day
  on public.program_activity_entries(user_id, program_slug, (value ->> 'day')) where kind = 'checkin';
create index if not exists program_activity_recent on public.program_activity_entries(user_id, program_slug, occurred_at desc);

-- 4) Ejercicio de respiración para la noche (Sueño). Las conquistas de cada programa se siembran desde el servidor.
insert into public.breathing_exercises (slug, name, description, inhale, hold, exhale, hold_after, position) values
  ('sueno-4-7-8', 'Respiración para la noche', 'Una exhalación larga y pausada ayuda a bajar el ritmo antes de dormir. Si te mareas, vuelve a respirar con normalidad.', 4, 7, 8, 0, 4)
on conflict (slug) do nothing;
