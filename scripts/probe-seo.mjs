import { launchBrowser, URL } from './lib.mjs';

const b = await launchBrowser();
try {
  // 404: bad path should render the app's styled page, not a framework default.
  const page = await b.newPage();
  await page.goto(`${URL}/definitely-not-a-real-page`, { waitUntil: 'networkidle' });
  const h2 = await page.locator('h2').first().textContent();
  const hasHome = await page.getByRole('button', { name: /Back to Home|Start a Session/ }).count();

  // OG: image file must exist and be a valid 1200x630 PNG (checked from the
  // homepage, not the 404 view).
  const home = await b.newPage();
  await home.goto(URL, { waitUntil: 'networkidle' });
  const og = await home.evaluate(async () => {
    const r = await fetch('/og-3.png');
    if (!r.ok) return { ok: false, status: r.status };
    const buf = new Uint8Array(await r.arrayBuffer());
    // PNG header: width (bytes 16-19) and height (bytes 20-23), big-endian.
    const w = (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19];
    const h = (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23];
    return { ok: true, bytes: buf.length, w, h };
  });

  const meta = await home.evaluate(() => ({
    title: document.title,
    ogImage: document.querySelector('meta[property="og:image"]')?.content,
    desc: document.querySelector('meta[name="description"]')?.content?.slice(0, 40),
  }));

  console.log(JSON.stringify({ h2, hasHome, og, meta }, null, 2));
  const ok = h2?.includes("doesn't exist") && hasHome >= 1 && og.ok && og.w === 1200 && og.h === 630 && meta.ogImage?.includes('og-3.png');
  console.log(ok ? 'SEO_OK' : 'SEO_FAIL');
} finally {
  await b.close();
}
