update public.profiles set locale = 'es' where locale <> 'es';
alter table public.profiles drop constraint if exists profiles_locale_check;
alter table public.profiles add constraint profiles_locale_check check (locale = 'es');
