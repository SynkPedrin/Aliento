-- Liberación comercial de Alcohol, Azúcar, Ansiedad y Sueño (decisión del titular del producto).
-- Solo cambia estado y publicación. NO toca `clinical_review`: las lecciones siguen figurando como
-- «pendiente» hasta que alguien con criterio clínico las apruebe en /admin.
-- Reversión: supabase/rollback/20261023100000_release_programs.down.sql
update public.journey_programs set commercial_status = 'active', published = true
  where slug in ('alcohol', 'azucar', 'ansiedad', 'sueno');
update public.journey_chapters set published = true
  where program_id in (select id from public.journey_programs where slug in ('alcohol', 'azucar', 'ansiedad', 'sueno'));
update public.journey_lessons set published = true
  where chapter_id in (select c.id from public.journey_chapters c join public.journey_programs p on p.id = c.program_id
                       where p.slug in ('alcohol', 'azucar', 'ansiedad', 'sueno'));
