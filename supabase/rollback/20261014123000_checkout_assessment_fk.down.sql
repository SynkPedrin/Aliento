alter table public.checkout_sessions drop constraint if exists checkout_sessions_assessment_id_fkey;
alter table public.checkout_sessions add constraint checkout_sessions_assessment_id_fkey
  foreign key (assessment_id) references public.user_assessments(id);
-- (assessment_id queda admitiendo nulos: volver a NOT NULL fallaría si ya hay filas nulas.)
