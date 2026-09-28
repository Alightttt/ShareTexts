// Diag v3: run N join cycles on live; on failure dump both peers' diag rings + logs.
import { chromium } from 'playwright';
import { resolveChrome } from './lib.mjs';

const LIVE = process.env.PROD_URL || 'https://sharetexts.online/';
const RUNS = Number(process.env.RUNS || 5);
const exe = resolveChrome();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});

async function oneRun(i) {
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const logs = { A: [], B: [] };
  for (const [n, p] of [['A', A], ['B', B]]) {
    p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs[n].push(m.text().slice(0, 220)); });
    p.on('pageerror', e => logs[n].push(`[pageerror] ${String(e).slice(0, 220)}`));
  }
  await A.goto(LIVE, { waitUntil: 'domcontentloaded' });
  await B.goto(LIVE, { waitUntil: 'domcontentloaded' });
  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
  const digits = await A.getByRole('group', { name: 'Pairing code' }).locator('[data-code-digit], .font-mono, span').allInnerTexts().catch(() => []);
  const code = digits.map(t => t.trim()).join('').replace(/\D/g, '').slice(0, 6);

  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await B.keyboard.press('Enter').catch(() => {});
  await B.getByRole('button', { name: /connect|join/i }).first().click().catch(() => {});

  let bInChat = false, aInChat = false;
  for (let t = 0; t < 12; t++) {
    await new Promise(r => setTimeout(r, 2500));
    bInChat = await B.evaluate(() => !!document.querySelector('[data-testid="composer"], textarea'));
    aInChat = await A.evaluate(() => !!document.querySelector('[data-testid="composer"], textarea'));
    if (bInChat && aInChat) break;
  }
  const state = await B.evaluate(() => (document.body.innerText.match(/Connected|Connecting\w*|Reconnect\w*|Pairing\w*|Waiting\w*/g) || []).slice(0, 3).join(','));
  const diagB = await B.evaluate(() => { try { const s = window.__sharetextDiag?.snapshot?.(); return JSON.stringify(s)?.slice(0, 1200) || 'none'; } catch { return 'err'; } });
  console.log(`run${i}: B=${bInChat ? 'CHAT' : 'STUCK'} A=${aInChat ? 'chat' : 'stuck'} (${state}) code=${code}`);
  if (!bInChat || !aInChat) {
    console.log('  B.logs:', logs.B.slice(0, 8).join(' | ') || 'clean');
    console.log('  A.logs:', logs.A.slice(0, 8).join(' | ') || 'clean');
    console.log('  B.diag:', diagB);
  }
  await ctxA.close(); await ctxB.close();
  return bInChat && aInChat;
}

let ok = 0;
for (let i = 1; i <= RUNS; i++) { try { if (await oneRun(i)) ok++; } catch (e) { console.log(`run${i}: EXC ${String(e).slice(0, 160)}`); } }
console.log(`\nRESULT: ${ok}/${RUNS} clean joins`);
await browser.close();
