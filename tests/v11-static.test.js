const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');

test('v10 extension chain loads v11 handoff and UI layers', () => {
  const v10 = read('v10-booking.js');
  assert.match(v10, /v11\.src=['"]v11-booking\.js['"]/, 'v10 should load the v11 handoff runtime');
  assert.match(v10, /v11Ui\.src=['"]v11-ui\.js['"]/, 'v10 should load the v11 portable recovery UI');
});

test('v11 portable recovery keeps handoff data in fragment and redacts it before canonical recovery', () => {
  const v11 = read('v11-booking.js');
  assert.match(v11, /#mosigo-recovery=/, 'v11 should define a recovery fragment');
  assert.match(v11, /history\?\.replaceState/, 'v11 should redact the recovery fragment from browser history');
  assert.match(v11, /durability\.recover\(parsed\.bookingId,parsed\.recoveryKey\)/, 'v11 should delegate to v10 canonical recovery');
  assert.doesNotMatch(v11, /\?recoveryKey=/, 'v11 should not place recovery credentials in URL query parameters');
  assert.doesNotThrow(() => new Function(v11), 'v11 handoff runtime should be syntax-valid');
});

test('v11 UI provides in-app recovery and cross-device sharing entry points', () => {
  const ui = read('v11-ui.js');
  const handoff = read('v11-booking.js');
  assert.match(ui, /다른 기기의 예약 이어보기/, 'v11 should expose a recovery entry point');
  assert.match(ui, /예약 불러오기/, 'v11 should expose an explicit recovery action');
  assert.match(handoff, /다른 기기에서 이어보기 링크 복사/, 'v11 should expose a portable link copy action');
  assert.match(ui, /aria-modal/, 'v11 recovery sheet should expose dialog semantics');
  assert.match(ui, /role=\"alert\"/, 'v11 recovery validation should be announced');
  assert.doesNotThrow(() => new Function(ui), 'v11 UI runtime should be syntax-valid');
});
