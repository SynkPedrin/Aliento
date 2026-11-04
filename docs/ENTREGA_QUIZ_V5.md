# Entrega: quiz v5 do Sem Fumo + versões no Analytics

Base: commit `2484530`. Sem migração de banco (a versão vai no `props` jsonb que já existe).

## O que entra

**Quiz v5 (beta), ao lado da v4**
- `/quiz/sem-fumo?beta=5` (ou `/test?beta=5`) abre a v5; sem o parâmetro continua a v4 padrão.
- `server/quiz.js`: `STEPS_V5` (42 etapas), `EMOJI_V5` (emoji por opção, só na v5), `publicQuiz(program, variant)`; `missingAnswers` aceita v4 ou v5 completas.
- `server/routes/public.js`: `/api/quiz?v=5`.
- `public/js/pages/test.js`: `{q_id}` vira a resposta escolhida, `optionsFrom` (etapa 16 filtra pela 15 e se pula com 1 opção), emoji nas opções, texto longo revelado por toque (só v5).
- `public/css/app.css`: estilos de emoji e revelação.
- Traduções: `i18n/funil-10-quiz-v5.json` → `npm run i18n:build` (já rodado; `public/js/lang/*.js` regenerados). `scripts/i18n-extract.js`: faixa de SKIP_LINES atualizada.

**Versão do quiz nos eventos e no painel**
- Todo evento do quiz (`quiz_started`, `quiz_step`, `quiz_answered`, `quiz_commitment`, `lead_form_shown`) leva `props.quiz_version` (`v4`, `v5`). `server/routes/track.js` grava o campo.
- Eventos antigos, sem o campo, contam como a versão padrão (v4).
- `server/routes/growth.js`: `QUIZ_VERSIONS`. `/funnels` devolve `versions` por produto (iniciaram, lead %, conversão da coorte, link). `/funnels/:program?qv=v5` mostra as telas e métricas da versão.
- `public/js/growth/v2.js` + `growth.css`: o card do produto lista as versões com link para copiar; dentro do produto há abas "Quiz v4 / Quiz v5".
- Com mais de uma versão, compras e conversão do funil são as da coorte da versão; o faturamento fica no card do produto.

**Teste novo**: `test/growth-panel.test.js` ("cada produto separa as versões do quiz").

**Documentos**: `docs/QUIZ_COPY_V5.md` (copy), `server/growth/quiz-benchmarks.json` (metas de funil).

## Antes de pôr tráfego pago na v5
1. O resultado e a página de vendas ainda são os da v4 (não continuam o diagnóstico da v5).
2. Conferir a fonte das afirmações "5× mais chance" (Stoptober), "17 mil usuários" e os logos de OMS/Harvard/JAMA.
3. Traduções escritas por IA: revisão nativa pendente.

## Como validar
```
npm run i18n:missing   # 0 faltando
npm test
```
