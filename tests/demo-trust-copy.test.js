const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const html = readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
const app = readFileSync(path.join(__dirname, '..', 'src', 'index-core.js'), 'utf8');
const css = readFileSync(path.join(__dirname, '..', 'src', 'ux-enhancements.css'), 'utf8');

test('payment UI identifies charges as prototype-only', () => {
  assert.match(html, /시연용 · 실제 청구 없음/);
  assert.match(html, /실제 결제·자동 청구가 발생하지 않습니다/);
  assert.match(html, /예시 금액 · 실제 결제 없음/);
  assert.doesNotMatch(html, /> 후불 결제로 진행됩니다</);
});

test('example business information is not presented as a registered operator', () => {
  assert.match(html, /가상 사업자 정보 · 시연용/);
  assert.match(html, /실제 사업자 정보가 아닙니다/);
});

test('companion departure terminology is consistent in labels and feedback', () => {
  assert.match(html, /동행 출발지 입력/);
  assert.match(html, /동행 출발지 관리/);
  assert.match(html, /동행 시간/);
  assert.match(app, /동행 출발지를 저장했어요/);
  assert.doesNotMatch(html, />간병 장소</);
});

test('placeholder promotions and inquiries announce their prototype boundary', () => {
  for (const label of ['적립 이벤트', '미션·쿠폰', '건강 체크리스트', '1:1 문의 접수']) {
    assert.ok(html.includes("showPrototypeNotice('" + label + "')"), label);
  }
});

test('comparison controls have a mobile-friendly target and visible focus', () => {
  assert.match(css, /\.mosigo-compare-card button\{min-height:44px/);
  assert.match(css, /\.mosigo-compare-card button:focus-visible/);
});


test('demo bookings never claim real manager notification or stale August booking dates', () => {
  assert.match(app, /실제 매니저에게 알림은 전송되지 않습니다/);
  assert.match(app, /시연용 매니저 배정 완료/);
  assert.match(app, /getElementById\('home-active-date'\)/);
  assert.match(app, /getElementById\('manager-date-sub'\)/);
  assert.match(app, /getElementById\('confirm-date-sub'\)/);
  assert.match(html, /id="home-active-date"/);
  assert.match(html, /id="manager-date-sub"/);
  assert.match(html, /id="confirm-date-sub"/);
  assert.doesNotMatch(html, /<div class="app-bar-sub">8월 13일 오전 10시/);
});
