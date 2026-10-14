# Aliento: checklist de produção (atualizado em 14/10/2026)

**Produção:** https://aliento-alpha.vercel.app · **Repositório:** github.com/SynkPedrin/Aliento (deploy automático a cada push na `main`)

## Feito
- [x] Projeto Vercel `aliento`, ligado ao GitHub. Função serverless em `api/index.js` e páginas estáticas em `public/`.
- [x] Variáveis de produção na Vercel: Stripe live, webhook secret, VAPID, CRON_SECRET, moeda, idioma, oferta, identidade legal (nome e país), `APP_URL`.
- [x] Stripe **live**:
  - produto `Aliento Premium` com descritor de fatura "ALIENTO";
  - 3 preços em USD (7,99 / 19,99 / 34,99);
  - cupom `aliento-salida-20`;
  - webhook `https://aliento-alpha.vercel.app/api/stripe/webhook` com 11 eventos;
  - Customer Portal (cancelar ao fim do período, trocar de plano, cartão, faturas, links para termos e privacidade).
- [x] Notificações Web Push: chaves VAPID, service worker, ativação por dispositivo, lembrete diário, resumo semanal, sugestão de exercício e aviso de conquista, todos sem duplicados.
- [x] Revisão do conteúdo (precisão, segurança, linguagem). O validador passa.
- [x] Termos e privacidade completos (CDC/LGPD, compatíveis com o RGPD), com a identidade legal configurável via `LEGAL_*`.
- [x] Consentimento específico para dados de saúde no cadastro.
- [x] Acesso de cortesia (`access_grants`) e conta interna criada por script.

## Falta (nesta ordem)
1. [ ] **Aceitar os termos da integração Supabase** (só você pode fazer):
   https://vercel.com/pgvenegeroles09-9629s-projects/~/integrations/accept-terms/supabase?source=cli
2. [ ] `npx vercel integration add supabase --name aliento-db --non-interactive` (cria o banco e injeta as variáveis).
3. [ ] `npm run prod:finish -- admin@admin.com 'Elefante#123'`: migrations, jornada, conta admin, lembretes (pg_cron) e deploy.
4. [ ] No Supabase › Authentication › URL Configuration: *Site URL* `https://aliento-alpha.vercel.app` e *Redirect URL* `https://aliento-alpha.vercel.app/restablecer`. Para volume real de e-mails de recuperação, configurar SMTP próprio.
5. [ ] Stripe Dashboard › Settings › Business › Public details: hoje o Checkout mostra **"GS MIDIA"** e o descritor padrão da conta é **"ZIVAHSTORE"**. O produto já força "ALIENTO" nas assinaturas, mas o nome público só muda pelo painel.
6. [ ] Vercel: `LEGAL_TAX_ID` (CNPJ), `LEGAL_ADDRESS` e `LEGAL_EMAIL` (e-mail de contato público). Sem eles, as páginas legais mostram "disponible a solicitud".
7. [ ] **Rotacionar** as chaves Stripe live (enviadas por mensagem) e atualizar `STRIPE_SECRET_KEY` na Vercel.

## Revisão humana (obrigatória antes de escalar)
- Profissional de saúde: os 8 pontos listados no relatório de revisão do conteúdo (`IMPLEMENTATION_STATUS.md`).
- Advogado: os pontos marcados no fim de `public/terminos.html` e `public/privacidad.html` (comentário no topo) e em `IMPLEMENTATION_STATUS.md`.
