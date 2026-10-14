# Aliento: auditoria de produção

Data: 14/10/2026 · Repositório: `/Users/pedro/Downloads/focus`

## 1. Premissas do briefing comparadas com o estado real

| Premissa do briefing | Estado verificado | Evidência |
|---|---|---|
| Next.js + Supabase já configurados | **Falso.** É Node 24 + Express 5 + SQLite (`node:sqlite`), com HTML/JS sem build | `package.json`: só `express` e `stripe`; nenhuma referência a Supabase/Next no código |
| Projeto Supabase `gbryzdyawsiaezqysexq` em uso | **Não conectado.** Nenhum arquivo nesta máquina referencia esse ID e não há credenciais | busca em `~/Downloads`, `~/Desktop`, `~/Documents` |
| Sistema recebendo tráfego / clientes reais | **Não.** Roda em `localhost` (3100 real-teste, 3200 demo); não há deploy | nenhuma configuração de hosting |
| Clientes que já pagaram | **Nenhum para o Aliento.** A chave é só de teste (`rk_test`). Assinaturas na conta: 1 compra de teste do Aliento e 2 de teste do Orvyn (outro produto, mesma conta) | `stripe.subscriptions.list` |
| Supabase Auth | **Não existe.** A autenticação é própria: scrypt + sessão em cookie httpOnly | `server/auth.js` |

Conclusão: o código está num estágio anterior ao que o briefing supõe. O fluxo comercial funciona de ponta a ponta. As funcionalidades internas após o login (jornada, lições, diário etc.) ainda não existem.

## 2. Classificação das funcionalidades

Legenda: **IMPLEMENTED** · **PARTIAL** · **MOCKED** · **BROKEN** · **MISSING**

### Aquisição e pagamento
| Funcionalidade | Estado | Observação |
|---|---|---|
| Landing em espanhol | IMPLEMENTED | `public/index.html` |
| Questionário (avançar, voltar, retomar, persistir) | IMPLEMENTED | Cada resposta é salva no servidor; retoma pelo cookie `fg_aid` |
| Resultados com dados reais e gráficos interativos | IMPLEMENTED | Cálculos cobertos por `test/results.test.js` |
| Consumo semanal/mensal, gasto, economia, gatilhos, estratégia | IMPLEMENTED | — |
| "Motivação informada" nos resultados | PARTIAL | Coletada (`q_motivos`), mas não exibida nos resultados |
| Paywall (3 planos com preços do Stripe) | IMPLEMENTED | Lista com preço por dia; Trimestral recomendado |
| Oferta de saída com desconto (imagem de referência) | MISSING | Precisa de decisão comercial (ver §5) |
| Stripe Checkout (assinatura) | IMPLEMENTED | Validado com cartão de teste real |
| Webhooks com assinatura verificada e idempotência | IMPLEMENTED | Testados com eventos fora de ordem e duplicados |
| Reconciliação de pagantes sem vínculo | PARTIAL | Bloqueia duplicidade consultando o Stripe; falta rotina em lote e fila de revisão |
| Customer Portal | IMPLEMENTED | Portal já configurado na conta |
| Merchant exibido no Checkout | BROKEN (negócio) | Aparece "Área restrita de Orvyn IA"; exige conta Stripe própria |

### Conta
| Funcionalidade | Estado | Observação |
|---|---|---|
| Cadastro / login / logout / sessão | IMPLEMENTED | Autenticação própria, sem Supabase Auth |
| Recuperação de senha | MISSING | Depende de um provedor de e-mail |
| Alteração de senha | MISSING | — |
| Vinculação de questionário e assinatura à conta | IMPLEMENTED | — |
| Exportação de dados | IMPLEMENTED | `/api/account/export` |
| Exclusão de conta | MISSING | — |

### Produto após o login
| Funcionalidade | Estado | Observação |
|---|---|---|
| Onboarding (meta, data de início, notificações) | IMPLEMENTED | — |
| Dashboard | PARTIAL | Contador diário, KPIs, gráfico de 14 dias, metas e SOS. Faltam próxima lição/capítulo e saudação conforme o horário |
| **Jornada (capítulos, lições, blocos, progresso)** | **MISSING** | Prioridade máxima do briefing |
| Registro de cigarros com horário, gatilho e emoção, editável | PARTIAL | Hoje só total diário (+/−); sem registro individual, edição ou exclusão |
| Registro de vontade de fumar | PARTIAL | Existe no SOS (gatilho, intensidade, resistiu?); falta "¿Qué estás sintiendo?" |
| Respiração (pausar, duração, áudio, sessões salvas) | PARTIAL | Modal de 5 ciclos sem controles; sessões não são salvas |
| Mis objetivos (editável, com histórico) | PARTIAL | Meta e data no onboarding; sem página própria e sem histórico |
| Diário emocional | MISSING | — |
| Mi progreso (filtros 7/30/90/365) | MISSING | Só o gráfico de 14 dias no dashboard |
| Conquistas | MISSING | — |
| Notificações | PARTIAL | Preferências salvas; **nenhum envio** (não há provedor) |
| Assistente "Habla con Aliento" | MISSING | Não há provedor de IA configurado |
| Mi perfil / Mi suscripción | PARTIAL | `/cuenta` cobre nome, assinatura, portal e exportação |
| Área administrativa /admin e editor de capítulos | MISSING | — |

### Segurança e qualidade
| Item | Estado | Observação |
|---|---|---|
| Isolamento entre usuários | IMPLEMENTED (no app) | Toda consulta filtra por `user_id` da sessão. Não há RLS porque não há Postgres |
| CSRF / CSP / cookies httpOnly / rate limit de login | IMPLEMENTED | — |
| Testes automatizados | IMPLEMENTED | 11 testes (`npm test`) cobrindo o fluxo, webhooks e cálculos |
| Termos e privacidade | PARTIAL | Modelos com campos `[ENTRE COLCHETES]`; precisam de revisão jurídica |
| Deploy, HTTPS, backups | MISSING | — |

## 3. Impacto e prioridade

| Prioridade | Problema | Impacto | Solução |
|---|---|---|---|
| P0 | Jornada e lições inexistentes | Quem assinar encontra só o contador e as metas; o valor percebido é baixo | Motor de jornada (capítulos, lições, blocos, progresso) com conteúdo inicial real |
| P0 | Decisão de banco (SQLite × Supabase) | Define onde todo o resto é construído | §5 |
| P0 | Sem deploy | Ninguém consegue usar fora desta máquina | Escolher hospedagem e configurar HTTPS e variáveis |
| P0 | Merchant "Orvyn IA" no Checkout | Confunde o cliente e gera risco de contestação | Conta Stripe do Aliento |
| P1 | Registro detalhado, respiração completa, objetivos, progresso, perfil | Funcionalidades essenciais incompletas | Implementar sobre o banco escolhido |
| P1 | Recuperação de senha | Cliente que esquece a senha fica bloqueado | Supabase Auth (resolve sozinho) ou um provedor de e-mail |
| P2 | Diário, conquistas, notificações, assistente, admin | Complementares | Na sequência |

## 4. Critérios de validação

Cada item só passa para IMPLEMENTED com:
1. um teste automatizado que exercite o caminho real (API ou banco); e
2. uma verificação no navegador (desktop e celular).

As provas ficam registradas em `IMPLEMENTATION_STATUS.md`.

## 5. Decisões pendentes do responsável

1. **Banco e autenticação:** migrar para o Supabase (Postgres + Auth + RLS), mantendo o servidor Express e o front atual, ou continuar no SQLite.
2. **Credenciais Supabase:** devem ser **rotacionadas** e colocadas no `.env` pelo responsável, nunca enviadas no chat: URL, publishable key, secret key e a string de conexão do Postgres para as migrations.
3. **Oferta de saída (imagem do Calmio):** é um desconto real no primeiro ciclo (US$ 7,99 → US$ 6,39 = 20%) ou não. A frase "oferta única que no volverá a aparecer" só pode ser usada se o sistema garantir que ela não reaparece.
4. **Conta Stripe própria do Aliento** e chave de produção (`sk_live`/`rk_live`), quando chegar a hora do lançamento.

---

## Atualização de 14/10/2026: após a implementação

Decisões tomadas pelo responsável: migrar para o Supabase (mantendo Express e o front) e ativar a oferta de saída (20% no 1º ciclo).

Os itens MISSING e PARTIAL das tabelas acima foram implementados e testados; o estado atual está em `IMPLEMENTATION_STATUS.md`.

Continuam pendentes, sem poderem ser resolvidos a partir do código:
- credenciais rotacionadas do projeto Supabase de produção;
- deploy;
- conta Stripe própria (o merchant aparece como "Orvyn IA");
- canal de notificações;
- revisão editorial e jurídica.
