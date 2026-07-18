/* Star Diary service worker: live family data stays network-first; only safe GET responses are cached. */
const BUILD_ID = new URL(self.location.href).searchParams.get("v") || "development";
const CACHE_PREFIX = "star-diary";
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${BUILD_ID}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${BUILD_ID}`;
const DATA_CACHE = `${CACHE_PREFIX}-data-${BUILD_ID}`;
const CORE_ASSETS = [
  "/", "/manifest.json", "/star-diary-logo.jpg", "/favicon-32.png", "/apple-touch-icon.png",
  "/icon-72.png", "/icon-96.png", "/icon-128.png", "/icon-144.png", "/icon-152.png",
  "/icon-192.png", "/icon-384.png", "/icon-512.png", "/icon-maskable-192.png", "/icon-maskable-512.png",
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await Promise.allSettled(CORE_ASSETS.map(async asset => {
      const response = await fetch(new Request(asset, { cache: "reload" }));
      if (response.ok) await cache.put(asset, response);
    }));
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const active = new Set([SHELL_CACHE, RUNTIME_CACHE, DATA_CACHE]);
    await Promise.all((await caches.keys()).filter(name => name.startsWith(`${CACHE_PREFIX}-`) && !active.has(name)).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallbackUrl ? await caches.match(fallbackUrl) : undefined) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request).then(async response => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  }).catch(() => undefined);
  return cached || await network || Response.error();
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/version") {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }
  if (url.pathname === "/api/state") {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  if (url.pathname.startsWith("/api/media")) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/"));
    return;
  }
  if (["style", "script", "font", "image"].includes(request.destination) || CORE_ASSETS.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
