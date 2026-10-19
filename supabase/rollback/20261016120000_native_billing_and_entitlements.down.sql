-- Rollback de facturación nativa y mapeo de productos.
drop policy if exists billing_mappings_select on public.billing_product_mappings;
drop table if exists public.billing_product_mappings;
drop index if exists public.subscriptions_provider_tx;
alter table public.subscriptions
  drop column if exists store_original_transaction_id,
  drop column if exists store_transaction_id,
  drop column if exists billing_provider;
