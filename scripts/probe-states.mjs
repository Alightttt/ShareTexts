// Deep state probe — walks every screen state and measures real geometry.
// Usage: node scripts/probe-states.mjs
import { launchBrowser, sleep } from './lib.mjs';

const URL = process.env.URL || 'http://localhost:3210';
const browser = await launchBrowser();

async function probeViewport(w, h, label) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'light' });
  const A = await ctx.newPage(); // creator (desktop-ish)
  await A.setViewportSize({ width: 1280, height: 900 });
  const B = await ctx.newPage();
  await B.setViewportSize({ width: w, height: h });
  const errs = { A: [], B: [] };
  A.on('pageerror', e => errs.A.push(e.message));
  B.on('pageerror', e => errs.B.push(e.message));

  const facts = { label, w, h };
  const measure = async (page, sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    const r = (n) => { if (!n) return null; const b = n.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), scrollW: n.scrollWidth, clientW: n.clientWidth, overflowX: n.scrollWidth - n.clientWidth, visible: getComputedStyle(n).visibility !== 'hidden' && getComputedStyle(n).display !== 'none' }; };
    return {
      docX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      docY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      vw: window.innerWidth, vh: window.innerHeight,
      el: s ? r(el) : null,
    };
  }, sel);

  await A.goto(URL, { waitUntil: 'networkidle' }); await sleep(900);
  await B.goto(URL, { waitUntil: 'networkidle' }); await sleep(900);

  // ── IDLE (B at target width) ──
  facts.idle = await measure(B);
  const idleSend = await B.locator('button', { hasText: 'Send' }).first().isVisible().catch(() => false);
  const idleSendRect = await B.getByRole('button', { name: 'Send', exact: true }).first().boundingBox().catch(() => null);
  const idleRecvRect = await B.getByRole('button', { name: 'Receive', exact: true }).first().boundingBox().catch(() => null);
  facts.idleButtons = { sendAboveFold: idleSendRect && idleSendRect.y > 0 && idleSendRect.y + idleSendRect.height < h, sendY: idleSendRect?.y, recvY: idleRecvRect?.y };
  await B.screenshot({ path: `.audit-shots/probe-${label}-idle.png`, fullPage: true });

  // ── SEND on A, read code ──
  await A.getByRole('button', { name: 'Send', exact: true }).first().click();
  await A.waitForSelector('[aria-label="Pairing code"]', { timeout: 10000 });
  await sleep(300);
  const code = await A.evaluate(() => {
    const g = document.querySelector('[aria-label="Pairing code"]');
    return g ? [...g.querySelectorAll('span')].map(e => e.textContent.trim()).filter(d => /^\d$/.test(d)).join('') : '';
  });
  facts.code = code;
  facts.codeDisplay = await measure(A, '[aria-label="Pairing code"]');

  // QR overlay on A
  await A.getByRole('button', { name: 'Show QR' }).click().catch(() => {});
  await sleep(500);
  facts.qrOverlay = await A.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="QR code"]');
    if (!dlg) return { found: false };
    const b = dlg.getBoundingClientRect();
    return { found: true, x: Math.round(b.x), w: Math.round(b.width), fits: b.x >= 0 && b.x + b.width <= window.innerWidth };
  });
  await A.screenshot({ path: `.audit-shots/probe-${label}-qr.png` });
  await A.keyboard.press('Escape');
  await sleep(250);

  // ── RECEIVE on B, code entry geometry ──
  await B.getByRole('button', { name: 'Receive', exact: true }).first().click();
  await sleep(300);
  facts.receive = await measure(B);
  const inputBox = await B.locator('input[inputmode="numeric"]:visible').boundingBox();
  const cells = await B.evaluate(() => {
    const inp = document.querySelector('input[inputmode="numeric"]');
    if (!inp) return null;
    // walk up to the flex row of digit cells
    let row = inp.parentElement?.parentElement;
    const cells = row ? [...row.querySelectorAll(':scope > div')] : [];
    return { cellCount: cells.length, panelWidth: row ? row.getBoundingClientRect().width : null, firstW: cells[0]?.getBoundingClientRect().width, lastRight: cells.length ? cells[cells.length - 1].getBoundingClientRect().right : null };
  });
  const cellRow = await B.evaluate(() => {
    const inp = document.querySelector('input[inputmode="numeric"]');
    if (!inp) return null;
    let row = inp.parentElement?.parentElement;
    return row ? (() => { const b = row.getBoundingClientRect(); return { left: b.left, right: b.right, vw: window.innerWidth }; })() : null;
  });
  facts.codeInput = { inputVisible: !!inputBox, cells };
  facts.receiveOverflow = cellRow ? (cellRow.left < -1 || cellRow.right > cellRow.vw + 1) : null;
  await B.screenshot({ path: `.audit-shots/probe-${label}-receive.png` });

  // ── wrong code → error state ──
  const wrong = String((Number(code) + 1) % 1000000).padStart(6, '0');
  await B.locator('input[inputmode="numeric"]:visible').fill(wrong);
  await sleep(1500);
  facts.wrongCode = await B.evaluate(() => {
    const err = document.querySelector('#live-code-error');
    return { errorShown: !!err, text: err?.textContent?.slice(0, 90) || null };
  });
  await B.screenshot({ path: `.audit-shots/probe-${label}-wrong-code.png` });

  // ── correct code → connected ──
  await B.locator('input[inputmode="numeric"]:visible').fill(code);
  facts.bJoined = false;
  await B.waitForSelector('textarea', { timeout: 15000 }).then(() => { facts.bJoined = true; }).catch(() => {});
  if (facts.bJoined) {
    await A.waitForSelector('textarea', { timeout: 15000 }).catch(() => {});
    await sleep(1200);
    facts.connectedA = await measure(A);
    facts.connectedB = await measure(B);
    // room empty-state text on B
    facts.emptyRoomB = await B.evaluate(() => document.body.innerText.includes('Ready when you are'));
    await B.screenshot({ path: `.audit-shots/probe-${label}-connected.png`, fullPage: true });
    await A.screenshot({ path: `.audit-shots/probe-${label}-connected-A.png` });

    // send text both ways
    await A.locator('textarea').first().fill('Probe from desktop ✅');
    await A.locator('button[data-testid="send"]').click();
    await sleep(700);
    await B.locator('textarea').first().fill('Probe reply from mobile 📱 हिन्दी');
    await B.locator('button[data-testid="send"]').click();
    await sleep(700);
    facts.bothWays = {
      aGotReply: await A.evaluate(() => document.body.innerText.includes('Probe reply from mobile')),
      bGotSend: await B.evaluate(() => document.body.innerText.includes('Probe from desktop')),
    };
    await B.screenshot({ path: `.audit-shots/probe-${label}-chat.png`, fullPage: true });
  }

  // page errors
  if (errs.A.length) { facts.errsA = errs.A.slice(0, 6); }
  if (errs.B.length) { facts.errsB = errs.B.slice(0, 6); }
  await ctx.close();
  return facts;
}

const widths = [
  [320, 640, 'w320'],
  [360, 740, 'w360'],
  [430, 932, 'w430'],
  [768, 1024, 'w768'],
  [1024, 900, 'w1024'],
  [1440, 900, 'w1440'],
];
for (const [w, h, l] of widths) {
  try {
    const f = await probeViewport(w, h, l);
    const summary = {
      label: f.label,
      idleOverflowX: f.idle.docX, idleOverflowY: f.idle.docY,
      sendAboveFold: f.idleButtons.sendAboveFold,
      recvY: f.idleButtons.recvY,
      codeFits: f.codeDisplay.el ? (f.codeDisplay.el.overflowX <= 0) : null,
      codeOverflowX: f.codeDisplay.el?.overflowX,
      qrFound: f.qrOverlay.found, qrFits: f.qrOverlay.fits,
      receiveOverflow: f.receiveOverflow, cells: f.codeInput.cells?.cellCount,
      wrongCodeShown: f.wrongCode.errorShown,
      joined: f.bJoined,
      connectedOverflowX: f.connectedB?.docX,
      emptyRoomB: f.emptyRoomB,
      bothWays: f.bothWays,
    };
    console.log(l.padEnd(8), JSON.stringify(summary));
    if (f.errsA) console.log('   A errs:', f.errsA);
    if (f.errsB) console.log('   B errs:', f.errsB);
  } catch (e) {
    console.log(l.padEnd(8), 'PROBE FAILED:', e.message.slice(0, 160));
  }
}
await browser.close();
process.exit(0);