# Aliento: esquema da base de dados (Supabase / Postgres)

As migrations ficam em `supabase/migrations/` e a reversão de cada uma em `supabase/rollback/`. Todas são incrementais e não destrutivas: só usam `create … if not exists`, `alter … add` e políticas novas.

| Migration | Conteúdo |
|---|---|
| `20261014120000_aliento_core.sql` | Esquema completo, RLS, função `has_premium`, catálogos de respiração e conquistas |
| `20261014121000_daily_checkins.sql` | Dias marcados como "hoje não fumei" |
| `20261014122000_profiles_onboarding.sql` | `profiles.onboarded_at` |
| `20261014123000_checkout_assessment_fk.sql` | FK do checkout com `on delete set null` (permite excluir a conta) |

## Modelo de acesso

O servidor Express acessa o Postgres de duas formas:

- **Como usuário** (`db.asUser`): `SET LOCAL ROLE authenticated` + `request.jwt.claims.sub = <usuário>`. O RLS vale também para as consultas do servidor. Todos os dados pessoais são lidos e escritos assim.
- **Como serviço** (`db.service`): ignora o RLS. Fica restrito a webhooks, questionário anônimo, catálogos, admin e escritas que o usuário não pode fazer sozinho (progresso, conquistas, plano).

A chave secreta e a string de conexão nunca chegam ao navegador.

## Tabelas

| Tabela | Conteúdo | RLS para o usuário |
|---|---|---|
| `profiles` | nome, fuso horário, customer do Stripe, aceite dos termos, `onboarded_at` | ler a própria; editar **apenas** `name` e `timezone` (privilégio por coluna) |
| `admin_users` | quem é admin | nenhum acesso |
| `admin_audit_logs` | auditoria de ações | nenhum acesso |
| `questionnaire_sessions` | sessão do questionário (cookie), etapa atual, oferta de saída exibida | ler a própria (vinculada ou reivindicada) |
| `questionnaire_answers` | uma linha por resposta | ler as próprias |
| `user_assessments` | resultado calculado | ler o próprio |
| `personalized_plans` / `plan_versions` | plano e **histórico de versões** | somente leitura |
| `user_goals` | objetivos, com uma versão ativa e as anteriores (`superseded_at`) | CRUD próprio |
| `daily_goals` | metas semanais do plano | CRUD próprio |
| `journey_programs` / `journey_chapters` / `journey_lessons` / `lesson_blocks` | conteúdo da jornada | leitura apenas do que está **publicado** e com **assinatura ativa** |
| `lesson_responses` | respostas por bloco | CRUD próprio |
| `user_lesson_progress` / `user_chapter_progress` | progresso | **somente leitura** (o servidor valida antes de escrever) |
| `smoking_entries` | cigarros (hora, quantidade, gatilho, estado, nota, `client_request_id` único) | CRUD próprio |
| `daily_checkins` | "hoje não fumei" | inserir, ler e excluir os próprios |
| `craving_entries` | vontade de fumar (sentimento, gatilho, intensidade, resultado) | CRUD próprio |
| `mood_entries` | diário emocional (1 por dia) | CRUD próprio |
| `breathing_exercises` / `breathing_sessions` | catálogo e sessões | catálogo: leitura; sessões: CRUD próprio |
| `achievements` / `user_achievements` | catálogo e conquistas (PK única: não duplica) | catálogo: leitura; conquistas: **somente leitura** |
| `notification_preferences` | consentimento, horário, fuso, categorias | CRUD próprio |
| `notification_deliveries` | envios (ainda sem canal) | nenhum acesso |
| `checkout_sessions` | sessões do Stripe Checkout | nenhum acesso |
| `subscriptions` | espelho das assinaturas do Stripe | somente leitura |
| `billing_events` | idempotência dos webhooks (sem payload pessoal) | nenhum acesso |
| `billing_reconciliation_reviews` | casos para revisão manual | nenhum acesso |
| `support_conversations` / `support_messages` | histórico da guia de apoio | CRUD próprio |

Nenhuma política de dados pessoais usa `using (true)`. Os únicos `using (true)` são das tabelas de catálogo (`breathing_exercises`, `achievements`).

## Funções

- `public.has_premium(uid)` (`security definer`): diz se o usuário tem uma assinatura `active`, `trialing` ou `past_due`. As políticas do conteúdo da jornada usam essa função.
- `public.touch_updated_at()`: trigger que mantém `updated_at`.

## Exclusão de conta

O endpoint `DELETE /api/account` pede a senha e confirma que não há renovação pendente. Em seguida:

1. remove as sessões do questionário;
2. registra a exclusão na auditoria;
3. apaga o usuário no Supabase Auth.

As tabelas com `on delete cascade` apagam perfil, registros, progresso e respostas. Os pagamentos continuam registrados no Stripe.

## Dados de teste locais

O Supabase local (`npx supabase start`) contém contas de teste criadas pelas provas e pela demo. **Não são dados reais.** O antigo arquivo `data/folego.db` (SQLite) também só tem dados de teste da primeira versão e não é mais usado.
