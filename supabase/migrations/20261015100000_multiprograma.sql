-- Alento multiprograma: catálogo de programas, acceso por programa y registros genéricos.
-- Incremental y reversible (ver rollback/20261015100000_multiprograma.down.sql).
-- Todos los datos existentes quedan asociados al programa 'sem-fumo'.

-- ---------------------------------------------------------------- 1) catálogo
-- journey_programs pasa a ser también el catálogo comercial de programas.
alter table public.journey_programs
  add column if not exists name        text,
  add column if not exists tagline     text,
  add column if not exists description text,
  add column if not exists color       text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists icon        text,
  add column if not exists position    int not null default 0,
  add column if not exists theme       text not null default 'light' check (theme in ('light', 'night')),
  add column if not exists commercial_status text not null default 'coming_soon'
    check (commercial_status in ('coming_soon', 'ready_for_review', 'active', 'paused', 'archived'));

update public.journey_programs set slug = 'sem-fumo' where slug = 'aliento-base';

insert into public.journey_programs (slug, title, name, tagline, description, color, icon, position, theme, commercial_status, published, version)
values
  ('sem-fumo', 'Programa Alento', 'Sem Fumo', 'Respira una nueva etapa.',
   'Comprende tu hábito, prepara el cambio y acompaña tu consumo día a día con estrategias de apoyo para dejar de fumar.',
   '#3EE0B5', '/assets/brand/alento-icone-sem-fumo.svg', 1, 'light', 'active', true, 1),
  ('alcohol', 'Alcohol', 'Alcohol', 'Construye una relación más consciente.',
   'Un espacio educativo para comprender y transformar tu relación con el alcohol, a tu ritmo y con apoyo profesional cuando haga falta.',
   '#9B8CFF', '/assets/brand/alento-icone-alcool.svg', 2, 'light', 'coming_soon', false, 1),
  ('azucar', 'Azúcar', 'Azúcar', 'Encuentra equilibrio en tus hábitos.',
   'Hábitos más conscientes y equilibrados con el azúcar, sin culpa y sin dietas extremas.',
   '#FF7A59', '/assets/brand/alento-icone-acucar.svg', 3, 'light', 'coming_soon', false, 1),
  ('ansiedad', 'Ansiedad', 'Ansiedad', 'Un espacio para recuperar la calma.',
   'Educación emocional y herramientas de autorregulación para el día a día. No sustituye la atención de un profesional.',
   '#FFC857', '/assets/brand/alento-icone-ansiedade-sono.svg', 4, 'light', 'coming_soon', false, 1),
  ('sueno', 'Sueño', 'Sueño', 'Descansa. Mañana es otro comienzo.',
   'Rutinas nocturnas e higiene del sueño para descansar mejor, sin presión.',
   '#FFC857', '/assets/brand/alento-icone-ansiedade-sono.svg', 5, 'night', 'coming_soon', false, 1)
on conflict (slug) do update set
  name = excluded.name, tagline = excluded.tagline, description = excluded.description,
  color = excluded.color, icon = excluded.icon, position = excluded.position, theme = excluded.theme,
  commercial_status = excluded.commercial_status, published = excluded.published;

-- ---------------------------------------------------------------- 2) acceso por programa
alter table public.subscriptions add column if not exists program_slug text;
update public.subscriptions set program_slug = 'sem-fumo' where program_slug is null;
alter table public.subscriptions alter column program_slug set not null;
alter table public.subscriptions
  add constraint subscriptions_program_fk foreign key (program_slug) references public.journey_programs(slug);
create index if not exists subscriptions_user_program on public.subscriptions(user_id, program_slug);

-- Cortesías (access_grants) también por programa (antes de la función que las consulta).
alter table public.access_grants add column if not exists program_slug text;
update public.access_grants set program_slug = 'sem-fumo' where program_slug is null;
alter table public.access_grants alter column program_slug set not null;

-- Fuente única de verdad del acceso, ahora por programa.
create or replace function public.has_program_access(uid uuid, program text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = uid and program_slug = program and status in ('active', 'trialing', 'past_due')
  ) or exists (
    select 1 from public.access_grants
    where user_id = uid and program_slug = program and revoked_at is null and (expires_at is null or expires_at > now())
  );
$$;
revoke all on function public.has_program_access(uuid, text) from public, anon;
grant execute on function public.has_program_access(uuid, text) to authenticated, service_role;

-- has_premium (cualquier programa) se mantiene para usos globales (p. ej. notificaciones).
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

-- ---------------------------------------------------------------- 3) checkout por programa
alter table public.checkout_sessions add column if not exists program_slug text;
update public.checkout_sessions set program_slug = 'sem-fumo' where program_slug is null;
alter table public.checkout_sessions alter column program_slug set not null;
-- La compra desde el catálogo no parte de un cuestionario.
alter table public.checkout_sessions alter column assessment_id drop not null;

-- Un único checkout abierto por usuario Y programa (puede comprar dos programas a la vez, no dos veces el mismo).
drop index if exists public.checkout_sessions_one_open;
create unique index if not exists checkout_sessions_one_open
  on public.checkout_sessions(user_id, program_slug) where status = 'open';

-- ---------------------------------------------------------------- 4) cuestionario, plan y metas por programa
alter table public.questionnaire_sessions add column if not exists program_slug text not null default 'sem-fumo';
alter table public.user_assessments       add column if not exists program_slug text not null default 'sem-fumo';
alter table public.personalized_plans     add column if not exists program_slug text not null default 'sem-fumo';
alter table public.user_goals             add column if not exists program_slug text not null default 'sem-fumo';
alter table public.daily_goals            add column if not exists program_slug text not null default 'sem-fumo';

-- Un plan por usuario Y programa (antes: uno por usuario).
alter table public.personalized_plans drop constraint if exists personalized_plans_user_id_key;
create unique index if not exists personalized_plans_user_program on public.personalized_plans(user_id, program_slug);

-- Una versión de metas activa por usuario Y programa.
drop index if exists public.user_goals_one_active;
create unique index if not exists user_goals_one_active on public.user_goals(user_id, program_slug) where superseded_at is null;

-- ---------------------------------------------------------------- 5) registros de actividad genéricos
-- Sem Fumo mantiene sus tablas especializadas; los demás programas usan esta.
create table if not exists public.program_activity_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  program_slug text not null references public.journey_programs(slug),
  kind         text not null check (char_length(kind) between 2 and 40),
  value        jsonb not null default '{}',
  occurred_at  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index if not exists program_activity_user on public.program_activity_entries(user_id, program_slug, kind, occurred_at desc);
alter table public.program_activity_entries enable row level security;
create policy program_activity_select_own on public.program_activity_entries
  for select to authenticated using (user_id = (select auth.uid()));

-- Humor y respiración son transversales; se etiqueta el programa cuando aplica.
alter table public.mood_entries add column if not exists program_slug text;
alter table public.breathing_sessions add column if not exists program_slug text;

-- ---------------------------------------------------------------- 6) notificaciones por programa
-- Una fila de preferencias por usuario Y programa.
alter table public.notification_preferences add column if not exists program_slug text not null default 'sem-fumo';
alter table public.notification_preferences drop constraint if exists notification_preferences_pkey;
alter table public.notification_preferences add primary key (user_id, program_slug);
alter table public.notification_deliveries add column if not exists program_slug text not null default 'sem-fumo';

-- ---------------------------------------------------------------- 7) logros por programa
alter table public.achievements add column if not exists program_slug text not null default 'sem-fumo';

-- ---------------------------------------------------------------- 8) último programa usado
alter table public.profiles add column if not exists last_program_slug text;
