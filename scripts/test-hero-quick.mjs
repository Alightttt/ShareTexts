import { launchBrowser, URL, sleep } from './lib.mjs';

const b = await launchBrowser();
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
  await sleep(2000);

  // Check for hero demo
  const hasDemo = await page.evaluate(() => {
    return !!document.querySelector('[data-testid="hero-demo"]');
  });
  console.log('Hero demo found:', hasDemo);

  // Check for Play button
  const hasPlay = await page.evaluate(() => {
    return !!document.querySelector('[data-testid="hero-demo-play"]');
  });
  console.log('Play button found:', hasPlay);

  // Check for scenario chips
  const hasScenarios = await page.evaluate(() => {
    return ['note', 'link', 'photo', 'file'].every(key => 
      !!document.querySelector(`[data-testid="hero-scenario-${key}"]`)
    );
  });
  console.log('Scenario chips found:', hasScenarios);

  // Check for progress rail
  const hasProgress = await page.evaluate(() => {
    return !!document.querySelector('[aria-label="Go to Pair step"]');
  });
  console.log('Progress rail found:', hasProgress);

  // Check page title
  const title = await page.title();
  console.log('Page title:', title);

  console.log('QUICK_TEST_OK');
} finally {
  await b.close();
}
