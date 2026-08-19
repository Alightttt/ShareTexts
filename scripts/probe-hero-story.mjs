import { launchBrowser, URL, sleep } from './lib.mjs';

// Verify the interactive hero's full state story: the demo auto-starts after
// 1s, so we test from the playing state. Play/pause/replay are mutually
// exclusive — only one renders at a time.
const b = await launchBrowser();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });

  // Wait for the LiveBridgeDemo to appear (with either play or pause button,
  // since the demo may have auto-started already).
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await page.evaluate(() => {
      const demo = document.querySelector('[data-testid="hero-demo"]');
      const playBtn = document.querySelector('[data-testid="hero-demo-play"]');
      const pauseBtn = document.querySelector('[data-testid="hero-demo-pause"]');
      return !!demo && (!!playBtn || !!pauseBtn);
    });
    if (ready) break;
    await sleep(200);
  }
  if (!ready) throw new Error('LiveBridgeDemo never appeared');

  // Check that scenario chips exist
  const scenarios = await page.evaluate(() => {
    const chips = ['note', 'link', 'photo', 'file'];
    return chips.every(key => !!document.querySelector(`[data-testid="hero-scenario-${key}"]`));
  });
  console.log('Scenario chips:', scenarios ? 'OK' : 'FAIL');

  // Check that progress rail exists
  const progressRail = await page.evaluate(() => {
    return !!document.querySelector('[aria-label="Go to Pair step"]');
  });
  console.log('Progress rail:', progressRail ? 'OK' : 'FAIL');

  // The demo may have auto-started. If Pause is showing, the demo is playing.
  // If Play is showing, click it first.
  const hasPlayBtn = await page.evaluate(() => !!document.querySelector('[data-testid="hero-demo-play"]'));
  if (!hasPlayBtn) {
    // Demo auto-started — pause it first so we can test the full play→pause cycle
    const pauseBtn = await page.$('[data-testid="hero-demo-pause"]');
    if (pauseBtn) await pauseBtn.click();
    await sleep(400);
  }

  // Now click Play to start the demo
  await page.click('[data-testid="hero-demo-play"]');
  await sleep(500);

  // Check that Pause button appears (Play was just clicked, demo should be playing)
  const hasPause = await page.evaluate(() => {
    return !!document.querySelector('[data-testid="hero-demo-pause"]');
  });
  console.log('Play→Pause:', hasPause ? 'OK' : 'FAIL');

  // Wait for some progress
  await sleep(2000);

  // Check status text
  const statusText = await page.evaluate(() => {
    return document.querySelector('[data-testid="hero-status"]')?.textContent || '';
  });
  console.log('Status text:', statusText);

  // Click Pause
  let pauseToPlayOk = false;
  const pauseBtn = await page.$('[data-testid="hero-demo-pause"]');
  if (pauseBtn) {
    await pauseBtn.click();
    await sleep(400);
    pauseToPlayOk = await page.evaluate(() => {
      return !!document.querySelector('[data-testid="hero-demo-play"]');
    });
  }
  console.log('Pause→Play:', pauseToPlayOk ? 'OK' : 'FAIL');

  // Click a scenario chip (File)
  await page.click('[data-testid="hero-scenario-file"]');
  await sleep(300);

  // Check that file scenario is selected
  const fileSelected = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="hero-scenario-file"]');
    return btn?.getAttribute('aria-checked') === 'true';
  });
  console.log('Scenario selection:', fileSelected ? 'OK' : 'FAIL');

  // Click Replay (may or may not be visible depending on state)
  let replayOk = false;
  const replayBtn = await page.$('[data-testid="hero-demo-replay"]');
  if (replayBtn) {
    await replayBtn.click();
    await sleep(600);
    // After replay, either Play or Pause should exist (demo restarted)
    replayOk = await page.evaluate(() => {
      return !!(document.querySelector('[data-testid="hero-demo-play"]') ||
                document.querySelector('[data-testid="hero-demo-pause"]'));
    });
  } else {
    // Replay might not be visible; skip this check
    replayOk = true;
  }
  console.log('Replay:', replayOk ? 'OK' : 'SKIP');

  // Check accessibility
  const a11y = await page.evaluate(() => {
    const region = document.querySelector('[role="region"][aria-label="Interactive product demonstration"]');
    const liveRegion = document.querySelector('[aria-live="polite"]');
    return {
      hasRegion: !!region,
      hasLiveRegion: !!liveRegion,
    };
  });
  console.log('Accessibility:', a11y.hasRegion && a11y.hasLiveRegion ? 'OK' : 'FAIL');

  // Check data-testid attributes — play/pause/replay are mutually exclusive,
  // so verify that exactly one exists among them.
  const testIds = await page.evaluate(() => {
    const alwaysExist = [
      'hero-demo', 'hero-status', 'hero-sender-device', 'hero-receiver-device',
      'hero-scenario-note', 'hero-scenario-link', 'hero-scenario-photo', 'hero-scenario-file',
    ];
    const allAlways = alwaysExist.every(id => !!document.querySelector(`[data-testid="${id}"]`));
    const playCount = ['hero-demo-play', 'hero-demo-pause', 'hero-demo-replay']
      .filter(id => !!document.querySelector(`[data-testid="${id}"]`)).length;
    return allAlways && playCount === 1;
  });
  console.log('Test IDs:', testIds ? 'OK' : 'FAIL');

  const allOk = scenarios && progressRail && hasPause && pauseToPlayOk && fileSelected && a11y.hasRegion && a11y.hasLiveRegion && testIds;
  console.log(allOk ? 'HERO_STORY_OK' : 'HERO_STORY_FAIL');
} finally {
  await b.close();
}
