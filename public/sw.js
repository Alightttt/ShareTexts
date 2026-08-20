/* ShareText service worker — minimal offline-capable shell.
 *
 * Strategy:
 *   - Precache the app shell on install (HTML, manifest, icons).
 *   - Navigations (the app is a single page at "/", including ?join= links):
 *     network-first so the HTML is always fresh, falling back to the cached
 *     shell when offline.
 *   - Other same-origin GETs (hashed assets, icons): cache-first, filling the
 *     cache on first fetch. Cross-origin requests (the signaling Worker's
 *     /health, /lookup, /ws) are never intercepted.
 */
const CACHE = 'sharetext-v6';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon-16.png',
  '/favicon-32.png',
  '/favicon-48.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/og.png',
  '/social-avatar.png',
  '/demo/photo-4x3.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Keep the cached shell fresh for offline use.
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() =>
          caches.match('/').then((cached) => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          // Only cache same-origin, successful, non-opaque responses.
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
