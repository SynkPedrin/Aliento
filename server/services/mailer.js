// E-mails transacionais pelo Resend (confirmação de compra e suporte).
// Sem RESEND_API_KEY (local/testes) nada é enviado: só fica registrado no log.
import { isValidEmail } from '../auth.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createMailer({ config, fetchImpl = globalThis.fetch, log = console }) {
  const { apiKey, from, support } = config.email;
  const enabled = Boolean(apiKey && from);

  /** idempotencyKey: o Resend ignora o mesmo envio repetido (ex.: webhook reenviado) por 24 h. */
  async function send({ to, subject, html, text, replyTo, idempotencyKey }) {
    if (!enabled) { log.info?.(`[mail] (sem RESEND_API_KEY) "${subject}" → ${to}`); return { skipped: true }; }
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}) },
      body: JSON.stringify({ from, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }

  /** Mensagem do formulário de suporte → caixa do suporte (responder vai direto para o cliente). */
  function sendSupport({ name, email, orderId, message, page }) {
    if (enabled && !support) throw new Error('SUPPORT_EMAIL não configurado.');
    const rows = [['Nome', name], ['E-mail', email], ['Pedido', orderId || '—'], ['Página', page || '—']];
    return send({
      to: support || '(SUPPORT_EMAIL)', replyTo: isValidEmail(email) ? email : undefined,
      subject: `[Suporte] ${name}${orderId ? ` · ${orderId}` : ''}`,
      text: `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${message}`,
      html: `<table>${rows.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${esc(v)}</td></tr>`).join('')}</table><p style="white-space:pre-wrap">${esc(message)}</p>`,
    });
  }

  return { enabled, send, sendSupport };
}

// ---------------------------------------------------------------- confirmação de compra
const PLAN = {
  es: { semanal: 'Plan de 1 semana', mensual: 'Plan de 1 mes', trimestral: 'Plan de 3 meses', anual: 'Plan de 1 año' },
  en: { semanal: '1-week plan', mensual: '1-month plan', trimestral: '3-month plan', anual: '1-year plan' },
  pt: { semanal: 'Plano de 1 semana', mensual: 'Plano de 1 mês', trimestral: 'Plano de 3 meses', anual: 'Plano de 1 ano' },
  fr: { semanal: 'Formule 1 semaine', mensual: 'Formule 1 mois', trimestral: 'Formule 3 mois', anual: 'Formule 1 an' },
  de: { semanal: '1-Wochen-Plan', mensual: '1-Monats-Plan', trimestral: '3-Monats-Plan', anual: '1-Jahres-Plan' },
  it: { semanal: 'Piano di 1 settimana', mensual: 'Piano di 1 mese', trimestral: 'Piano di 3 mesi', anual: 'Piano di 1 anno' },
};
const T = {
  es: { subject: 'Tu acceso a Alento está listo', hi: (n) => `Hola${n ? `, ${n}` : ''}:`, thanks: 'Gracias por tu compra. Tu plan ya está activo.', plan: 'Plan', total: 'Total',
    create: 'Crea tu contraseña para entrar en la app:', createBtn: 'Crear mi contraseña', enter: 'Entra en la app cuando quieras:', enterBtn: 'Entrar en Alento',
    receipt: 'Stripe te envía el recibo por separado.', help: '¿Dudas? Responde a este correo o escríbenos en', bye: 'Un abrazo,\nEquipo Alento' },
  en: { subject: 'Your Alento access is ready', hi: (n) => `Hi${n ? ` ${n}` : ''},`, thanks: 'Thank you for your purchase. Your plan is now active.', plan: 'Plan', total: 'Total',
    create: 'Create your password to open the app:', createBtn: 'Create my password', enter: 'Open the app whenever you like:', enterBtn: 'Open Alento',
    receipt: 'Stripe sends your receipt separately.', help: 'Questions? Reply to this email or contact us at', bye: 'Warmly,\nThe Alento team' },
  pt: { subject: 'Seu acesso ao Alento está pronto', hi: (n) => `Olá${n ? `, ${n}` : ''}!`, thanks: 'Obrigado pela sua compra. Seu plano já está ativo.', plan: 'Plano', total: 'Total',
    create: 'Crie sua senha para entrar no app:', createBtn: 'Criar minha senha', enter: 'Entre no app quando quiser:', enterBtn: 'Entrar no Alento',
    receipt: 'O Stripe envia o recibo separadamente.', help: 'Dúvidas? Responda este e-mail ou fale com a gente em', bye: 'Um abraço,\nEquipe Alento' },
  fr: { subject: 'Votre accès à Alento est prêt', hi: (n) => `Bonjour${n ? ` ${n}` : ''},`, thanks: 'Merci pour votre achat. Votre formule est active.', plan: 'Formule', total: 'Total',
    create: 'Créez votre mot de passe pour ouvrir l’app :', createBtn: 'Créer mon mot de passe', enter: 'Ouvrez l’app quand vous voulez :', enterBtn: 'Ouvrir Alento',
    receipt: 'Stripe vous envoie le reçu séparément.', help: 'Des questions ? Répondez à cet e-mail ou écrivez-nous sur', bye: 'Bien à vous,\nL’équipe Alento' },
  de: { subject: 'Dein Alento-Zugang ist bereit', hi: (n) => `Hallo${n ? ` ${n}` : ''},`, thanks: 'Danke für deinen Kauf. Dein Plan ist jetzt aktiv.', plan: 'Plan', total: 'Gesamt',
    create: 'Erstelle dein Passwort, um die App zu öffnen:', createBtn: 'Passwort erstellen', enter: 'Öffne die App, wann immer du willst:', enterBtn: 'Alento öffnen',
    receipt: 'Stripe schickt dir die Quittung separat.', help: 'Fragen? Antworte auf diese E-Mail oder schreib uns unter', bye: 'Herzliche Grüße,\nDein Alento-Team' },
  it: { subject: 'Il tuo accesso ad Alento è pronto', hi: (n) => `Ciao${n ? ` ${n}` : ''},`, thanks: 'Grazie per l’acquisto. Il tuo piano è attivo.', plan: 'Piano', total: 'Totale',
    create: 'Crea la tua password per entrare nell’app:', createBtn: 'Crea la mia password', enter: 'Entra nell’app quando vuoi:', enterBtn: 'Apri Alento',
    receipt: 'Stripe ti invia la ricevuta a parte.', help: 'Domande? Rispondi a questa e-mail o scrivici su', bye: 'Un abbraccio,\nIl team Alento' },
};

/** Monta o e-mail de boas-vindas após a compra (função pura: testável sem rede). */
export function purchaseEmail({ locale, name, plan, amountCents, currency, link, needsPassword, supportUrl }) {
  const t = T[locale] ?? T.es;
  const planName = (PLAN[locale] ?? PLAN.es)[plan] ?? plan ?? '';
  const total = amountCents != null && currency
    ? new Intl.NumberFormat(locale === 'pt' ? 'pt-BR' : locale || 'es', { style: 'currency', currency: currency.toUpperCase() }).format(amountCents / 100) : null;
  const first = String(name ?? '').trim().split(/\s+/)[0];
  const [lead, btn] = needsPassword ? [t.create, t.createBtn] : [t.enter, t.enterBtn];
  const text = [t.hi(first), '', t.thanks, planName ? `${t.plan}: ${planName}` : null, total ? `${t.total}: ${total}` : null, '', lead, link, '', t.receipt, `${t.help} ${supportUrl}`, '', t.bye]
    .filter((x) => x != null).join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#F4F6FF;font-family:Helvetica,Arial,sans-serif;color:#0A0F3C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:32px" cellpadding="0" cellspacing="0"><tr><td>
<p style="font-size:22px;font-weight:700;color:#1E3FFF;margin:0 0 24px">Alento</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${esc(t.hi(first))}</p>
<p style="font-size:16px;line-height:1.5;margin:0 0 16px">${esc(t.thanks)}</p>
${planName || total ? `<p style="font-size:15px;line-height:1.6;margin:0 0 20px;padding:14px 16px;background:#F4F6FF;border-radius:10px">${planName ? `${esc(t.plan)}: <b>${esc(planName)}</b><br>` : ''}${total ? `${esc(t.total)}: <b>${esc(total)}</b>` : ''}</p>` : ''}
<p style="font-size:16px;line-height:1.5;margin:0 0 16px">${esc(lead)}</p>
<p style="margin:0 0 24px"><a href="${esc(link)}" style="display:inline-block;background:#1E3FFF;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">${esc(btn)}</a></p>
<p style="font-size:13px;line-height:1.5;color:#4B5287;margin:0 0 6px">${esc(t.receipt)}</p>
<p style="font-size:13px;line-height:1.5;color:#4B5287;margin:0 0 20px">${esc(t.help)} <a href="${esc(supportUrl)}" style="color:#1E3FFF">${esc(supportUrl.replace(/^https?:\/\//, ''))}</a></p>
<p style="font-size:15px;line-height:1.5;margin:0;white-space:pre-line">${esc(t.bye)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: t.subject, text, html };
}
