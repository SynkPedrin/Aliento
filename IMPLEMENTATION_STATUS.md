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

## Estado atual (atualizado)
1. **Banco de produção:** um Supabase novo, dedicado, criado pela integração da Vercel. Falta só o responsável aceitar os termos da integração; depois disso, `npm run prod:finish` termina tudo. Veja `PRODUCTION_CHECKLIST.md`.
2. **Deploy:** feito na Vercel (https://citavel.ai), com deploy automático a partir do GitHub.
3. **Notificações:** canal Web Push implementado e testado. A recuperação de senha usa o e-mail do Supabase Auth; para volume real, configure SMTP próprio.
4. **Revisões:** conteúdo e documentos legais revisados e completos. Os pontos que exigem um profissional de saúde e um advogado estão listados abaixo.

---

## Revisões de 14/10/2026: pontos que exigem decisão humana

### Profissional de saúde (conteúdo da jornada)
1. Linguagem neutra em gênero: ainda há várias formas no masculino genérico.
2. "enojo/enojado" (América Latina) ou "enfado" (Espanha).
3. A redução gradual aparece como equivalente a marcar uma data para parar; não fala em redução com terapia de reposição de nicotina sob orientação.
4. Confirmar as frases "beneficios… mucho mayores" que o ganho de peso e "a cualquier edad".
5. A linha do tempo de benefícios é pensada para quem fuma, não para quem só usa vaporizador.
6. A posição sobre cigarro eletrônico ("no los recomienda como método").
7. O texto de crise é genérico, sem números de telefone por país.
8. "Diversos estudios indican…" sobre ansiedade e estresse depois de parar.

### Advogado (termos e privacidade)
- CNPJ, endereço, e-mail e encarregado de dados (DPO) da empresa; se é preciso um representante na UE.
- Validade do consentimento para dados de saúde. A caixa específica no cadastro já foi adicionada; falta validar o texto e o momento (o questionário anônimo vem antes).
- Direito de arrependimento: 7 dias no Brasil (vale para renovações?), 14 dias na UE/Espanha (renúncia expressa no checkout), 10 dias na Argentina com o botão de arrependimento.
- Regras de renovação automática nos EUA (FTC e leis estaduais, como a ARL da Califórnia).
- Reembolsos proporcionais prometidos no rascunho em três casos: fechamento da conta pela empresa, perda substancial de funções e encerramento do serviço. **Decisão comercial.**
- Limite de responsabilidade (provavelmente inválido para consumidores no Brasil e na Espanha), lei e foro aplicáveis, tributos de serviço digital vendido em USD.
- Prazos de guarda dos dados, transferências internacionais (cláusulas-padrão e acordos de tratamento de dados com Supabase, Vercel e Stripe) e leis de dados de saúde de estados dos EUA.
