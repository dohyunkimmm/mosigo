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
