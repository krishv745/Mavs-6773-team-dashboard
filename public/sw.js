const CACHE_NAME = "tech-titans-team-shell-v2";
const SHELL_URLS = ["/team/tasks", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

// Only step in for full-page navigations, and only as an offline fallback.
// Every other request (RSC data, JS chunks, API calls, etc.) passes straight
// through untouched — intercepting those is what caused the app to hang.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match("/team/tasks")),
  );
});
