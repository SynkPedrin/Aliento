-- Reversión del panel de growth: elimina solo los esquemas growth y growth_pii (y el rol de lectura).
drop schema if exists growth cascade;
drop schema if exists growth_pii cascade;
do $$ begin if exists (select 1 from pg_roles where rolname = 'growth_ai') then drop owned by growth_ai; drop role growth_ai; end if; end $$;
