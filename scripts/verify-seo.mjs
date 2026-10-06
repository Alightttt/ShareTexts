/**
 * verify-seo.mjs — F20 SEO/AEO/GEO verification.
 *
 * Asserts what CRAWLERS see (raw HTML over HTTP, no JS) and what USERS get
 * (the same URLs in a real browser, JS on). Run against a production build:
 *
 *   npm run build
 *   node scripts/start-dist.mjs   (or NODE_ENV=production PORT=… node dist/server.cjs)
 *   URL=http://localhost:3012 node scripts/verify-seo.mjs
 *
 * Checks per route (/, /docs, /privacy, /terms, /about, /nonexistent-404):
 *   HTTP status, <title>, description (present, ≤ 200 chars), canonical,
 *   exactly one H1 (except /about which owns its own), landmark elements,
 *   OG/Twitter tags, valid JSON-LD, and internal <a href> links in the RAW
 *   response — never document.body after React hydrates. Also asserts the
 *   /docs FAQ JSON-LD text matches the visible FAQ text verbatim.
 */

import { chromium } from 'playwright';

const BASE = process.env.URL || 'http://localhost:3012';
const ORIGIN = 'https://sharetexts.online';

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function get(path) {
  const res = await fetch(BASE + path, { redirect: 'manual' });
  const html = await res.text();
  return { status: res.status, html };
}

const meta = (html, key) =>
  html.match(new RegExp(`<meta[^>]*(?:name|property)="${key}"[^>]*content="([^"]*)"`, 'i'))?.[1] ??
  html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*(?:name|property)="${key}"`, 'i'))?.[1] ?? null;

function parseLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
    .filter(Boolean);
}

const count = (html, re) => (html.match(re) || []).length;

function auditRoute(name, path, { expectStatus = 200, expectH1 = true, expectCanonical = true, expectLd = true, expectAboutLink = true } = {}) {
  return async () => {
    console.log(`\n[${name}] ${path}`);
    const { status, html } = await get(path);
    ok('HTTP status', status === expectStatus, `got ${status}, want ${expectStatus}`);

    if (expectStatus !== 200) {
      ok('404 page is noindex', meta(html, 'robots')?.includes('noindex'), String(meta(html, 'robots')));
      ok('404 page offers ways forward', html.includes('href="/"') && html.includes('href="/docs"'));
      return;
    }

    const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
    ok('title present & unique', title.length > 10 && title.includes('ShareTexts'), title);
    const desc = meta(html, 'description') ?? '';
    ok('description present', desc.length > 50, `${desc.length} chars`);
    ok('description ≤ 200 chars', desc.length <= 200, `${desc.length} chars`);
    if (expectCanonical) {
      ok('canonical is absolute & route-correct', (html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '') === ORIGIN + (path === '/' ? '/' : path));
    }
    ok('robots meta allows indexing', (meta(html, 'robots') ?? 'index') .includes('index') && !meta(html, 'robots')?.includes('noindex'), String(meta(html, 'robots')));

    if (expectH1) ok('exactly one H1', count(html, /<h1[\s>]/g) === 1, String(count(html, /<h1[\s>]/g)));
    ok('has <main>', count(html, /<main[\s>]/g) >= 1);
    ok('has <header>', count(html, /<header[\s>]/g) >= 1);

    ok('og:title', !!meta(html, 'og:title'));
    ok('og:description', !!meta(html, 'og:description'));
    ok('og:image absolute', (meta(html, 'og:image') ?? '').startsWith('https://'));
    ok('twitter:card', !!meta(html, 'twitter:card'));

    const ld = parseLd(html);
    if (expectLd) ok('JSON-LD present & parses', ld.length >= 1);
    const internalLinks = [...html.matchAll(/href="(\/[^"]*)"/g)].map(m => m[1]);
    ok('internal links in raw HTML', internalLinks.length >= 3, String(internalLinks.length));
    if (expectAboutLink) ok('About link reachable in raw HTML', html.includes('href="/about"'));
  };
}

// --- Route audits (raw HTML) -------------------------------------------------
const audits = [
  auditRoute('HOME', '/'),
  auditRoute('DOCS', '/docs'),
  auditRoute('PRIVACY', '/privacy'),
  auditRoute('TERMS', '/terms'),
  auditRoute('ABOUT (static guide)', '/about', { expectLd: false, expectAboutLink: false }),
  auditRoute('404', '/this-page-does-not-exist', { expectStatus: 404, expectH1: false, expectCanonical: false }),
];

// --- Entity-graph & FAQ honesty checks (raw HTML) ----------------------------
async function entityChecks() {
  console.log('\n[ENTITY GRAPH] /');
  const { html } = await get('/');
  const graph = parseLd(html).flatMap(ld => ld['@graph'] ?? [ld]);
  const byType = t => graph.filter(n => n['@type'] === t);
  const org = byType('Organization')[0];
  const app = byType('WebApplication')[0];
  const site = byType('WebSite')[0];
  ok('Organization exists', !!org);
  ok('WebApplication exists', !!app);
  ok('WebSite exists', !!site);
  ok('sameAs = the two verified profiles only', JSON.stringify(org?.sameAs) === JSON.stringify(['https://x.com/0xalyt', 'https://github.com/Alightttt/ShareTexts']), JSON.stringify(org?.sameAs));
  ok('app publisher → Organization @id', app?.publisher?.['@id'] === 'https://sharetexts.online/#organization');
  ok('no AggregateRating anywhere', JSON.stringify(graph).includes('AggregateRating') === false);
  ok('no ContactPoint anywhere', JSON.stringify(graph).includes('ContactPoint') === false);
  ok('brand name consistent', org?.name === 'ShareTexts' && app?.name === 'ShareTexts' && site?.name === 'ShareTexts');
}

async function faqHonestyCheck() {
  console.log('\n[FAQ HONESTY] /docs');
  const { html } = await get('/docs');
  const faq = parseLd(html).flatMap(ld => ld['@graph'] ?? [ld]).find(n => n['@type'] === 'FAQPage');
  ok('FAQPage JSON-LD on /docs', !!faq);
  if (!faq) return;
  const strip = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  let matched = 0;
  for (const q of faq.mainEntity) {
    const pattern = new RegExp(`<h3>\\s*${q.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<\\/h3>\\s*<p>\\s*${strip(q.acceptedAnswer.text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<\\/p>`);
    if (pattern.test(html)) matched++;
    else console.log(`    ✗ no visible match for: ${q.name}`);
  }
  ok(`every FAQ JSON-LD answer is visible verbatim (${matched}/${faq.mainEntity.length})`, matched === faq.mainEntity.length);
}

// --- Browser pass: the same URLs must still work for real users --------------
async function browserChecks() {
  console.log('\n[BROWSER] JS-on hydration & rendering');
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // When a production bundle is served on localhost it dials the REMOTE
  // worker (VITE_SIGNALING_URL baked at build time), which rejects localhost
  // origins with 403 on /stats and /api/event. That is documented env noise
  // (see .freebuff/run.md) — on the real origin it does not happen. CSP
  // violations and real JS errors still fail the run.
  const WORKER_NOISE = /sharetext-signaling\.alighttt\.workers\.dev/;
  page.on('pageerror', e => { if (!WORKER_NOISE.test(String(e))) errors.push(String(e)); });
  page.on('console', m => { if (m.type() === 'error' && !WORKER_NOISE.test(m.text()) && !/Failed to load resource.*403/.test(m.text())) errors.push(m.text()); });

  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  ok('home renders hero H1', await page.locator('h1').first().textContent().then(t => t.includes('Move anything')), 'h1 not found');
  ok('home boots interactive (Send button)', await page.getByRole('button', { name: 'Send' }).first().isVisible().catch(() => false));

  await page.goto(BASE + '/docs', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const docsH1 = await page.locator('h1').first().textContent().catch(() => '');
  ok('docs route renders the React Docs view', docsH1.includes('ShareTexts'), String(docsH1));
  ok('no page errors on home+docs', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
}

// --- Sitemap & robots ---------------------------------------------------------
async function sitemapAndRobots() {
  console.log('\n[SITEMAP + ROBOTS]');
  const sm = await get('/sitemap.xml');
  ok('sitemap.xml 200', sm.status === 200);
  const locs = [...sm.html.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  ok('sitemap has core routes', ['/','/docs','/about','/privacy','/terms'].every(p => locs.includes(ORIGIN + p)), locs.join(','));
  ok('sitemap URLs absolute', locs.every(u => u.startsWith('https://')));
  ok('no session routes in sitemap', locs.every(u => !/\/(s|space|room)\//.test(u)));
  const rb = await get('/robots.txt');
  ok('robots.txt 200', rb.status === 200);
  ok('robots allows /docs and /about', rb.html.includes('Allow: /docs') && rb.html.includes('Allow: /about'));
  ok('robots blocks session routes', ['Disallow: /s/', 'Disallow: /space/', 'Disallow: /room/'].every(d => rb.html.includes(d)));
  ok('robots declares sitemap', rb.html.includes('Sitemap: https://sharetexts.online/sitemap.xml'));
}

// --- Run ----------------------------------------------------------------------
let failed = false;
for (const audit of audits) { try { await audit(); } catch (e) { failed = true; console.log('  ✗ audit crashed:', e.message); } }
try { await entityChecks(); } catch (e) { failed = true; console.log('  ✗ entity crashed:', e.message); }
try { await faqHonestyCheck(); } catch (e) { failed = true; console.log('  ✗ faq crashed:', e.message); }
try { await sitemapAndRobots(); } catch (e) { failed = true; console.log('  ✗ sitemap crashed:', e.message); }
try { await browserChecks(); } catch (e) { failed = true; console.log('  ✗ browser crashed:', e.message); }

console.log(`\n=== verify-seo: ${pass} passed, ${fail + (failed ? 1 : 0)} failed ===`);
if (failures.length) console.log(failures.map(f => '  FAIL: ' + f).join('\n'));
process.exit(fail + (failed ? 1 : 0) > 0 ? 1 : 0);
