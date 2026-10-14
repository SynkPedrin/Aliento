-- Aliento · esquema principal
-- Migración incremental y no destructiva: solo CREATE ... IF NOT EXISTS y políticas nuevas.
-- Reversión: supabase/rollback/20261014120000_aliento_core.down.sql
--
-- Modelo de acceso:
--   · El servidor (Express) consulta Postgres con dos modos:
--       - como servicio (rol postgres; ignora RLS) para webhooks, cuestionario anónimo y tareas de sistema;
--       - como usuario (SET LOCAL ROLE authenticated + request.jwt.claims) para todo dato personal,
--         de modo que RLS se aplica también a las consultas del propio servidor.
--   · La autorización de administración usa la tabla admin_users, que ningún usuario puede leer ni escribir.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- utilidades
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------- perfiles y administración
create table if not exists public.profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 80),
  locale             text not null default 'es' check (locale in ('es')),
  timezone           text not null default 'UTC',
  stripe_customer_id text unique,
  terms_accepted_at  timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create or replace trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id            bigint generated always as identity primary key,
  admin_user_id uuid references auth.users(id) on delete set null,
  action        text not null,
  entity        text not null,
  entity_id     text,
  details       jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- cuestionario
create table if not exists public.questionnaire_sessions (
  id                    uuid primary key default gen_random_uuid(),
  quiz_version          int not null,
  current_step          text,
  claimed_user_id       uuid references auth.users(id) on delete set null, -- al identificarse
  user_id               uuid references auth.users(id) on delete set null, -- al confirmarse el pago
  completed_at          timestamptz,
  exit_offer_shown_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists questionnaire_sessions_claimed on public.questionnaire_sessions(claimed_user_id);
create index if not exists questionnaire_sessions_user on public.questionnaire_sessions(user_id);
create or replace trigger questionnaire_sessions_touch before update on public.questionnaire_sessions
  for each row execute function public.touch_updated_at();

create table if not exists public.questionnaire_answers (
  session_id  uuid not null references public.questionnaire_sessions(id) on delete cascade,
  question_id text not null,
  value       jsonb not null,
  answered_at timestamptz not null default now(),
  primary key (session_id, question_id)
);

create table if not exists public.user_assessments (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null unique references public.questionnaire_sessions(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  result      jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists user_assessments_user on public.user_assessments(user_id);

-- ---------------------------------------------------------------- plan personalizado y metas
create table if not exists public.personalized_plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users(id) on delete cascade,
  assessment_id   uuid references public.user_assessments(id) on delete set null,
  current_version int not null default 1,
  created_at      timestamptz not null default now()
);

create table if not exists public.plan_versions (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.personalized_plans(id) on delete cascade,
  version    int not null,
  data       jsonb not null,
  reason     text not null,
  created_at timestamptz not null default now(),
  unique (plan_id, version)
);

-- Una fila por versión de objetivos: al editar se inserta una nueva y se cierra la anterior (historial).
create table if not exists public.user_goals (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  strategy           text not null check (strategy in ('parar', 'gradual', 'reducir')),
  start_date         date not null,
  quit_date          date,
  max_daily          int check (max_daily between 0 and 200),
  exercise_per_week  int not null default 3 check (exercise_per_week between 0 and 21),
  money_goal         numeric(10, 2) check (money_goal >= 0),
  money_goal_label   text check (char_length(money_goal_label) <= 80),
  created_at         timestamptz not null default now(),
  superseded_at      timestamptz
);
create unique index if not exists user_goals_one_active on public.user_goals(user_id) where superseded_at is null;

create table if not exists public.daily_goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  week       int not null,
  title      text not null,
  detail     text,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists daily_goals_user on public.daily_goals(user_id, week);

-- ---------------------------------------------------------------- jornada
create table if not exists public.journey_programs (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  title      text not null,
  version    int not null default 1,
  published  boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.journey_chapters (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.journey_programs(id) on delete cascade,
  slug        text not null,
  number      int not null,
  title       text not null,
  description text not null,
  published   boolean not null default false,
  updated_at  timestamptz not null default now(),
  unique (program_id, slug)
);

create table if not exists public.journey_lessons (
  id          uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null references public.journey_chapters(id) on delete cascade,
  slug        text not null unique,
  position    int not null,
  title       text not null,
  description text not null,
  minutes     int not null check (minutes between 1 and 60),
  published   boolean not null default false,
  version     int not null default 1,
  updated_at  timestamptz not null default now()
);
create index if not exists journey_lessons_chapter on public.journey_lessons(chapter_id, position);

create table if not exists public.lesson_blocks (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.journey_lessons(id) on delete cascade,
  block_key  text not null,
  position   int not null,
  type       text not null check (type in ('educational_text', 'multiple_choice', 'reflection',
               'interactive_exercise', 'breathing_exercise', 'commitment', 'feedback', 'completion')),
  content    jsonb not null,
  unique (lesson_id, block_key)
);

create table if not exists public.lesson_responses (
  user_id      uuid not null references auth.users(id) on delete cascade,
  lesson_id    uuid not null references public.journey_lessons(id) on delete cascade,
  block_key    text not null,
  response     jsonb not null,
  responded_at timestamptz not null default now(),
  primary key (user_id, lesson_id, block_key)
);

create table if not exists public.user_lesson_progress (
  user_id        uuid not null references auth.users(id) on delete cascade,
  lesson_id      uuid not null references public.journey_lessons(id) on delete cascade,
  status         text not null check (status in ('in_progress', 'completed')),
  lesson_version int not null default 1,
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  primary key (user_id, lesson_id)
);

create table if not exists public.user_chapter_progress (
  user_id      uuid not null references auth.users(id) on delete cascade,
  chapter_id   uuid not null references public.journey_chapters(id) on delete cascade,
  status       text not null check (status in ('in_progress', 'completed')),
  completed_at timestamptz,
  primary key (user_id, chapter_id)
);

-- ---------------------------------------------------------------- registros
create table if not exists public.smoking_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  smoked_at         timestamptz not null,
  quantity          int not null default 1 check (quantity between 1 and 50),
  trigger           text check (char_length(trigger) <= 40),
  mood              text check (char_length(mood) <= 40),
  note              text check (char_length(note) <= 500),
  client_request_id uuid not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, client_request_id) -- evita duplicados por doble clic o reintento
);
create index if not exists smoking_entries_user_time on public.smoking_entries(user_id, smoked_at);
create or replace trigger smoking_entries_touch before update on public.smoking_entries
  for each row execute function public.touch_updated_at();

create table if not exists public.craving_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  felt_at           timestamptz not null default now(),
  feeling           text check (char_length(feeling) <= 40),
  trigger           text check (char_length(trigger) <= 40),
  intensity         int not null check (intensity between 1 and 5),
  outcome           text check (outcome in ('resisted', 'smoked')),
  strategy          text check (char_length(strategy) <= 60),
  client_request_id uuid not null,
  created_at        timestamptz not null default now(),
  unique (user_id, client_request_id)
);
create index if not exists craving_entries_user_time on public.craving_entries(user_id, felt_at);

create table if not exists public.mood_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  day        date not null,
  mood       int not null check (mood between 1 and 5), -- 5 muy bien … 1 muy mal
  note       text check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, day)
);
create or replace trigger mood_entries_touch before update on public.mood_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- respiración
create table if not exists public.breathing_exercises (
  slug        text primary key,
  name        text not null,
  description text not null,
  inhale      int not null check (inhale between 1 and 10),
  hold        int not null check (hold between 0 and 10),
  exhale      int not null check (exhale between 1 and 12),
  hold_after  int not null default 0 check (hold_after between 0 and 10),
  position    int not null default 0
);

create table if not exists public.breathing_sessions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  exercise_slug   text not null references public.breathing_exercises(slug),
  planned_seconds int not null check (planned_seconds between 30 and 1800),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  active_seconds  int check (active_seconds between 0 and 3600)
);
create index if not exists breathing_sessions_user on public.breathing_sessions(user_id, started_at);

-- ---------------------------------------------------------------- logros
create table if not exists public.achievements (
  slug        text primary key,
  title       text not null,
  description text not null,
  icon        text not null,
  position    int not null default 0
);

create table if not exists public.user_achievements (
  user_id          uuid not null references auth.users(id) on delete cascade,
  achievement_slug text not null references public.achievements(slug),
  unlocked_at      timestamptz not null default now(),
  primary key (user_id, achievement_slug) -- nunca se concede dos veces
);

-- ---------------------------------------------------------------- notificaciones
create table if not exists public.notification_preferences (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  enabled         boolean not null default false,
  consent_at      timestamptz,
  timezone        text not null default 'UTC',
  reminder_time   time not null default '09:00',
  lessons         boolean not null default true,
  tracking        boolean not null default true,
  exercises       boolean not null default true,
  achievements    boolean not null default true,
  weekly_summary  boolean not null default true,
  updated_at      timestamptz not null default now()
);
create or replace trigger notification_preferences_touch before update on public.notification_preferences
  for each row execute function public.touch_updated_at();

create table if not exists public.notification_deliveries (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  category      text not null,
  channel       text not null,
  status        text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  scheduled_for timestamptz not null,
  sent_at       timestamptz,
  error         text
);

-- ---------------------------------------------------------------- facturación
create table if not exists public.checkout_sessions (
  id            text primary key, -- cs_...
  user_id       uuid not null references auth.users(id) on delete cascade,
  assessment_id uuid not null references public.user_assessments(id),
  plan          text not null,
  price_id      text not null,
  coupon_id     text,
  url           text,
  status        text not null default 'open' check (status in ('open', 'complete', 'expired')),
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists checkout_sessions_user on public.checkout_sessions(user_id, status);
create or replace trigger checkout_sessions_touch before update on public.checkout_sessions
  for each row execute function public.touch_updated_at();

create table if not exists public.subscriptions (
  id                   text primary key, -- sub_...
  user_id              uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id   text not null,
  plan                 text not null,
  price_id             text not null,
  amount               int,
  currency             text,
  interval             text,
  interval_count       int,
  status               text not null,
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists subscriptions_user on public.subscriptions(user_id);
create or replace trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Idempotencia de webhooks + rastro mínimo (sin datos personales del payload).
create table if not exists public.billing_events (
  id           text primary key, -- evt_...
  type         text not null,
  object_id    text,
  status       text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  error        text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);

-- Casos que la conciliación no puede resolver con certeza → revisión manual.
create table if not exists public.billing_reconciliation_reviews (
  id                     uuid primary key default gen_random_uuid(),
  stripe_subscription_id text not null unique,
  stripe_customer_id     text,
  reason                 text not null,
  status                 text not null default 'open' check (status in ('open', 'resolved')),
  created_at             timestamptz not null default now(),
  resolved_at            timestamptz
);

-- ---------------------------------------------------------------- apoyo
create table if not exists public.support_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('user', 'guide')),
  content         text not null check (char_length(content) <= 2000),
  created_at      timestamptz not null default now()
);
create index if not exists support_messages_conv on public.support_messages(conversation_id, id);

-- ---------------------------------------------------------------- acceso premium
-- Fuente única de verdad sobre si un usuario tiene acceso de pago.
create or replace function public.has_premium(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions
    where user_id = uid and status in ('active', 'trialing', 'past_due')
  );
$$;
revoke all on function public.has_premium(uuid) from public;
grant execute on function public.has_premium(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- RLS
do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'admin_users', 'admin_audit_logs', 'questionnaire_sessions', 'questionnaire_answers',
    'user_assessments', 'personalized_plans', 'plan_versions', 'user_goals', 'daily_goals',
    'journey_programs', 'journey_chapters', 'journey_lessons', 'lesson_blocks', 'lesson_responses',
    'user_lesson_progress', 'user_chapter_progress', 'smoking_entries', 'craving_entries', 'mood_entries',
    'breathing_exercises', 'breathing_sessions', 'achievements', 'user_achievements',
    'notification_preferences', 'notification_deliveries', 'checkout_sessions', 'subscriptions',
    'billing_events', 'billing_reconciliation_reviews', 'support_conversations', 'support_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Sin políticas = sin acceso para anon/authenticated:
--   admin_users, admin_audit_logs, billing_events, billing_reconciliation_reviews,
--   notification_deliveries, checkout_sessions (solo el servidor).

-- Perfil: leer y editar el propio (columnas limitadas más abajo).
create policy profiles_select_own on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.profiles from authenticated, anon;
grant update (name, timezone) on public.profiles to authenticated;

-- Cuestionario: el dueño puede leer su evaluación (anónimo → lo gestiona el servidor).
create policy qs_select_own on public.questionnaire_sessions for select to authenticated
  using (user_id = (select auth.uid()) or claimed_user_id = (select auth.uid()));
create policy qa_select_own on public.questionnaire_answers for select to authenticated
  using (exists (select 1 from public.questionnaire_sessions s where s.id = session_id
                 and (s.user_id = (select auth.uid()) or s.claimed_user_id = (select auth.uid()))));
create policy ua_select_own on public.user_assessments for select to authenticated
  using (user_id = (select auth.uid()) or exists (
    select 1 from public.questionnaire_sessions s where s.id = session_id and s.claimed_user_id = (select auth.uid())));

-- Plan: lectura propia (lo crea el servidor al activar).
create policy pp_select_own on public.personalized_plans for select to authenticated using (user_id = (select auth.uid()));
create policy pv_select_own on public.plan_versions for select to authenticated
  using (exists (select 1 from public.personalized_plans p where p.id = plan_id and p.user_id = (select auth.uid())));

-- Tablas de datos propios con CRUD completo del dueño.
do $$
declare t text;
begin
  foreach t in array array['user_goals', 'daily_goals', 'smoking_entries', 'craving_entries', 'mood_entries',
                           'breathing_sessions', 'notification_preferences', 'support_conversations', 'support_messages',
                           'lesson_responses'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete_own', t);
  end loop;
end $$;

-- Progreso y logros: el usuario solo los lee; los escribe el servidor tras validar (no manipulables).
create policy ulp_select_own on public.user_lesson_progress for select to authenticated using (user_id = (select auth.uid()));
create policy ucp_select_own on public.user_chapter_progress for select to authenticated using (user_id = (select auth.uid()));
create policy uach_select_own on public.user_achievements for select to authenticated using (user_id = (select auth.uid()));
create policy subs_select_own on public.subscriptions for select to authenticated using (user_id = (select auth.uid()));

-- Contenido publicado: visible para usuarios con suscripción activa.
create policy jp_select_published on public.journey_programs for select to authenticated
  using (published and public.has_premium((select auth.uid())));
create policy jc_select_published on public.journey_chapters for select to authenticated
  using (published and public.has_premium((select auth.uid())));
create policy jl_select_published on public.journey_lessons for select to authenticated
  using (published and public.has_premium((select auth.uid())));
create policy lb_select_published on public.lesson_blocks for select to authenticated
  using (public.has_premium((select auth.uid())) and exists (
    select 1 from public.journey_lessons l where l.id = lesson_id and l.published));

-- Catálogos no personales.
create policy be_select_all on public.breathing_exercises for select to authenticated using (true);
create policy ach_select_all on public.achievements for select to authenticated using (true);

-- ---------------------------------------------------------------- catálogos iniciales
insert into public.breathing_exercises (slug, name, description, inhale, hold, exhale, hold_after, position) values
  ('calma-4-6', 'Calma 4·6', 'Exhalar más largo que inhalar ayuda a bajar el ritmo. Ideal cuando aparecen las ganas.', 4, 0, 6, 0, 1),
  ('caja-4-4', 'Respiración cuadrada', 'Cuatro tiempos iguales para recuperar el foco en momentos de tensión.', 4, 4, 4, 4, 2),
  ('pausa-4-2-6', 'Pausa consciente', 'Una breve retención antes de soltar. Para hacer una pausa sin cigarrillo.', 4, 2, 6, 0, 3)
on conflict (slug) do nothing;

insert into public.achievements (slug, title, description, icon, position) values
  ('primer-paso', 'Mi primer paso', 'Activaste tu plan Aliento.', 'sprout', 1),
  ('primera-leccion', 'Primera lección completada', 'Completaste tu primera lección.', 'book', 2),
  ('primer-capitulo', 'Primer capítulo superado', 'Completaste un capítulo entero de tu jornada.', 'leaf', 3),
  ('primer-registro', 'Datos en marcha', 'Hiciste tu primer registro.', 'pen', 4),
  ('semana-seguimiento', 'Una semana de seguimiento', 'Registraste tu progreso durante 7 días distintos.', 'calendar', 5),
  ('ganas-superadas', 'Ganas superadas', 'Superaste unas ganas de fumar sin fumar.', 'wave', 6),
  ('respiracion-5', 'Cinco respiraciones', 'Completaste 5 ejercicios de respiración.', 'wind', 7),
  ('primer-dia-sin-fumar', 'Mi primer día sin fumar', 'Registraste un día completo con cero cigarrillos.', 'sun', 8),
  ('un-mes', 'Un mes de progreso', 'Llevas 30 días con tu plan Aliento.', 'mountain', 9)
on conflict (slug) do nothing;
