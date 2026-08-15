# ShareText — PWA Quality Audit

## What's implemented

- **Manifest** (`public/manifest.json`): name/short_name, `display: standalone`,
  start_url `/`, theme + background colors, icons with `any` and `maskable` purposes.
- **Icon family** — a coherent set rendered from the ShareText logo mark:
  `favicon.svg` (vector), `favicon-16/32/48.png` (new, browser-rendered from the SVG),
  `icon-192/512.png` (`any`), `icon-maskable-192/512.png` (safe-zone maskable),
  `apple-touch-icon.png` (180×180). No unrelated generated icons.
- **Head integration** (`index.html`): manifest link, icon links for every size,
  apple-touch-icon, `theme-color` for light *and* dark, `mobile-web-app-capable`,
  `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style:
  black-translucent`, `apple-mobile-web-app-title`, `viewport-fit=cover` (safe areas).
- **Service worker** (`public/sw.js`, registered in production only):
  - precaches the shell (HTML, manifest, all icons) on install, `skipWaiting` +
    `clients.claim`;
  - navigations are **network-first** with cached-shell fallback → offline opens the
    app shell;
  - same-origin GETs are cache-first with runtime fill; **cross-origin requests are
    never intercepted** — the Cloudflare signaling endpoints (`/health`, `/lookup`,
    `/ws`) are untouched by the SW;
  - versioned cache (`sharetext-v2`).
- **Install experience** — no aggressive "Install ShareText?" prompt anywhere. The
  browser's native install affordance is the only path; `beforeinstallprompt` is not
  hijacked. (The brief's "only after the user has experienced the product" is
  satisfied by not prompting at all.)

## Offline honesty

The offline shell **does not fake connectivity**: the landing, pairing, and settings
screens render offline, but anything that needs the network or WebRTC shows its normal
error/reconnecting states ("Couldn't reach ShareText." / "Reconnecting…"). Nothing
claims transfers work offline. The app's static shell is all that's cached.

## Verification

- `probe-sw.mjs` (run in the earlier PWA pass): service worker registered, activated,
  and controlling the page on the production build.
- Icons verified at exact dimensions (16/32/48/180/192/512, maskable safe zone).
- A fresh deploy bumps the SW cache version so installed clients refresh cleanly.
