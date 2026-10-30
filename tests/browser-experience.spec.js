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
      window.__mosigoReportedDirectives.push(event.disposition + ':' + event.effectiveDirective);
    });
  });
  for (const path of ['/', '/ops.html', '/ops-preview.html', '/new_event.html', '/new_game.html?win=0']) {
    const response = await page.goto(path, {waitUntil:'domcontentloaded'});
    expect(response?.status(), `${path}: HTML response`).toBe(200);
    const headers = await response.headers();
    expect(headers['content-security-policy-report-only'], `${path}: report-only policy`).toContain("default-src 'self'");
    if (['/ops.html','/ops-preview.html','/new_event.html','/new_game.html?win=0'].includes(path)) {
      expect(headers['content-security-policy'], `${path}: enforced policy`).toContain("script-src 'self'");
      expect(headers['content-security-policy'], `${path}: no inline event handlers`).toContain("script-src-attr 'none'");
    } else {
      expect(headers['content-security-policy'], `${path}: blocking policy is unapproved`).toBeUndefined();
    }
    await page.waitForTimeout(250);
    const directives = await page.evaluate(() => window.__mosigoReportedDirectives);
    expect(directives, `${path}: unexpected report-only policy violations`).toEqual([]);
  }
});


test('embedded event can advance to game under enforced scoped CSP', async ({page}) => {
  await page.goto('/');
  await page.waitForFunction(() => typeof window.openExtPage === 'function');
  await page.evaluate(() => window.openExtPage('event'));
  await expect(page.locator('.ext-host')).toHaveClass(/is-open/);
  await page.frameLocator('.ext-host iframe.is-live').locator('.fish-cta').click();
  await expect(page.frameLocator('.ext-host iframe.is-live').locator('#g-cast')).toHaveAttribute('aria-label','낚시대 던지기');
  await page.frameLocator('.ext-host iframe.is-live').locator('#g-cast').click();
  await expect(page.frameLocator('.ext-host iframe.is-live').locator('#g-cast')).toBeHidden();
});


test('department search matches specific specialties and never broadens unknown filters',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>typeof window.pickDept==='function');
  const codes=await page.evaluate(()=>[
    detectDeptCode('정형외과'),detectDeptCode('외과'),detectDeptCode('정형외과 전문'),
    detectDeptCode('가정의학과')
  ]);
  expect(codes).toEqual(['D006','D005','D006','']);
  await page.evaluate(()=>pickDept('가정의학과'));
  await expect(page.locator('#hospmap-list')).toContainText('검색 결과가 없습니다');
});

test('hospital detail discloses example status and tabs navigate existing sections',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    hospitalCache=[FALLBACK_HOSPITALS[0]];
    openHospDetail(0);
  });
  await expect(page.locator('#hd-open')).toHaveText('실시간 진료 여부 미확인');
  await expect(page.locator('#hd-notice')).toContainText('시연용 공지');
  await expect(page.locator('#hd-hours')).toContainText('예시');
  await expect(page.locator('#hd-revs')).toContainText('가상 후기 예시');
  await page.locator('#hd-tabs .hd-tab').nth(2).click();
  await expect(page.locator('#hd-tabs .hd-tab').nth(2)).toHaveClass(/on/);
  await expect.poll(()=>page.locator('#hd-scroll').evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
  await page.locator('#hd-tabs .hd-tab').first().click();
  await expect.poll(()=>page.locator('#hd-scroll').evaluate(node=>node.scrollTop)).toBeLessThan(10);
});

test('rapid hospital searches ignore an older response arriving last',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>typeof window.siTypeFetch==='function');
  const result=await page.evaluate(async()=>{
    const original=searchHospitals;
    const pending=[];
    searchHospitals=()=>new Promise(resolve=>pending.push(resolve));
    const input=document.getElementById('si-input');
    input.value='안과';
    const first=siTypeFetch();
    input.value='내과';
    const second=siTypeFetch();
    pending[1]([FALLBACK_HOSPITALS[0]]);
    await second;
    pending[0]([FALLBACK_HOSPITALS[4]]);
    await first;
    searchHospitals=original;
    return {names:hospitalCache.map(h=>h.name),text:document.getElementById('si-suggest').textContent};
  });
  expect(result.names).toEqual(['똑똑연세내과의원']);
  expect(result.text).toContain('똑똑연세내과의원');
  expect(result.text).not.toContain('향남밝은안과의원');
});

test('recent searches are session-scoped and demo rankings have no fake live time',async({page})=>{
  await page.goto('/');
  await page.evaluate(()=>{
    rememberSearchQuery('정형외과');
    rememberSearchQuery('내과');
    renderRecents();
    renderRanks();
  });
  await expect(page.locator('#si-recents')).toContainText('내과');
  await expect(page.locator('#si-rank-time')).toContainText('실시간 통계 아님');
  const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('mosigo-search-recents-session')));
  expect(stored).toEqual(['내과','정형외과']);
  await page.evaluate(()=>clearRecents());
  await expect(page.locator('#si-recents')).toContainText('최근 검색어가 없습니다');
});

test('missing Leaflet CDN shows readable fallback rather than a silent empty map',async({page})=>{
  await page.route('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',route=>route.abort());
  await page.goto('/');
  await expect(page.locator('#map-search .mosigo-map-unavailable')).toContainText('배경지도를 불러오지 못했습니다');
  await expect(page.locator('#map-hosp .mosigo-map-unavailable')).toHaveCount(1);
});
