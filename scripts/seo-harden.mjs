/**
 * seo-harden.mjs — build-free SEO hardening for the static guide pages.
 *
 * Three jobs, all idempotent (safe to re-run; skips anything present):
 *   1. Generate public/guides/index.html — the guides HUB. Every guide
 *      gets one direct inbound link from a crawlable index, and the hub
 *      itself is linked from the app footer, so no guide is an orphan.
 *   2. Inject a visible breadcrumb (Home › Guides › Page) plus matching
 *      BreadcrumbList JSON-LD into every guide page. The markup is
 *      inline-styled with the page's own custom properties (with literal
 *      fallbacks), so it reads on template pages AND self-styled pages,
 *      light and dark.
 *   3. Add FAQPage JSON-LD to pages whose visible headings are literal
 *      questions with answers (troubleshooting) — schema mirrors the
 *      visible text verbatim; nothing is invented.
 *
 * Run: node scripts/seo-harden.mjs   (from the repo root)
 */
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ORIGIN = 'https://sharetexts.online';
const DIR = path.join(process.cwd(), 'public', 'guides');

let hubWritten = 0, crumbsAdded = 0, faqAdded = 0, skipped = 0, refreshed = 0, deduped = 0;
const files = readdirSync(DIR).filter(f => f.endsWith('.html') && f !== 'index.html');

const meta = (html, name) => {
  const m = html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`));
  return m ? m[1] : '';
};
const titleOf = (html) => {
  const m = html.match(/<title>([^<]*)<\/title>/);
  if (!m) return null;
  return { full: m[1], short: m[1].split(' — ')[0].split(' - ')[0].trim() };
};

// ── 1. Hub page ─────────────────────────────────────────────────────────
const entries = files.map(file => {
  const html = readFileSync(path.join(DIR, file), 'utf8');
  const t = titleOf(html);
  return { file, title: t ? t.short : file, desc: meta(html, 'description') };
}).sort((a, b) => a.title.localeCompare(b.title));

const hubPath = path.join(DIR, 'index.html');
const needHub = !existsSync(hubPath)
  || !readFileSync(hubPath, 'utf8').includes('rel="canonical" href="' + ORIGIN + '/guides"');
if (needHub) {
  const cards = entries.map(e =>
    `          <a href="/guides/${e.file}" title="${e.desc.replace(/"/g, '&quot;')}">${e.title}</a>`).join('\n');
  const crumbsLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ShareTexts', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${ORIGIN}/guides` },
    ],
  }, null, 2);
  const hub = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Guides — ShareTexts</title>
  <meta name="description" content="Every ShareTexts guide: how to transfer files between devices, compare AirDrop alternatives, secure your transfers, and use Temporary Spaces." />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${ORIGIN}/guides" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="ShareTexts" />
  <meta property="og:title" content="Guides — ShareTexts" />
  <meta property="og:description" content="Every ShareTexts guide: file transfer how-tos, comparisons, security, and Temporary Spaces." />
  <meta property="og:url" content="${ORIGIN}/guides" />
  <meta property="og:image" content="${ORIGIN}/og/sharetext-og.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Guides — ShareTexts" />
  <meta name="twitter:description" content="Every ShareTexts guide: file transfer how-tos, comparisons, security, and Temporary Spaces." />
  <meta name="twitter:image" content="${ORIGIN}/og/sharetext-og.jpg" />
  <link rel="stylesheet" href="/guides/_template.css" />
  <script type="application/ld+json">
${crumbsLd}
  </script>
  <script src="/guides/theme.js" defer></script>
</head>
<body>
  <header class="header"><div class="header-inner">
    <a href="/" class="header-brand">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h16"/><path d="m14 6 6 6-6 6"/></svg>
      <span>ShareTexts</span>
    </a>
    <a href="/" class="header-back">Home →</a>
  </div></header>
  <main class="container"><article>
    <nav class="st-crumb" aria-label="Breadcrumb" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:13px;margin:0 0 4px">
      <a href="/" style="display:inline-flex;align-items:center;min-height:40px;color:var(--brand,#d9560e);text-decoration:none;font-weight:500">ShareTexts</a>
      <span aria-hidden="true" style="opacity:.5">›</span>
      <span aria-current="page" style="display:inline-flex;align-items:center;min-height:40px;color:var(--text-secondary,#635f57)">Guides</span>
    </nav>
    <p class="overline">Learn</p>
    <h1>ShareTexts Guides</h1>
    <p class="subtitle">Every guide, in one place — how transfers work, how ShareTexts compares, and how to keep your content yours.</p>
    <div class="related-links">
${cards}
    </div>
  </article></main>
  <footer class="footer"><p><a href="/">ShareTexts</a> — The temporary bridge between your devices.</p></footer>
</body>
</html>
`;
  writeFileSync(hubPath, hub);
  hubWritten++;
}

// ── 2. Breadcrumbs (visible + JSON-LD) ──────────────────────────────────
const CRUMB_STYLE = `<style>
    /* st-crumb — injected by scripts/seo-harden.mjs (idempotent). */
    .st-crumb { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 13px; margin: 0 0 4px; }
    .st-crumb a { display: inline-flex; align-items: center; min-height: 40px; color: var(--brand, #d9560e); text-decoration: none; font-weight: 500; }
    .st-crumb a:hover { text-decoration: underline; }
    .st-crumb [aria-current] { display: inline-flex; align-items: center; min-height: 40px; color: var(--text-secondary, #635f57); }
    html.dark .st-crumb [aria-current] { color: #b0aba2; }
    @media (prefers-color-scheme: dark) { html:not(.light):not(.dark) .st-crumb [aria-current] { color: #b0aba2; } }
  </style>`;

for (const file of files) {
  const p = path.join(DIR, file);
  let html = readFileSync(p, 'utf8');
  if (html.includes('BreadcrumbList')) {
    // A nav this script inserted more than once (e.g. after a manual schema
    // edit removed the JSON-LD): keep the first, drop the rest.
    const navs = [...html.matchAll(/<nav class="st-crumb"[\s\S]*?<\/nav>/g)];
    if (navs.length > 1) {
      const first = navs[0][0];
      html = html.replace(/<nav class="st-crumb"[\s\S]*?<\/nav>/g, '');
      html = html.replace(navs[0].index !== undefined ? '<h1' : '<h1', `${first}\n    <h1`);
      writeFileSync(p, html);
      deduped++;
    }
    // Refresh an older injected style to the current rules (links need a
    // 40px tap box — guide-taps gates every link on both dimensions).
    if (html.includes('.st-crumb a { color: var(--brand')) {
      html = html.replace(/<style>\s*\/\* st-crumb[\s\S]*?<\/style>/, CRUMB_STYLE);
      writeFileSync(p, html);
      refreshed++;
    }
    skipped++;
    continue;
  }
  const t = titleOf(html);
  if (!t) { console.warn('! no title:', file); continue; }

  const h1Idx = html.indexOf('<h1');
  if (h1Idx === -1) { console.warn('! no h1:', file); continue; }
  const lead = html.slice(0, h1Idx).match(/\s*$/)[0] || '\n    ';
  const li = lead.replace(/\S/g, ' ').slice(1); // indent for nav children
  const nav = `<nav class="st-crumb" aria-label="Breadcrumb">${lead}` +
    `<a href="/">ShareTexts</a>${li}<span aria-hidden="true">›</span>${li}` +
    `<a href="/guides">Guides</a>${li}<span aria-hidden="true">›</span>${li}` +
    `<span aria-current="page">${t.short}</span>${lead}</nav>`;
  html = html.slice(0, h1Idx) + nav + lead + html.slice(h1Idx);
  if (!html.includes('st-crumb {')) html = html.replace('</head>', `${CRUMB_STYLE}\n</head>`);

  const ld = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ShareTexts', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Guides', item: `${ORIGIN}/guides` },
      { '@type': 'ListItem', position: 3, name: t.short, item: `${ORIGIN}/guides/${file}` },
    ],
  }, null, 2);
  html = html.replace('</head>', `  <script type="application/ld+json">\n${ld}\n  </script>\n</head>`);
  writeFileSync(p, html);
  crumbsAdded++;
}

// ── 3. FAQ schema where the visible text is Q&A ─────────────────────────
const decode = (s) => s
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

for (const file of files) {
  const p = path.join(DIR, file);
  const html = readFileSync(p, 'utf8');
  if (html.includes('FAQPage')) continue;
  // Only headings that ARE questions (end in "?") followed by their
  // visible answer paragraph — schema mirrors visible text, never invented.
  const pairs = [...html.matchAll(/<h([2-5])>([^<]+\?)<\/h\1>\s*<p>([^<]+)<\/p>/g)]
    .map(m => ({ q: decode(m[2]), a: decode(m[3]) }));
  if (pairs.length < 1) continue;
  const faq = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: pairs.map(({ q, a }) => ({
      '@type': 'Question', name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }, null, 2);
  const out = html.replace('</head>', `  <script type="application/ld+json">\n${faq}\n  </script>\n</head>`);
  writeFileSync(p, out);
  faqAdded++;
  console.log(`  FAQ: ${file} (${pairs.length} Q&As)`);
}

console.log(`seo-harden: hub=${hubWritten} breadcrumbs=${crumbsAdded} faq=${faqAdded} skipped=${skipped} refreshed=${refreshed} deduped=${deduped}`);
