// Probe: live-count on the Cloudflare transport. Creates real browser
// sessions against a CF-transport frontend, then checks the worker /stats.
import { launchBrowser, URL, sleep, readLiveCode } from './lib.mjs';

const CF_STATS = process.env.CF_STATS || 'http://localhost:8787/stats';

async function users() {
  const res = await fetch(CF_STATS);
  return (await res.json()).users;
}

async function main() {
  const browser = await launchBrowser();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const A = await ctxA.newPage();
  const B = await ctxB.newPage();

  console.log('before:', await users(), '(expect 0)');

  await A.goto(URL, { waitUntil: 'networkidle' });
  await A.getByRole('button', { name: 'Start a transfer' }).first().click();
  await A.getByText('LIVE CODE').waitFor({ timeout: 10000 });
  await sleep(1500); // let the presence report land
  console.log('after A created:', await users(), '(expect 1)');

  await B.goto(URL, { waitUntil: 'networkidle' });
  await B.getByRole('button', { name: 'Already have a code?' }).first().click();
  await B.locator('input[inputmode="numeric"]').fill(await readLiveCode(A));
  await sleep(3000); // join + report
  console.log('after B joined:', await users(), '(expect 2)');

  await A.close();
  await sleep(1500);
  console.log('after A closed:', await users(), '(expect 1)');

  await B.close();
  await sleep(1500);
  console.log('after B closed:', await users(), '(expect 0)');

  await browser.close();
}

main().catch((e) => {
  console.error('PROBE FAIL', e);
  process.exit(1);
});
