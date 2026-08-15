import { launchBrowser, pairDevices, URL, sleep } from './lib.mjs';

const browser = await launchBrowser();
const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ctxB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const A = await ctxA.newPage();
const B = await ctxB.newPage();
await A.goto(URL, { waitUntil: 'domcontentloaded' });
await B.goto(URL, { waitUntil: 'domcontentloaded' });
await pairDevices(A, B);
await sleep(1500);

const dropped = await B.evaluate(() => {
  const area = document.querySelector('.overflow-y-auto');
  if (!area) return 'no drop area';
  const dt = new DataTransfer();
  dt.items.add(new File([new Uint8Array(2048)], 'dropped-notes.txt', { type: 'text/plain' }));
  area.dispatchEvent(new DragEvent('dragenter', { bubbles: true, dataTransfer: dt }));
  area.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  return 'dropped';
});
console.log(dropped);
await sleep(600);
const staged = await B.getByText('dropped-notes.txt').count();
console.log(staged >= 1 ? 'PASS: dropped file staged in composer' : 'FAIL: file not staged');
await B.getByRole('button', { name: 'Send' }).click();
await sleep(2500);
const received = await A.getByText('dropped-notes.txt').count();
console.log(received >= 1 ? 'PASS: dropped file transferred to A' : 'FAIL: not received on A');
await browser.close();
