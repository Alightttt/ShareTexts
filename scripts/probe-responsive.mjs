// Responsive probe: pair two devices, verify the room behaves as a fixed
// viewport app (h-dvh) and the contextual rail shows at xl (>=1280px) but
// is hidden below. Also confirms the composer stays reachable.
// Run: URL=http://localhost:3000 node scripts/probe-responsive.mjs
import { launchBrowser, URL, pairDevices } from './lib.mjs';

const browser = await launchBrowser();
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

try {
  for (const vp of [{ name: 'xl', width: 1400 }, { name: 'md', width: 1100 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: 900 } });
    const A = await ctx.newPage();
    const B = await ctx.newPage();
    await A.goto(URL, { waitUntil: 'networkidle' });
    await B.goto(URL, { waitUntil: 'networkidle' });
    await pairDevices(A, B);

    await A.waitForFunction(() => document.body.innerText.includes('Your private clipboard'), null, { timeout: 30000 });

    const state = await A.evaluate(() => {
      const root = document.querySelector('#root > div');
      const rail = [...document.querySelectorAll('div')].find(d => (d.textContent || '').includes('Pairing code') && d.className.includes('hidden xl:flex'));
      const railVisible = rail ? getComputedStyle(rail).display !== 'none' : false;
      return {
        rootH: Math.round(root?.getBoundingClientRect().height || 0),
        vp: window.innerHeight,
        railVisible,
        composerVisible: (() => {
          const ta = document.querySelector('textarea');
          if (!ta) return false;
          const r = ta.getBoundingClientRect();
          return r.bottom <= window.innerHeight + 1 && r.top >= 0;
        })(),
      };
    });
    check(`${vp.name}: room height === viewport (fixed app)`, Math.abs(state.rootH - state.vp) <= 2, `${state.rootH} vs ${state.vp}`);
    check(`${vp.name}: rail ${vp.name === 'xl' ? 'visible' : 'hidden'}`, state.railVisible === (vp.name === 'xl'), `railVisible=${state.railVisible}`);
    check(`${vp.name}: composer in viewport`, state.composerVisible);

    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `${failures} PROBE(S) FAILED` : 'ALL RESPONSIVE PROBES PASSED');
process.exit(failures ? 1 : 0);
