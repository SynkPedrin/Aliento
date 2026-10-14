-- ⚠️ Borra las suscripciones push de todos los dispositivos.
drop policy if exists notification_deliveries_select_own on public.notification_deliveries;
drop index if exists public.notification_deliveries_dedupe;
alter table public.notification_deliveries drop column if exists dedupe_key, drop column if exists title;
drop table if exists public.push_subscriptions;
