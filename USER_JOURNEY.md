# Aliento: jornada do usuário

## Aquisição (público)

| Etapa | Rota | Observações |
|---|---|---|
| Landing | `/` | Em espanhol, com CTA "Hacer el test gratuito" |
| Questionário | `/test` | 12 perguntas; cada resposta é salva no servidor e é possível voltar e retomar |
| Resultados (grátis) | `/resultados` | Consumo, gasto, índice de dependência, gatilhos, projeções marcadas como "Estimación" e plano inicial |
| Paywall | `/resultados#planes`, `/planes` | 3 planos com preço do Stripe e preço por dia; oferta de saída única (20% no 1º pagamento do plano semanal) |
| Identificação | `/acceso` | Criar conta ou entrar; o plano pode ser trocado aqui |
| Pagamento | Stripe Checkout | Assinatura recorrente |
| Boas-vindas | `/bienvenida` | Aguarda a confirmação via webhook |
| Configuração inicial | `/configuracion` | Meta, data de início e lembretes |

Esquecer a senha leva a `/olvide`, que envia o link do Supabase Auth, e depois a `/restablecer`.

## Área premium

| Seção | Rota | Funções |
|---|---|---|
| Painel | `/dashboard` | Saudação conforme o horário ("Buenos días, …") e "Cada paso cuenta."; consumo de hoje e meta; "Tengo ganas de fumar"; próxima lição e capítulo; exercício recomendado; diário; semana em gráfico; economia estimada; metas |
| Jornada | `/jornada` | 10 capítulos × 3 lições; estados bloqueada/disponível/em andamento/concluída; uma planta que cresce a cada lição |
| Lição | `/leccion?l=slug` | Blocos: texto, múltipla escolha (avaliada no servidor), reflexão, exercício, respiração, compromisso, feedback e encerramento |
| Registrar | `/registro` | Cigarro (quantidade, hora, gatilho, estado, nota; editar e excluir; sem duplicados); "hoje não fumei"; histórico de vontades |
| Vontade de fumar | botão em painel/registro | Sentimento, gatilho, intensidade, estratégia e resultado; não conta como consumo |
| Respirar | `/respirar` | 3 exercícios; duração; iniciar, pausar, continuar, reiniciar, finalizar; som opcional; só registra sessões completas |
| Meus objetivos | `/objetivos` | Estratégia, máximo diário, data para parar, exercícios por semana, meta de economia; histórico |
| Meu diário | `/diario` | "¿Cómo te has sentido hoy?" com 5 níveis, nota, calendário, evolução e edição |
| Meu progresso | `/progreso` | Filtros de 7/30/90/365 dias; dados registrados separados das estimativas; consumo, humor, vontades, gatilhos, jornada, objetivos |
| Minhas conquistas | `/logros` | 9 conquistas automáticas, sem duplicação |
| Habla con Aliento | `/ayuda` | Guia com respostas predefinidas (não é IA, e a tela diz isso); histórico salvo |
| Notificações | `/notificaciones` | Consentimento, horário, fuso, categorias; aviso honesto de que ainda não há canal de envio |

## Sempre acessível com sessão (mesmo sem assinatura)

- `/perfil`: nome, fuso, idioma, senha, exportação, exclusão, sair.
- `/suscripcion`: status e Customer Portal.
- `/resultados`.

## Regras de acesso

- Sem sessão: a área privada redireciona para `/acceso`.
- Sem assinatura: a área premium redireciona para `/planes`. A API responde 402, e o RLS também esconde o conteúdo da jornada.
- Com assinatura mas sem configuração inicial: redireciona para `/configuracion`.
- Quem já tem assinatura ativa nunca é cobrado de novo (`ALREADY_SUBSCRIBED`).
