# Aliento: integração com o Stripe

## Catálogo (modo teste, conta atual)

| Plano | lookup_key | Preço | Intervalo |
|---|---|---|---|
| Plano de 1 semana | `folego_semanal` | US$ 7,99 | semanal |
| Plano de 1 mês | `folego_mensual` | US$ 19,99 | mensal |
| Plano de 3 meses (recomendado) | `folego_trimestral` | US$ 34,99 | a cada 3 meses |

- O produto se chama **Aliento Premium** (`prod_VRMMrNzCo4dqJY`).
- O cupom da oferta de saída é `aliento-salida-20`: 20% de desconto, duração `once` (só o primeiro pagamento), restrito ao produto.
- O servidor busca os preços pelo `lookup_key`, confere se o intervalo corresponde ao plano esperado e **só exibe valores que vêm do Stripe**.
- `npm run stripe:setup` cria o catálogo em outra conta. Ele não altera preços existentes: cria novos e transfere o `lookup_key`.

## Fluxo

1. O usuário escolhe o plano.
2. `POST /api/checkout`:
   - valida o plano;
   - exige sessão e questionário concluído;
   - bloqueia se já houver assinatura ativa, tanto no banco quanto consultando o Stripe;
   - reutiliza a sessão aberta do mesmo plano, avaliação e desconto, e expira as demais;
   - recupera ou cria o Customer (com chave de idempotência);
   - cria a sessão de Checkout com `metadata` (`user_id`, `assessment_id`, `plan`) também em `subscription_data`.
3. O usuário paga no Stripe Checkout.
4. O webhook é recebido: assinatura verificada e idempotência via `billing_events`.
5. A assinatura é sincronizada e, se o status der acesso, a conta é ativada (`ensureActivated`, idempotente):
   - questionário vinculado à conta;
   - plano personalizado (versão 1);
   - objetivos e metas;
   - preferências de notificação;
   - conquista "Mi primer paso".
6. `/bienvenida` só **consulta** o estado; o redirecionamento sozinho não ativa nada.

## Webhooks processados

`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `customer.subscription.created | updated | deleted | paused | resumed`, `invoice.paid`, `invoice.payment_failed`.

- **Idempotência:** inserir em `billing_events` e processar. Se o processamento falhar, o evento fica marcado `failed` e o Stripe pode reenviar.
- **Ordem:** eventos fora de ordem são tolerados. O teste real recebeu `invoice.paid` antes de `checkout.session.completed`.
- **Fonte de verdade:** as faturas recuperam a assinatura no Stripe antes de sincronizar.

Status com acesso: `active`, `trialing` e `past_due`. No `past_due` o Stripe ainda tenta cobrar, e o painel avisa o usuário.

## Clientes que já pagaram: conciliação

```bash
npm run billing:reconcile             # só relatório
npm run billing:reconcile -- --apply  # sincroniza o que é verificável
```

- Vincula **somente** por `metadata.user_id`, gravado pelo nosso servidor, ou pelo `stripe_customer_id` salvo no perfil.
- **Nunca** vincula por nome nem por e-mail.
- Não cria cobranças e não altera nada no Stripe.
- Casos ambíguos vão para `billing_reconciliation_reviews`, visíveis em /admin › Suscripciones.

Na conta atual **não há clientes reais do Aliento**: a chave é de teste e as únicas assinaturas são testes. As 2 assinaturas do Orvyn usam outro produto e são ignoradas.

## Gerenciamento

- `/suscripcion` mostra plano, status, valor, periodicidade e próxima cobrança.
- O Customer Portal permite trocar de plano, atualizar o cartão, ver faturas e cancelar. Ele já está configurado na conta, com cancelamento ativo.
- O cancelamento ao fim do período mantém o acesso até `current_period_end`.

## Webhook local

```bash
.tools/stripe listen --forward-to localhost:3100/api/stripe/webhook   # STRIPE_API_KEY do .env
```

Em produção, crie o endpoint no painel do Stripe com os eventos acima e configure o `STRIPE_WEBHOOK_SECRET`.

## Validação real (14/10/2026, modo teste)

1. Plano semanal pago com o cartão 4242.
2. Os 3 webhooks reais responderam 200.
3. A assinatura ficou `active` com 799 USD por semana.
4. Plano criado, questionário vinculado e conquista concedida.

## Pendências

- ⚠️ **Nome do vendedor no Checkout: "Área restrita de Orvyn IA".** A conta é compartilhada com o Orvyn. Para o lançamento, crie uma conta Stripe própria do Aliento ou mude o nome público da conta.
- Chave de produção (`rk_live`/`sk_live`) e webhook de produção.
- Rotacionar a chave `rk_test` que foi enviada pelo chat.
