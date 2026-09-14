const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');

test('v10 extension chain loads v13 account ownership runtime and UI after v12', () => {
  const v10 = read('v10-booking.js');
  assert.match(v10, /v13\.src=['"]v13-account\.js['"]/, 'v10 should load v13 account runtime');
  assert.match(v10, /v13Ui\.src=['"]v13-ui\.js['"]/, 'v10 should load v13 account UI');
  assert.ok(v10.indexOf("v12Ui.src='v12-ui.js'") < v10.indexOf("v13.src='v13-account.js'"), 'v13 should load after v12');
});

test('v13 account API uses secure cookie sessions and server-side password hashing', () => {
  const api = read('api/account.js');
  const store = read('lib/account-store.js');
  assert.match(api, /schemaVersion: 'v13'/, 'account endpoint should expose v13 schema');
  assert.match(api, /account-ownership-resource/, 'account endpoint should expose ownership resource');
  assert.match(store, /scryptSync/, 'passwords should be hashed with scrypt');
  assert.match(store, /HttpOnly/, 'session cookie should be HttpOnly');
  assert.match(store, /Secure/, 'session cookie should be Secure');
  assert.match(store, /SameSite=Lax/, 'session cookie should use SameSite=Lax');
  assert.match(store, /mosigo\/account-sessions\//, 'server should persist session records by token hash path');
  assert.doesNotMatch(api, /passwordHash\s*:/, 'API response code should not expose password hashes');
  assert.doesNotThrow(() => new Function(api), 'account API should be syntax-valid');
  assert.doesNotThrow(() => new Function(store), 'account store should be syntax-valid');
});

test('v13 browser runtime keeps authentication in HttpOnly cookies rather than Web Storage', () => {
  const runtime = read('v13-account.js');
  assert.match(runtime, /credentials:'same-origin'/, 'v13 requests should include same-origin cookies');
  assert.match(runtime, /MosigoV13AccountOwnership/, 'v13 account facade should exist');
  assert.match(runtime, /claim-booking/, 'v13 should support claiming durable bookings');
  assert.match(runtime, /\?resource=bookings/, 'v13 should list account-owned bookings');
  assert.doesNotMatch(runtime, /localStorage/, 'account session should not be persisted in localStorage');
  assert.doesNotMatch(runtime, /sessionStorage/, 'account session should not be persisted in sessionStorage');
  assert.doesNotThrow(() => new Function(runtime), 'v13 browser runtime should be syntax-valid');
});

test('v13 UI exposes login, owned booking list, claim, and integrated share management', () => {
  const ui = read('v13-ui.js');
  assert.match(ui, /계정 로그인 · 예약 이어보기/, 'landing should expose account login entry');
  assert.match(ui, /내 예약 보기/, 'settings should expose owned booking list');
  assert.match(ui, /현재 예약을 내 계정에 연결/, 'existing durable booking should be claimable');
  assert.match(ui, /1시간 공유/, 'owned booking list should manage secure sharing');
  assert.match(ui, /공유 폐기/, 'owned booking list should support share revocation');
  assert.match(ui, /textContent/, 'dynamic booking content should be rendered with textContent');
  assert.doesNotThrow(() => new Function(ui), 'v13 UI should be syntax-valid');
});

test('v12 secure sharing accepts v13 account owner access without exposing session tokens to JS', () => {
  const sharing = read('v12-sharing.js');
  assert.match(sharing, /setOwnerAccessProvider/, 'v12 sharing should accept an account owner access provider');
  assert.match(sharing, /accountOwnerAccess/, 'v12 sharing should recognize account-owned bookings');
  assert.match(sharing, /credentials:'same-origin'/, 'share management should rely on same-origin account cookies');
  assert.doesNotMatch(sharing, /mosigo_v13_session/, 'v12 JS should never read the HttpOnly account cookie');
});
