# Alento iOS — guia para publicar na App Store

Estado (2026-10-19): projeto Xcode compila (Debug simulador + Release dispositivo, sem assinatura). A app carrega `https://citavel.ai` e compra com StoreKit 2 (plugin `AlentoStore`); no navegador continua o Stripe. **Falta só o que depende da sua conta Apple.**

## 1. O que já está pronto no projeto
- `ios/App/App.xcodeproj` · bundle id `app.alento` · versão 1.0 (1) · iPhone, vertical · iOS 15+.
- Ícones oficiais, splash, `ITSAppUsesNonExemptEncryption=false`, `arm64`.
- `capacitor.config.json` → `server.url = https://citavel.ai` (o domínio precisa estar no ar).
- Plugin StoreKit 2 (`CapApp-SPM/Sources/.../AlentoStorePlugin.swift`): comprar, restaurar, atualizações. O acesso só é concedido depois que o servidor valida o JWS da Apple (`/api/store/transactions`).
- Web: dentro da app nunca abre Stripe (regra 3.1.1); há «Restaurar compras» e «Gestionar en App Store» em Mis suscripciones.
- `ios/App/Alento.storekit`: 15 produtos para testar compras no simulador (Xcode → Edit Scheme → Run → Options → StoreKit Configuration).

## 2. O que você precisa fazer (conta Apple Developer, US$ 99/ano)
1. Xcode → `ios/App/App.xcodeproj` → target App → Signing & Capabilities → escolha seu **Team** (Automatic signing). Capability **In-App Purchase** (adicione com «+ Capability»).
2. App Store Connect → Apps → **+ New App**: nome *Alento*, idioma principal Español, bundle id `app.alento`, SKU `alento-ios`.
3. **Subscriptions**: crie 5 grupos (um por programa) e 3 assinaturas em cada. Product IDs exatos:

| Programa | semanal (1 semana) | mensual (1 mês) | trimestral (3 meses) |
|---|---|---|---|
| Sem Fumo | app.alento.sem_fumo.semanal | app.alento.sem_fumo.mensual | app.alento.sem_fumo.trimestral |
| Alcohol | app.alento.alcohol.semanal | …alcohol.mensual | …alcohol.trimestral |
| Azúcar | app.alento.azucar.semanal | …azucar.mensual | …azucar.trimestral |
| Ansiedad | app.alento.ansiedad.semanal | …ansiedad.mensual | …ansiedad.trimestral |
| Sueño | app.alento.sueno.semanal | …sueno.mensual | …sueno.trimestral |

   Preços sugeridos (iguais à web): US$ 7,99 / 19,99 / 34,99. Cada assinatura precisa de nome, descrição e uma captura de tela da tela de planos.
4. App Store Connect → App Information → **App Store Server Notifications**: URL de produção `https://citavel.ai/api/store/notifications/apple` (versão 2), e igual para Sandbox.
5. No Vercel (Production) defina `APPLE_BUNDLE_ID=app.alento` e `APPLE_APP_STORE_ENV=production` (use `sandbox` durante TestFlight) e faça novo deploy.
6. Xcode → Product → Destination *Any iOS Device* → **Product → Archive** → Distribute App → App Store Connect → Upload.
7. Teste no **TestFlight** com um usuário Sandbox: comprar, restaurar, cancelar.
8. Preencha a ficha (abaixo) e **Submit for Review**.

## 3. Ficha da App Store (copiar e colar)
- **Nome**: Alento · **Subtítulo**: Deja los malos hábitos, día a día
- **Categoria**: Salud y forma física (secundária: Estilo de vida)
- **Texto promocional**: Un plan a tu ritmo, respiraciones guiadas y acompañamiento, sin juicios.
- **Descrição**: Alento crea programas que te ayudan a dejar los hábitos que pesan: tabaco, alcohol, azúcar, ansiedad y sueño. Responde un cuestionario, recibe un plan personal y avanza un día a la vez, con lecciones cortas, respiración guiada de 1 minuto, registro de progreso y logros. Alento es un apoyo para cambiar hábitos y no sustituye el seguimiento médico o psicológico. Suscripción con renovación automática; puedes cancelarla cuando quieras en los ajustes de tu cuenta de Apple.
- **Palavras-chave**: dejar de fumar,hábitos,respiración,ansiedad,sueño,alcohol,azúcar,bienestar
- **URL de suporte**: https://citavel.ai/ayuda · **Privacidade**: https://citavel.ai/privacidad · **Termos (EULA)**: https://citavel.ai/terminos
- **Classificação etária**: 12+ (referências a tabaco/álcool em contexto de ajuda para deixar). **Copyright**: © 2026 Alento
- **Privacidade (labels)**: dados vinculados ao usuário — e-mail, nome, conteúdo do usuário (registros de hábito), compras, identificadores; sem rastreamento (sem ATT).
- **Notas para o revisor**: criar uma conta de teste de cortesia (`npm run access:grant -- correo contraseña`) e informar e-mail e senha. Explicar que as assinaturas se compram com StoreKit e que o acesso se valida no servidor.
- **Capturas**: iPhone 6,9" (1320×2868) — mínimo 3: LP/quiz, resultados, planos, dashboard. Tire-as no simulador com a app em produção.

## 4. Riscos de revisão (leia)
- **4.2 (funcionalidade mínima)**: a app é um shell que carrega o site. Mitigação: compras nativas, restauração, conteúdo próprio e autenticação. Se a Apple recusar, responder destacando IAP, notificações e uso offline; pode exigir recursos nativos extras (ex.: notificações push nativas).
- **3.1.1**: nada de Stripe dentro da app (já tratado). Preços da App Store devem ser os mesmos da web ou maiores nunca menores que o necessário.
- **5.1.1(v)**: exclusão de conta existe em `/perfil` mas é bloqueada com assinatura ativa; o texto deve orientar a cancelar na App Store antes. Revise o texto.
- **Saúde (1.4.1)**: manter o aviso «não substitui tratamento médico» (já está). Os 4 programas novos não passaram por revisão clínica — avalie isso antes de submeter.
- O domínio `citavel.ai` precisa estar no ar com HTTPS antes do envio, senão a app abre em branco.
