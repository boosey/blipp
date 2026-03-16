const CACHE_NAME = 'blipp-v1';
const AUDIO_CACHE_NAME = 'briefing-audio-v1';
const MAX_AUDIO_CACHE_SIZE = 50;
const SHELL_ASSETS = [
  '/',
  '/home',
  '/discover',
  '/library',
  '/settings',
];

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    const toDelete = keys.slice(0, keys.length - maxItems);
    await Promise.all(toDelete.map(key => cache.delete(key)));
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_ASSETS).catch(() => {
        // Non-critical — cache what we can
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== AUDIO_CACHE_NAME).map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // API requests: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    // Briefing audio: cache-first (for offline playback)
    if (url.pathname.match(/^\/api\/briefings\/[^/]+\/audio$/)) {
      event.respondWith(
        caches.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(response => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(AUDIO_CACHE_NAME).then(cache => {
                cache.put(event.request, clone);
                trimCache(AUDIO_CACHE_NAME, MAX_AUDIO_CACHE_SIZE);
              });
            }
            return response;
          });
        })
      );
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache successful GET API responses for offline fallback
          if (response.ok && url.pathname.startsWith('/api/feed')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline: try cache
          return caches.match(event.request).then(cached => {
            return cached || new Response(JSON.stringify({ error: 'Offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            });
          });
        })
    );
    return;
  }

  // Static assets + navigation: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache static assets
        if (response.ok && (
          url.pathname.endsWith('.js') ||
          url.pathname.endsWith('.css') ||
          url.pathname.endsWith('.png') ||
          url.pathname.endsWith('.ico')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline navigation: serve cached shell
        if (event.request.mode === 'navigate') {
          return caches.match('/').then(cached => cached || new Response('Offline', { status: 503 }));
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});

// ── Push Notifications ──

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'Blipp', body: 'New briefing ready!' };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/home' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/home';

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
