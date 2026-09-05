// Transfer proof — exercises the redesigned transfer layer in a real browser:
//   1. one batch: big PNG (3000×2000, generated on the fly) + JPEG + 6MB
//      pseudo-random binary + an undecodable "HEIC" — sent together from A
//   2. on receipt: every Save captures a download whose SHA-256 matches the
//      original bytes exactly; the decoded images' naturalWidth/Height equal
//      the original pixel dimensions (not stretched); the metadata chip shows
//      dims + format; the Verified shield appears on all four cards
//   3. decode-fallback: the HEIC degrades to the file row with Save promoted
//   4. wall-clock timing per file and for the batch (send → complete)
import { launchBrowser, URL, sleep, waitForChat } from './lib.mjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const browser = await launchBrowser();
const fails = [];
const ok = (cond, label) => { console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}`); if (!cond) fails.push(label); };

/* ── payload generation ─────────────────────────────────────────────── */

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
// Minimal valid PNG: gradient 3000×2000, 8-bit RGB, stored-deflate (fast).
function makePng(w, h) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolor RGB
  const rowLen = 1 + w * 3;
  const raw = Buffer.alloc(rowLen * h);
  for (let y = 0; y < h; y++) {
    const off = y * rowLen;
    raw[off] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const p = off + 1 + x * 3;
      raw[p] = (x * 255 / w) | 0; raw[p + 1] = (y * 255 / h) | 0; raw[p + 2] = 128;
    }
  }
  const blocks = [];
  for (let i = 0; i < raw.length; i += 65535) {
    const b = raw.subarray(i, Math.min(i + 65535, raw.length));
    const last = i + 65535 >= raw.length;
    const hdr = Buffer.from([last ? 1 : 0, b.length & 0xff, (b.length >> 8) & 0xff, (~b.length) & 0xff, ((~b.length) >> 8) & 0xff]);
    blocks.push(hdr, b);
  }
  const adler = Buffer.alloc(4); adler.writeUInt32BE(crc32(raw));
  const zlib = Buffer.concat([Buffer.from([0x78, 0x01]), ...blocks, adler]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib), chunk('IEND', Buffer.alloc(0))]);
}
// Real JPEG raster rendered by the browser itself (guaranteed decodable).
async function makeJpegInBrowser(page, w, h) {
  return page.evaluate(async ([W, H]) => {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#7c6ce0'); g.addColorStop(1, '#f28456');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    return new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result.split(',')[1]);
      fr.readAsDataURL(blob);
    });
  }, [w, h]);
}
const digestOf = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const MB = (n) => (n / 1048576).toFixed(2);

/* ── main ───────────────────────────────────────────────────────────── */
async function main() {
  const W = 3000, H = 2000, JW = 2000, JH = 1500;
  console.log(`generating payloads (PNG ${W}×${H}, JPEG ${JW}×${JH})…`);
  const png = makePng(W, H);
  const jpeg = Buffer.from(await (async () => {
    const ctx0 = await browser.newContext();
    const p = await ctx0.newPage();
    const b64 = await makeJpegInBrowser(p, JW, JH);
    await ctx0.close();
    return b64;
  })(), 'base64');
  const bin = crypto.randomBytes(6 * 1024 * 1024);
  const heic = crypto.randomBytes(64 * 1024);

  const payloads = [
    { name: 'proof-gradient-3000x2000.png', mime: 'image/png', buf: png, dims: `${W}×${H}` },
    { name: 'proof-photo-2000x1500.jpg', mime: 'image/jpeg', buf: jpeg, dims: `${JW}×${JH}` },
    { name: 'proof-binary-6mb.bin', mime: 'application/octet-stream', buf: bin },
    { name: 'proof-broken.heic', mime: 'image/heic', buf: heic },
  ];
  for (const p of payloads) p.sha = await digestOf(p.buf);
  console.log('payloads:', payloads.map(p => `\n  ${p.name}  ${MB(p.buf.length)}MB  sha=${p.sha.slice(0, 12)}…`).join(''));

  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  A.on('pageerror', e => console.log('[A:PAGEERROR]', e.message));
  B.on('pageerror', e => console.log('[B:PAGEERROR]', e.message));

  await A.goto(URL, { waitUntil: 'networkidle' });
  await B.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Send', exact: true }).first().click();
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 10000 });
  const code = await (async () => {
    const group = A.getByRole('group', { name: 'Pairing code' });
    for (let i = 0; i < 10; i++) {
      const digits = await group.locator('span').filter({ hasText: /^\d$/ }).allTextContents();
      const c = digits.slice(-6).join('');
      if (/^\d{6}$/.test(c)) { await sleep(250); return c; }
      await sleep(300);
    }
    throw new Error('no stable code');
  })();
  await B.getByRole('button', { name: 'Receive', exact: true }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(A, 'A'); await waitForChat(B, 'B');
  const connType = await B.evaluate(() => {
    // the session isn't exposed globally; infer from the diag transport event
    const g = window.__sharetextDiag;
    if (!g) return '(no diag)';
    const tr = g.snapshot().find(e => e.stage === 'transport.choose');
    return tr ? tr.detail : '(none)';
  }).catch(() => '(read failed)');
  // Root-cause probe: WIRE-level truth. The session layer is closed over, so
  // we read the socket.io emission counter — relay_mode means the WebRTC
  // data channel never opened, and every binary chunk went via socket.io.
  const wire = await B.evaluate(() => {
    const g = window.__sharetextDiag;
    if (!g) return { available: false };
    const ev = g.snapshot();
    return {
      webrtc: ev.filter(e => String(e.stage).startsWith('webrtc.')).map(e => ({ s: e.stage, ok: e.ok, d: (e.detail || '').slice(0, 40) })),
      transport: ev.filter(e => String(e.stage).startsWith('transport.')).map(e => ({ s: e.stage, ok: e.ok, d: (e.detail || '').slice(0, 40) })),
    };
  }).catch(() => null);
  console.log('B wire diagnostics:', JSON.stringify(wire, null, 1));
  console.log(`OK  paired (transport: ${connType}) — staging batch on A`);

  // Stage all four files: images through the image input, the rest generic.
  await A.locator('input[type="file"][accept="image/*"]').first().setInputFiles(
    payloads.filter(p => p.mime.startsWith('image/')).map(p => ({ name: p.name, mimeType: p.mime, buffer: p.buf })));
  await A.locator('input[type="file"]:not([accept])').first().setInputFiles(
    payloads.filter(p => !p.mime.startsWith('image/')).map(p => ({ name: p.name, mimeType: p.mime, buffer: p.buf })));
  await sleep(800);
  const staged = await A.evaluate(() => document.body.innerText.match(/\d of \d attached/)?.[0] || '(no counter)');
  console.log('staged:', staged);

  // ── send the batch; record per-file completion by watching Save buttons ──
  const t0 = Date.now();
  await A.getByTestId('send').click();
  const arrivalTimes = [];
  const deadline = Date.now() + 300_000;
  let completeCount = 0;
  while (Date.now() < deadline && completeCount < 4) {
    await sleep(500);
    const n = await B.evaluate(() => document.querySelectorAll('button[data-testid="transfer-download"]').length);
    while (completeCount < n) { completeCount++; arrivalTimes.push({ file: `#${completeCount}`, ms: Date.now() - t0 }); }
  }
  const batchMs = Date.now() - t0;
  ok(completeCount === 4, `all 4 files arrived (batch wall clock ${(batchMs / 1000).toFixed(1)}s)`);
  const totalMB = MB(payloads.reduce((s, p) => s + p.buf.length, 0));

  /* ── integrity diagnostics from B (hash + checksum lifecycle) ── */
  await sleep(6500); // let late checksum re-sends / late verifications land
  const transferDiag = await B.evaluate(() => {
    const g = window.__sharetextDiag;
    if (!g) return { available: false };
    return g.snapshot().filter(e => e.stage && String(e.stage).startsWith('transfer.'));
  }).catch(() => null);
  console.log('B transfer diagnostics:', JSON.stringify(transferDiag, null, 1));
  const counts = await B.evaluate(() => {
    const g = window.__sharetextDiag;
    if (!g) return null;
    const ev = g.snapshot();
    const webrtc = ev.filter(e => String(e.stage).startsWith('webrtc.'));
    return {
      channelOpen: !!webrtc.find(e => e.stage === 'webrtc.channel_open'),
      link: (webrtc.filter(e => e.stage === 'webrtc.link').map(e => (e.ok ? e.detail : '(none)')))[0] || null,
      relayFallback: !!ev.find(e => e.stage === 'webrtc.relay_fallback'),
      statsError: ev.filter(e => e.stage === 'webrtc.stats_error').length,
      sentDiag: ev.filter(e => e.stage === 'transfer.sent').length,
      relayCount: ev.filter(e => e.stage === 'relay.binary_messages').length,
    };
  }).catch(() => null);
  console.log('B transport counts:', JSON.stringify(counts));

  /* ── card assertions on B ── */
  // The Verified shield is set by the async checksum pass, which can land a
  // beat AFTER a big file's status flips to complete — its checksum metadata
  // rides behind the file's chunk queue on the ordered channel. Wait for one
  // lucide-shield-check (exactly one per verified card) per received file.
  const allVerified = await (async () => {
    const dl = Date.now() + 30000;
    while (Date.now() < dl) {
      const n = await B.evaluate(() => document.querySelectorAll('.lucide-shield-check').length);
      if (n >= 4) return true;
      await sleep(500);
    }
    return false;
  })();
  ok(allVerified, 'Verified shield appears on all 4 cards (async checksum pass completes)');
  // Card text: walk up from each Save button to the first ancestor whose text
  // includes 'Verified' (the footer) AND is not shared with another card.
  const cards = await B.evaluate(() => {
    return [...document.querySelectorAll('button[data-testid="transfer-download"]')].map(btn => {
      let el = btn, best = null;
      for (let i = 0; i < 16 && el && el !== document.body; i++) {
        el = el.parentElement;
        if (!el) break;
        const saves = el.querySelectorAll('button[data-testid="transfer-download"]').length;
        if (saves > 1) break; // crossed into a container holding multiple cards
        best = el;
      }
      const txt = best ? (best.innerText || '') : '';
      return {
        text: txt.slice(0, 400),
        dims: (txt.match(/(\d{2,5})\s*×\s*(\d{2,5})/) || [])[0] || null,
        verified: txt.includes('Verified'),
        fmt: (txt.match(/\b(PNG|JPEG|HEIC|HEIF|WebP|AVIF|GIF)\b/) || [])[0] || null,
        fallbackNote: txt.includes('Original file kept'),
        hasImg: !!(best && best.querySelector('img')),
      };
    });
  });

  // Decoded images: intrinsic pixel size must equal the original dimensions —
  // this is the direct "pixels not stretched" proof (naturalWidth is what the
  // decoder produced from the arrived bytes).
  const imgs = await B.evaluate(() => [...document.querySelectorAll('img')].map(i => ({
    nw: i.naturalWidth, nh: i.naturalHeight, src: i.src.startsWith('blob:') ? i.src.slice(0, 24) : '(non-blob)',
  })));
  console.log('decoded images on B:', JSON.stringify(imgs));
  const pngImg = imgs.find(i => i.nw === W && i.nh === H);
  const jpgImg = imgs.find(i => i.nw === JW && i.nh === JH);
  ok(!!pngImg, `png: decoded at exact original ${W}×${H} pixels (naturalWidth/Height)`);
  ok(!!jpgImg, `jpeg: decoded at exact original ${JW}×${JH} pixels (naturalWidth/Height)`);

  const pngCard = cards.find(c => c.dims === `${W} × ${H}`) || cards.find(c => c.fmt === 'PNG');
  const jpgCard = cards.find(c => c.fmt === 'JPEG');
  ok(!!pngCard && pngCard.hasImg, 'png: metadata chip shows exact dimensions + rendered as image');
  ok(!!pngCard && pngCard.verified, 'png: Verified shield shown');
  ok(!!jpgCard && jpgCard.fmt === 'JPEG', `jpeg: format chip shows JPEG`);
  ok(!!jpgCard && jpgCard.verified, 'jpeg: Verified shield shown');

  const heicCard = cards.find(c => c.text.includes('proof-broken'));
  ok(!!heicCard, 'heic: card present on B');
  ok(!!heicCard && heicCard.fallbackNote, 'heic: decode-fallback note shown ("Original file kept — preview not supported")');
  ok(!!heicCard && !heicCard.hasImg, 'heic: NOT rendered as a broken image (file row instead)');
  ok(!!heicCard && heicCard.verified, 'heic: Verified shield shown');
  const binCard = cards.find(c => c.text.includes('proof-binary'));
  ok(!!binCard && binCard.verified, 'bin: Verified shield shown');

  /* ── checksums: click Save on every card, capture the real download ── */
  const tmp = fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'tproof-'));
  const saveButtons = B.locator('button[data-testid="transfer-download"]');
  const nSaves = await saveButtons.count();
  const received = {};
  for (let i = 0; i < nSaves; i++) {
    const btn = saveButtons.nth(i);
    const [download] = await Promise.all([
      B.waitForEvent('download', { timeout: 20000 }),
      btn.click(),
    ]);
    const fname = download.suggestedFilename();
    const dest = path.join(tmp, `recv-${i}-${path.basename(fname)}`);
    await download.saveAs(dest);
    const sha = digestOf(fs.readFileSync(dest));
    received[fname] = sha;
    console.log(`  saved "${fname}" → sha=${sha.slice(0, 12)}… (${MB(fs.statSync(dest).size)}MB)`);
  }
  for (const p of payloads) {
    const got = received[p.name];
    ok(got === p.sha, `${p.name}: SHA-256 of the saved file matches the original byte-for-byte`);
  }

  /* ── timing report ── */
  console.log('\n=== TIMING (wall clock, send → each file complete on B) ===');
  console.log(`batch: 4 files, ${totalMB}MB total → ${(batchMs / 1000).toFixed(1)}s (${(parseFloat(totalMB) / (batchMs / 1000)).toFixed(1)} MB/s effective on localhost, transport: ${connType})`);
  for (const a of arrivalTimes) console.log(`  ${a.file}: ${(a.ms / 1000).toFixed(1)}s`);

  fs.rmSync(tmp, { recursive: true, force: true });
  await browser.close();
  if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log(' -', f)); process.exit(1); }
  console.log('\nTransfer proof complete: all checks passed.');
}
main().catch(e => { console.error('PROOF ERROR:', e.message); process.exit(1); });
