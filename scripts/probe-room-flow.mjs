// E2E verification of the room-flow changes:
//  1. No orange "disconnected" banner during the connect window (creator side)
//  2. Both devices show the connecting animation (ConnectingVisual)
//  3. Chat header: name + Connected chip on ONE line
//  4. Delivery receipt: sender bubble flips Sent -> Delivered (true ack)
//  5. + menu shows only Photo and File
//  6. Attachment remove: circular button, tap removes with animation
//  7. Image viewer opens full-quality + zoomable
import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';
import fs from 'fs';

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

async function main() {
  const browser = await launchBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await ctx.newPage(); // creator
  const B = await ctx.newPage(); // joiner
  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await sleep(1500);

  // --- Pair up ---
  await A.getByRole('button', { name: 'Send text' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  const code = await readLiveCode(A);

  // Poll A's RoomHub during the whole join to catch the connecting window.
  const bannerSeen = [];
  const visualSeen = [];
  const poll = setInterval(async () => {
    const r = await A.evaluate(() => {
      const banner = !!Array.from(document.querySelectorAll('div')).find(d => d.textContent && d.textContent.includes('Your other device disconnected'));
      const visual = !!document.querySelector('.animate-float-soft, .animate-beam');
      return { banner, visual };
    });
    bannerSeen.push(r.banner);
    if (r.visual) visualSeen.push(true);
  }, 120);

  await B.getByRole('button', { name: 'Receive text' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await B.getByText('Connecting').waitFor({ timeout: 8000 }).catch(() => {});
  // Snapshot joiner's connecting screen.
  const joinerVisual = await B.evaluate(() => !!document.querySelector('.animate-float-soft, .animate-beam'));
  check('joiner shows connecting animation', joinerVisual);

  await sleep(400);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  clearInterval(poll);

  check('no orange banner during connect (creator)', bannerSeen.every(v => !v), `sampled ${bannerSeen.length}x, ${bannerSeen.filter(Boolean).length} hits`);
  check('connecting animation appeared on creator screen', visualSeen.length > 0);

  // --- Header: name + Connected chip on ONE line ---
  const header = await A.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Connected') && (b.textContent.includes('Guest') || b.textContent.includes('Other device')));
    if (!btn) return null;
    const spans = Array.from(btn.querySelectorAll('span')).filter(s => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const name = spans.find(s => s.textContent && /Guest|Other device/.test(s.textContent));
    const chip = spans.find(s => s.textContent && /Connected|Offline/.test(s.textContent));
    if (!name || !chip) return null;
    const nr = name.getBoundingClientRect();
    const cr = chip.getBoundingClientRect();
    return {
      sameLine: Math.abs(nr.y - cr.y) < 6,
      nameY: Math.round(nr.y), chipY: Math.round(cr.y),
      chipH: Math.round(cr.height),
      text: btn.textContent.replace(/\s+/g, ' ').trim().slice(0, 70)
    };
  });
  check('header name+status on one line', !!header && header.sameLine && header.chipH < 28, header ? `"${header.text}" nameY=${header.nameY} chipY=${header.chipY} chipH=${header.chipH}` : 'not found');

  // --- Delivery receipt ---
  await A.getByPlaceholder('Paste or type text…').fill('hello receipt test');
  await A.getByRole('button', { name: 'Send' }).click();
  await sleep(1500);

  // The bubble = the rounded-[18px] wrapper containing the message text.
  const bubbleText = async (page) => page.evaluate(() => {
    const hits = Array.from(document.querySelectorAll('div[class*="rounded-[18px]"]')).filter(d => d.textContent && d.textContent.includes('hello receipt test'));
    if (!hits.length) return null;
    return hits[hits.length - 1].textContent.replace(/\s+/g, ' ').trim().slice(0, 120);
  });

  const sentState = await bubbleText(A);
  check('sender bubble exists', !!sentState, sentState || 'missing');
  check('sender shows Delivered after receipt', !!(sentState && sentState.includes('Delivered')), sentState || '');
  check('sender does NOT show bare Sent', !!(sentState && !/Sent$|Sent •/.test(sentState.replace('Delivered', ''))), sentState || '');

  // Debug hook: confirm the receipt really flipped state.
  const deliveredFlag = await A.evaluate(() => {
    const msgs = window.__sharetextDebug?.getMessages?.() ?? [];
    const m = msgs.find(x => x.text && x.text.includes('hello receipt test'));
    return m ? m.delivered === true : null;
  });
  check('receipt flipped delivered flag (state)', deliveredFlag === true, String(deliveredFlag));

  // Received side shows Received
  await sleep(300);
  const receivedState = await bubbleText(B);
  check('receiver shows Received', !!(receivedState && receivedState.includes('Received')), receivedState || 'missing');

  // --- + menu: only Photo and File ---
  await A.getByRole('button', { name: 'Add attachment' }).click();
  await sleep(350);
  const menu = await A.evaluate(() => {
    const items = Array.from(document.querySelectorAll('button')).filter(b => ['Photo', 'File', 'Video', 'Audio', 'Paste from clipboard'].includes(b.textContent.trim()));
    return items.map(b => b.textContent.trim());
  });
  await A.keyboard.press('Escape');
  check('+ menu shows only Photo and File', menu.length === 2 && menu.includes('Photo') && menu.includes('File'), JSON.stringify(menu));

  // --- Attachment remove button ---
  const imgPath = pathOf('demo-photo');
  if (imgPath) {
    await A.locator('input[type="file"][accept="image/*"]').setInputFiles(imgPath);
    await sleep(400);
    const removeBtn = await A.getByRole('button', { name: 'Remove attachment' }).count();
    check('attachment remove button visible', removeBtn === 1);
    if (removeBtn === 1) {
      await A.getByRole('button', { name: 'Remove attachment' }).click();
      await sleep(500);
      const gone = (await A.getByRole('button', { name: 'Remove attachment' }).count()) === 0;
      check('attachment removed after click', gone);
    }

    // --- Image transfer + viewer on both sides ---
    await A.locator('input[type="file"][accept="image/*"]').setInputFiles(imgPath);
    await sleep(300);
    await A.getByRole('button', { name: 'Send' }).click();
    await sleep(2500);

    for (const [label, page] of [['sender', A], ['receiver', B]]) {
      const viewerBtn = await page.getByRole('button', { name: /View / }).count().catch(() => 0);
      check(`${label} image card tappable`, viewerBtn === 1);
      if (viewerBtn === 1) {
        await page.getByRole('button', { name: /View / }).click();
        await sleep(400);
        const opened = await page.evaluate(() => {
          const dialog = document.querySelector('[role="dialog"][aria-label^="Viewing"]');
          return !!dialog;
        });
        check(`${label} image viewer opens`, opened);
        if (opened) {
          // zoom via wheel
          await page.mouse.move(640, 450);
          await page.mouse.wheel(0, -200);
          await sleep(300);
          const zoomText = await page.evaluate(() => {
            const d = document.querySelector('[role="dialog"][aria-label^="Viewing"]');
            return d ? d.textContent : '';
          });
          check(`${label} viewer zooms (scale hint >100%)`, /1[1-9]\d%|200%|300%/.test(zoomText), zoomText.slice(0, 60));
          await page.keyboard.press('Escape');
          await sleep(250);
        }
      }
    }
  } else {
    check('demo photo path found (skip attachment tests)', false, 'missing file');
  }

  await A.screenshot({ path: '.audit-shots/room-flow-A.png' });
  await B.screenshot({ path: '.audit-shots/room-flow-B.png' });
  await browser.close();

  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  process.exit(fails.length ? 1 : 0);
}

function pathOf(name) {
  const candidates = [
    'public/demo/photo-4x3.jpg',
    'public/demo/photo.jpg',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

main().catch((e) => { console.error('PROBE FAIL', String(e).slice(0, 500)); process.exit(1); });
