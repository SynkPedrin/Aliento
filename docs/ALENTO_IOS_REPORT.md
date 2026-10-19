# Alento — iOS Report (verified 2026-10-19)

Estado: PREPARACIÓN — **no** se publicó nada nem se firmó nada; el canal comercial sigue siendo la web (PWA). **El proyecto iOS nativo ya existe y compila** (ver §2026-10-19 abajo).

## 2026-10-19 — proyecto nativo creado y validado (SPM, sin CocoaPods)

- **Capacitor 8.5.3** instalado como devDependency (`@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`); `capacitor.config.json` (appId **`app.alento`**, appName `Alento`, webDir `public`, coherente con el mapeo canónico `app.alento.*` de `server/billing-mappings.js`).
- `npx cap add ios --packagemanager spm` → proyecto Xcode en `ios/App/` con **Swift Package Manager** (no se necesita CocoaPods, que no está instalado en esta máquina).
- **`xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build` → `** BUILD SUCCEEDED **`** (12连胜 build real en esta máquina; app simulador generada en DerivedData). Firma de dispositivo, provisioning, TestFlight y envío a revisión: **no hechos** (requieren credenciales Apple y autorización explícita).
- Pendiente para la app nativa: definir `server.url` (dominio de producción real — no inventado aquí), `APPLE_BUNDLE_ID` en el entorno del servidor, y el flujo StoreKit descrito más abajo.

## Toolchain disponible en esta máquina (verificado)

- **Xcode 27.1** (`xcodebuild -version` → `Build version 27A9275`) ✅
- `xcrun` ✅ (`simctl`, `altool` disponibles vía Xcode)
- **CocoaPods ✗** (`pod` no encontrado) — CocoaPods es necesario para la ruta clásica de Capacitor; la alternativa moderna es usar el flujo de **StaticLibrary/Swift Package Manager** (Capacitor ≥ 6 admite SPM como beta) o instalar CocoaPods (`sudo gem install cocoapods` o `brew install cocoapods`) cuando se inicie el proyecto nativo.
- Node 22 ✅

## Contrato backend ↔ app nativa (ya implementado y probado)

La app nativa (Capacitor/Swift) consume los endpoints existentes:

| Paso en la app iOS | Endpoint | estados |
|---|---|---|
| StoreKit 2 compra → `Transaction` JWS firmado | `POST /api/store/transactions` | `200 {granted:true}` / `403` JWS inválido / `409` replay / `503` sin configurar |
| Notificaciones del App Store (V2) | `POST /api/store/notifications/apple` | verifica JWS de cada payload; reembolsos revocan acceso |
| Restaurar compras | `GET /api/store/restore` | lista de grants activos por programa |
| Productos disponibles | `GET /api/store/products` | mapa program/plan → product id |
| Sesión/entitlement | `POST /api/auth/*` + `GET /api/me` | cookies `al_at`/`al_rt` (ATS: requiere HTTPS) |

Regla de oro ya probada en `test/store-sync.test.js`: **sin verificación criptográfica no hay acceso** (la app nunca confía en el recibo local).

## Mapping producto StoreKit ↔ plan (servidor)

- Product ids por defecto: `app.alento.<programa_con_guiones_bajos>.<plan>` p.ej. `app.alento.sem_fumo.mensual`; variables `APPLE_PRODUCT_SEM_FUMO_MENSUAL` etc. (ver `.env.example`).
- `APPLE_BUNDLE_ID` debe coincidir EXACTAMENTE con el bundle del build (verificación e2e en el JWS); `APPLE_APP_STORE_ENV` = `sandbox` para TestFlight, `production` para App Store.

## Lo que falta para compilar (bloqueado por decisiones/credenciales, no por código)

1. Crear el proyecto nativo (`npx cap add ios`) — **no** se ejecutó: añadiría `ios/` y dependencias nuevas al repo sin decisión explícita del dueño. `capacitor.config.json` sugerido (documentado, no creado): `{ appId: "app.alento.web", appName: "Alento", webDir: "public", server: { url: <APP_URL produzione>, androidScheme: "https" } }`.
2. Cuenta de desarrollador Apple + App ID + provisioning; StoreKit products en App Store Connect (los product ids de la tabla anterior).
3. CocoaPods/SPM para las dependencias nativas.

## Pruebas StoreKit en local (cuando exista el proyecto)

- TestFlight/sandbox: `APPLE_APP_STORE_ENV=sandbox` y compras sandbox en el dispositivo.
- Los tests JWS ya cubren aceptación/rechazo; para validar contra receipts reales de sandbox, usar la misma suite sustituyendo el root de prueba por el de Apple (el fingerprint ya está fijado).

## Conclusión

Backend listo y con tests que cubren StoreKit 2/Notificaciones V2; **proyecto iOS válido creado (SPM) y compilando en esta máquina**, pendiendo únicamente credenciales Apple (firma, TestFlight, envío) y decisiones de cierre de producción, documentadas en `docs/ALENTO_APP_STORE_CHECKLIST.md`.
