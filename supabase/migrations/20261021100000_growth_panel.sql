-- Painel de Operação e Growth: eventos, atribuição, anúncios, experimentos, e-mails e IA.
-- Aditiva e não destrutiva. Reversão: supabase/rollback/20261021100000_growth_panel.down.sql
-- Todo acesso é do backend (rol del pool). Nada se expone a anon/authenticated.

create schema if not exists growth;
create schema if not exists growth_pii; -- datos personales (e-mail): acceso restringido

-- ---------------------------------------------------------------- tráfico
create table if not exists growth.visitors (
  visitor_id    uuid primary key,
  first_touch   jsonb not null default '{}'::jsonb,   -- utm_*, fbclid, ttclid, referrer, landing, at
  last_touch    jsonb not null default '{}'::jsonb,
  country       text,
  language      text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  ip            text,
  user_agent    text
);

create table if not exists growth.sessions (
  session_id    uuid primary key,
  visitor_id    uuid not null references growth.visitors(visitor_id) on delete cascade,
  started_at    timestamptz not null default now(),
  entry_page    text,
  device        text,
  browser       text
);
create index if not exists sessions_visitor on growth.sessions(visitor_id);

create table if not exists growth.leads (
  lead_id        uuid primary key default gen_random_uuid(),
  visitor_id     uuid references growth.visitors(visitor_id) on delete set null,
  user_id        uuid,
  assessment_id  uuid,
  language       text,
  topic          text,                    -- programa (sem-fumo, alcohol, ...)
  attribution    jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists leads_visitor on growth.leads(visitor_id);

-- E-mail en esquema restringido.
create table if not exists growth_pii.lead_pii (
  lead_id     uuid primary key references growth.leads(lead_id) on delete cascade,
  email       text not null,
  email_hash  text not null,              -- sha256(lower(trim(email)))
  created_at  timestamptz not null default now()
);
create unique index if not exists lead_pii_email on growth_pii.lead_pii (lower(email));
create index if not exists lead_pii_hash on growth_pii.lead_pii (email_hash);

-- ---------------------------------------------------------------- eventos (solo inserción)
create table if not exists growth.events (
  event_id      uuid primary key,
  name          text not null,
  occurred_at   timestamptz not null default now(),
  visitor_id    uuid,
  session_id    uuid,
  lead_id       uuid,
  user_id       uuid,
  language      text,
  country       text,
  device        text,
  browser       text,
  page          text,
  program_slug  text,
  utm_source    text, utm_medium text, utm_campaign text, utm_term text, utm_content text,
  fbclid        text, ttclid text, fbp text, fbc text,
  variant       jsonb not null default '{}'::jsonb,   -- {experimento: variante}
  value_cents   bigint,
  currency      text,
  consent_marketing boolean not null default false,
  props         jsonb not null default '{}'::jsonb
);
create index if not exists events_name_time on growth.events(name, occurred_at);
create index if not exists events_visitor on growth.events(visitor_id, occurred_at);
create index if not exists events_lead on growth.events(lead_id);
create index if not exists events_user on growth.events(user_id);
create index if not exists events_time on growth.events(occurred_at);

-- La tabla de eventos solo recibe filas nuevas. Excepción: derecho de supresión
-- (growth.erase_person), que activa el interruptor local growth.erasing.
create or replace function growth.events_immutable() returns trigger language plpgsql as $$
begin
  if current_setting('growth.erasing', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'growth.events es de solo inserción';
end $$;
drop trigger if exists events_no_update on growth.events;
create trigger events_no_update before update or delete on growth.events
  for each row execute function growth.events_immutable();

create table if not exists growth.quiz_answers (
  id          bigserial primary key,
  lead_id     uuid,
  visitor_id  uuid,
  program_slug text,
  question    text not null,
  answer      text,
  seconds     numeric,
  quiz_version text,
  answered_at timestamptz not null default now()
);
create index if not exists quiz_answers_q on growth.quiz_answers(program_slug, question);
create index if not exists quiz_answers_visitor on growth.quiz_answers(visitor_id);

create table if not exists growth.consents (
  id          bigserial primary key,
  lead_id     uuid,
  visitor_id  uuid,
  user_id     uuid,
  kind        text not null check (kind in ('cookies_marketing', 'cookies_analytics', 'marketing_email', 'health_data')),
  granted     boolean not null,
  text_version text,
  ip          text,
  created_at  timestamptz not null default now()
);
create index if not exists consents_visitor on growth.consents(visitor_id, kind, created_at);
create index if not exists consents_lead on growth.consents(lead_id);

-- ---------------------------------------------------------------- ventas
create table if not exists growth.checkouts (
  stripe_session_id text primary key,
  user_id       uuid,
  lead_id       uuid,
  visitor_id    uuid,
  program_slug  text,
  plan          text,
  amount_cents  bigint,
  currency      text,
  status        text not null default 'open',   -- open | paid | expired | failed
  opened_at     timestamptz not null default now(),
  paid_at       timestamptz,
  first_touch   jsonb not null default '{}'::jsonb,
  last_touch    jsonb not null default '{}'::jsonb
);
create index if not exists checkouts_visitor on growth.checkouts(visitor_id);

create table if not exists growth.orders (
  order_id      text primary key,               -- invoice/session id o transacción de tienda
  provider      text not null default 'stripe', -- stripe | apple | google
  user_id       uuid,
  lead_id       uuid,
  visitor_id    uuid,
  program_slug  text,
  plan          text,
  kind          text not null default 'first',  -- first | renewal
  amount_cents  bigint not null,
  tax_cents     bigint not null default 0,
  currency      text not null,
  paid_at       timestamptz not null default now(),
  first_touch   jsonb not null default '{}'::jsonb,
  last_touch    jsonb not null default '{}'::jsonb
);
create index if not exists orders_user on growth.orders(user_id, paid_at);
create index if not exists orders_time on growth.orders(paid_at);

create table if not exists growth.subscriptions (
  subscription_id text primary key,             -- id de Stripe o de tienda
  provider      text not null default 'stripe',
  user_id       uuid,
  program_slug  text,
  plan          text,
  status        text not null,
  amount_cents  bigint,
  currency      text,
  started_at    timestamptz,
  next_billing_at timestamptz,
  canceled_at   timestamptz,
  cancel_reason text,
  updated_at    timestamptz not null default now()
);

create table if not exists growth.refunds (
  refund_id     text primary key,
  order_id      text,
  user_id       uuid,
  amount_cents  bigint not null,
  currency      text not null,
  reason        text,
  refunded_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- anuncios
create table if not exists growth.ads (
  platform      text not null check (platform in ('meta', 'tiktok')),
  ad_id         text not null,
  account_id    text,
  campaign_id   text, campaign_name text,
  adset_id      text, adset_name text,
  ad_name       text,
  thumbnail_url text,
  status        text,
  daily_budget_cents bigint,                    -- del conjunto
  updated_at    timestamptz not null default now(),
  primary key (platform, ad_id)
);

create table if not exists growth.ad_spend_daily (
  platform      text not null,
  ad_id         text not null,
  day           date not null,
  spend_cents   bigint not null default 0,
  impressions   bigint not null default 0,
  clicks        bigint not null default 0,
  reported_conversions numeric not null default 0,
  reported_value_cents bigint not null default 0,
  video_3s_views bigint not null default 0,
  updated_at    timestamptz not null default now(),
  primary key (platform, ad_id, day)
);
create index if not exists ad_spend_day on growth.ad_spend_daily(day);

-- ---------------------------------------------------------------- experimentos
create table if not exists growth.experiments (
  key           text primary key,
  name          text not null,
  kind          text not null check (kind in ('quiz', 'price', 'page', 'email')),
  variants      jsonb not null,                 -- [{"key":"a","weight":50},{"key":"b","weight":50}]
  goal_event    text not null default 'purchase',
  status        text not null default 'running' check (status in ('draft', 'running', 'stopped', 'won')),
  winner        text,
  created_at    timestamptz not null default now(),
  ended_at      timestamptz
);
create table if not exists growth.experiment_assignments (
  visitor_id    uuid not null,
  experiment_key text not null references growth.experiments(key) on delete cascade,
  variant       text not null,
  assigned_at   timestamptz not null default now(),
  primary key (visitor_id, experiment_key)
);

-- ---------------------------------------------------------------- e-mails
create table if not exists growth.email_events (
  id            bigserial primary key,
  flow          text,
  message       text,
  variant       text,
  event         text not null check (event in ('sent', 'delivered', 'opened', 'clicked', 'unsubscribed', 'bounced', 'converted')),
  lead_id       uuid,
  user_id       uuid,
  language      text,
  occurred_at   timestamptz not null default now(),
  raw           jsonb not null default '{}'::jsonb
);
create index if not exists email_events_flow on growth.email_events(flow, event, occurred_at);

-- ---------------------------------------------------------------- IA
create table if not exists growth.ai_reports (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('monitor', 'daily', 'weekly', 'question')),
  period_start  timestamptz,
  period_end    timestamptz,
  title         text,
  body          text not null,
  numbers       jsonb not null default '{}'::jsonb,
  model         text,
  llm           boolean not null default false,   -- false = informe por reglas (sin LLM)
  created_at    timestamptz not null default now()
);
create table if not exists growth.ai_actions (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('pause_ad', 'scale_budget', 'promote_variant', 'email_variant', 'creative_brief', 'price_change')),
  platform      text,
  target_id     text,
  reason        text not null,
  data          jsonb not null default '{}'::jsonb,
  confidence    text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  status        text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'executed', 'failed', 'undone')),
  auto          boolean not null default false,
  proposed_at   timestamptz not null default now(),
  decided_by    uuid,
  decided_at    timestamptz,
  executed_at   timestamptz,
  result        jsonb,
  undo_data     jsonb
);
create index if not exists ai_actions_status on growth.ai_actions(status, proposed_at);
create table if not exists growth.alerts (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  severity      text not null default 'warn' check (severity in ('info', 'warn', 'critical')),
  message       text not null,
  data          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  notified_at   timestamptz
);
create index if not exists alerts_open on growth.alerts(code) where resolved_at is null;

-- ---------------------------------------------------------------- operación
create table if not exists growth.settings (
  key           text primary key,
  value         jsonb not null,
  encrypted     boolean not null default false,   -- tokens: AES-256-GCM en value->>'v'
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);
create table if not exists growth.staff (
  user_id       uuid primary key,
  role          text not null check (role in ('admin', 'marketing', 'readonly')),
  totp_secret   text,                              -- cifrado
  totp_enabled  boolean not null default false,
  created_at    timestamptz not null default now()
);
create table if not exists growth.audit_log (
  id            bigserial primary key,
  actor         uuid,
  action        text not null,
  entity        text,
  entity_id     text,
  details       jsonb not null default '{}'::jsonb,
  at            timestamptz not null default now()
);
create table if not exists growth.outbox (
  id            bigserial primary key,
  event_id      uuid,
  destination   text not null check (destination in ('meta', 'tiktok', 'customerio')),
  payload       jsonb not null,
  status        text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts      int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error    text,
  response      jsonb,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index if not exists outbox_due on growth.outbox(status, next_attempt_at);
create unique index if not exists outbox_dedupe on growth.outbox(event_id, destination) where event_id is not null;

-- ---------------------------------------------------------------- supresión (RGPD/LGPD)
create or replace function growth.erase_person(p_lead uuid, p_user uuid, p_visitor uuid) returns void
language plpgsql security definer set search_path = growth, growth_pii, public as $$
begin
  perform set_config('growth.erasing', 'on', true);
  delete from growth.events where (p_lead is not null and lead_id = p_lead) or (p_user is not null and user_id = p_user) or (p_visitor is not null and visitor_id = p_visitor);
  delete from growth.quiz_answers where (p_lead is not null and lead_id = p_lead) or (p_visitor is not null and visitor_id = p_visitor);
  delete from growth.consents where (p_lead is not null and lead_id = p_lead) or (p_visitor is not null and visitor_id = p_visitor) or (p_user is not null and user_id = p_user);
  delete from growth.email_events where (p_lead is not null and lead_id = p_lead) or (p_user is not null and user_id = p_user);
  delete from growth.experiment_assignments where p_visitor is not null and visitor_id = p_visitor;
  update growth.orders set user_id = null, lead_id = null, visitor_id = null where (p_user is not null and user_id = p_user) or (p_lead is not null and lead_id = p_lead);
  update growth.checkouts set user_id = null, lead_id = null, visitor_id = null where (p_user is not null and user_id = p_user) or (p_lead is not null and lead_id = p_lead);
  update growth.subscriptions set user_id = null where p_user is not null and user_id = p_user;
  update growth.refunds set user_id = null where p_user is not null and user_id = p_user;
  delete from growth.leads where p_lead is not null and lead_id = p_lead;   -- cascada a lead_pii
  delete from growth.sessions where p_visitor is not null and visitor_id = p_visitor;
  delete from growth.visitors where p_visitor is not null and visitor_id = p_visitor;
end $$;

-- ---------------------------------------------------------------- vistas (sin datos personales)
-- Embudo diario por dimensión: visitantes distintos por etapa.
create or replace view growth.v_funil_diario as
select (occurred_at at time zone 'UTC')::date as day,
  coalesce(language, '-') as language, coalesce(country, '-') as country, coalesce(device, '-') as device,
  coalesce(utm_source, '(directo)') as source, coalesce(program_slug, '-') as program,
  count(distinct visitor_id) filter (where name = 'page_view') as visits,
  count(distinct visitor_id) filter (where name = 'quiz_started') as quiz_started,
  count(distinct visitor_id) filter (where name = 'lead_created') as leads,
  count(distinct visitor_id) filter (where name = 'plan_viewed') as plan_viewed,
  count(distinct visitor_id) filter (where name = 'plan_selected') as plan_selected,
  count(distinct visitor_id) filter (where name = 'checkout_started') as checkouts,
  count(distinct coalesce(visitor_id, user_id)) filter (where name = 'purchase') as purchases,
  count(distinct coalesce(user_id, visitor_id)) filter (where name = 'app_activated') as activated
from growth.events
group by 1, 2, 3, 4, 5, 6;

-- Abandono por pregunta del quiz.
create or replace view growth.v_quiz_preguntas as
select program_slug as program, question,
  count(*) as answers, round(avg(seconds)::numeric, 1) as avg_seconds,
  count(distinct coalesce(lead_id::text, visitor_id::text)) as people
from growth.quiz_answers group by 1, 2;

create or replace view growth.v_quiz_respuestas as
select program_slug as program, question, answer, count(*) as total
from growth.quiz_answers group by 1, 2, 3;

-- Pedidos con atribución de último toque, primer toque y reembolsos acumulados.
create or replace view growth.v_atribuicao as
select o.order_id, o.provider, (o.paid_at at time zone 'UTC')::date as day, o.paid_at,
  o.program_slug as program, o.plan, o.kind, o.currency, o.amount_cents,
  coalesce((select sum(r.amount_cents) from growth.refunds r where r.order_id = o.order_id), 0) as refunded_cents,
  o.amount_cents - coalesce((select sum(r.amount_cents) from growth.refunds r where r.order_id = o.order_id), 0) as net_cents,
  coalesce(o.last_touch->>'utm_source', '(directo)') as last_source,
  o.last_touch->>'utm_campaign' as last_campaign, o.last_touch->>'utm_term' as last_adset, o.last_touch->>'utm_content' as last_ad,
  coalesce(o.first_touch->>'utm_source', '(directo)') as first_source,
  o.first_touch->>'utm_campaign' as first_campaign, o.first_touch->>'utm_term' as first_adset, o.first_touch->>'utm_content' as first_ad
from growth.orders o;

-- Rendimiento por anuncio y día: gasto + embudo + ventas unidos por el ad_id de utm_content.
create or replace view growth.v_desempenho_anuncios as
with ev as (
  select (occurred_at at time zone 'UTC')::date as day, utm_content as ad_id,
    count(distinct lead_id) filter (where name = 'lead_created') as leads,
    count(distinct visitor_id) filter (where name = 'checkout_started') as checkouts,
    count(distinct visitor_id) filter (where name = 'quiz_started') as quiz_started
  from growth.events where utm_content is not null group by 1, 2
), ord as (
  select day, last_ad as ad_id, count(*) filter (where kind = 'first') as purchases,
    sum(net_cents) as revenue_net_cents, sum(refunded_cents) as refunded_cents
  from growth.v_atribuicao where last_ad is not null group by 1, 2
)
select s.day, s.platform, s.ad_id, a.ad_name, a.adset_id, a.adset_name, a.campaign_id, a.campaign_name, a.thumbnail_url, a.status,
  s.spend_cents, s.impressions, s.clicks, s.video_3s_views, s.reported_conversions, s.reported_value_cents,
  coalesce(ev.quiz_started, 0) as quiz_started, coalesce(ev.leads, 0) as leads, coalesce(ev.checkouts, 0) as checkouts,
  coalesce(ord.purchases, 0) as purchases, coalesce(ord.revenue_net_cents, 0) as revenue_net_cents, coalesce(ord.refunded_cents, 0) as refunded_cents
from growth.ad_spend_daily s
left join growth.ads a on a.platform = s.platform and a.ad_id = s.ad_id
left join ev on ev.day = s.day and ev.ad_id = s.ad_id
left join ord on ord.day = s.day and ord.ad_id = s.ad_id;

-- Cohortes por mes de la primera compra: ingresos netos acumulados por meses transcurridos.
create or replace view growth.v_coortes as
with first_order as (
  select user_id, min(paid_at) as first_at from growth.orders where user_id is not null group by 1
)
select to_char(date_trunc('month', f.first_at), 'YYYY-MM') as cohort,
  coalesce(a.last_source, '(directo)') as source, o.currency,
  ((extract(year from o.paid_at) - extract(year from f.first_at)) * 12 + extract(month from o.paid_at) - extract(month from f.first_at))::int as months_since,
  count(distinct o.user_id) as payers, sum(a.net_cents) as net_cents
from growth.orders o
join first_order f on f.user_id = o.user_id
join growth.v_atribuicao a on a.order_id = o.order_id
where o.user_id is not null
group by 1, 2, 3, 4;

create or replace view growth.v_ventas_diarias as
select day, program, plan, currency, kind, count(*) as orders, sum(amount_cents) as gross_cents, sum(refunded_cents) as refunded_cents, sum(net_cents) as net_cents
from growth.v_atribuicao group by 1, 2, 3, 4, 5;

create or replace view growth.v_emails as
select flow, coalesce(language, '-') as language, coalesce(variant, '-') as variant,
  count(*) filter (where event = 'sent') as sent, count(*) filter (where event = 'opened') as opened,
  count(*) filter (where event = 'clicked') as clicked, count(*) filter (where event = 'unsubscribed') as unsubscribed,
  count(*) filter (where event = 'converted') as converted
from growth.email_events group by 1, 2, 3;

-- ---------------------------------------------------------------- permisos
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'growth_ai') then create role growth_ai nologin; end if;
end $$;
grant usage on schema growth to growth_ai;
grant select on growth.v_funil_diario, growth.v_quiz_preguntas, growth.v_quiz_respuestas, growth.v_atribuicao,
  growth.v_desempenho_anuncios, growth.v_coortes, growth.v_ventas_diarias, growth.v_emails to growth_ai;
do $$ begin execute format('grant growth_ai to %I', current_user); exception when others then null; end $$;

-- Ninguna tabla es visible para las APIs públicas de Supabase.
revoke all on schema growth from anon, authenticated;
revoke all on schema growth_pii from anon, authenticated;
revoke all on all tables in schema growth from anon, authenticated;
revoke all on all tables in schema growth_pii from anon, authenticated;
do $$
declare t record;
begin
  for t in select schemaname, tablename from pg_tables where schemaname in ('growth', 'growth_pii') loop
    execute format('alter table %I.%I enable row level security', t.schemaname, t.tablename);
  end loop;
end $$;
