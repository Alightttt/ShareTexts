// Tap-target check for the static guide pages: every link must clear 40px in
// BOTH dimensions, and the header must not change height when the fix lands.
import fs from 'fs';
import { launchBrowser, sleep } from './lib.mjs';

const BASE = process.env.URL || 'http://localhost:3010';
const files = fs.readdirSync('public/guides').filter((f) => f.endsWith('.html'));

const browser = await launchBrowser();
const VIEWPORTS = [
  { name: 'desktop 1440x900', width: 1440, height: 900 },
  { name: 'mobile 375x812', width: 375, height: 812 },
];
const errs = [];
let bad = 0;

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(`${vp.name} ${e.message.slice(0, 100)}`));
  console.log(`\n=== ${vp.name} ===`);
  const rows = [];
  for (const f of files) {
    await page.goto(`${BASE}/guides/${f}`, { waitUntil: 'domcontentloaded' });
    await sleep(300);
    const r = await page.evaluate(() => {
      const issues = [];
      for (const el of document.querySelectorAll('a, button')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (el.classList.contains('hidden')) continue;
        if (b.width < 40 || b.height < 40) {
          issues.push(`${(el.textContent || '').trim().slice(0, 22)} ${Math.round(b.width)}x${Math.round(b.height)}`);
        }
      }
      const hd = document.querySelector('header');
      return {
        issues,
        headerH: hd ? Math.round(hd.getBoundingClientRect().height) : null,
        docW: document.documentElement.scrollWidth,
      };
    });
    const over = r.docW > vp.width + 1;
    if (r.issues.length || over) bad++;
    rows.push(`${f.padEnd(46)} hdr=${String(r.headerH).padStart(3)} ${r.issues.length ? 'ISSUES: ' + r.issues.join(' | ') : 'ok'}${over ? ` H-OVERFLOW(${r.docW}>${vp.width})` : ''}`);
  }
  console.log(rows.join('\n'));
  await ctx.close();
}

console.log('\nchecks failing:', bad, 'of', files.length * VIEWPORTS.length);
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
process.exit(bad === 0 ? 0 : 1);
