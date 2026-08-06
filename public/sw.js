// Minimal service worker → installable PWA + offline, without staleness traps.
// Cache bumped to v2; the activate handler purges every older cache.
const CACHE = "matrixng-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // Navigations (the HTML document) are network-FIRST: always load the freshest
  // index so a new build's hashed bundle is referenced correctly. Cache is only
  // a fallback when offline. This is what prevents "old index → missing bundle
  // → black screen" after an update.
  const isNavigation =
    req.mode === "navigate" ||
    req.destination === "document" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isNavigation) {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) (await caches.open(CACHE)).put(req, res.clone());
          return res;
        } catch {
          return (await caches.match(req)) || (await caches.match("./index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // Hashed static assets are immutable → cache-first, revalidate in background.
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});
