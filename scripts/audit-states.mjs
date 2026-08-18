// State walkthrough: capture exactly what a first-time user sees in each
// product state, for the product-experience audit.
// Run: URL=http://localhost:3000 node scripts/audit-states.mjs
import { launchBrowser, URL, readLiveCode } from './lib.mjs';
import fs from 'fs';
import os from 'os';
import path from 'path';

const browser = await launchBrowser();
const ctx = await browser.newContext();
const A = await ctx.newPage(); // creator
const B = await ctx.newPage(); // joiner

const snap = async (page, label) => {
  const text = await page.evaluate(() => {
    const vis = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const walk = (node, out) => {
      for (const el of node.querySelectorAll('*')) {
        if (el.children.length === 0 && vis(el) && el.textContent.trim()) out.push(el.textContent.trim().slice(0, 90));
      }
      return out;
    };
    return walk(document.body, []).slice(0, 40);
  });
  console.log(`\n===== ${label} (${page === A ? 'A-creator' : 'B-joiner'}) =====`);
  console.log(text.join(' | '));
  await page.screenshot({ path: `.audit-shots/state-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` });
};

try {
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await snap(A, 'LANDING');

  // Create session (A)
  await A.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Send');
    const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
    btn.dispatchEvent(new PointerEvent('pointerdown', o));
  });
  await A.waitForFunction(() => document.body.innerText.includes('Connect your other device'), null, { timeout: 15000 });
  await snap(A, 'WAITING FOR PEER');

  // Join (B) via the live code shown on A
  const code = await readLiveCode(A);
  await B.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Receive');
    const o = { bubbles: true, cancelable: true, composed: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 };
    btn.dispatchEvent(new PointerEvent('pointerdown', o));
  });
  await B.waitForFunction(() => document.body.innerText.includes('Enter the code'), null, { timeout: 15000 });
  await snap(B, 'ENTER CODE');
  await B.locator('input[inputmode="numeric"]').fill(code);
  await B.waitForFunction(() => document.body.innerText.includes('Connecting'), null, { timeout: 20000 }).catch(() => {});
  await A.waitForFunction(() => document.body.innerText.includes('connecting') || document.body.innerText.includes('Chat'), null, { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1200));
  await snap(A, 'CONNECTING/CONNECTED');
  await snap(B, 'CONNECTING/CONNECTED');

  // Wait for chat on both
  await A.waitForFunction(() => document.body.innerText.includes('private clipboard'), null, { timeout: 20000 });
  await B.waitForFunction(() => document.body.innerText.includes('private clipboard'), null, { timeout: 20000 });
  await snap(A, 'EMPTY ROOM');
  await snap(B, 'EMPTY ROOM');

  // Send a text A → B
  await A.evaluate(() => {
    const ta = document.querySelector('textarea');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'Hello from device A — this is a test message.');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await A.click('textarea');
  await A.keyboard.press('Enter');
  await B.waitForFunction(() => document.body.innerText.includes('Hello from device A'), null, { timeout: 15000 });
  await snap(A, 'TEXT SENT');
  await snap(B, 'TEXT RECEIVED');

  // Send a file A → B
  const filePath = path.join(os.tmpdir(), 'audit-test.bin');
  const chunk = Buffer.alloc(2 * 1024 * 1024);
  for (let i = 0; i < chunk.length; i++) chunk[i] = i % 251;
  fs.writeFileSync(filePath, chunk);
  await A.locator('input[type=file]').last().setInputFiles(filePath);
  await A.getByRole('button', { name: 'Send' }).first().click();
  await new Promise(r => setTimeout(r, 800));
  await snap(A, 'FILE SENDING');
  await snap(B, 'FILE RECEIVING');
  await B.waitForFunction(() => {
    const m = document.body.innerText.match(/Received •|Save/);
    return !!m;
  }, null, { timeout: 30000 });
  await snap(A, 'FILE COMPLETE');
  await snap(B, 'FILE COMPLETE');
} finally {
  await browser.close();
}
console.log('\nwalkthrough complete');
