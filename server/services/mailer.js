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
  'pt-BR': { semanal: 'Plano de 1 semana', mensual: 'Plano de 1 mês', trimestral: 'Plano de 3 meses', anual: 'Plano de 1 ano' },
  'pt-PT': { semanal: 'Plano de 1 semana', mensual: 'Plano de 1 mês', trimestral: 'Plano de 3 meses', anual: 'Plano de 1 ano' },
  fr: { semanal: 'Formule 1 semaine', mensual: 'Formule 1 mois', trimestral: 'Formule 3 mois', anual: 'Formule 1 an' },
  de: { semanal: '1-Wochen-Plan', mensual: '1-Monats-Plan', trimestral: '3-Monats-Plan', anual: '1-Jahres-Plan' },
};
const T = {
  es: { subject: 'Tu acceso a Alento está listo', hi: (n) => `Hola${n ? `, ${n}` : ''}:`, thanks: 'Gracias por tu compra. Tu plan ya está activo.', plan: 'Plan', total: 'Total',
    create: 'Crea tu contraseña para entrar en la app:', createBtn: 'Crear mi contraseña', enter: 'Entra en la app cuando quieras:', enterBtn: 'Entrar en Alento',
    receipt: 'Stripe te envía el recibo por separado.', help: '¿Dudas? Responde a este correo o escríbenos en', bye: 'Con cariño,\nEquipo Alento' },
  en: { subject: 'Your Alento access is ready', hi: (n) => `Hi${n ? ` ${n}` : ''},`, thanks: 'Thank you for your purchase. Your plan is now active.', plan: 'Plan', total: 'Total',
    create: 'Create your password to open the app:', createBtn: 'Create my password', enter: 'Open the app whenever you like:', enterBtn: 'Open Alento',
    receipt: 'Stripe sends your receipt separately.', help: 'Questions? Reply to this email or contact us at', bye: 'With care,\nThe Alento team' },
  'pt-BR': { subject: 'Seu acesso ao Alento está pronto', hi: (n) => `Olá${n ? `, ${n}` : ''}!`, thanks: 'Obrigado pela sua compra. Seu plano já está ativo.', plan: 'Plano', total: 'Total',
    create: 'Crie sua senha para entrar no app:', createBtn: 'Criar minha senha', enter: 'Entre no app quando quiser:', enterBtn: 'Entrar no Alento',
    receipt: 'O Stripe envia o recibo separadamente.', help: 'Dúvidas? Responda este e-mail ou fale com a gente em', bye: 'Com carinho,\nEquipe Alento' },
  fr: { subject: 'Ton accès à Alento est prêt', hi: (n) => `Bonjour${n ? ` ${n}` : ''},`, thanks: 'Merci pour ton achat. Ta formule est active.', plan: 'Formule', total: 'Total',
    create: 'Crée ton mot de passe pour ouvrir l’app :', createBtn: 'Créer mon mot de passe', enter: 'Ouvre l’app quand tu veux :', enterBtn: 'Ouvrir Alento',
    receipt: 'Stripe t’envoie le reçu séparément.', help: 'Des questions ? Réponds à cet e-mail ou écris-nous sur', bye: 'À bientôt,\nL’équipe Alento' },
  de: { subject: 'Dein Alento-Zugang ist bereit', hi: (n) => `Hallo${n ? ` ${n}` : ''},`, thanks: 'Danke für deinen Kauf. Dein Plan ist jetzt aktiv.', plan: 'Plan', total: 'Gesamt',
    create: 'Erstelle dein Passwort, um die App zu öffnen:', createBtn: 'Passwort erstellen', enter: 'Öffne die App, wann immer du willst:', enterBtn: 'Alento öffnen',
    receipt: 'Stripe schickt dir die Quittung separat.', help: 'Fragen? Antworte auf diese E-Mail oder schreib uns unter', bye: 'Alles Liebe,\nDein Alento-Team' },
  'pt-PT': { subject: 'O teu acesso ao Alento está pronto', hi: (n) => `Olá${n ? `, ${n}` : ''}!`, thanks: 'Obrigado pela tua compra. O teu plano já está ativo.', plan: 'Plano', total: 'Total',
    create: 'Cria a tua palavra-passe para entrar na app:', createBtn: 'Criar a minha palavra-passe', enter: 'Entra na app quando quiseres:', enterBtn: 'Entrar no Alento',
    receipt: 'O Stripe envia-te o recibo em separado.', help: 'Dúvidas? Responde a este e-mail ou fala connosco em', bye: 'Com carinho,\nEquipa Alento' },
};

const ICONS = ['app', 'jornada', 'diario', 'volta']; // public/assets/email/passo-*.png (scripts/email-icons.mjs)

// Boas-vindas: faixa do topo, acolhimento e "e agora?" em 4 passos.
const W = {
  es: { sig: 'Respira de nuevo.', welcome: 'Qué bien tenerte aquí.',
    intro: ['Has dado un paso que pide valor. A partir de hoy, Alento te acompaña con calma y a tu ritmo.', 'Los primeros días pueden ser difíciles, y es normal. Para eso estamos aquí desde el principio.'],
    next: '¿Y ahora qué?', steps: [['Entra en la app', 'Usa tu correo y tu contraseña. En el móvil, añádela a tu pantalla de inicio.'], ['Sigue tu jornada', '9 capítulos con pequeñas tareas que se abren poco a poco, a tu ritmo.'],
      ['Registra tu día', 'Anota cómo te sientes y mira cómo crece tu progreso.'], ['Vuelve cada día', 'Cada día te espera una frase nueva, sobre todo para los días difíciles.']] },
  en: { sig: 'Breathe again.', welcome: 'We’re so glad you’re here.',
    intro: ['You’ve taken a step that takes courage. From today, Alento walks alongside you, calmly and at your own pace.', 'The first few days can feel hard, and that’s normal. That’s exactly why we’re here from the very start.'],
    next: 'So, what now?', steps: [['Open the app', 'Sign in with your email and password. On your phone, add it to your home screen.'], ['Follow your journey', '9 chapters of small tasks that unlock gradually, at your pace.'],
      ['Log your day', 'Note how you feel and watch your progress grow.'], ['Come back every day', 'A new phrase waits for you each day, especially for the hard ones.']] },
  'pt-BR': { sig: 'Respire de novo.', welcome: 'Que bom ter você aqui.',
    intro: ['Você deu um passo que pede coragem. A partir de hoje, o Alento te acompanha com calma e no seu ritmo.', 'Os primeiros dias podem ser difíceis, e isso é normal. É para isso que estamos aqui desde o começo.'],
    next: 'E agora?', steps: [['Entre no app', 'Use seu e-mail e sua senha. No celular, adicione o app à tela inicial.'], ['Siga sua jornada', '9 capítulos com pequenas tarefas que se abrem aos poucos, no seu ritmo.'],
      ['Registre seu dia', 'Anote como você se sente e veja seu progresso crescer.'], ['Volte todo dia', 'Uma frase nova te espera a cada dia, principalmente nos dias difíceis.']] },
  'pt-PT': { sig: 'Respira de novo.', welcome: 'Que bom ter-te aqui.',
    intro: ['Deste um passo que pede coragem. A partir de hoje, o Alento acompanha-te com calma e ao teu ritmo.', 'Os primeiros dias podem ser difíceis, e isso é normal. É para isso que estamos aqui desde o início.'],
    next: 'E agora?', steps: [['Entra na app', 'Usa o teu e-mail e a tua palavra-passe. No telemóvel, adiciona a app ao ecrã principal.'], ['Segue a tua jornada', '9 capítulos com pequenas tarefas que se desbloqueiam aos poucos, ao teu ritmo.'],
      ['Regista o teu dia', 'Anota como te sentes e vê o teu progresso crescer.'], ['Volta todos os dias', 'Todos os dias tens uma frase nova à tua espera, sobretudo nos dias difíceis.']] },
  fr: { sig: 'Respirez à nouveau.', welcome: 'Nous sommes heureux de vous accueillir.',
    intro: ['Vous venez de faire un pas qui demande du courage. Dès aujourd’hui, Alento vous accompagne, avec calme et à votre rythme.', 'Les premiers jours peuvent être difficiles, et c’est normal. C’est justement pour cela que nous sommes là dès le début.'],
    next: 'Et maintenant ?', steps: [['Ouvrez l’app', 'Connectez-vous avec votre e-mail et votre mot de passe. Sur mobile, ajoutez-la à votre écran d’accueil.'], ['Suivez votre parcours', '9 chapitres de petites tâches qui se débloquent peu à peu, à votre rythme.'],
      ['Notez votre journée', 'Notez ce que vous ressentez et voyez vos progrès grandir.'], ['Revenez chaque jour', 'Une nouvelle phrase vous attend chaque jour, surtout pour les jours difficiles.']] },
  de: { sig: 'Atme wieder auf.', welcome: 'Schön, dass du da bist.',
    intro: ['Du hast einen Schritt gemacht, der Mut braucht. Ab heute begleitet dich Alento, ruhig und in deinem Tempo.', 'Die ersten Tage können schwer sein, und das ist normal. Genau dafür sind wir von Anfang an da.'],
    next: 'Und jetzt?', steps: [['Öffne die App', 'Melde dich mit deiner E-Mail und deinem Passwort an. Auf dem Handy: zum Startbildschirm hinzufügen.'], ['Folge deiner Reise', '9 Kapitel mit kleinen Aufgaben, die sich nach und nach freischalten, in deinem Tempo.'],
      ['Halte deinen Tag fest', 'Notiere, wie es dir geht, und sieh deinen Fortschritt wachsen.'], ['Komm jeden Tag zurück', 'Jeden Tag wartet ein neuer Satz auf dich, gerade an schweren Tagen.']] },
};

/** Monta o e-mail de boas-vindas após a compra (função pura: testável sem rede). */
export function purchaseEmail({ locale, name, plan, amountCents, currency, link, needsPassword, supportUrl, appUrl = '' }) {
  const t = T[locale] ?? T.es;
  const w = W[locale] ?? W.es;
  const planName = (PLAN[locale] ?? PLAN.es)[plan] ?? plan ?? '';
  const total = amountCents != null && currency
    ? new Intl.NumberFormat(T[locale] ? locale : 'es', { style: 'currency', currency: currency.toUpperCase() }).format(amountCents / 100) : null;
  const first = String(name ?? '').trim().split(/\s+/)[0];
  const [lead, btn] = needsPassword ? [t.create, t.createBtn] : [t.enter, t.enterBtn];
  const text = [t.hi(first), '', w.welcome, '', t.thanks, planName ? `${t.plan}: ${planName}` : null, total ? `${t.total}: ${total}` : null, '', ...w.intro.flatMap((p) => [p, '']),
    lead, link, '', w.next, ...w.steps.map(([h, d], i) => `${i + 1}. ${h}: ${d}`), '', t.bye, w.sig, '', t.receipt, `${t.help} ${supportUrl}`]
    .filter((x) => x != null).join('\n');
  // Marca: Varela 400 só em títulos (sem negrito), Figtree Light no texto; quem não carrega a fonte (Gmail) cai no fallback.
  const V = "font-family:Varela,'Varela Round',Helvetica,Arial,sans-serif;font-weight:400";
  const F = "font-family:Figtree,Helvetica,Arial,sans-serif";
  const P = `${F};font-size:16px;font-weight:300;line-height:1.6;color:#0A0F3C;margin:0 0 16px`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;500&display=swap" rel="stylesheet">
<style>@font-face{font-family:Varela;font-weight:400;src:url('${esc(appUrl)}/fonts/varela.woff') format('woff')}</style></head>
<body style="margin:0;background:#FFFFFF;color:#0A0F3C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px 40px">
<table role="presentation" width="100%" style="max-width:600px" cellpadding="0" cellspacing="0">
<tr><td align="center" bgcolor="#1E3FFF" style="background:#1E3FFF;border-radius:22px;padding:44px 24px"><img src="${esc(appUrl)}/assets/brand/alento-logo-branco.png" width="150" height="29" alt="Alento" style="display:block;border:0;margin:0 auto"></td></tr>
<tr><td style="padding:40px 8px 0">
<p style="${V};font-size:36px;line-height:1.1;letter-spacing:-0.02em;color:#0A0F3C;margin:0 0 28px">${esc(w.welcome)}</p>
<p style="${P}">${esc(t.hi(first))}</p>
<p style="${P}">${esc(t.thanks)}</p>
${planName || total ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="background:#EEF3FF;border-radius:16px;padding:16px 20px;${F};font-size:15px;line-height:1.7;color:#4A5185">${planName ? `${esc(t.plan)}: <span style="color:#0A0F3C;font-weight:500">${esc(planName)}</span><br>` : ''}${total ? `${esc(t.total)}: <span style="color:#0A0F3C;font-weight:500">${esc(total)}</span>` : ''}</td></tr></table>` : ''}
${w.intro.map((p) => `<p style="${P}">${esc(p)}</p>`).join('\n')}
<p style="${P};margin-top:8px">${esc(lead)}</p>
<p style="margin:0 0 48px"><a href="${esc(link)}" style="display:inline-block;background:#1E3FFF;color:#FFFFFF;text-decoration:none;${F};font-weight:500;font-size:16px;padding:16px 32px;border-radius:30px">${esc(btn)}</a></p>
</td></tr>
<tr><td style="background:#EEF3FF;border-radius:22px;padding:36px 28px 16px">
<p style="${V};font-size:28px;line-height:1.15;letter-spacing:-0.01em;color:#0A0F3C;margin:0 0 28px">${esc(w.next)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${w.steps.map(([h, d], i) => `<tr>
<td width="68" valign="top" style="padding:0 16px 24px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="52" height="52" align="center" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:16px"><img src="${esc(appUrl)}/assets/email/passo-${ICONS[i]}.png" width="38" height="38" alt="" style="display:block;border:0"></td></tr></table></td>
<td valign="top" style="padding:0 0 24px"><p style="${V};font-size:19px;line-height:1.2;color:#0A0F3C;margin:4px 0 6px"><span style="display:inline-block;width:20px;height:20px;line-height:20px;border-radius:10px;background:#3EE0B5;color:#0A0F3C;${F};font-weight:500;font-size:11px;text-align:center;vertical-align:3px;margin-right:8px">${i + 1}</span>${esc(h)}</p><p style="${F};font-size:15px;font-weight:300;line-height:1.55;color:#4A5185;margin:0">${esc(d)}</p></td></tr>`).join('')}</table>
</td></tr>
<tr><td style="padding:40px 8px 0">
<p style="${P};white-space:pre-line;margin-bottom:24px">${esc(t.bye)}</p>
<p style="${V};font-size:19px;color:#1E3FFF;margin:0 0 32px">${esc(w.sig)}</p>
<p style="border-top:1px solid #D5DCF5;margin:0 0 20px;font-size:0;line-height:0">&nbsp;</p>
<p style="${F};font-size:13px;font-weight:300;line-height:1.6;color:#4A5185;margin:0 0 4px">${esc(t.receipt)}</p>
<p style="${F};font-size:13px;font-weight:300;line-height:1.6;color:#4A5185;margin:0">${esc(t.help)} <a href="${esc(supportUrl)}" style="color:#1E3FFF">${esc(supportUrl.replace(/^https?:\/\//, ''))}</a></p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: t.subject, text, html };
}
