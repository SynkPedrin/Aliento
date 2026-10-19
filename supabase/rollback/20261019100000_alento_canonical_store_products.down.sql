-- Rollback de 20261019100000: devuelve los identificadores legados ``aliento''.
-- Incluido por simetría con el resto de rollbacks; los valores antiguos no fueron
-- usados por ninguna compra real (store-sync no estaba conectado antes de este ciclo).

update public.billing_product_mappings
set apple_product_id = replace(apple_product_id, 'app.alento.', 'app.aliento.'),
    google_product_id = replace(google_product_id, 'alento_', 'aliento_'),
    revenuecat_entitlement_id = replace(revenuecat_entitlement_id, 'alento_', 'aliento_');
