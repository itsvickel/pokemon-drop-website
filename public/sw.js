/**
 * Service worker — deliberately minimal.
 *
 * A service worker is the one thing on a site that can break persistently: a
 * bad one keeps serving stale HTML from inside the user's browser long after
 * the deploy that fixed it. So this one does the least that is still useful.
 *
 * IT CACHES: only Next's build output under /_next/static/, which is
 * content-hashed and immutable — a given URL there can never change meaning, so
 * serving it from cache is always correct.
 *
 * IT NEVER TOUCHES: HTML, API responses, or anything else. Prices are the whole
 * product and must never come from a cache this worker controls. That means no
 * offline page, which is the deliberate trade for not being able to serve
 * anyone a stale price.
 *
 * Bump CACHE_VERSION to evict everything on the next activation.
 */

const CACHE_VERSION = "tcgdrop-static-v1";
const IMMUTABLE_PREFIX = "/_next/static/";

self.addEventListener("install", (event) => {
  // Take over immediately rather than waiting for every tab to close, so a
  // fixed worker replaces a broken one on the next navigation.
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_VERSION));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Same origin only, and only the immutable build output.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(IMMUTABLE_PREFIX)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      // Only store complete, successful responses.
      if (response.ok && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })()
  );
});

/**
 * Push handling.
 *
 * Inert until VAPID keys are configured and a subscription exists — no push can
 * arrive before then. Drops are time-sensitive in a way email cannot serve: a
 * Secret Lair goes live at an exact instant and sells out in minutes.
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "TCG Drop", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "TCG Drop", {
      body: payload.body || "",
      icon: "/icon.svg",
      badge: "/icon-maskable.svg",
      tag: payload.tag || "tcgdrop",
      // Drop alerts are worth replacing rather than stacking: the latest state
      // of a drop is the only one that matters.
      renotify: Boolean(payload.tag),
      data: { url: payload.url || "/drops" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/drops";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open tab when there is one rather than piling up windows.
      for (const client of all) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })()
  );
});
