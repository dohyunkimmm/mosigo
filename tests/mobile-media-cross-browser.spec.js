const { test, expect } = require('@playwright/test');

// Browser emulation, not a claim about real iOS/Android hardware or cellular networks.
test('mobile game defers every MP4 until a user starts playing', async ({ page }) => {
  const mediaRequests = [];
  page.on('request', (req) => {
    if (/\.mp4(?:\?|$)/i.test(req.url())) mediaRequests.push(req.url());
  });
  await page.goto('/new_game.html?win=0', { waitUntil: 'load' });
  await expect(page.locator('#g-cast')).toHaveAttribute('aria-label', '낚시대 던지기');
  for (const id of ['g-bg2', 'g-bg3', 'g-bg4']) {
    await expect(page.locator('#' + id)).toHaveAttribute('preload', 'none');
    await expect(page.locator('#' + id)).toHaveAttribute('playsinline', '');
    await expect(page.locator('#' + id)).toHaveAttribute('data-src', /\.mp4$/);
    await expect(page.locator('#' + id)).not.toHaveAttribute('src', /.+/);
  }
  await expect(page.locator('video.g-result-art')).toHaveAttribute('data-src', /\.mp4$/);
  await expect(page.locator('video.g-result-art')).not.toHaveAttribute('src', /.+/);
  await page.waitForTimeout(650);
  expect(mediaRequests).toEqual([]);
});

test('broken video downloads recover to an actionable state and allow retry', async ({ page }) => {
  let blockedMedia = 0;
  await page.route(/\.mp4(?:\?|$)/i, route => {
    blockedMedia += 1;
    return route.abort('failed');
  });
  await page.goto('/new_game.html?win=0');
  await page.locator('#g-cast').click();
  await expect(page.locator('#g-bg2')).toHaveAttribute('src', /game2\.mp4$/);
  await expect(page.locator('#g-bg3')).not.toHaveAttribute('src', /.+/);
  await expect(page.locator('#g-cast')).toHaveAttribute('aria-label', '잡은 것 확인하기', { timeout: 7000 });
  await page.locator('#g-cast').click();
  await expect(page.locator('#g-result')).toBeVisible({ timeout: 14000 });
  await expect(page.locator('#g-rbtn-primary')).toHaveText('다시 도전하기');
  await page.locator('#g-rbtn-primary').click();
  await expect(page.locator('#g-cast')).toHaveAttribute('aria-label', '낚시대 던지기');
  await expect(page.locator('#g-result')).toBeHidden();
  expect(blockedMedia).toBeGreaterThan(0);
});


test('video retry fetches media again after a simulated network outage', async ({page}) => {
  let unavailable = true;
  let failedRequests = 0;
  let recoveredRequests = 0;
  await page.route(/\.mp4(?:\?|$)/i, route => {
    if (unavailable) {
      failedRequests += 1;
      return route.abort('failed');
    }
    recoveredRequests += 1;
    return route.continue();
  });
  await page.goto('/new_game.html?win=0');
  await page.locator('#g-cast').click();
  await expect(page.locator('#g-bg2')).toHaveAttribute('src', /game2\.mp4$/);
  await expect.poll(() => failedRequests).toBeGreaterThan(0);
  await expect(page.locator('#g-cast')).toHaveAttribute('aria-label', '잡은 것 확인하기', {timeout:7000});
  await page.evaluate(() => onRetry());
  await expect(page.locator('#g-bg2')).not.toHaveAttribute('src', /.+/);
  await expect(page.locator('#g-cast')).toHaveAttribute('aria-label', '낚시대 던지기');
  unavailable = false;
  await page.locator('#g-cast').click();
  await expect.poll(() => recoveredRequests, {timeout:7000}).toBeGreaterThan(0);
  await expect(page.locator('#g-bg2')).toHaveAttribute('src', /game2\.mp4$/);
});


test('leaving a failed media session and re-entering never preloads video', async ({page}) => {
  let unavailable = true, firstFailures = 0, recoveredRequests = 0;
  await page.route(/\.mp4(?:\?|$)/i, route => {
    if (unavailable) {
      firstFailures++;
      return route.abort('failed');
    }
    recoveredRequests++;
    return route.continue();
  });
  await page.goto('/new_game.html?win=0');
  await page.locator('#g-cast').click();
  await expect.poll(() => firstFailures).toBeGreaterThan(0);
  // Navigate away mid-game, as when a mobile user leaves the game screen.
  await page.goto('/new_event.html');
  unavailable = false;
  await page.goto('/new_game.html?win=0');
  for (const id of ['g-bg2','g-bg3','g-bg4']) {
    await expect(page.locator('#' + id)).not.toHaveAttribute('src', /.+/);
  }
  await expect(page.locator('#g-cast')).toHaveAttribute('aria-label','낚시대 던지기');
  await page.waitForTimeout(300);
  expect(recoveredRequests).toBe(0);
  await page.locator('#g-cast').click();
  await expect.poll(() => recoveredRequests, {timeout:7000}).toBeGreaterThan(0);
});


test('returning from a backgrounded video requires a fresh user tap', async ({page}) => {
  let unavailable = true, failedRequests = 0, retriedRequests = 0;
  await page.route(/\.mp4(?:\?|$)/i, route => {
    if (unavailable) {
      failedRequests++;
      return route.abort('failed');
    }
    retriedRequests++;
    return route.continue();
  });
  await page.goto('/new_game.html?win=0');
  await page.locator('#g-cast').click();
  await expect.poll(() => failedRequests).toBeGreaterThan(0);
  // Deterministic lifecycle event emulation, NOT a physical iPhone/Android
  // background test; real devices can suspend timers and media differently.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable:true, get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#g-bg2')).toHaveJSProperty('paused', true);
  await expect(page.locator('#g-bg2')).toHaveAttribute('src', /game2\.mp4$/);
  unavailable = false;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {configurable:true, get:()=>false});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#g-cast')).toHaveAttribute('aria-label','낚시대 던지기');
  await expect(page.locator('#g-bg2')).not.toHaveAttribute('src', /.+/);
  await expect(page.locator('#g-result')).toBeHidden();
  expect(retriedRequests).toBe(0);
  await page.locator('#g-cast').click();
  await expect.poll(() => retriedRequests, {timeout:7000}).toBeGreaterThan(0);
});

test('BFCache pagehide/pageshow does not skip an unfinished video', async ({page}) => {
  await page.route(/\.mp4(?:\?|$)/i, route => route.abort('failed'));
  await page.goto('/new_game.html?win=0');
  await page.locator('#g-cast').click();
  await expect(page.locator('#g-bg2')).toHaveAttribute('src', /game2\.mp4$/);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
  });
  await expect(page.locator('#g-cast')).toHaveAttribute('aria-label','낚시대 던지기');
  await expect(page.locator('#g-bg2')).not.toHaveAttribute('src', /.+/);
  await expect(page.locator('#g-result')).toBeHidden();
});
