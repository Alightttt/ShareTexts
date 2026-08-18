import { launchBrowser, URL, sleep } from './lib.mjs';

// Verify the interactive hero's full state story: click Play → scenario chips →
// progress rail → pause/play → replay. The new LiveBridgeDemo is a state machine
// with Play/Pause/Replay controls and scenario selection.
const b = await launchBrowser();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.locator('text=Move anything between your devices').first().waitFor({ timeout: 15000 });

  // Wait for the LiveBridgeDemo to appear
  let ready = false;
  for (let i = 0; i < 30; i++) {
    ready = await page.evaluate(() => {
      const demo = document.querySelector('[data-testid="hero-demo"]');
      const playBtn = document.querySelector('[data-testid="hero-demo-play"]');
      return !!demo && !!playBtn;
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

  // Click Play button
  await page.click('[data-testid="hero-demo-play"]');
  await sleep(500);

  // Check that Pause button appears
  const hasPause = await page.evaluate(() => {
    return !!document.querySelector('[data-testid="hero-demo-pause"]');
  });
  console.log('Play/Pause:', hasPause ? 'OK' : 'FAIL');

  // Wait for some progress
  await sleep(2000);

  // Check status text
  const statusText = await page.evaluate(() => {
    return document.querySelector('[data-testid="hero-status"]')?.textContent || '';
  });
  console.log('Status text:', statusText);

  // Click Pause
  const pauseBtn = await page.$('[data-testid="hero-demo-pause"]');
  if (pauseBtn) {
    await pauseBtn.click();
    await sleep(300);
    const hasPlay = await page.evaluate(() => {
      return !!document.querySelector('[data-testid="hero-demo-play"]');
    });
    console.log('Pause/Play:', hasPlay ? 'OK' : 'FAIL');
  }

  // Click a scenario chip (File)
  await page.click('[data-testid="hero-scenario-file"]');
  await sleep(300);

  // Check that file scenario is selected
  const fileSelected = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="hero-scenario-file"]');
    return btn?.getAttribute('aria-checked') === 'true';
  });
  console.log('Scenario selection:', fileSelected ? 'OK' : 'FAIL');

  // Click Replay
  const replayBtn = await page.$('[data-testid="hero-demo-replay"]');
  if (replayBtn) {
    await replayBtn.click();
    await sleep(500);
    const hasPlay = await page.evaluate(() => {
      return !!document.querySelector('[data-testid="hero-demo-play"]');
    });
    console.log('Replay:', hasPlay ? 'OK' : 'FAIL');
  }

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

  // Check data-testid attributes
  const testIds = await page.evaluate(() => {
    const ids = [
      'hero-demo', 'hero-status', 'hero-sender-device', 'hero-receiver-device',
      'hero-demo-play', 'hero-demo-pause', 'hero-demo-replay',
      'hero-scenario-note', 'hero-scenario-link', 'hero-scenario-photo', 'hero-scenario-file',
    ];
    return ids.every(id => !!document.querySelector(`[data-testid="${id}"]`));
  });
  console.log('Test IDs:', testIds ? 'OK' : 'FAIL');

  const allOk = scenarios && progressRail && hasPause && fileSelected && a11y.hasRegion && a11y.hasLiveRegion && testIds;
  console.log(allOk ? 'HERO_STORY_OK' : 'HERO_STORY_FAIL');
} finally {
  await b.close();
}
