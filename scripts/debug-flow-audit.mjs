/** F10 live-flow audit: two real peers walk the entire journey; at every step
 *  print what the user actually SEES (names, statuses, buttons) so UX gaps
 *  surface from the real UI, not from code reading. */
import { chromium } from 'playwright';
import { resolveChrome } from './lib.mjs';

const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  return ctx.newPage();
};
const A = await mk();
const B = await mk();
for (const p of [A, B]) p.on('pageerror', e => console.log('PAGEERROR:', e.message));

const snap = async (page, tag) => {
  const s = await page.evaluate(() => {
    const roomPanel = document.querySelector('[data-testid="room-panel"]');
    const header = roomPanel ? roomPanel.innerText.split('\n').slice(0, 6).join(' | ') : '';
    const body = document.body.innerText;
    return {
      inChat: !!document.querySelector('[data-testid="composer"]'),
      header,
      buttons: [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.innerText.trim()).filter(t => t && t.length < 28).slice(0, 14),
      toast: document.querySelector('[role="status"], [role="alert"]')?.textContent?.slice(0, 80) || null,
      hasOffline: body.includes('Offline') || body.includes('Desconectad'),
      hasReconnect: /reconnect|reconnect/i.test(body),
    };
  });
  console.log(`\n== ${tag} ==`);
  console.log(JSON.stringify(s, null, 1));
};

// 1. A creates a room.
await A.goto('http://localhost:3010', { waitUntil: 'networkidle' });
await A.getByRole('button', { name: /^send$/i }).first().click();
await A.waitForTimeout(1500);
const code = ((await A.evaluate(() => document.body.innerText)).match(/^[0-9]$/gm) || []).join('');
console.log('code:', code);

// 2. B joins.
await B.goto('http://localhost:3010', { waitUntil: 'networkidle' });
await B.getByRole('button', { name: /^receive$/i }).first().click();
await B.waitForTimeout(800);
await B.locator('[data-testid="join-code-input"]').first().fill(code);
await B.keyboard.press('Enter').catch(() => {});
await A.locator('[data-testid="composer"]').first().waitFor({ timeout: 20000 });
await B.locator('[data-testid="composer"]').first().waitFor({ timeout: 15000 });
await A.waitForTimeout(800);
await snap(A, 'A connected (empty room)');
await snap(B, 'B connected (empty room)');

// 3. A sends text.
await A.locator('[data-testid="composer"]').first().fill('audit text hello');
await A.locator('[data-testid="composer"]').first().press('Enter');
await A.waitForTimeout(700);
await snap(A, 'A right after sending text (sender state)');
await B.waitForTimeout(800);
await snap(B, 'B received text (receiver state)');

// 4. A sends URL.
await A.locator('[data-testid="composer"]').first().fill('https://example.com/very/long/path/that/should/truncate/somewhere');
await A.locator('[data-testid="composer"]').first().press('Enter');
await A.waitForTimeout(900);
await snap(B, 'B received URL (LinkCard state)');

// 5. A sends a small file via the composer attach (DataTransfer drop).
await A.evaluate(() => {
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array(50 * 1024).fill(7)], 'audit-notes.bin', { type: 'application/octet-stream' }));
  const input = document.querySelector('input[type="file"]');
  if (input) { input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); }
});
await A.waitForTimeout(600);
await snap(A, 'A staged file (attachment state)');
const sendDisabled = await A.evaluate(() => {
  const b = document.querySelector('[data-testid="send"]');
  return b ? { disabled: b.disabled, label: b.innerText.trim() } : 'no send btn';
});
console.log('A send button:', JSON.stringify(sendDisabled));
await A.locator('[data-testid="send"]').first().click();
await A.waitForTimeout(400);
await snap(A, 'A mid file transfer (progress state)');
await B.waitForTimeout(2500);
await snap(B, 'B file received (completion state)');

// 6. B sends back (reverse direction).
await B.locator('[data-testid="composer"]').first().fill('reply from B');
await B.locator('[data-testid="composer"]').first().press('Enter');
await B.waitForTimeout(800);
await snap(A, 'A received B reply (reverse direction)');

// 7. B leaves abruptly — what does A see?
await B.context().close();
await A.waitForTimeout(3000);
await snap(A, 'A after peer left (grace window state)');

await browser.close();
console.log('\nAUDIT COMPLETE');
