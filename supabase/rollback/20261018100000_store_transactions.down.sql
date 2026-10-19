-- Reversión de store_transactions (solo elimina la tabla nueva; no toca datos de otros módulos).
drop table if exists public.store_transactions;
