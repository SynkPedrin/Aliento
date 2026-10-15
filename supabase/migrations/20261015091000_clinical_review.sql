-- Estado de revisión clínica de cada lección. Ninguna se presenta como validada sin revisión profesional.
alter table public.journey_lessons add column if not exists clinical_review text not null default 'pending'
  check (clinical_review in ('pending', 'approved'));
alter table public.journey_lessons add column if not exists clinical_reviewer text check (char_length(clinical_reviewer) <= 120);
alter table public.journey_lessons add column if not exists clinical_reviewed_at timestamptz;
