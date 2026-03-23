/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { clientsClaim } from "workbox-core";

declare let self: ServiceWorkerGlobalScope;

// Take control immediately on update
self.skipWaiting();
clientsClaim();

// Precache built assets — VitePWA injects manifest at build time
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA navigation fallback
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

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
      icon: "/icon-192.png",
      badge: "/icon-192.png",
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
