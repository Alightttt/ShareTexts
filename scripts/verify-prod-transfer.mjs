// Production smoke: pair on the LIVE site, text both ways, 3MB file A→B,
// and room persistence across A's refresh. Uses the repo's proven helpers.
import { launchBrowser, sleep, readLiveCode, waitForChat } from './lib.mjs';

const LIVE = process.env.PROD_URL || 'https://sharetexts.online/';
const FAILS = [];
const ok = (name, cond) => {
  console.log(`${cond ? 'OK ' : 'FAIL'} ${name}`);
  if (!cond) FAILS.push(name);
};

async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();
  const errs = [];
  for (const [n, p] of [['A', A], ['B', B]]) p.on('pageerror', e => errs.push(`[${n}] ${e.message}`));

  await A.goto(LIVE, { waitUntil: 'domcontentloaded' });
  await B.goto(LIVE, { waitUntil: 'domcontentloaded' });

  // Pair via the same entry points the E2E uses.
  await A.getByRole('button', { name: 'Send' }).first().click();
  await A.getByRole('group', { name: 'Pairing code' }).waitFor({ timeout: 15000 });
  const code = await readLiveCode(A);
  await B.getByRole('button', { name: 'Receive' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(code);
  await waitForChat(B, 'B');
  await waitForChat(A, 'A');
  ok('pair → both in chat', true);

  // Text A→B.
  await A.locator('textarea').first().fill('prod ping from A');
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(2500);
  ok('A→B text', (await B.locator('body').innerText()).includes('prod ping from A'));

  // Text B→A.
  await B.locator('textarea').first().fill('prod pong from B');
  await B.getByRole('button', { name: 'Send', exact: true }).click();
  await sleep(2500);
  ok('B→A text', (await A.locator('body').innerText()).includes('prod pong from B'));

  // 3MB file A→B — the exact case that used to hang forever.
  const fin = A.locator('input[type=file]').first();
  ok('file input mounts when connected', (await fin.count()) > 0);
  await fin.setInputFiles({
    name: 'probe.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.alloc(3 * 1024 * 1024, 7),
  });
  await sleep(1000);
  await A.getByRole('button', { name: 'Send', exact: true }).click();
  let fileOk = false;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    if ((await B.locator('body').innerText()).includes('probe.bin')) { fileOk = true; break; }
  }
  ok('A→B 3MB file lands on B', fileOk);

  // Persistence: A refreshes → room must survive (composer returns).
  await A.reload({ waitUntil: 'domcontentloaded' });
  await sleep(7000);
  ok('A reconnects after refresh', (await A.getByTestId('composer').count()) > 0);
  const canSend = (await A.locator('textarea').count()) > 0;
  if (canSend) {
    await A.locator('textarea').first().fill('after refresh');
    await A.getByRole('button', { name: 'Send', exact: true }).click();
    await sleep(2500);
    ok('post-refresh send reaches B', (await B.locator('body').innerText()).includes('after refresh'));
  } else {
    ok('post-refresh send reaches B', false);
  }

  console.log('\npage errors:', errs.length ? errs.slice(0, 4) : 'none');
  console.log(FAILS.length ? `RESULT: ${FAILS.length} FAILED` : 'RESULT: ALL GREEN');
  await browser.close();
  process.exit(FAILS.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(1); });
