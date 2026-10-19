# Alento — App Store / Play Store Checklist (preparación, nada publicado)

Estado al 2026-10-19: todo lo marcado pendiente requiere decisiones de negocio, cuentas de desarrollador o credenciales — **ningún paso se ejecutó en contra de servicios externos**.

## 0. Requisitos previos de negocio (bloqueantes)

- [ ] Cuenta Apple Developer (Team ID, App ID `app.alento.*` activado con In-App Purchase).
- [ ] En App Store Connect: crear los 11 productos no-consumibles/suscripciones con los ids `app.alento.<programa>_<plan>` (sem_fumo × mensual/trimestral/anual/semanal…) — o decidir el esquema de ids final y fijar `APPLE_PRODUCT_*`.
- [ ] Cuenta Google Play Console + permite billing; products `aliento_<programa>_<plan>`; service account JSON con acceso Android Publisher → `GOOGLE_SERVICE_ACCOUNT_JSON`.
- [ ] Decisión: la app iOS/Android entra al store solo cuando los 4 programas restantes pasen revisión clínica, o publicando solo Sem Fumo (exactamente igual que la web hoy).

## 1. Backend ya verificado (esto ya está hecho)

- [x] `POST /api/store/transactions` verifica JWS StoreKit 2 (ES256, cadena al Apple Root CA - G3 **pinneada**, bundle+environment) → activa el entitlement del programa comprado y audita en `store_transactions`.
- [x] `POST /api/store/notifications/apple` — App Store Server Notifications V2 (renovaciones, reembolsos, gracia): cada payload se verifica; el reembolso revoca acceso.
- [x] `GET /api/store/restore`, `GET /api/store/products`.
- [x] `GOOGLE_*`: verificación real por `androidpublisher` (subscriptionsv2); estados válidos ACTIVE/IN_GRACE_PERIOD.
- [x] `test/store-sync.test.js` 9/9 verde; suite completa 40/40.

## 2. Proyecto nativo iOS

- [x] **2026-10-19: hecho en esta máquina** — Capacitor 8.5.3 (devDeps) + `npx cap init Alento app.alento --web-dir public` + `npx cap add ios --packagemanager spm` (CocoaPods NO necesario: SPM resuelve sin `pod`). Proyecto en `ios/App/`.
- [x] **Validación de build**: `xcodebuild -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO` → `** BUILD SUCCEEDED **` (app `app.alento` generada para el simulador).
- [ ] Firma + device build: requiere cuenta Apple Developer y perfil de provisioning (acción externa; no ejecutar sin autorización).
- [ ] StoreKit capability + IAP + asociar App ID en Xcode (requiere sesión de firma).
- [ ] `APPLE_BUNDLE_ID` = bundle final en el entorno del servidor (aviso actual del server: «Falta APPLE_BUNDLE_ID»); `APPLE_APP_STORE_ENV=sandbox` para TestFlight.
- [ ] Registrar `https://<prod>/api/store/notifications/apple` como App Store Server Notifications V2 (producción y sandbox).

## 3. Metadata / cumplimiento

- [ ] Screenshots por dispositivo (6.7″, 6.1″, iPad if universal).
- [ ] Privacy nutrition labels (data with health data; contenido k individuals) — la app colecciona salud/hábitos: completar App Privacy con la misma verdad de `privacidad.html`.
- [ ] Ficha: descripción en español (mercado principal), keywords, support URL, marketing URL.
- [ ] Age rating questionnaire (wellness, no medical claim — el copy legal es «educativo y de apoyo»).
- [ ] Review notes: cuenta demo + instrucciones para el revisor (las cuentas cortesía existen: `npm run access:grant`).
- [ ] Export/encryption compliance (HTTPS only → ITSAppUsesNonExemptEncryption=false si no hay crypto custom).
- [ ] Account deletion IN-APP (App Store exige): `DELETE /api/account` existe en la web — la app nativa debe exponerla en Ajustes; añadirlo a la pata nativa cuando exista.

## 4. Google Play (equivalente)

- [ ] Play Console: products suscripción `alento_*`; testers internos; licensing testing.
- [ ] Data safety form alineada con `privacidad.html`.
- [ ] Health apps declaration (hábitos tabáquicos) si aplica.

## 5. Post-aprobación (production enablement)

- [ ] `APPLE_APP_STORE_ENV=production`, `APPLE_BUNDLE_ID` definitivo, products activados en purdad.
- [ ] Monitoreo: `store_transactions` audit para rechazos/replays; alertas sobre `status='rejected'` recurrentes.
- [ ] Landing: los íconos oficiales de tiendas SOLO se añaden cuando las apps estén publicadas (invariant #10 en `docs/AI_CONTEXT.md`).

## Conclusión

Backend de facturación nativa listo con pruebas; app nativa, cuentas y productos son pasos externos. Nada se publicó ni se configuró contra servicios de Apple/Google.
