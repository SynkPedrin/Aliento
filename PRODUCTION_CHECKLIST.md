# Aliento: checklist de produção

Marque cada item **na ordem**. Nenhum deles foi executado contra produção.

## 1. Segredos (bloqueante)
- [ ] **Rotacionar** a chave secreta do Supabase que foi compartilhada antes e gerar novas chaves no painel do projeto `gbryzdyawsiaezqysexq`.
- [ ] Rotacionar a chave Stripe `rk_test` que foi enviada pelo chat.
- [ ] No servidor de produção (nunca no código), configurar: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` (Settings › Database › Connection string, pooler em modo *session*), `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (live), `STRIPE_EXIT_COUPON`, `APP_URL=https://…`, `NODE_ENV=production`.

## 2. Banco de dados
- [ ] Confirmar que existe um backup restaurável (Point-in-Time Recovery ou dump), **antes** de qualquer migration.
- [ ] Revisar se o projeto já tem tabelas com os mesmos nomes. As migrations usam `if not exists`; se houver uma tabela equivalente com outra estrutura, é preciso adaptar antes de aplicar.
- [ ] `npm run db:migrate` (aplica `supabase/migrations/` com `supabase db push`).
- [ ] `npm run content:seed` (publica a jornada; pode ser rodado de novo sem duplicar nada).
- [ ] `npm run admin:grant -- seu@email` (primeiro administrador).
- [ ] Supabase Auth: configurar SMTP próprio e o modelo de e-mail de recuperação em espanhol; incluir `https://SEU-DOMINIO/restablecer` em *Redirect URLs*.

## 3. Stripe (produção)
- [ ] Conta própria do Aliento, ou nome público corrigido (hoje aparece "Área restrita de Orvyn IA").
- [ ] Criar o catálogo live: `npm run stripe:setup -- --currency usd --semanal 7.99 --mensual 19.99 --trimestral 34.99`.
- [ ] Criar o cupom live `aliento-salida-20` (20%, `once`, restrito ao produto) ou deixar `STRIPE_EXIT_COUPON` vazio para desativar a oferta.
- [ ] Endpoint de webhook em `https://SEU-DOMINIO/api/stripe/webhook` com os eventos de `STRIPE_INTEGRATION.md`.
- [ ] Customer Portal ativo, com cancelamento e troca de plano.
- [ ] `npm run billing:reconcile` (relatório) e, se houver casos, `-- --apply`. Revisar /admin › Suscripciones.

## 4. Deploy
- [ ] Hospedagem Node 22.13+ com HTTPS (cookies `Secure` e HSTS ficam ativos com `NODE_ENV=production`).
- [ ] `npm ci && npm start` atrás de um proxy (o `trust proxy` já está configurado).
- [ ] Monitoramento de erros (logs do servidor e /admin › Resumen › webhooks com falha).

## 5. Conteúdo e jurídico
- [ ] Revisão das 30 lições por um profissional de saúde (pontos sinalizados: lição de estresse no cap. 7, menção a tratamentos no cap. 2).
- [ ] Preencher `terminos.html` e `privacidad.html` (campos `[ENTRE COLCHETES]`) e revisar com assessoria jurídica, incluindo o tratamento de dados de saúde e a política de reembolso.

## 6. Verificação final (com cartão real de valor baixo ou em modo teste no ambiente de produção)
- [ ] Questionário → resultados → pagamento → configuração inicial → painel.
- [ ] Concluir uma lição; registrar um cigarro; mudar um objetivo.
- [ ] Cancelar pelo Portal e confirmar a perda de acesso ao fim do período.
- [ ] Login em outro dispositivo e retomar de onde parou.

## Riscos que continuam
- Sem canal de notificações: os lembretes não são enviados (o aplicativo diz isso ao usuário).
- O cache de 30 s de usuário no servidor atrasa mudanças de nome no cabeçalho, nada mais. Acesso premium e admin são sempre verificados no banco.
- O limite de tentativas (*rate limit*) fica em memória: com várias instâncias do servidor, cada uma conta separadamente.
