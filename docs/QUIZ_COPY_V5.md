# Quiz Sem Fumo v5: copy na estrutura de diagnóstico

Rascunho em PT-BR para aprovação (03/11/2026). Depois de aprovado, vira ES/EN nativo em `server/quiz.js` (subir `QUIZ_VERSION` para 5).
Base: v4 atual (estrutura Calmio) + método do vídeo "funil de quiz" (diagnóstico + 4 blocos de pergunta + mecanismos antes da solução).
Metas de retenção: `server/growth/quiz-benchmarks.json`.

## A lógica em 1 minuto

1. **O quiz entrega valor sozinho:** a pessoa sai com um diagnóstico, não com "seu resultado está pronto".
   Promessa: *"Descubra qual gatilho mantém você fumando e se o seu caso se resolve em 28 dias."*
2. **Não encurtar.** 4 tipos de pergunta, nesta ordem: **genéricas → dor → desejo → solução**.
3. **Entre desejo e solução** entram o diagnóstico e a conscientização dos dois mecanismos, que são os mesmos dos anúncios:
   - **Mecanismo do problema:** a nicotina sai do corpo em ~3 dias. O que puxa de volta é o **laço do gatilho** (café, carro, fim do dia, estresse → cigarro → alívio). Força de vontade briga com a vontade e deixa o laço no lugar.
   - **Mecanismo da solução:** **Reset de Gatilhos de 28 Dias**, um gatilho desarmado de cada vez, 5 minutos por dia.
4. Total: **42 etapas** até o e-mail (alvo do vídeo: 35 a 45).

Legenda: **[mantém]** = tela que já existe (id atual), **[ajusta]** = existe com texto novo, **[nova]** = criar.

---

## Bloco 0. Abertura (1 etapa)

| # | id | Tela | Copy |
|---|---|---|---|
| 1 | `q_diario` [ajusta] | hero Sim/Não | Sobretítulo: **Análise do Hábito de Fumar · 2 minutos** · Título: **Descubra qual gatilho mantém você fumando** e se o seu caso se resolve em 28 dias · Pergunta: **Você fuma todos os dias?** · Sim / Não |

## Bloco 1. Genéricas (perfil, fácil de responder) (8 etapas)

| # | id | Copy |
|---|---|---|
| 2 | `q_genero` [mantém] | Seu gênero · Homem / Mulher |
| 3 | `q_edad` [mantém] | Quantos anos você tem? · 18–24 … 65+ |
| 4 | `q_producto` [mantém] | Qual é a sua forma principal de nicotina? |
| 5 | `q_anios` [mantém] | Há quantos anos você fuma com frequência? |
| 6 | `info_duracion` [mantém] | (personalizada pelos anos) |
| 7 | `q_cantidad` [mantém] | Num dia normal, quantas vezes você fuma? |
| 8 | `q_medico` [mantém] | Um médico já recomendou que você parasse? · *Cada vez mais médicos indicam o Alento.* |
| 9 | `info_notalone` [mantém] | prova social (você não está sozinho) |

## Bloco 2. Dor (onde dói hoje + mapa dos gatilhos) (14 etapas)

| # | id | Copy |
|---|---|---|
| 10 | `q_primer` [mantém] | Quando você acorda, quanto tempo leva até a primeira dose de nicotina? |
| 11 | `q_enfermo` [mantém] | Você continua fumando quando está doente? |
| 12 | `q_prohibido` [mantém] | Como você costuma se sentir em lugares onde não pode fumar? |
| 13 | `q_sin24h` [mantém] | Se ficasse 24 horas sem a sua dose, o que você faria? |
| 14 | `q_esconder` [nova] | **O que você já fez para ninguém perceber que fumou?** (múltipla) · Chiclete ou bala · Perfume ou lavar as mãos · Janela do carro aberta no frio · Fumar escondido da família · Nunca escondi (exclusiva) |
| 15 | `q_depois` [nova] | **Como você se sente uns minutos depois de fumar?** · Aliviado, mas logo quero outro · Com culpa · Com cheiro e vergonha · Nada, é automático |
| 16 | `q_patron` [mantém] | O seu consumo é mais… programado / automático / misto |
| 17 | `q_gatillos` [mantém] | O que costuma te levar a fumar? (múltipla) |
| 18 | `q_gatillo_forte` [nova] | **Qual desses é o mais difícil de vencer?** (lista = só os gatilhos marcados na 17) · *Esse vai ser o primeiro que vamos desarmar.* |
| 19 | `q_disfrute` [mantém] | O que você mais gosta no cigarro? (múltipla) |
| 20 | `info_amigo` [mantém] | (personalizada pela 19) |
| 21 | `q_metodos` [mantém] | O que você já tentou para diminuir ou parar? (múltipla) |
| 22 | `q_recaida` [nova] | **Na última vez que tentou parar, quando voltou?** · No 1º ou 2º dia · Na 1ª semana · Depois de algumas semanas · Nunca tentei de verdade · Sub: *Quase todo mundo volta no mesmo lugar. Já te mostro por quê.* |
| 23 | `q_preocupacion` [mantém] | O que mais te daria medo se você parasse? |

## Bloco 3. Desejo (como seria a vida sem) (8 etapas)

| # | id | Copy |
|---|---|---|
| 24 | `q_objetivo` [mantém] | Qual é o seu objetivo agora? |
| 25 | `q_primeiro_ganho` [nova] | **O que você quer sentir primeiro?** · Subir uma escada sem perder o fôlego · Acordar sem tosse · Abraçar alguém sem cheiro de fumaça · Parar de pensar no próximo cigarro · Não esconder mais nada |
| 26 | `q_por_quem` [nova] | **Por quem mais você quer parar?** · Por mim · Pelos meus filhos · Pelo meu parceiro(a) · Pelos meus pais · Por alguém que perdi |
| 27 | `q_gasto` [mantém] | Quanto você gasta por mês com nicotina? |
| 28 | `info_ahorro` [mantém] | Com o Alento você pode economizar cerca de {valor} por ano |
| 29 | `q_ahorro` [mantém] | O que você faria com esse dinheiro? |
| 30 | `q_meta3m` [mantém] | Onde você quer estar daqui a 3 meses? |
| 31 | `info_metas` [mantém] | (personalizada pela 30) |

## Bloco 4. Diagnóstico + mecanismos (5 etapas) ← o coração do quiz

| # | id | Tipo | Copy |
|---|---|---|---|
| 32 | `diag_previa` [nova] | info, escuro, **personalizada** | **Seu laço mais forte: {gatilho_forte}.** · Pelas suas respostas, o seu cigarro não é sobre nicotina. É sobre **{gatilho_forte}**. Você fuma há {anos} e {cantidad} vezes por dia: o cérebro já liga uma coisa à outra sem pedir licença. · *O diagnóstico completo sai no fim, com o seu plano.* |
| 33 | `mec_problema_1` [nova] | info, número grande | **3 dias.** É o tempo que a nicotina leva para sair do corpo. · Então por que é tão difícil depois disso? Porque o que te prende não é a substância. **É o laço do gatilho.** |
| 34 | `mec_problema_2` [nova] | info + desenho do laço (gatilho → cigarro → alívio → gatilho) | **{gatilho_forte} → cigarro → alívio.** Repetido milhares de vezes, esse laço vira automático. · Por isso você voltou {quando_recaida}: a vontade passou do corpo, mas **o gatilho continuou lá**. · Força de vontade briga com a vontade. Não mexe no laço. **Não é fraqueza. É fiação.** |
| 35 | `mec_solucao_1` [nova] | info + 4 fases | **O Reset de Gatilhos de 28 Dias desarma um laço de cada vez.** · Semana 1, Atravessar: os primeiros dias, com apoio na hora da vontade (ela dura minutos e passa) · Semana 2, Desarmar: começando por {gatilho_forte}, tarefas de 5 minutos · Semana 3, Trocar: as respostas novas viram rotina · Semana 4, Blindar: festa, bebida, dia ruim |
| 36 | `mec_solucao_2` [nova] | info, número grande | **5× mais chance.** Quem passa 28 dias sem fumar tem 5 vezes mais chance de parar de vez.* · *Dado da campanha Stoptober, saúde pública da Inglaterra. |

## Bloco 5. Solução (a pessoa monta o próprio plano) (5 etapas)

Pergunta de solução = a pessoa escolhe como quer o método. Cada resposta é um micro-sim para o produto.

| # | id | Copy |
|---|---|---|
| 37 | `sol_tempo` [nova] | **Quanto tempo por dia você consegue dedicar?** · 5 minutos · 10 minutos · 15 minutos ou mais · Sub: *5 minutos já bastam para o Reset.* |
| 38 | `sol_horario` [nova] | **Quando quer receber a tarefa do dia?** · Logo ao acordar · Na hora do almoço · No fim do dia |
| 39 | `sol_alerta` [nova] | **Quer um aviso no celular nos horários do seu gatilho ({gatilho_forte})?** · Sim, me avisa · Não, prefiro sozinho |
| 40 | `sol_inicio` [nova] | **Quando você quer começar?** · Hoje · Amanhã · Na próxima segunda · Sub: *Você não precisa parar hoje. O plano diz quando.* |
| 41 | `info_ciencia` [mantém] | Suas respostas serão revisadas por especialistas |

## Fechamento (antes do resultado)

| # | id | Copy |
|---|---|---|
| 42 | `analisis` [ajusta] | Analisando suas respostas · Itens: Perfil e rotina · **Mapa dos seus gatilhos** · Tentativas anteriores · **Seu plano de 28 dias** · Popups: *Pronto para retomar o controle a partir de hoje?* / *Quer começar desarmando {gatilho_forte}?* / *Quer um plano passo a passo?* |
| — | e-mail | **Seu diagnóstico está pronto.** Para onde enviamos o seu plano de 28 dias? · Botão: **Ver meu diagnóstico** |
| — | nome | Como podemos te chamar? |

## Resultado (o diagnóstico prometido na etapa 1)

- **R1:** "{Nome}, seu gatilho principal é **{gatilho_forte}**" + radar dos 4 grupos (automático, emocional, social, concentração) + **"Seu caso se resolve em 28 dias: SIM"** (sempre sim para quem fuma; o que muda é por onde começa).
- **R2:** por que você voltou nas outras vezes (texto do laço, com {quando_recaida} e {metodos}).
- **R3:** seu plano: semana 1 a 4 com datas reais a partir de {sol_inicio}, primeiro gatilho = {gatilho_forte}, aviso em {sol_horario}.
- Página de vendas segue igual à v4.

## Notas para implementar

- Novas variáveis de personalização: `gatilho_forte` (18), `quando_recaida` (22). As outras já existem.
- A 18 precisa filtrar as opções pela 17 (novo comportamento no `test.js`).
- Termos clínicos e números (3 dias, 5×) iguais aos anúncios, para a promessa do anúncio bater com o quiz.
- Ponto de captura do lead para a métrica "retenção até o lead" = tela de e-mail (`quiz_step` step=`email`).
