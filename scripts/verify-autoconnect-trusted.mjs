// Auto-connect is the MUTUAL CONFIRMED flow (dc19ce8): a device with
// autoConnect on NEVER connects silently — both landings show the detection
// overlay and a human confirms. The original zero-tap design was removed on
// purpose ("Nothing connects silently, ever").
//
// This suite is the regression gate for that promise, including the
// trusted/returning case:
//   step 0 — the relocated toggle (inside the "Why isn't my device showing?"
//            helper) is reachable and persists its setting.
//   step 1 — both sides auto-connect ON, they SEE each other (detection
//            overlay), yet NO room opens without a tap — first encounter.
//   step 2 — after a reload (returning/trusted device) still no silent room.
//   step 3 — zero page errors.
// Run: URL=http://localhost:3010 node scripts/verify-autoconnect-trusted.mjs
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:3013';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const out = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch();
const A = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const B = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errs = [];
for (const [tag, p] of [['A', A], ['B', B]]) p.on('pageerror', e => errs.push(`[${tag}] ${String(e).slice(0, 120)}`));

const composerUp = async (p) => (await p.locator('textarea').count()) > 0;

await A.goto(URL, { waitUntil: 'networkidle' });
await sleep(1500);

// step 0 — the setting is reachable through the real UI and persists.
// (The toggle lives inside the expandable "Why isn't my device showing?"
// helper, which renders exactly while no devices are around.)
await A.getByTestId('nearby-why-toggle').click();
await A.getByTestId('auto-connect-toggle').click();
await sleep(300);
const autoSaved = await A.evaluate(() => localStorage.getItem('sharetext.autoConnect.v1'));
out('step 0 — toggle writes the setting', autoSaved === '1', `got ${autoSaved}`);

// B seeds the same setting before load (once devices are visible the
// helper is gone by design — the setting, not the panel, is what counts).
await B.addInitScript(() => localStorage.setItem('sharetext.autoConnect.v1', '1'));
await B.goto(URL, { waitUntil: 'networkidle' });
await sleep(1500);

// step 1 — first encounter: both can SEE each other…
const seenA = await A.getByTestId('nearby-detect-overlay').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
const seenB = await B.getByTestId('nearby-detect-overlay').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
out('step 1a — both sides detect each other', seenA && seenB, `A=${seenA} B=${seenB}`);

// …and must NOT connect without a tap. Give any hypothetical silent path
// 15 full seconds to fire, then require no composer on either side.
await sleep(15000);
const silent = (await composerUp(A)) || (await composerUp(B));
out('step 1b — first encounter never connects silently', !silent, silent ? 'a room opened without a tap' : 'both still on landing');

// step 2 — returning/trusted case: reload both back to idle. A reload
// mid-overlay must not auto-accept either.
await A.reload({ waitUntil: 'networkidle' });
await B.reload({ waitUntil: 'networkidle' });
await sleep(15000);
const silentAfter = (await composerUp(A)) || (await composerUp(B));
out('step 2 — reload (trusted) still never connects silently', !silentAfter, silentAfter ? 'a room opened without a tap' : 'both still on landing');

// step 3 — and the normal mutual-confirm flow is still reachable (the
// overlay that leads to a human Yes — proof the silence above is by
// design, not a broken discovery pipeline).
const stillSees = await A.getByTestId('nearby-detect-overlay').waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
out('step 3 — detection overlay returns after reload', stillSees);

out('step 4 — no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
const failed = results.filter(r => !r).length;
console.log(`\nverify-autoconnect-trusted: ${results.length - failed}/${results.length} passed`);
process.exit(failed === 0 ? 0 : 1);
