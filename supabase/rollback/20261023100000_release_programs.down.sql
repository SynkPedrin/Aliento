-- Vuelve los 4 programas a «Próximamente» y los despublica (no borra datos de usuarios ni suscripciones).
update public.journey_programs set commercial_status = 'coming_soon', published = false where slug in ('alcohol', 'azucar', 'ansiedad', 'sueno');
update public.journey_chapters set published = false where program_id in (select id from public.journey_programs where slug in ('alcohol', 'azucar', 'ansiedad', 'sueno'));
update public.journey_lessons set published = false where chapter_id in (select c.id from public.journey_chapters c join public.journey_programs p on p.id = c.program_id where p.slug in ('alcohol', 'azucar', 'ansiedad', 'sueno'));
