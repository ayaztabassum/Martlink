// Minimal service worker — required by browsers for a site to be
// "installable" as a web app. It doesn't do heavy offline caching
// (your catalog needs a live CSV fetch anyway); it just passes
// requests through to the network, falling back to cache if the
// network fails, for whatever has been requested before.
const CACHE_NAME = "downtown-supermart-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
