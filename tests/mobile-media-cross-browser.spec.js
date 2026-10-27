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
  }
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
  await expect(page.locator('#g-cast')).toHaveAttribute('aria-label', '잡은 것 확인하기', { timeout: 7000 });
  await page.locator('#g-cast').click();
  await expect(page.locator('#g-result')).toBeVisible({ timeout: 14000 });
  await expect(page.locator('#g-rbtn-primary')).toHaveText('다시 도전하기');
  await page.locator('#g-rbtn-primary').click();
  await expect(page.locator('#g-cast')).toHaveAttribute('aria-label', '낚시대 던지기');
  await expect(page.locator('#g-result')).toBeHidden();
  expect(blockedMedia).toBeGreaterThan(0);
});
