# Aliento: prontidão para escala (análise de 14/10/2026)

**Veredito: ainda não está pronto para receber usuários em escala.**

O fluxo de pagamento é sólido: idempotência, conciliação, RLS e 22 testes passando. Mesmo assim, há **um bloqueio de infraestrutura**, **7 correções técnicas obrigatórias** e **decisões comerciais e jurídicas** antes de investir em tráfego pago.

**Como a análise foi feita:**
- três revisões independentes do código (segurança e privacidade; escala e confiabilidade; produto e operação);
- teste de carga local nas rotas principais;
- simulação de 10 mil usuários e 3 milhões de registros num banco descartável.

Cada item abaixo cita arquivo e linha nos relatórios de origem.

---

## 0. Já corrigido durante a análise
| Problema | Impacto | Status |
|---|---|---|
| **Travamento do pool de conexões:** o painel e as lições pediam uma 2ª conexão dentro de uma transação | Com 3 usuários simultâneos o painel travava (o teste de carga fez **0 requisições** em 8 s) | ✅ Corrigido e com teste de concorrência (commit `c680d50`) |
| Senha de exemplo do admin no `PRODUCTION_CHECKLIST.md` (o **repositório é público**) | Credencial exposta | ✅ Removida do arquivo. Segue no histórico, por isso **a conta de produção será criada com outra senha** |
| `.env.local` com o token da Vercel legível por qualquer usuário da máquina | Vazamento local | ✅ Permissões restritas |

---

## 1. Bloqueantes: sem eles não abre (decisão ou credencial do dono)
| # | O que falta | Ação |
|---|---|---|
| 1 | **Banco de produção não existe** (termos da integração Supabase não aceitos) | Aceitar os termos, depois `npm run prod:finish` |
| 2 | **Recuperação de senha não funciona** para usuários reais: o SMTP padrão do Supabase só entrega para a equipe e tem limite de ~2 e-mails/hora | Contratar Resend, Postmark ou SES e configurar SMTP no Supabase |
| 3 | **Não existe canal de contato** com o cliente. Os Termos mandam pedir reembolso "por e-mail", mas não há e-mail | Criar um e-mail de suporte e preencher `LEGAL_EMAIL`, CNPJ e endereço |
| 4 | **Identidade no Stripe:** o checkout mostra "GS MIDIA" e o descritor padrão é "ZIVAHSTORE". A conta é **compartilhada com outros produtos**, então as disputas de um contaminam todos | O ideal é uma conta Stripe própria do Aliento. O mínimo é mudar o nome público e o descritor e conferir o MCC (categoria do negócio) |
| 5 | **Impostos da venda internacional:** IVA na UE/Espanha desde a 1ª venda, IVA digital em México, Chile e Colômbia, exportação de serviço no Brasil | Decidir os países e então ativar o Stripe Tax ou restringir a venda (**com contador**) |
| 6 | **Planos de infraestrutura:** o Vercel Hobby proíbe uso comercial; o Supabase Free pausa por inatividade e não tem backups úteis | Vercel Pro + Supabase Pro com PITR (restauração a qualquer momento) |
| 7 | **Chaves Stripe live** enviadas por mensagem | Rotacionar e atualizar na Vercel |

## 2. Correções técnicas P0 antes de escalar (posso implementar)
| # | Problema | Evidência medida | Correção |
|---|---|---|---|
| 1 | **Login de todos travado por um atacante:** o Supabase Auth limita por IP, e todas as chamadas saem do IP do servidor (30 logins / 5 min). O limitador do app fica em memória e não funciona na Vercel. Um erro 429 no refresh **desloga o usuário** | `auth.js`, `app.js:91-98` | Repassar o IP do cliente ao Auth; limite de tentativas compartilhado (Postgres/Upstash); só apagar o cookie quando o token for realmente inválido; ajustar os limites do Auth |
| 2 | **Painel e progresso ficam mais lentos a cada dia de uso:** a série diária roda 8 subconsultas por dia | Usuário pesado com 1 ano de uso: **1,72 s**. Versão reescrita: **6 ms** (280× mais rápido) | Reescrever `dailySeries` em consulta agregada com faixa indexável |
| 3 | **Lembretes não escalam:** processamento sequencial dentro de 30 s | ~100–200 usuários por execução; com 10 mil usuários, **75–85% não recebem** | Seleção por horário no SQL, envio paralelo com limite, lotes ou fila; reprocessar envios presos |
| 4 | **Pagamento confirmado pode se perder:** um webhook que estoura o tempo fica "processing" para sempre e o Stripe recebe 200 nas novas tentativas | `billing.js:346-361` | Reprocessar eventos presos há mais de 2 min e alertar |
| 5 | **Assinatura cancelada pode voltar a ficar ativa:** webhooks fora de ordem sobrescrevem o status | `billing.js:327-333` | Sempre reler a assinatura no Stripe antes de gravar |
| 6 | **Push como relé de ataque e travamento do cron:** o usuário cadastra qualquer URL HTTPS, sem timeout | `app.js:447-458`, `notifications.js:39` | Aceitar só domínios oficiais de push, no máximo 5 por usuário, timeout de 5 s, limite no envio de teste; RLS sem inserção direta |
| 7 | **Sem timeouts externos:** Stripe com 80 s (maior que o limite de 30 s da função), Postgres sem `statement_timeout` | `factory.js:15` | Stripe 8 s com 2 novas tentativas; `statement_timeout` de 5 s; timeout no Supabase |

### P0 de segurança e privacidade (posso implementar)
| # | Problema | Correção |
|---|---|---|
| 8 | `/api/auth/reset` aceita **qualquer** token de sessão, não só o de recuperação, o que permite tomar a conta | Exigir `amr=recovery` (ou o fluxo PKCE) e limite de tentativas |
| 9 | **Redirecionamento aberto** no login (`next=/%5Cevil.com`), usável para phishing | Validar com `new URL(next, origin)` |
| 10 | **Cupom de 20% reutilizável sem limite**: basta refazer o quiz | Uso único por cliente; bloquear quem já assinou |
| 11 | **Checkout duplicado** entre instâncias (o bloqueio por usuário vive em memória), com risco de cobrança dupla | `pg_advisory_xact_lock` + índice único de sessão aberta + `idempotencyKey` |
| 12 | **RLS permite gravar direto pela API pública** (push para IP interno, mensagens "da guia" forjadas); `has_premium` executável por anônimo | Remover as políticas de escrita, revogar o `execute`, desligar o cadastro público do Supabase |
| 13 | **Reembolso e disputa não removem o acesso**, e a renovação continua | Tratar `charge.refunded` e `charge.dispute.created` |
| 14 | **LGPD:** dados de saúde do quiz coletados **antes** do consentimento e nunca apagados; exportação incompleta; exclusão de conta deixa dados no Stripe; e-mail não verificado e cadastro revela quem usa o app | Aviso de consentimento no início do quiz; limpeza automática de quizzes anônimos (30 dias); exportação completa; excluir o cliente no Stripe; confirmação de e-mail e resposta genérica |
| 15 | O certificado TLS do banco não é validado | Fixar a CA do Supabase |

## 3. Antes de ligar tráfego pago
- **Medição:** não há nenhum pixel nem UTM. É preciso capturar UTM e click IDs e enviar Purchase pelo servidor (Meta CAPI, Google, TikTok) a partir do webhook, **sem enviar dados de saúde**: nada de pixel em `/resultados` nem na área logada (há precedentes da FTC contra GoodRx e BetterHelp). Antes, **banner de consentimento** e fontes hospedadas no próprio site.
- **Domínio próprio:** `*.vercel.app` não permite verificar o domínio na Meta. Depois de comprar, atualizar `APP_URL`, o webhook, o Supabase e o cron.
- **E-mails de ciclo de vida:** boas-vindas com instrução de cancelamento (exigida por leis de renovação automática dos EUA), falha de pagamento, cancelamento confirmado, checkout abandonado (precisa de opt-in de marketing). No Stripe: recibos, Smart Retries (novas tentativas automáticas) e aviso de renovação.
- **Observabilidade:**
  - Sentry para erros;
  - envio de logs estruturados para fora da Vercel;
  - monitor de uptime;
  - alertas para webhook falho, cron parado e taxa de erros 5xx;
  - staging separado da produção;
  - migrations rodando pelo CI, não do notebook.
- **Admin de suporte:** falta uma ficha do usuário com conceder e revogar acesso, reembolsar, cancelar e ver o histórico, tudo com auditoria.
- **Paywall:** a lista de funções cita "Botón SOS" e "Diario de gatillos", que o app não tem com esses nomes, e não menciona a jornada. Expectativa errada vira reembolso.
- **Oferta de saída:** sequestra o botão "voltar" no celular, o que as plataformas de anúncio penalizam. Também vale reavaliar oferecer o **plano semanal**: ele sai 73% mais caro por mês que o mensal e é o padrão com mais disputas. O limite de disputas das bandeiras é 0,75%.
- **18+ explícito no cadastro**, guia de criativos dentro das políticas de saúde da Meta e do Google, e uma decisão sobre o arrependimento na UE e na Argentina (botão).
- **Desempenho do front:**
  - imagem de fundo de 168 KB, que cairia para 39 KB em WebP/AVIF;
  - fontes carregadas por `@import`, que bloqueia a renderização;
  - sem cache nos arquivos estáticos;
  - `/api/me` chamado a cada visita à landing, uma invocação por clique de anúncio.

## 4. Crescimento e retenção
- As 30 lições somam 168 minutos e podem ser concluídas em 2 ou 3 dias. Para o plano trimestral faltam: liberação de uma lição por dia, uma fase de manutenção e prevenção de recaída (semanas 5 a 13), sequências e marcos de 7, 30, 60 e 90 dias, e um resumo semanal.
- A landing não tem prova social (depoimentos reais), prints do app, preço, "quem somos" nem FAQ de cobrança.
- **Moeda:** o quiz pergunta o gasto em USD e a projeção de economia não faz sentido na Espanha, no México ou na Colômbia. A UE exige preço final em EUR com IVA.
- Testes A/B com variante gravada por sessão (texto do paywall, plano recomendado, oferta).
- No iPhone, o push exige instalar o app na tela inicial: falta um guia no onboarding e o e-mail como canal de reserva.

## 5. Custo em escala (ordem de grandeza)
A infraestrutura (Vercel Pro ~US$ 20/membro + Supabase Pro ~US$ 25 + compute) é pequena perto do **custo de aquisição** e das **taxas do Stripe**: taxa percentual, mais tarifa fixa, mais conversão USD→BRL, mais 0,7% do Billing e 0,5% do Tax. No plano semanal, a tarifa fixa é cobrada 52 vezes por ano.

---

## Ordem recomendada
1. **Dono:** itens 1 a 7 da seção 1 (o 1 desbloqueia todo o resto).
2. **Técnico:** P0 técnico e de segurança (seção 2), cerca de 2 a 3 dias de trabalho, com testes.
3. **Antes dos anúncios:** medição com consentimento, domínio, e-mails, observabilidade e ajustes do paywall.
4. **Crescimento:** retenção dos meses 2 e 3, prova social, moeda local, testes A/B.
