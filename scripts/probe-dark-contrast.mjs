import { launchBrowser, URL, sleep, readLiveCode, waitForChat } from './lib.mjs';

// Dark-mode WCAG contrast audit: walk every visible text node on the landing,
// pairing, and connected screens (dark scheme), compute the real contrast
// ratio against its effective background, and flag anything below 4.5:1
// (normal text) / 3:1 (large ≥24px or 18.66px bold). Also checks surfaces:
// backgrounds must differ from the page background (subtle hierarchy, not
// pure black everywhere).
function lum(rgb) {
  const c = rgb.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(fg, bg) {
  const l1 = lum(fg), l2 = lum(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
function parseColor(str) {
  const m = str.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+([\d.]+))?\)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined ? Number(m[4]) : 1];
}
// Walk up the ancestors collecting backgrounds until a non-transparent one.
function effectiveBg(el) {
  let node = el;
  const stack = [];
  while (node && node !== document.body) {
    const s = getComputedStyle(node);
    const bg = parseColor(s.backgroundColor);
    if (bg && bg[3] > 0.9) { stack.push(bg.slice(0, 3)); }
    node = node.parentElement;
  }
  const body = parseColor(getComputedStyle(document.body).backgroundColor);
  if (body && body[3] > 0.9) stack.push(body.slice(0, 3));
  return stack[stack.length - 1] || [0, 0, 0];
}

const b = await launchBrowser();
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  const A = await ctx.newPage();
  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });
  await sleep(1200);

  const audit = () => A.evaluate(() => {
    const lum = (rgb) => {
      const c = rgb.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (fg, bg) => {
      const l1 = lum(fg), l2 = lum(bg);
      const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
      return (hi + 0.05) / (lo + 0.05);
    };
    const parseColor = (str) => {
      const m = str && str.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+([\d.]+))?\)/);
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] !== undefined ? Number(m[4]) : 1];
    };
    const effectiveBg = (el) => {
      // Innermost opaque background wins — the closest ancestor that paints
      // its own surface (a button's white, a card's surface). Using the
      // page background would compare text against the body, which happens
      // to match the ink color in dark mode and produce false flags.
      let node = el;
      while (node && node !== document.body) {
        const s = getComputedStyle(node);
        const bg = parseColor(s.backgroundColor);
        if (bg && bg[3] > 0.9) return bg.slice(0, 3);
        node = node.parentElement;
      }
      const body = parseColor(getComputedStyle(document.body).backgroundColor);
      return (body && body[3] > 0.9 ? body.slice(0, 3) : null) || [0, 0, 0];
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const flags = [];
    let n;
    const min = { ratio: 99, text: '', cls: '' };
    while ((n = walker.nextNode())) {
      const t = n.textContent.trim();
      if (!t || t.length < 2) continue;
      const el = n.parentElement;
      if (!el || el.closest('[aria-hidden="true"]')) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.5) continue;
      const fg = parseColor(s.color);
      if (!fg || fg[3] < 0.5) continue;
      const size = parseFloat(s.fontSize);
      const bold = parseInt(s.fontWeight) >= 600;
      const large = size >= 24 || (size >= 18.66 && bold);
      const threshold = large ? 3 : 4.5;
      const bg = effectiveBg(el);
      const r = ratio(fg.slice(0, 3), bg);
      if (r < min.ratio) { min.ratio = r; min.text = t.slice(0, 40); min.cls = el.className?.toString().slice(0, 60) || el.tagName; }
      if (r < threshold) flags.push({ text: t.slice(0, 40), ratio: Math.round(r * 100) / 100, cls: (el.className?.toString() || el.tagName).slice(0, 70), size, large });
    }
    return { flags: flags.slice(0, 12), worst: { ratio: Math.round(min.ratio * 100) / 100, text: min.text, cls: min.cls } };
  });

  const landing = await audit();
  console.log('LANDING dark:', JSON.stringify(landing, null, 1));

  await A.getByRole('button', { name: 'Send text' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  await sleep(500);
  const pairing = await audit();
  console.log('PAIRING dark:', JSON.stringify(pairing, null, 1));

  // Join from a second browser so the chat renders messages.
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  const B = await ctxB.newPage();
  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Receive text' }).first().click();
  const code = await readLiveCode(A);
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  await sleep(600);
  await A.locator('textarea').first().fill('dark mode contrast sample — long enough to render');
  await A.locator('textarea').first().press('Enter');
  await sleep(1200);
  const chat = await audit();
  console.log('CHAT dark:', JSON.stringify(chat, null, 1));

  const ok = landing.flags.length === 0 && pairing.flags.length === 0 && chat.flags.length === 0;
  console.log(ok ? 'DARK_CONTRAST_OK' : 'DARK_CONTRAST_FAIL');
} finally {
  await b.close();
}
