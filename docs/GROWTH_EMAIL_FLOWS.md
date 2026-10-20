# Flujos de e-mail de Alento (texto base en español)

Catálogo técnico: `FLOWS` en `server/growth/email.js`. Los textos se cargan como plantillas en Customer.io (UE, `track-eu.customer.io`).
Tono: acogedor, sin culpa y sin promesa de cura. Alento acompaña; no es un servicio médico ni sustituye a un profesional.

## Reglas

1. **Transaccional vs marketing.**
   - Transaccional (bienvenida/confirmación, primeros pasos, activación, pago fallido, avisos de cobro y reembolsos): se envía por la App API (`sendTransactional`) o por flujos marcados como transaccionales. No requiere consentimiento de marketing, pero solo se refiere a algo que la persona hizo o contrató. Sin contenido promocional.
   - Marketing (plan sin compra, pago sin completar, regreso): solo con `marketing_consent = true` (consentimiento `marketing_email` concedido Y confirmado). Pie obligatorio con enlace de baja de un clic y datos del responsable.
2. **Confirmación doble (UE).** El alta en la quiz guarda el consentimiento `marketing_email` y se envía el e-mail 1 (confirmación). Solo al pulsar el enlace se rellena `growth.leads.email_confirmed_at` y el atributo `marketing_consent` pasa a `true`. Sin confirmar, no entra ningún flujo de marketing; basta con el transaccional de bienvenida y un único recordatorio.
3. **Baja.** El webhook `unsubscribed` de Customer.io inserta `growth.consents(kind='marketing_email', granted=false)`; esa baja prevalece sobre cualquier consentimiento anterior. La baja nunca corta los transaccionales de cobro.
4. **Máximo 1 e-mail por día** por persona. Customer.io: frecuencia limitada a 1 mensaje/24 h entre campañas de marketing; si dos flujos coinciden, gana el de mayor prioridad (pago fallido > pago sin completar > primeros pasos > plan sin compra > regreso) y el otro se aplaza al día siguiente.
5. **Zona horaria de la persona.** Envío entre las 9:00 y las 20:00 hora local (atributo `timezone` o, si falta, deducido del país; por defecto `Europe/Madrid`). Los transaccionales de cobro e inmediatos salen al instante.
6. **Personalización con la quiz.** Variables disponibles: `{{first_name}}` (opcional), `{{quiz.habit}}` (hábito que la persona quiere trabajar, p. ej. "dejar de fumar"), `{{quiz.goal}}`, `{{quiz.level}}`, `{{plan.name}}`, `{{app_url}}`, `{{unsubscribe_url}}`.
   Importante: `quiz.*` es dato de salud. Vive solo en Customer.io (con la base legal de consentimiento explícito `health_data`) y NUNCA se envía a Meta ni TikTok. Si la variable falta, el texto debe funcionar con la alternativa "tu proceso" (usar `{{quiz.habit | default: "tu proceso"}}`).
7. **Idioma.** Se usa el atributo `language`; si no hay plantilla en ese idioma se cae a español.
8. **Sin presión.** Nada de urgencia falsa, culpa o "has fallado". Ningún mensaje promete resultados concretos.

---

## 1. Bienvenida y confirmación (`welcome_confirm`, transaccional)
Gatillo: `lead_created`. Salida: e-mail confirmado o 7 días.

**welcome_1** (inmediato). Asunto: *Confirma tu correo y recibe tu plan*
> Hola{{ first_name | prepend: " " }}:
> Gracias por darte este momento. Ya hemos guardado tus respuestas sobre {{quiz.habit | default: "tu proceso"}}.
> Para enviarte tu plan y los consejos que elegiste, confirma que este correo es tuyo:
> [Confirmar mi correo]
> Si no fuiste tú, ignora este mensaje y no recibirás nada más. Alento te acompaña, pero no sustituye a un profesional de la salud.

**welcome_2** (48 h, solo si no confirmó). Asunto: *Tu confirmación sigue pendiente*
> Un recordatorio amable: tu enlace de confirmación sigue activo. Cuando quieras, [confirma tu correo](url). Si prefieres no continuar, no hace falta que hagas nada.

## 2. Plan sin compra (`plan_nurture`, marketing)
Gatillo: `lead_created` con consentimiento confirmado. Salida: `purchase`.

**nurture_1** (día 1). Asunto: *Tu primer paso, a tu ritmo*
> Empezar con {{quiz.habit | default: "un cambio"}} no exige hacerlo todo hoy. Tu plan propone un primer paso pequeño: {{plan.first_step | default: "dedicar cinco minutos al día"}}. Puedes verlo cuando quieras: [Ver mi plan](url).

**nurture_2** (día 3). Asunto: *Lo que otras personas notaron la primera semana*
> Muchas personas cuentan que lo más difícil fue empezar, y que contar con un lugar donde registrar cada día les dio calma. Cada proceso es distinto; no hay un ritmo correcto. [Conocer cómo funciona Alento](url).

**nurture_3** (día 6). Asunto: *Tu plan te espera cuando quieras*
> Sin prisa: tu plan sigue guardado. Si te surgen dudas, responde a este correo. Si ya no quieres recibir mensajes, [puedes darte de baja aquí]({{unsubscribe_url}}).

## 3. Pago sin completar (`checkout_abandoned`, marketing)
Gatillo: `checkout_started`. Salida: `purchase`.

**checkout_1** (1 h). Asunto: *Tu plan quedó a medias*
> Vimos que no terminaste el pago. A veces pasa. Puedes retomarlo donde lo dejaste: [Continuar](url). Recuerda que puedes cancelar cuando quieras desde la app.

**checkout_2** (1 día). Asunto: *¿Te surgió alguna duda?*
> Si algo no estaba claro (precio, cancelación, qué incluye), responde a este correo y te lo explicamos. Sin compromiso.

## 4. Primeros pasos tras la compra (`onboarding`, transaccional)
Gatillo: `purchase`.

**onboarding_1** (inmediato). Asunto: *Bienvenida a Alento: así empiezas*
> Gracias por confiar en Alento. Tu suscripción ({{plan.name}}) está activa. Descarga o abre la app e inicia sesión con este correo: [Abrir Alento]({{app_url}}). Tu primer paso para {{quiz.habit | default: "tu proceso"}} te espera. Tienes el recibo en tu correo de pago.

**onboarding_2** (2 días). Asunto: *Un recordatorio amable para tu día*
> Puedes activar un recordatorio diario en Perfil. Un día difícil no borra lo avanzado: aquí seguimos.

## 5. Activación de la app (`activation`, transaccional)
Gatillo: `purchase` sin `app_activated`. Salida: `app_activated`.

**activation_1** (24 h). Asunto: *Abre la app y tu plan estará listo*
> Aún no has entrado en la app. Inicia sesión con este correo y tu plan aparecerá enseguida: [Abrir Alento]({{app_url}}).

**activation_2** (4 días). Asunto: *¿Necesitas ayuda para empezar?*
> Si tuviste algún problema para entrar, responde a este correo. Si prefieres no usar la app, puedes gestionar o cancelar tu suscripción en cualquier momento.

## 6. Pago fallido (`dunning`, transaccional)
Gatillo: `payment_failed`. Salida: `subscription_renewed` o `subscription_canceled`.

**dunning_1** (inmediato). Asunto: *No pudimos cobrar tu suscripción*
> No pudimos procesar el último cobro. Suele ser por una tarjeta caducada o límite del banco. Actualiza tu método de pago aquí: [Actualizar pago]({{billing_url}}). Tu acceso sigue activo unos días.

**dunning_2** (3 días). Asunto: *Actualiza tu método de pago para no perder tu avance*
> Seguimos sin poder cobrar. Tu progreso queda guardado, pero el acceso se pausará pronto. [Actualizar pago]({{billing_url}}).

**dunning_3** (7 días). Asunto: *Último aviso sobre tu suscripción*
> Si no actualizas el pago, tu suscripción se cancelará automáticamente. Puedes volver cuando quieras y tu historial seguirá ahí.

## 7. Cancelación y regreso (`winback`, marketing)
Gatillo: `subscription_canceled`. Salida: `purchase`.

**winback_1** (1 día). Asunto: *Gracias por haber estado, de verdad*
> Hemos cancelado tu suscripción. Gracias por permitir que Alento te acompañara. Si nos cuentas qué faltó (una sola pregunta, 30 segundos), nos ayuda a mejorar: [Responder](url). Sin presión.

**winback_2** (30 días). Asunto: *La puerta sigue abierta*
> Si en algún momento quieres retomar {{quiz.habit | default: "tu proceso"}}, tu historial sigue guardado. [Volver a Alento](url). Si prefieres no recibir más mensajes, [date de baja aquí]({{unsubscribe_url}}).

## 8. Avisos de cobro y reembolsos (`billing_notices`, transaccional)
Gatillos: `trial_ending`, `refund`.

**billing_trial_ending** (3 días antes). Asunto: *Tu período de prueba termina pronto*
> Tu prueba termina el {{trial_end_date}} y después se cobrará {{price}}. Puedes cancelar antes desde Perfil, sin explicaciones: [Gestionar suscripción]({{billing_url}}).

**billing_refund** (inmediato). Asunto: *Hemos procesado tu reembolso*
> Hemos reembolsado {{refund_amount}}. Tu banco puede tardar de 5 a 10 días hábiles en mostrarlo. Gracias por probar Alento.

---

## Medición
Customer.io envía su webhook de informes a `POST /api/...` (ruta del servidor que llama a `email.handleWebhook`) con firma `x-cio-signature`. Se guardan en `growth.email_events` los eventos sent, delivered, opened, clicked, unsubscribed, bounced y converted, con el nombre de la campaña como `flow`. Configura `webhookSecret` en los ajustes `customerio`.
Nota: las aperturas son una señal débil (Apple Mail Privacy Protection); prioriza clics y conversiones.
