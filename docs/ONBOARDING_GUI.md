# Guia para quem vai evoluir o Alento (funil, quiz e funcionalidades)

Produção: **https://alentohealth.com** · Painel de gestão: **/growth** (somente a conta master) · Repositório: github.com/SynkPedrin/Aliento

## Como rodar localmente (sem nenhuma credencial externa)
```bash
npm install
npx supabase start                 # Postgres + Auth locais (precisa de Docker); as chaves locais saem de `supabase status`
node scripts/demo-seed.js          # ativa os 5 programas e cria contas de teste locais
PORT=3200 APP_URL=http://localhost:3200 node scripts/demo.js   # app em http://localhost:3200 com Stripe SIMULADO
npm test                           # suíte (usa o Supabase local)
```
Contas de teste locais (só existem no seu Supabase local): `comprador@alento.test` e `premium@alento.test`, senha `Alento2026!`.

## Mapa do código
| Área | Onde |
|---|---|
| Servidor (Express) | `server/app.js`, `server/routes/*`, `server/services/*` |
| Quiz (perguntas, validação) | `server/quiz.js`; telas `public/js/pages/test.js` (rota `/quiz/<programa>`) |
| Resultados do quiz (motores por programa) | `server/results.js`; tela `public/js/pages/resultados.js` |
| Funil: captura de e-mail → planos → checkout | `public/js/lead-gate.js`, `public/js/paywall.js`, `server/billing.js` |
| Rastreio (UTMs, eventos, consentimento) | `public/js/track.js`, `server/routes/track.js`, `server/growth/*` |
| Painel de growth (10 telas, pt-BR) | `public/growth.html`, `public/js/pages/growth.js`, `public/js/growth/*`, `server/routes/growth.js` |
| Programas (conteúdo, painel, registro) | `server/content/programs/*`, `server/content/companions/*`, `server/routes/program.js`, `public/js/pages/programa.js` |
| iOS (Capacitor + StoreKit) | `ios/`, `public/js/native-iap.js`, `server/routes/store.js` |
| Migrações do banco | `supabase/migrations` (reversões em `supabase/rollback`) |
| Documentos de contexto | `docs/` (`GROWTH_CONTRACT.md`, `PROGRAM_COMPANION_CONTRACT.md`, `GROWTH_PANEL.md`, `RELEASE_CITAVEL.md`, `APP_STORE_SUBMISSION.md`) |

## Credenciais: NUNCA no repositório (ele é público)
O repositório só traz `.env.example` (nomes das variáveis). Os valores reais vivem em cada serviço e são dados **por convite**, não por arquivo:
- **Vercel** (projeto `aliento`): variáveis de produção e deploys. Convidar o e-mail do Gui no time.
- **Supabase** (projeto de produção): banco, Auth e a connection string. Convidar como membro do projeto.
- **Stripe**: chaves, preços e webhook (`https://alentohealth.com/api/stripe/webhook`). Convidar como usuário no dashboard.
- **Meta / TikTok**: o ID do pixel e os tokens são cadastrados pelo próprio painel (`/growth` → Configurações); ficam cifrados no banco.
- **Spaceship** (DNS do alentohealth.com): convidar ou criar chave de API própria. Domínio no Vercel já configurado.
Se precisar compartilhar um segredo avulso, use um gerenciador de senhas (1Password/Bitwarden), nunca chat, issue ou commit.

## Painel `/growth`
Acesso restrito por `GROWTH_MASTER_EMAIL` (hoje: guilhermes.sabbo@gmail.com), sem 2FA. Para dar acesso a outra pessoa, troque essa variável no Vercel. Ele cobre pixels Meta/TikTok (com botão "Testar conexão"), anúncios, IA, e-mails, experimentos A/B e pessoas.

## Publicar
Deploy: `vercel deploy --prod` (projeto já vinculado em `.vercel/`, que não vai ao git). Antes de publicar, aplicar migrações pendentes: `npx supabase db push --db-url "<connection string>" --include-all`. Detalhes em `docs/RELEASE_CITAVEL.md`.
