/*
 * Tally offline support. The page is fetched network-first (updates show up
 * straight away when online) with a short timeout, falling back to the saved
 * copy; icons and the manifest are cache-first.
 */
const CACHE = 'tally-v1';
const CORE = ['./', 'manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('tally-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const scopePath = new URL(self.registration.scope).pathname;

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
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(scopePath)) return;
  if (req.mode === 'navigate' || url.pathname === scopePath || url.pathname.endsWith('/index.html')) return event.respondWith(networkFirstPage(req));
  event.respondWith(cacheFirst(req));
});
