const CACHE_NAME = 'crm-invent-v2';
// Solo assets que EXISTEN y son estáticos. (El v1 precacheaba PNGs
// inexistentes → cache.addAll rechazaba → el SW nunca instalaba.)
const STATIC_ASSETS = [
  '/icons/icon-72x72.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first para navegación/HTML, cache-first SOLO para estáticos.
// Nunca cachear /api ni Supabase (datos autenticados y siempre frescos).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;       // terceros: no tocar
  if (url.pathname.startsWith('/api/')) return;          // API autenticada: jamás cachear
  if (url.pathname.startsWith('/auth/')) return;         // flujos de auth

  // Navegaciones (HTML): red primero, caché como fallback offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Estáticos (_next, iconos, imágenes, fuentes): caché primero
  const isStatic = url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(png|jpe?g|svg|webp|ico|woff2?|css|js)$/.test(url.pathname);
  if (!isStatic) return;

  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached || fetch(event.request).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
    )
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  
  const options = {
    body: data.body || 'Nueva notificación',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: data.tag || 'default',
    requireInteraction: true,
    data: data.data || {}
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'CRM Invent', options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/dashboard';
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if not
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-contacts') {
    event.waitUntil(syncContacts());
  } else if (event.tag === 'sync-deals') {
    event.waitUntil(syncDeals());
  }
});

async function syncContacts() {
  // Implement contact sync logic
  console.log('Syncing contacts...');
}

async function syncDeals() {
  // Implement deals sync logic
  console.log('Syncing deals...');
}
