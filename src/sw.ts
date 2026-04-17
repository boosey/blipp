/// <reference lib="webworker" />
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope;

// Take control immediately on update
self.skipWaiting();
clientsClaim();

// SPA navigation fallback — network-first so deploys are picked up immediately
registerRoute(new NavigationRoute(new NetworkFirst({ cacheName: "navigation-v1" })));

// JS/CSS assets — cache on first visit, revalidate in background
registerRoute(
  ({ url }) => url.pathname.startsWith("/assets/"),
  new StaleWhileRevalidate({
    cacheName: "assets-v1",
    plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  })
);

// ── Custom caching strategies ──

// Briefing audio: cache-first for offline playback
registerRoute(
  ({ url }) => /^\/api\/briefings\/[^/]+\/audio$/.test(url.pathname),
  new CacheFirst({
    cacheName: "briefing-audio-v1",
    plugins: [new ExpirationPlugin({ maxEntries: 50 })],
  })
);

// Feed API: network-first with offline cache fallback
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/feed"),
  new NetworkFirst({ cacheName: "api-feed-v1" })
);

// ── Push Notifications ──

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Blipp", body: "New briefing ready!" };

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/blipp-icon-transparent-192.png",
      badge: "/blipp-icon-transparent-192.png",
      data: { url: data.url || "/home" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/home";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
