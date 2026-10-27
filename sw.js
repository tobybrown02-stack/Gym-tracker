/*
 * Offline support. The page itself is fetched network-first (so updates show
 * up straight away when online) with a short timeout, falling back to the
 * saved copy; libraries are cache-first; food data is served from the cache
 * and refreshed in the background.
 */
const CACHE = 'overload-v1';
const CORE = ['./', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];
const LIBS = ['https://cdn.tailwindcss.com/3.4.16'];
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    await Promise.all(LIBS.map((url) => fetch(url, { mode: 'no-cors' }).then((r) => cache.put(url, r)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const scopePath = new URL(self.registration.scope).pathname;
const isPage = (req, url) => req.mode === 'navigate' || (url.origin === location.origin && (url.pathname === scopePath || url.pathname.endsWith('/index.html')));

async function networkFirstPage(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put('./', res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch (err) { /* offline */ }
  return (await cache.match('./')) || network;
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(refresh.catch(() => {}));
    return hit;
  }
  return refresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isPage(req, url)) return event.respondWith(networkFirstPage(req));
  if (url.origin === location.origin && url.pathname.includes('/food-data/')) return event.respondWith(staleWhileRevalidate(req, event));
  if (url.origin === location.origin || ['cdn.tailwindcss.com', 'unpkg.com'].includes(url.hostname)) return event.respondWith(cacheFirst(req));
  // Everything else (e.g. live Open Food Facts lookups) goes straight to the network.
});
