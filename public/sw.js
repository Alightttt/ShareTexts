/* ShareTexts service worker — minimal offline-capable shell.
 *
 * Strategy:
 *   - Precache the app shell on install (HTML, manifest, icons).
 *   - Navigations (the app is a single page at "/", including ?join= links):
 *     network-first so the HTML is always fresh, falling back to the cached
 *     shell when offline.
 *   - UNHASHED app files (manifest, favicons, icons, og image): network-first
 *     with a cache fallback. Cache-first here froze branding for returning
 *     visitors — a rebranded manifest/favicon never reached browsers that had
 *     an older copy, and no cache-key bump can be trusted to ship every time.
 *   - Other same-origin GETs (content-hashed assets): cache-first, filling
 *     the cache on first fetch. Cross-origin requests (the signaling
 *     Worker's /health, /lookup, /ws) are never intercepted.
 */
const CACHE = 'sharetexts-v18';
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
  '/og/airdrop-any-device.png',
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
    // STALE-WHILE-REVALIDATE: the cached shell paints INSTANTLY — on a slow
    // 3G link network-first meant seconds of white browser chrome before our
    // boot skeleton could even render ("loading screen never goes away"),
    // because respondWith() held the navigation until the network answered.
    // The boot skeleton inside the shell IS the loading state; it now shows
    // at once, while the fresh HTML is fetched in the background and cached
    // for the next visit.
    event.respondWith(
      caches.match('/').then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put('/', copy));
            }
            return response;
          })
          .catch(() => cached || caches.match('/index.html'));
        // Cached shell answers immediately when present; offline falls back
        // to it too. No cache (first ever visit) waits for the network.
        return cached || network;
      })
    );
    return;
  }

  // Unhashed shell files must track the server: a branding/icon update has
  // to reach every visitor on their next load, online or not.
  const unhashed = SHELL.includes(url.pathname) && url.pathname !== '/';
  if (unhashed) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error()))
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

// ── Temporary Space reminders (F14) ────────────────────────────────────────
// One push per space per device. The server sends a generic payload:
//   { title, body, spaceId }  — never filenames or content.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* opaque payload */ }
  if (!data || !data.spaceId) return; // unknown push shape — ignore quietly
  event.waitUntil((async () => {
    // Deduplicate: if this space's reminder notification is still showing,
    // replace it rather than stacking duplicates.
    const tag = 'space-reminder-' + data.spaceId;
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const title = typeof data.title === 'string' ? data.title : 'ShareTexts';
    const body = typeof data.body === 'string' ? data.body : 'Your space closes soon.';
    await self.registration.showNotification(title, {
      body,
      tag,
      renotify: false, // one reminder; a re-shown tag would be a second buzz
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { spaceId: data.spaceId },
    });
    return clientList.length; // keeps linters honest about the clients read
  })());
});

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();
  const target = data.spaceId
    ? '/space/' + data.spaceId
    : '/';
  event.waitUntil((async () => {
    // Focus an existing window on this origin if one exists; the app routes
    // itself to the space from its stored credential. Otherwise open fresh —
    // if the credential is gone the app shows the join surface honestly.
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if (client.url.startsWith(self.location.origin)) {
        await client.focus();
        if (client.navigate) {
          try { await client.navigate(target); } catch { /* navigation refused — the focused app is enough */ }
        }
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
