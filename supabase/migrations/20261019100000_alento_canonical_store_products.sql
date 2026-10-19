-- 20261019100000: Identificadores canônicos de tienda con la marca oficial ALENTO.
--
-- El ciclo anterior sembró los mapeos de Shopify/Apple/Google con el nombre legado
-- ómnibus ``aliento'' (con i). La marca oficial del producto es ALENTO y los
-- identificadores de tienda generados deben usarla (server/billing-mappings.js).
-- Ningún usuario ha comprado por tienda nativa todavía (el módulo store-sync no
-- estaba conectado a despliegues previos), de modo que ningún dato de cliente
-- depende de los valores antiguos.
--
-- Es una migración solo de datos, sin cambios de esquema. No toca.subscriptions
-- ni filas de usuarios.

update public.billing_product_mappings
set apple_product_id = replace(apple_product_id, 'app.aliento.', 'app.alento.'),
    google_product_id = replace(google_product_id, 'aliento_', 'alento_'),
    revenuecat_entitlement_id = replace(revenuecat_entitlement_id, 'aliento_', 'alento_');
