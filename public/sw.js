// Service worker de Aliento: muestra las notificaciones push y abre la sección indicada.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Aliento', {
    body: data.body || '',
    icon: '/assets/icono-180.png',
    badge: '/assets/favicon.png',
    tag: data.tag,
    lang: 'es',
    data: { url: data.url || '/dashboard' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      if (client.url.startsWith(self.location.origin) && 'focus' in client) {
        client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  }));
});
