// Service worker de Alento.
// Reglas de caché (seguridad y privacidad):
//  · NUNCA se cachea /api/* (sesión, datos personales y de salud, pagos), ni Stripe, ni otros orígenes.
//  · Páginas HTML: red primero (no contienen datos personales; se pintan en el navegador).
//    Sin conexión: la última versión guardada o la página "Sin conexión".
//  · CSS/JS/imágenes/fuentes propias: caché con actualización en segundo plano.
//  · Al cambiar VERSION se borran las cachés anteriores (actualización controlada).
const VERSION = 'v3';
const STATIC = `aliento-static-${VERSION}`;
const PAGES = `aliento-pages-${VERSION}`;
const PRECACHE = [
  '/offline.html', '/css/app.css', '/js/ui.js', '/js/shell.js', '/js/install.js',
  '/assets/icons/icon-192.png', '/assets/icons/icon-512.png', '/assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('aliento-') && ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // solo GET propios
  if (url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return; // network-only

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') (await caches.open(PAGES)).put(url.pathname, res.clone());
        return res;
      } catch {
        return (await caches.match(url.pathname, { cacheName: PAGES })) || (await caches.match('/offline.html')); // offline.html vive en STATIC (precarga); buscar en todas las cachés
      }
    })());
    return;
  }

  if (/\.(css|js|png|jpg|jpeg|webp|avif|svg|woff2|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    })());
  }
});

// ---------------------------------------------------------------- notificaciones push
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Alento', {
    body: data.body || '',
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/favicon-32.png',
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

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
