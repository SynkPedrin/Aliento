-- Endurecimiento para producción (incremental, no destructivo).

-- 1) Límite de intentos compartido entre instancias serverless.
create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null,
  hits         int not null
);
alter table public.rate_limits enable row level security; -- sin políticas: solo el servidor

create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits int;
begin
  insert into public.rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, int, int) from public, anon, authenticated;

-- 2) has_premium: no la puede consultar un anónimo (revelaría quién paga).
revoke execute on function public.has_premium(uuid) from anon, public;

-- 3) Escritura directa por la API pública cerrada donde el servidor valida:
--    suscripciones push (dominios permitidos, límite por usuario) y mensajes de la guía.
drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
drop policy if exists support_messages_insert_own on public.support_messages;
drop policy if exists support_messages_update_own on public.support_messages;

-- 4) Oferta de salida: un solo uso por persona (además de por cuestionario).
alter table public.profiles add column if not exists exit_offer_used_at timestamptz;

-- 5) Consentimiento del cuestionario anónimo (datos relacionados con la salud).
alter table public.questionnaire_sessions add column if not exists consent_at timestamptz;

-- 6) Índices para consultas frecuentes.
create index if not exists breathing_sessions_user_completed on public.breathing_sessions(user_id, completed_at) where completed_at is not null;
create index if not exists billing_events_pending on public.billing_events(received_at) where status <> 'processed';
create index if not exists questionnaire_sessions_anon_created on public.questionnaire_sessions(created_at) where user_id is null and claimed_user_id is null;
create index if not exists notification_deliveries_created on public.notification_deliveries(scheduled_for);
-- Un único checkout abierto por usuario (evita cobros duplicados entre instancias serverless).
create unique index if not exists checkout_sessions_one_open on public.checkout_sessions(user_id) where status = 'open';

-- 7) Retención (LGPD): cuestionarios anónimos sin cuenta > 30 días, envíos > 90 días,
--    eventos de facturación procesados > 1 año, contadores de límites viejos.
create or replace function public.purge_stale_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare a int; b int; c int; d int;
begin
  delete from public.questionnaire_sessions where user_id is null and claimed_user_id is null and created_at < now() - interval '30 days';
  get diagnostics a = row_count;
  delete from public.notification_deliveries where scheduled_for < now() - interval '90 days';
  get diagnostics b = row_count;
  delete from public.billing_events where status = 'processed' and received_at < now() - interval '365 days';
  get diagnostics c = row_count;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  get diagnostics d = row_count;
  return jsonb_build_object('questionnaires', a, 'deliveries', b, 'billing_events', c, 'rate_limits', d);
end $$;
revoke all on function public.purge_stale_data() from public, anon, authenticated;
