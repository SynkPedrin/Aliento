-- Consentimiento específico para datos relacionados con la salud (LGPD art. 11 / RGPD art. 9.2.a).
alter table public.profiles add column if not exists health_consent_at timestamptz;
