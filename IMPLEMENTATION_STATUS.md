# Aliento: estado da implementação (14/10/2026)

Legenda: ✅ concluído e testado · 🟡 parcial · ⛔ pendente (com o motivo)

## P0: crítico
| Item | Estado | Prova |
|---|---|---|
| Autenticação Supabase (cadastro, login, logout, sessão, renovação de token) | ✅ | testes 1, 2, 3; navegador |
| Recuperação de senha (e-mail do Supabase) e troca de senha | ✅ troca testada · 🟡 recuperação | troca: teste "perfil". Recuperação implementada, mas o envio real depende do SMTP do projeto Supabase |
| Integração com Supabase (Postgres, RLS em 33 tabelas) | ✅ | teste 9 (isolamento entre usuários) |
| Assinaturas: checkout, webhooks, idempotência, reconciliação | ✅ | testes 1, 8, 10, "conciliación"; **pagamento real em modo teste** |
| Acesso de clientes pagantes | ✅ | teste 2 |
| Painel | ✅ | teste 1; navegador |
| Jornada funcional (10 capítulos, 30 lições, ~9.000 palavras) | ✅ | testes 4 e 5 |
| Persistência de progresso e respostas | ✅ | testes 4 e 5 |

## P1: essencial
| Item | Estado |
|---|---|
| Registro de consumo (criar, editar, excluir, sem duplicados) | ✅ teste 6 |
| Objetivos com histórico | ✅ teste 7 |
| Respiração (sessões só contam se forem concluídas) | ✅ teste "respiración" |
| Relatórios "Mi progreso" (7/30/90/365, registrado vs. estimado) | ✅ teste 6 e navegador |
| Perfil (nome, fuso, senha, exportação, exclusão) | ✅ teste "perfil" |
| Mi suscripción + Customer Portal | ✅ teste 8 |

## P2: complementar
| Item | Estado |
|---|---|
| Diário emocional | ✅ teste "perfil" (API) e navegador |
| Conquistas automáticas | ✅ testes 1 e 6 |
| Preferências de notificação | ✅ salvas · ⛔ envio: não há canal configurado e nada é simulado |
| "Habla con Aliento" | ✅ guia com respostas predefinidas · ⛔ IA: não há provedor configurado e nenhum chatbot falso foi criado |
| /admin (métricas, usuários, assinaturas, revisões, editor de capítulos e lições, auditoria) | ✅ teste "contenido" e navegador |
| Oferta de saída (20% real, exibida uma única vez) | ✅ teste "oferta de salida" |

## Testes executados
`npm test` roda **20 testes, 20 aprovados**, contra o Supabase **real** local (Postgres, Auth e RLS). Só o Stripe é simulado, com assinatura de webhook real.

Além dos testes automatizados:
- **Pagamento real no Stripe (modo teste):** checkout hospedado, cartão 4242, 3 webhooks reais, ativação confirmada no banco.
- **Navegador:** do questionário ao painel, lição, jornada, registro, respiração, progresso, perfil, diário, conquistas, ajuda, notificações, assinatura e admin, em desktop e em 390 px. Sem erros de console nem da API.

## O que NÃO foi feito, e por quê
1. **Conexão ao projeto Supabase de produção (`gbryzdyawsiaezqysexq`)**: não recebi credenciais (corretamente, já que não devem vir pelo chat). Está tudo pronto para `npm run db:migrate` + `npm run content:seed`.
2. **Deploy**: não existe hospedagem configurada.
3. **Envio de e-mails e notificações**: não há provedor. A recuperação de senha usa o e-mail do próprio Supabase Auth, cujo SMTP precisa ser configurado no projeto para volume real.
4. **Revisão editorial e jurídica**: as lições foram escritas com base em diretrizes públicas, mas devem passar por um profissional de saúde. Termos e privacidade são modelos.
