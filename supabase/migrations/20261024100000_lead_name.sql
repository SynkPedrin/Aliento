-- Nombre de pila que el lead deja en el quiz (tras el e-mail). Dato personal: va en growth_pii.
alter table growth_pii.lead_pii add column if not exists first_name text;
