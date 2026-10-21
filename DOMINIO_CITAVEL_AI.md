# Configurar citavel.ai no Spaceship (hospedagem: Vercel)

## 1. DNS no Spaceship
1. spaceship.com → **Domains** → `citavel.ai` → **Manage** → aba **DNS**.
2. **Nameservers**: escolha **Spaceship default nameservers** (hoje apontam para
   `ns1/ns2.agenciadesigual.com.br`; o site que está lá será substituído).
3. Apague os registros A antigos (185.199.108–111.153, GitHub Pages) e os CNAME antigos de `www`.
4. Adicione:

| Tipo  | Host | Valor                  | TTL |
|-------|------|------------------------|-----|
| A     | @    | 76.76.21.21            | 300 |
| CNAME | www  | cname.vercel-dns.com   | 300 |

5. Aguarde 5–30 min (até 24 h). Teste: `dig +short A citavel.ai` → `76.76.21.21`.
   O Vercel emite o HTTPS sozinho.

## 2. Depois que o DNS responder (peça ao Claude ou faça)
- Vercel: `APP_URL=https://alento.citavel.ai` (Production) e `vercel --prod`.
- Stripe: webhook `https://alento.citavel.ai/api/stripe/webhook` (atualizar `STRIPE_WEBHOOK_SECRET`).
- Supabase → Authentication → URL Configuration: Site URL `https://alento.citavel.ai`,
  Redirect URLs `https://alento.citavel.ai/**`.
- Variáveis legais: `LEGAL_TAX_ID`, `LEGAL_ADDRESS`, `LEGAL_EMAIL`.
