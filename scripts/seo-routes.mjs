/**
 * SEO route shells — build-time prerendering for the public SPA routes.
 *
 * WHY: sharetexts.online is a Vite SPA. The homepage now ships real crawlable
 * content in its shell (see index.html), but /docs, /privacy and /terms were
 * JS-only: a crawler saw an empty document with the homepage's meta. This
 * script runs AFTER `vite build` and derives one static HTML file per public
 * route from dist/index.html:
 *
 *   - the <head> is kept intact (font preloads, icons, theme bootstrap,
 *     hashed asset tags, the site-wide Organization/WebApplication/WebSite
 *     graph) with per-route title/description/canonical/OG/Twitter swapped in;
 *   - the boot skeleton inside #root is replaced by real, readable route
 *     content (the same facts the React views render). React then mounts over
 *     it — JS users see the interactive page, crawlers and no-JS visitors see
 *     the same substance as plain HTML;
 *   - /docs additionally carries FAQPage JSON-LD whose Q&As are copied
 *     VERBATIM from the visible FAQ below (which itself mirrors
 *     src/views/Docs.tsx) — markup only ever describes visible content;
 *   - 404.html is noindex and gives humans real ways forward.
 *
 * Wiring:
 *   package.json  build: "vite build && esbuild … && node scripts/seo-routes.mjs"
 *   server.ts     prod SPA fallback serves these files for the known routes
 *                 (and 404.html with a real 404 status for everything else)
 *   vercel.json   rewrites /docs /privacy /terms → /seo/<route>.html
 *
 * Content rules (F20): every claim here is copied from the product's own
 * copy — Docs.tsx, Legal.tsx, llms.txt. No invented facts, no contact data,
 * no ratings, no profiles beyond the two verified ones (X @0xalyt, GitHub).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const dist = path.join(process.cwd(), 'dist');
const seoDir = path.join(dist, 'seo');
mkdirSync(seoDir, { recursive: true });

const base = readFileSync(path.join(dist, 'index.html'), 'utf8');

// ---------------------------------------------------------------------------
// Shared shell chrome — quiet, on-brand, dark-mode aware via the existing
// pre-paint theme bootstrap (html.dark). Scoped to .st-seo so it can never
// collide with the app's CSS.
// ---------------------------------------------------------------------------
const SHELL_CSS = `
    <style>
      .st-seo { min-height: 100dvh; display: flex; flex-direction: column;
        background: #f7f4ee; color: #1d1d1f;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      html.dark .st-seo { background: #131315; color: #f5f4f0; }
      .st-seo a { color: #d9560e; text-decoration: none; font-weight: 500; }
      html.dark .st-seo a { color: #ff8a3d; }
      .st-seo a:hover { text-decoration: underline; }
      .st-seo-header { display: flex; align-items: center; gap: 8px;
        padding: 18px 24px; font-weight: 700; letter-spacing: -0.02em; }
      .st-seo-header svg { display: block; }
      .st-seo-main { width: 100%; max-width: 720px; margin: 0 auto;
        padding: 8px 24px 48px; flex: 1; }
      .st-seo .overline { font-size: 12px; font-weight: 600; letter-spacing: 0.09em;
        text-transform: uppercase; color: rgba(99,95,87,0.85); margin: 0 0 10px; }
      html.dark .st-seo .overline { color: rgba(176,171,162,0.8); }
      .st-seo h1 { font-size: clamp(28px, 4.5vw, 40px); line-height: 1.12;
        letter-spacing: -0.03em; font-weight: 700; margin: 0 0 10px; }
      .st-seo .subtitle { font-size: 16.5px; line-height: 1.6;
        color: #6e6e73; margin: 0 0 26px; max-width: 58ch; }
      html.dark .st-seo .subtitle { color: rgba(255,255,255,0.62); }
      .st-seo h2 { font-size: 19px; letter-spacing: -0.02em; font-weight: 650;
        margin: 30px 0 10px; }
      .st-seo h3 { font-size: 15.5px; font-weight: 600; margin: 20px 0 4px; }
      .st-seo p, .st-seo li { font-size: 14.5px; line-height: 1.7; color: #3d3a34; }
      html.dark .st-seo p, html.dark .st-seo li { color: rgba(245,244,240,0.75); }
      .st-seo ul, .st-seo ol { padding-left: 20px; margin: 8px 0; }
      .st-seo-footer { border-top: 1px solid rgba(30,28,24,0.08);
        padding: 18px 24px 28px; display: flex; flex-wrap: wrap; gap: 8px 22px;
        font-size: 13px; }
      html.dark .st-seo-footer { border-top-color: rgba(255,255,255,0.08); }
      .st-seo .muted { color: #6e6e73; font-size: 13px; }
      html.dark .st-seo .muted { color: rgba(255,255,255,0.5); }
    </style>`;

const LOGO_SVG = `<svg width="26" height="26" viewBox="0 0 256 256" fill="none" aria-hidden="true">
        <defs><linearGradient id="st-seo-ember" x1="24" y1="20" x2="216" y2="236" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#feab30"/><stop offset="0.55" stop-color="#f97b3d"/><stop offset="1" stop-color="#f06413"/>
        </linearGradient></defs>
        <rect x="40" y="36" width="84" height="84" rx="24" fill="url(#st-seo-ember)"/>
        <rect x="132" y="136" width="84" height="84" rx="24" fill="url(#st-seo-ember)"/>
        <path d="M110 106 L146 142" stroke="url(#st-seo-ember)" stroke-width="28" stroke-linecap="round"/>
      </svg>`;

function shellBody({ overline, h1, subtitle, main, footerNote }) {
  return `<div id="root">
      <div class="st-seo">
        <header class="st-seo-header"><a href="/" aria-label="ShareTexts home" style="display:flex;align-items:center;gap:8px;color:inherit">${LOGO_SVG}<span>ShareTexts</span></a></header>
        <main class="st-seo-main">
          <p class="overline">${overline}</p>
          <h1>${h1}</h1>
          <p class="subtitle">${subtitle}</p>
          ${main}
        </main>
        <footer class="st-seo-footer">
          <a href="/">ShareTexts</a>
          <a href="/docs">Docs</a>
          <a href="/about">About</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="https://x.com/0xalyt" rel="noopener">x.com/0xalyt</a>
          <a href="https://github.com/Alightttt/ShareTexts" rel="noopener">GitHub</a>
          ${footerNote ? `<span class="muted">${footerNote}</span>` : ''}
        </footer>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Head surgery: swap the route-specific meta into the shared <head>.
// ---------------------------------------------------------------------------
function swapMeta(html, { title, description, canonicalPath, robots = 'index, follow', ogType = 'website' }) {
  const abs = `https://sharetexts.online${canonicalPath}`;
  let out = html;
  const setTag = (pattern, replacement) => {
    if (!pattern.test(out)) throw new Error(`meta tag not found: ${pattern}`);
    out = out.replace(pattern, replacement);
  };
  setTag(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  setTag(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${description}" />`);
  setTag(/<meta name="robots" content="[^"]*" \/>/, `<meta name="robots" content="${robots}" />`);
  setTag(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${abs}" />`);
  setTag(/<link rel="alternate" hreflang="x-default" href="[^"]*" \/>/,
    canonicalPath === '/' ? '<link rel="alternate" hreflang="x-default" href="https://sharetexts.online/" />' : '');
  setTag(/<meta property="og:type" content="[^"]*" \/>/, `<meta property="og:type" content="${ogType}" />`);
  setTag(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${title}" />`);
  setTag(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${description}" />`);
  setTag(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${abs}" />`);
  setTag(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${title}" />`);
  setTag(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${description}" />`);
  return out;
}

/** Replace everything inside #root (the boot skeleton) with the route body.
 *  Vite hoists the module script into <head>, so #root runs to the very end
 *  of the body — slice from the root div to the closing </body> tag. */
function swapBody(html, body) {
  const start = html.indexOf('<div id="root">');
  const end = html.lastIndexOf('</body>');
  if (start < 0 || end < start) throw new Error('dist/index.html does not match the expected shape');
  return html.slice(0, start) + body + '\n  ' + html.slice(end);
}

function emit(route, { head, body, jsonLd = '' }) {
  const html = swapBody(head.replace('</head>', `${SHELL_CSS}${jsonLd}</head>`), body);
  writeFileSync(path.join(seoDir, route), html);
  console.log(`seo-routes: wrote dist/seo/${route} (${(html.length / 1024).toFixed(1)} kB)`);
  // 404.html ALSO goes to the dist root: Vercel serves a root-level 404.html
  // with a real 404 status for paths that match no static file and no
  // rewrite — the node server path does the same via server.ts.
  if (route === '404.html') {
    writeFileSync(path.join(dist, '404.html'), html);
    console.log('seo-routes: wrote dist/404.html (Vercel auto-404 page)');
  }
}

// ---------------------------------------------------------------------------
// /docs — the strongest AEO surface. The FAQ below is copied VERBATIM from
// src/views/Docs.tsx (FAQSection); the JSON-LD mirrors exactly this text.
// ---------------------------------------------------------------------------
const DOCS_FAQS = [
  ['What is ShareTexts?', 'ShareTexts is a temporary bridge between two devices. Move text, links, photos, videos, and files directly from one screen to another. No app, no account, nothing kept.'],
  ['How do devices discover each other?', 'There are four ways to connect: Nearby device, the 6-digit code, the QR code, and the share link. For Nearby device, open ShareTexts on both devices — if both are on the same supported network, the other device appears automatically. Tap it, the other device accepts, and the connection starts.'],
  ['Is nearby discovery private?', 'Yes. Your device only appears while ShareTexts is open on it, and it disappears within about a minute of closing the tab. Other devices see only a temporary label like "Windows PC" — never your IP, accounts, or any permanent identifier. Devices already connected to a room are not listed, and this is never a global list of ShareTexts users.'],
  ['Is it free?', 'Yes. ShareTexts is completely free to use.'],
  ['Is it private?', 'Yes. Transfers are encrypted between devices. ShareTexts does not store your files, text, or transfer history.'],
  ['What if my internet drops mid-transfer?', 'If the connection is interrupted, ShareTexts will tell you whether the transfer can be retried. For large files, we recommend a stable connection.'],
  ['How long does the pairing code last?', 'The code refreshes every 90 seconds. If it expires, a new one appears automatically.'],
  ['Can an AI agent send text into my room?', 'Yes. The connect screen offers a temporary send permission for trusted tools. It expires automatically and can be revoked anytime.'],
  ['What file types are supported?', 'Any file type. ShareTexts transfers the original bytes without conversion. Images, videos, audio, documents, archives, code, and more.'],
  ['Is there a file size limit?', 'ShareTexts has been tested with large files. Actual limits depend on your browser, device memory, and network stability. For very large files, a stable connection is recommended.'],
  ['Does it work on mobile?', 'Yes. ShareTexts works in any modern mobile browser. No app download required.'],
  ['Can I transfer between iPhone and Android?', 'Yes. ShareTexts works across all platforms and devices with a modern browser.'],
  ['What is a Temporary Space?', 'A Temporary Space is a shared shelf that lives for a set time — 6 hours up to 7 days. You create it, get an 8-character space code, and share that code instead of files. Anyone with the code can add text, links, photos, or files, and everyone in the space sees them. When the time is up, the space closes and the content is deleted.'],
  ['How do I join a Temporary Space with a code?', 'Open sharetexts.online/space/join, enter the 8-character code the creator gave you, and tap Join space. You can also paste a full space link — it carries the same access. Both the code and the link stop working when the space closes.'],
];

const docsFaqHtml = DOCS_FAQS.map(([q, a]) => `<h3>${q}</h3>\n            <p>${a}</p>`).join('\n            ');
const docsFaqLd = DOCS_FAQS.map(([q, a]) => `        {
          "@type": "Question",
          "name": ${JSON.stringify(q)},
          "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(a)} }
        }`).join(',\n');

const docsMain = `
          <h2>What ShareTexts is</h2>
          <p>ShareTexts is a free web app for moving text, links, photos, videos, and files between any two devices — phone to laptop, iPhone to Windows, Android to Mac — directly in the browser. No app, no account, no cable. Transfers run peer-to-peer over WebRTC: the data moves encrypted between the two browsers and the server never sees file contents.</p>
          <h2>How to connect two devices</h2>
          <ol>
            <li><strong>Open</strong> sharetexts.online on both devices.</li>
            <li><strong>Find your other device.</strong> It appears in Nearby while ShareTexts is open on both devices — or connect with a six-digit code, a QR code, or a share link. The code, QR, and link work over any internet connection.</li>
            <li><strong>Connect with one tap.</strong> The room is end-to-end encrypted between your devices.</li>
            <li><strong>Send anything</strong> — it moves directly between the devices, never stored on a server.</li>
            <li><strong>Receive</strong> it on the other device, then close the room. Nothing is kept.</li>
          </ol>
          <h2>What you can send</h2>
          <p>Text, links (they render as tappable preview cards), photos, videos, audio, documents — any file type, transferred as the original bytes without conversion.</p>
          <h2>Temporary Spaces: share over days, not just this minute</h2>
          <p>For sharing beyond two live devices, create a <strong>Temporary Space</strong> — a shared shelf that lives 6 hours up to 7 days. You choose an 8-character space code (or generate one); whoever should join enters it at sharetexts.online/space/join. Everyone in the space adds text, links, photos, and files, and everyone sees them. The code only finds the space — it carries no keys — and when the space expires it is retired and the content is deleted.</p>
          <h2>Frequently asked questions</h2>
          ${docsFaqHtml}
          <h2>More reading</h2>
          <ul>
            <li><a href="/guides/temporary-spaces.html">Temporary Spaces</a> — the shared shelf with an 8-character join code.</li>
            <li><a href="/guides/how-it-works.html">How ShareTexts works</a> — the signaling and WebRTC architecture.</li>
            <li><a href="/guides/security.html">Security</a> — encryption and transport details.</li>
            <li><a href="/about">About ShareTexts</a> — what it is, what it transfers, supported devices.</li>
          </ul>`;

const docsJsonLd = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": "https://sharetexts.online/docs#webpage",
          "url": "https://sharetexts.online/docs",
          "name": "ShareTexts Docs — How Device Sharing Works",
          "isPartOf": { "@id": "https://sharetexts.online/#website" },
          "about": { "@id": "https://sharetexts.online/#application" },
          "inLanguage": "en"
        },
        {
          "@type": "FAQPage",
          "@id": "https://sharetexts.online/docs#faq",
          "isPartOf": { "@id": "https://sharetexts.online/docs#webpage" },
          "mainEntity": [
${docsFaqLd}
          ]
        }
      ]
    }
    </script>`;

emit('docs.html', {
  head: swapMeta(base, {
    title: 'ShareTexts Docs — How Device Sharing Works',
    description: 'How ShareTexts works: connect two devices with Nearby, a 6-digit code, a QR code, or a link, and transfer text, photos, and files — encrypted, in the browser.',
    canonicalPath: '/docs',
  }),
  body: shellBody({
    overline: 'Docs',
    h1: 'ShareTexts Docs',
    subtitle: 'How to move text, links, photos, videos, and files between your devices — no app, no account, straight from the browser.',
    main: docsMain,
  }),
  jsonLd: docsJsonLd,
});

// ---------------------------------------------------------------------------
// /privacy and /terms — faithful plain-HTML renderings of src/views/Legal.tsx.
// ---------------------------------------------------------------------------
const privacyMain = `
          <h2>The short version</h2>
          <p>ShareTexts moves text, photos, and files directly between <strong>your</strong> devices. Your content is end-to-end encrypted, travels peer-to-peer, and is never stored on our servers. When the room closes, everything is gone.</p>
          <h2>What we never collect</h2>
          <ul>
            <li>The text, photos, videos, or files you send</li>
            <li>Your name, email, phone number, or any account</li>
            <li>Contacts, location, or advertising identifiers</li>
          </ul>
          <p>Transfers are encrypted on your device with a key derived from the room's secret. That key never leaves your devices, so neither we nor anyone else can read what passes through.</p>
          <h2>What the connection server sees</h2>
          <p>Pairing requires a small signaling service. It temporarily sees connection metadata: encrypted room identifiers, rotating 6-digit codes, and WebRTC handshake data. It cannot decrypt anything. Rooms expire automatically and their state is deleted.</p>
          <h2>What stays on your device</h2>
          <p>To make rooms reconnectable, ShareTexts keeps a few entries in your browser's local storage: room credentials so a refresh doesn't break the pairing, recent messages so history survives a reload, preferences (theme, language, device name), and unsent drafts. All of it is removed when you close the room, and clearing your browser data removes it instantly. Nothing is synced anywhere.</p>
          <h2>Cookies and trackers</h2>
          <p><strong>Cookies: none. Trackers: none. Analytics: none.</strong> There is no consent banner because there is nothing to consent to. The list of network requests the app makes is short: the signaling service, and peer-to-peer WebRTC traffic.</p>
          <h2>Changes to this policy</h2>
          <p>If the policy ever changes, the updated version will be published on this page. The promise doesn't change: no accounts, no storage of your content, no tracking.</p>`;

emit('privacy.html', {
  head: swapMeta(base, {
    title: 'Privacy Policy — ShareTexts',
    description: 'What ShareTexts collects: nothing. Transfers are end-to-end encrypted and peer-to-peer; no accounts, no cookies, no trackers, nothing stored on servers.',
    canonicalPath: '/privacy',
  }),
  body: shellBody({
    overline: 'Legal',
    h1: 'Privacy Policy',
    subtitle: "ShareTexts's entire product promise is privacy. This policy is written in plain language and structured around what we don't collect.",
    main: privacyMain,
    footerNote: 'Last updated: September 2026',
  }),
});

const termsMain = `
          <h2>Using ShareTexts</h2>
          <p>ShareTexts is a free browser utility for moving content between devices you control. You don't need an account, and you don't need to give us anything to use it.</p>
          <h2>Your content is yours</h2>
          <p>Everything you send belongs to you. ShareTexts claims no rights over your text, photos, videos, or files, and because they are end-to-end encrypted we could not read them even if we wanted to. You are responsible for what you send and to whom.</p>
          <h2>Acceptable use</h2>
          <ul>
            <li>Don't send content that is illegal where you live</li>
            <li>Don't harass, threaten, or spam other people</li>
            <li>Don't attempt to break the pairing mechanism, rate limits, or the service itself</li>
          </ul>
          <h2>Rooms are temporary</h2>
          <p>Rooms exist only for the length of a transfer session and expire automatically. Nothing incomplete is saved, and a closed room cannot be reopened.</p>
          <h2>No warranty</h2>
          <p>ShareTexts is provided <strong>as is</strong>, without warranties of any kind. We work hard to keep transfers reliable and byte-perfect, but networks fail and browsers differ. For anything irreplaceable, keep a backup.</p>
          <h2>Contact</h2>
          <p>Questions about these terms? Reach us on X <a href="https://x.com/0xalyt" rel="noopener">@0xalyt</a>.</p>`;

emit('terms.html', {
  head: swapMeta(base, {
    title: 'Terms of Use — ShareTexts',
    description: 'The terms of using ShareTexts: a free browser utility for moving content between your own devices. Your content stays yours; rooms are temporary.',
    canonicalPath: '/terms',
  }),
  body: shellBody({
    overline: 'Legal',
    h1: 'Terms of Use',
    subtitle: "The short rules for using ShareTexts — what the service is, what belongs to you, and what it doesn't promise.",
    main: termsMain,
    footerNote: 'Last updated: September 2026',
  }),
});

// ---------------------------------------------------------------------------
// /404 — designed dead end, noindex, real ways forward.
// ---------------------------------------------------------------------------
emit('404.html', {
  head: swapMeta(base, {
    title: 'Page not found — ShareTexts',
    description: 'This page does not exist. Open ShareTexts to move text, photos, and files between your devices.',
    canonicalPath: '/404.html',
    robots: 'noindex, follow',
  }),
  // (also emitted to dist root for Vercel — see emit())
  body: shellBody({
    overline: '404',
    h1: 'Page not found',
    subtitle: "The page you are looking for doesn't exist — it may have moved, or the address may be wrong.",
    main: `<p>ShareTexts is a free browser app for moving text, links, photos, and files between your own devices — no app, no account. Start from <a href="/">the homepage</a>, or read <a href="/docs">the docs</a> to see how it works.</p>`,
  }),
});

console.log('seo-routes: done');
