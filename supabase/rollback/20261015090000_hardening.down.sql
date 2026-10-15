drop function if exists public.purge_stale_data();
drop index if exists public.checkout_sessions_one_open, public.notification_deliveries_created,
  public.questionnaire_sessions_anon_created, public.billing_events_pending, public.breathing_sessions_user_completed;
alter table public.questionnaire_sessions drop column if exists consent_at;
alter table public.profiles drop column if exists exit_offer_used_at;
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy support_messages_insert_own on public.support_messages for insert to authenticated with check (user_id = (select auth.uid()));
grant execute on function public.has_premium(uuid) to anon;
drop function if exists public.hit_rate_limit(text, int, int);
drop table if exists public.rate_limits;
