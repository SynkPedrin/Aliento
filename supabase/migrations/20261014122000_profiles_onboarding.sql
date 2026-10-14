-- Fin de la configuración inicial (meta, fecha, notificaciones). Solo lo escribe el servidor.
alter table public.profiles add column if not exists onboarded_at timestamptz;
