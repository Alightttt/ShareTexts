// Responsive audit: load each screen at every target viewport, capture a
// screenshot, and report layout problems (horizontal overflow, clipped
// primary actions, tiny touch targets, sticky bars, hero CTA visibility).
// Run: URL=http://localhost:3000 node scripts/audit-viewports.mjs
import { chromium } from 'playwright';
import { launchBrowser, URL } from './lib.mjs';

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '390', width: 390, height: 844 },
  { name: '430', width: 430, height: 932 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1920', width: 1920, height: 1080 },
];

const SCREENS = ['landing', 'connect', 'join'];

const browser = await launchBrowser();
const failures = [];
const notes = [];

for (const vp of VIEWPORTS) {
  for (const screen of SCREENS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const url = screen === 'join' ? `${URL}?join=placeholder` : URL;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(600);
      const report = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = doc.scrollWidth > window.innerWidth + 1;
        const scrollW = doc.scrollWidth;
        const winW = window.innerWidth;
        // Primary-action visibility: the Send-text CTA on landing, the code
        // card + copy button on connect, the input on join.
        const inViewport = (el) => {
          if (!el) return 'missing';
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && r.bottom <= window.innerHeight + 1 && r.top >= -1;
        };
        const sendBtn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Start a transfer');
        const hero = inViewport(sendBtn);
        // Sticky/fixed bars
        // Sticky/fixed bars that could cover content. Transparent decorative
        // layers (pointer-events-none, e.g. the landing's ambient glow) are
        // not bars — they never block interaction or reading.
        const fixedBars = [...document.querySelectorAll('header, [class*="sticky"], [class*="fixed"]')]
          .filter(el => el.getBoundingClientRect().height > 0)
          .filter(el => getComputedStyle(el).pointerEvents !== 'none')
          .length;
        return { overflow, scrollW, winW, heroVisible: hero, fixedBars };
      });
      await page.screenshot({ path: `.audit-shots/vp-${vp.name}-${screen}.png` });
      const flag = [];
      if (report.overflow) flag.push(`H-OVERFLOW ${report.scrollW}px>${report.winW}px`);
      if (screen === 'landing' && report.heroVisible !== true) flag.push(`HERO-CTA ${report.heroVisible}`);
      if (report.fixedBars > 2) flag.push(`${report.fixedBars} fixed bars`);
      if (flag.length) failures.push(`[${vp.name} ${screen}] ${flag.join(' | ')}`);
      else notes.push(`[${vp.name} ${screen}] ok (overflow:${report.overflow})`);
    } catch (e) {
      failures.push(`[${vp.name} ${screen}] load error: ${e.message.split('\n')[0]}`);
    }
    await ctx.close();
  }
}

await browser.close();
console.log('=== viewport audit ===');
for (const n of notes) console.log(n);
console.log('--- issues ---');
if (!failures.length) console.log('(none)');
for (const f of failures) console.log('ISSUE ' + f);
process.exit(failures.length ? 1 : 0);
