// Renders actual MP4 ads from ShareText's own hero animation — the product
// demo IS the ad. Captures frames of the live page (deterministic: clicks
// replay at t=0, captures one full transfer, stops before the loop composes
// the next scene), then stitches with ffmpeg.
//
// Usage: node scripts/render-ad.mjs   (URL=http://localhost:3000 default)
// Output: ads/sharetext-hero-16x9.mp4 and ads/sharetext-hero-9x16.mp4
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = process.env.URL || 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'ads');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function resolveChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return undefined;
}

const FPS = 12;
const DURATION_MS = 5600; // ready → launch → flight → received hold
const FRAME_MS = Math.round(1000 / FPS);

async function renderAd({ name, width, height, dpr }) {
  const browser = await chromium.launch(resolveChrome() ? { headless: true, executablePath: resolveChrome() } : { headless: true });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    colorScheme: 'dark',
  });
  const page = await context.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });

  // The demo now runs on its own, so click its send button the moment the
  // composer is in the ready phase — a deterministic ready → sending →
  // received timeline for the capture (the auto-run yields to the click).
  await page.evaluate(() => window.scrollTo(0, 0));
  const demo = page.locator('[data-step]').first();
  await demo.waitFor({ timeout: 15000 });
  for (let i = 0; i < 60; i++) {
    const ready = await page.evaluate(() => document.querySelector('[data-step]')?.getAttribute('data-step') === 'ready'
      && !!document.querySelector('button[aria-label="Send demo"]'));
    if (ready) break;
    await sleep(100);
  }
  await sleep(150);
  await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Send demo"]');
    btn?.click();
  });

  const framesDir = path.join(__dirname, '..', '.ad-frames', name);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });

  const total = Math.ceil(DURATION_MS / FRAME_MS);
  for (let i = 0; i < total; i++) {
    const buf = await demo.screenshot();
    fs.writeFileSync(path.join(framesDir, `frame-${String(i).padStart(4, '0')}.png`), buf);
    await sleep(FRAME_MS - 20);
  }

  const mp4 = path.join(OUT, name + '.mp4');
  execFileSync('ffmpeg', [
    '-y', '-framerate', String(FPS),
    '-i', path.join(framesDir, 'frame-%04d.png'),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    mp4,
  ], { stdio: 'ignore' });
  fs.rmSync(framesDir, { recursive: true, force: true });
  await browser.close();
  const size = fs.statSync(mp4).size;
  console.log(`rendered ${mp4} (${(size / 1024 / 1024).toFixed(2)} MB, ${total} frames)`);
  return mp4;
}

await renderAd({ name: 'sharetext-hero-16x9', width: 1280, height: 720, dpr: 2 });
await renderAd({ name: 'sharetext-hero-9x16', width: 720, height: 1280, dpr: 2 });
