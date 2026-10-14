-- Permite borrar una evaluación (p. ej. al eliminar la cuenta) sin perder el rastro del checkout.
alter table public.checkout_sessions alter column assessment_id drop not null;
alter table public.checkout_sessions drop constraint if exists checkout_sessions_assessment_id_fkey;
alter table public.checkout_sessions add constraint checkout_sessions_assessment_id_fkey
  foreign key (assessment_id) references public.user_assessments(id) on delete set null;
