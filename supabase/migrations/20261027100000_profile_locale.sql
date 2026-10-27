-- Idioma da conta: a pessoa escolhe (ou vem do navegador) e vale em qualquer aparelho.
-- Aditiva: só amplia a lista de idiomas aceitos. Reversão: supabase/rollback/20261027100000_profile_locale.down.sql
alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check check (locale in ('es', 'en', 'pt', 'fr', 'de', 'it'));
