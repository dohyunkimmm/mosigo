const { test, expect } = require('@playwright/test');
test.use({viewport:{width:390,height:844}});
test('mobile onboarding leads to an explicit service task',async({page})=>{
 await page.goto('/');
 await expect(page.locator('#s-onboard')).toHaveClass(/active/);
 await expect(page.locator('#s-onboard .ob-demo-btn')).toBeVisible();
 await page.evaluate(()=>tabTo('s-home'));
 await expect(page.locator('#s-home .mosigo-home-task')).toBeVisible();
 await expect(page.getByRole('button',{name:/병원동행 신청 시작/})).toBeVisible();
 await expect(page.locator('#s-home .mosigo-home-cta')).toHaveCSS('min-height','46px');
});
test('simulated actions disclose that no real operation occurred',async({page})=>{
 await page.goto('/');
 await page.waitForFunction(()=>typeof window.showPrototypeNotice==='function');
 await page.evaluate(()=>showPrototypeNotice('쿠폰을 받았어요'));
 await expect(page.locator('#toast')).toContainText('실제 처리');
 await expect(page.locator('#toast')).toContainText('시연');
});
test('manager comparison shows examples without actual allocation',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{renderMgrProfile(0);tabTo('s-mgr')});
 await page.locator('.mosigo-compare-trigger').click();
 const modal=page.locator('#mosigo-manager-compare');
 await expect(modal).toBeVisible();
 await expect(modal.locator('.mosigo-compare-card')).toHaveCount(3);
 await expect(modal).toContainText('예시');
 await page.getByRole('button',{name:'비교 닫기'}).click();
 await expect(modal).not.toBeVisible();
});
test('health report clearly states sample medical data',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>tabTo('s-report'));
 await expect(page.locator('#s-report .mosigo-report-orientation')).toContainText('프로토타입 예시');
 await expect(page.locator('#s-report .mosigo-inline-action')).toContainText('시연');
});
test('Operations sample is searchable, filterable, and read-only',async({page})=>{
 await page.goto('/ops-preview.html');
 await expect(page.locator('.ops-preview-banner')).toContainText('읽기 전용');
 await page.locator('.ops-nav [data-sample-tab="bookings"]').click();
 await expect(page.locator('#sample-bookings .ops-preview-item')).toHaveCount(3);
 await page.locator('#sample-query').fill('정형외과');
 await expect(page.locator('#sample-bookings .ops-preview-item')).toHaveCount(1);
 await page.locator('#sample-query').fill('');
 await page.locator('[data-sample-filter="past"]').click();
 await expect(page.locator('#sample-bookings .ops-preview-item')).toHaveCount(1);
 await page.locator('#sample-bookings button').click();
 await expect(page.locator('#sample-detail')).toBeVisible();
 await expect(page.locator('#sample-detail')).toContainText('예시 정보입니다');
});
test('Operations layout fits 320px without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:320,height:844});
 await page.goto('/ops.html');
 const width=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
 expect(width).toBeLessThanOrEqual(1);
 await expect(page.locator('.ops-preview-entry')).toBeVisible();
});

// Verify the full role-based module chain loads without intercepting DOM methods.
test('booking, recovery, sharing and account modules load through current paths',async({page})=>{
 await page.goto('/');
 await page.waitForFunction(()=>Boolean(window.MosigoV13AccountOwnership && window.MosigoV12SecureSharing && window.MosigoV10BookingDurability));
 const urls=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(node=>new URL(node.src).pathname));
 for(const path of ['/runtime/hospital-search.js','/runtime/booking-durable.js','/runtime/booking-sharing.js','/runtime/account-ownership.js']){
   expect(urls).toContain(path);
 }
 expect(urls.some(path=>/^\/v(?:4|6|7|8|9|10|11|12|13)[-.]/.test(path))).toBe(false);
 await expect(page.locator('link[href="/runtime/account-ui.css"]')).toHaveCount(1);
});

test('demo guide opens, ignores sheet clicks and resets from delegated controls',async({page})=>{
 await page.goto('/');
 await page.waitForFunction(()=>typeof window.openDemoGuide==='function');
 const opener=page.locator('#open-demo-guide');
 const guide=page.locator('#modal-demo-guide');
 await opener.click();
 await expect(guide).toHaveClass(/show/);
 await guide.locator('.demo-guide-sheet').click({position:{x:25,y:25}});
 await expect(guide).toHaveClass(/show/);
 await guide.getByRole('button',{name:'데모 가이드 닫기'}).click();
 await expect(guide).not.toHaveClass(/show/);
 await opener.click();
 await guide.locator('.demo-guide-reset').click();
 await expect(guide).not.toHaveClass(/show/);
 await expect(page.locator('#s-onboard')).toHaveClass(/active/);
});
test('guide routes and completion dialog work without inline event handlers',async({page})=>{
 await page.goto('/');
 await page.waitForFunction(()=>typeof window.demoJump==='function');
 const guide=page.locator('#modal-demo-guide');
 await page.locator('#open-demo-guide').click();
 await guide.locator('.demo-route').first().click();
 await expect(guide).not.toHaveClass(/show/);
 await page.evaluate(()=>openDemoComplete());
 const complete=page.locator('#modal-demo-complete');
 await expect(complete).toHaveClass(/show/);
 await complete.locator('.demo-complete-link').click();
 await expect(complete).not.toHaveClass(/show/);
 await expect(guide).toHaveClass(/show/);
});


test('mobile game does not eagerly download MP4 before the first action', async ({ page }) => {
 const mediaRequests = [];
 page.on('request', request => {
  if (/\.mp4(?:\?|$)/.test(request.url())) mediaRequests.push(request.url());
 });
 await page.goto('/new_game.html?win=0');
 await expect(page.locator('#g-cast')).toHaveAttribute('aria-label', '낚시대 던지기');
 for (const id of ['g-bg2', 'g-bg3', 'g-bg4']) {
  await expect(page.locator('#' + id)).toHaveAttribute('preload', 'none');
 }
 await page.waitForTimeout(800);
 expect(mediaRequests).toEqual([]);
});

test('mobile game remains recoverable when video requests fail', async ({ page }) => {
 await page.route(/\.mp4(?:\?|$)/, route => route.abort('failed'));
 await page.goto('/new_game.html?win=0');
 await page.locator('#g-cast').click();
 await expect(page.locator('#g-cast')).toBeHidden();
 // Media failure must not trap the user in the rolling state.
 await expect(page.locator('#g-cast')).toHaveAttribute('aria-label', '잡은 것 확인하기', { timeout: 7000 });
 await page.evaluate(() => onRetry());
 await expect(page.locator('#g-cast')).toHaveAttribute('aria-label', '낚시대 던지기');
 await expect(page.locator('#g-result')).toBeHidden();
 await expect(page.locator('#g-bg1')).toHaveClass(/is-on/);
});


test('share participant status follows server capability while retaining the edit default', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    globalThis.MosigoV12SecureSharingUi &&
    globalThis.MosigoV12SecureSharing &&
    globalThis.MosigoV10BookingDurability
  ));
  await page.evaluate(() => {
    globalThis.MosigoV12SecureSharing.getState = () => ({ bookingId: 'M10ABCD1234' });
    globalThis.MosigoV12SecureSharing.hasOwnerAccess = () => false;
    globalThis.MosigoV6BookingSync.getShareToken = () => 'test_share_token';
    globalThis.MosigoV10BookingDurability.getCapability = () => ({ shareParticipantWriteAccess: 'read-only' });
    globalThis.MosigoV12SecureSharingUi.refresh();
  });
  const status = page.locator('#v12-share-status');
  await expect(status).toContainText('열람 전용');
  await expect(status).toContainText('소유자');
  const cancel = page.locator('#order-cancel-btn');
  await expect(cancel).toBeHidden();
  await expect(cancel).toBeDisabled();
  await page.evaluate(() => {
    globalThis.MosigoV10BookingDurability.getCapability = () => ({ shareParticipantWriteAccess: 'edit' });
    globalThis.MosigoV12SecureSharingUi.refresh();
  });
  await expect(status).toContainText('임시 접근 중');
  await expect(status).not.toContainText('열람 전용');
  await expect(cancel).toBeEnabled();
  await expect(cancel).not.toHaveAttribute('hidden');
});


test('read-only share holders cannot activate booking mutation controls until edit capability arrives', async ({page}) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    globalThis.MosigoV12SecureSharingUi && globalThis.MosigoV12SecureSharing &&
    globalThis.MosigoV10BookingDurability && globalThis.MosigoV6BookingSync
  ));
  await page.evaluate(() => {
    globalThis.MosigoV12SecureSharing.getState=()=>({bookingId:'M10ABCD1234'});
    globalThis.MosigoV12SecureSharing.hasOwnerAccess=()=>false;
    globalThis.MosigoV6BookingSync.getShareToken=()=> 'test-share-token';
    globalThis.MosigoV10BookingDurability.getCapability=()=>null;
    globalThis.MosigoV12SecureSharingUi.refresh();
  });
  const actions=[
    page.locator('#order-cancel-btn'),
    page.locator('#modal-bk-cancel .dlg-btn.danger'),
    page.locator('button[onclick="completeReturn()"]')
  ];
  for(const action of actions){
    await expect(action).toBeDisabled();
    await expect(action).toHaveAttribute('hidden','');
  }
  await expect(page.locator('#v12-share-status')).toContainText('권한 확인 중');

  await page.evaluate(()=>{
    globalThis.MosigoV10BookingDurability.getCapability=()=>({shareParticipantWriteAccess:'read-only'});
    window.dispatchEvent(new Event('mosigo:booking-capability'));
  });
  for(const action of actions) await expect(action).toBeDisabled();
  await expect(page.locator('#v12-share-status')).toContainText('열람 전용');

  await page.evaluate(()=>{
    globalThis.MosigoV10BookingDurability.getCapability=()=>({shareParticipantWriteAccess:'edit'});
    window.dispatchEvent(new Event('mosigo:booking-capability'));
  });
  for(const action of actions){
    await expect(action).toBeEnabled();
    await expect(action).not.toHaveAttribute('hidden');
  }
  await expect(page.locator('#v12-share-status')).toContainText('임시 접근 중');

  await page.evaluate(()=>{
    globalThis.MosigoV10BookingDurability.getCapability=()=>({shareParticipantWriteAccess:'read-only'});
    globalThis.MosigoV12SecureSharing.hasOwnerAccess=()=>true;
    globalThis.MosigoV12SecureSharingUi.refresh();
  });
  for(const action of actions) await expect(action).toBeEnabled();
});

test('a view-only share does not optimistically cancel the local booking', async ({page}) => {
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    globalThis.MosigoV12SecureSharing && globalThis.MosigoV10BookingDurability &&
    globalThis.MosigoV6BookingSync && globalThis.v4BookingState
  ));
  const unchanged=await page.evaluate(()=>{
    const id='M10ABCD1234';
    globalThis.MosigoV6BookingSync.hydrate({bookingId:id, phase:'requesting', revision:1});
    globalThis.MosigoV6BookingSync.setShareToken(id,'test-share-token');
    globalThis.MosigoV12SecureSharing.hasOwnerAccess=()=>false;
    globalThis.MosigoV10BookingDurability.getCapability=()=>({shareParticipantWriteAccess:'read-only'});
    const before=JSON.stringify(globalThis.v4BookingState);
    confirmBkCancel();
    return before===JSON.stringify(globalThis.v4BookingState);
  });
  expect(unchanged).toBe(true);
});


test('CSP report-only is visible on real page journeys without new policy violations', async ({page}) => {
  // Persist only directive names, never blocked URLs or tokens from event details.
  await page.addInitScript(() => {
    window.__mosigoReportedDirectives = [];
    document.addEventListener('securitypolicyviolation', event => {
      if (event.disposition === 'report') window.__mosigoReportedDirectives.push(event.effectiveDirective);
    });
  });
  for (const path of ['/', '/ops.html', '/new_game.html?win=0']) {
    const response = await page.goto(path, {waitUntil:'domcontentloaded'});
    expect(response?.status(), `${path}: HTML response`).toBe(200);
    const headers = await response.headers();
    expect(headers['content-security-policy-report-only'], `${path}: report-only policy`).toContain("default-src 'self'");
    expect(headers['content-security-policy'], `${path}: blocking policy is unapproved`).toBeUndefined();
    await page.waitForTimeout(250);
    const directives = await page.evaluate(() => window.__mosigoReportedDirectives);
    expect(directives, `${path}: unexpected report-only policy violations`).toEqual([]);
  }
});
