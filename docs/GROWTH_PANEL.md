# Painel de Operação e Growth — guia de operação

Arquitetura real: **Express + Supabase (Postgres) + front vanilla** no mesmo projeto do site, na Vercel. A especificação sugeria Next.js; foi mantido o stack que já vende para não reescrever o que funciona. Funcionalmente é equivalente (mesmo banco, mesmo domínio, mesmo cookie de visitante).

## O que existe
| Peça | Onde |
|---|---|
| Banco (`growth`, `growth_pii`) + views sem dados pessoais | `supabase/migrations/20261021100000_growth_panel.sql` |
| Rastreio no navegador (visitante, UTMs, primeiro/último toque 90 dias, pixels com consentimento) | `public/js/track.js` |
| Ingestão `/api/track`, `/api/lead`, `/api/track/config` | `server/routes/track.js` |
| Eventos de servidor (checkout, compra, renovação, falha, cancelamento, reembolso) | `server/growth/stripe-hooks.js` |
| Bandeja de saída → Meta CAPI, TikTok Events API, Customer.io (retry com backoff) | `server/growth/forwarders.js`, `email.js` |
| Importação de gasto (Meta/TikTok) e execução de ações | `server/growth/ads.js` |
| IA (monitor, relatórios, ações com limites) | `server/growth/ai.js` |
| Equipe, papéis e 2FA (TOTP) | `server/growth/staff.js` |
| Pessoas (busca, exportar, apagar), experimentos A/B | `people.js`, `experiments.js` |
| API do painel | `server/routes/growth.js` → `/api/growth/*` |
| Interface (10 telas) | `public/growth.html` → **`/growth`** |

## Ligar em produção (ordem)
1. **Migração** (precisa da senha do banco): `npm run db:migrate` com `SUPABASE_DB_URL` de produção. Reversão: `supabase/rollback/20261021100000_growth_panel.down.sql`.
2. **Variáveis no Vercel**: `GROWTH_ENCRYPTION_KEY` (32+ caracteres aleatórios; **não perca**: cifra os tokens), opcional `ANTHROPIC_API_KEY`, `CUSTOMERIO_*`, `GROWTH_TIMEZONE`. `CRON_SECRET` já existe.
3. **Equipe**: `npm run growth:staff -- seu@email.com admin`; entre em `/growth`, configure o 2FA (app autenticador) e verifique.
4. **Cron**: `node scripts/finish-production.js …` agenda o `pg_cron` (cada 10 min → `/api/cron/growth?job=tick`: bandeja, anúncios por hora, monitor, informe diário às 8h, semanal às segundas). Backup diário via Vercel Cron já em `vercel.json`.
5. **Configurações → Pixels**: ID do pixel + token da API de conversões + código de evento de teste (Meta e TikTok). **Configurações → Anúncios**: conta/ token de leitura.
6. **UTMs nos anúncios** (para o ROAS por anúncio):
   - Meta: `utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}`
   - TikTok: `utm_source=tiktok&utm_medium=paid&utm_campaign=__CAMPAIGN_ID__&utm_term=__AID__&utm_content=__CID__`
7. **Customer.io**: crie os 8 fluxos de `docs/GROWTH_EMAIL_FLOWS.md`; webhook de relatórios → `https://alento.citavel.ai/api/webhooks/customerio` (segredo em Configurações → Customer.io).

## Regras de privacidade implementadas
- Consentimento explícito de dados de saúde antes da 1ª pergunta e no e-mail; marketing por e-mail separado e desmarcado.
- Pixels só carregam e a API de conversões só envia com "Aceptar todas" nos cookies. Nada de respostas do quiz nem do hábito sai para anúncios (URL sanitizada para `/quiz`; só o plano como conteúdo). Há testes que garantem isso.
- E-mails ficam em `growth_pii`; as views usadas pela IA não têm dados pessoais; a IA consulta com um papel de banco somente-leitura (`growth_ai`).
- Apagar pessoa: tela Pessoas (admin) → `growth.erase_person`.

## Portões de aceite (da especificação)
- **Portão 1**: compra de teste em cada idioma com mesma UTM e `event_id` no banco, Stripe, Meta e TikTok sem duplicar. Use os códigos de evento de teste. **Não validado** (exige contas reais).
- **Portão 2**: 7 dias com vendas do painel = Stripe.
