-- Reversión: quita solo las columnas de orden de eventos de tienda.
alter table public.subscriptions drop column if exists store_event_at, drop column if exists last_verified_at;
