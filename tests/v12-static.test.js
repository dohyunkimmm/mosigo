const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');

test('v10 extension chain loads v12 secure sharing runtime and UI', () => {
  const v10 = read('v10-booking.js');
  assert.match(v10, /v12\.src=['"]v12-sharing\.js['"]/, 'v10 should load the v12 sharing runtime');
  assert.match(v10, /v12Ui\.src=['"]v12-ui\.js['"]/, 'v10 should load the v12 sharing UI');
});

test('v12 secure sharing uses fragment transport, server validation, redaction, and copy rollback', () => {
  const v12 = read('v12-sharing.js');
  assert.match(v12, /#mosigo-share=/, 'v12 should define a secure-share fragment');
  assert.match(v12, /history\?\.replaceState/, 'v12 should redact the share fragment from browser history');
  assert.match(v12, /X-Mosigo-Share-Token/, 'v12 should send share tokens in a request header');
  assert.match(v12, /\/api\/booking-shares/, 'v12 should use the secure booking-share endpoint');
  assert.match(v12, /rollbackIssuedShare/, 'v12 should revoke a newly issued share when delivery fails');
  assert.match(v12, /execCommand\('copy'\)/, 'v12 should retain a browser fallback for clipboard delivery');
  assert.doesNotMatch(v12, /\?shareToken=/, 'v12 must not place share tokens in query parameters');
  assert.doesNotThrow(() => new Function(v12), 'v12 secure sharing runtime should be syntax-valid');
});

test('v6 sync accepts temporary v12 share access without persisting it as a durable recovery key', () => {
  const v6 = read('v6-booking.js');
  assert.match(v6, /mosigo-v12-share-token:/, 'v6 should namespace temporary share tokens');
  assert.match(v6, /sessionStorage\.setItem\(shareKeyName/, 'share tokens should be session-scoped on the recipient device');
  assert.match(v6, /X-Mosigo-Share-Token/, 'v6 lifecycle commands should support share-token authorization');
  assert.doesNotMatch(v6, /localStorage\.setItem\(shareKeyName/, 'share tokens should not be written to localStorage');
});

test('v12 UI separates owner controls from recipient state and aligns visual and DOM order', () => {
  const ui = read('v12-ui.js');
  const v11Ui = read('v11-ui.js');
  assert.match(ui, /안전한 이어보기 링크 복사 \(1시간\)/, 'v12 should expose an expiring share-link action');
  assert.match(ui, /공유 링크 폐기/, 'v12 should expose explicit revocation');
  assert.match(ui, /hasOwnerAccess/, 'v12 UI should gate owner-only controls with the durable owner credential');
  assert.match(ui, /공유받은 예약 · 임시 접근 중/, 'v12 UI should label temporary recipient access');
  assert.match(ui, /removeOwnerActions/, 'v12 UI should remove owner-only controls for recipients');
  assert.match(ui, /applyHomeContentOrder/, 'home priority should be reflected in actual DOM order');
  assert.match(ui, /applySettingsContentOrder/, 'settings priority should be reflected in actual DOM order');
  assert.match(ui, /돌봄 · 참여/, 'care management should be prioritized in settings');
  assert.match(ui, /서비스 설정/, 'service settings should remain ahead of promotional content');
  assert.match(ui, /mosigo:secure-share/, 'v12 UI should react to secure-share state');
  assert.match(v11Ui, /#mosigo-share=/, 'existing recovery modal should accept v12 share links');
  assert.doesNotThrow(() => new Function(ui), 'v12 UI runtime should be syntax-valid');
});
