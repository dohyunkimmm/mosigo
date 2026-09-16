const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'src', 'runtime', 'account-ownership.js'), 'utf8');

function createRuntime() {
  const bookingId = 'M10ABCD1234';
  const booking = { bookingId, revision: 2, hospitalName: '테스트병원', phase: 'confirmed' };
  const calls = [];
  let provider = () => false;
  const sandbox = {
    console: { warn() {} },
    async fetch(url, options = {}) {
      calls.push(['fetch', String(url), options]);
      if (String(url) === '/api/account' && (!options.method || options.method === 'GET')) {
        return { ok:true, status:200, async json(){ return { success:true, authenticated:true, account:{ accountId:'A13ABCDEF0123456789', email:'owner@example.com' }, sessionExpiresAt:'2026-09-22T00:00:00.000Z' }; } };
      }
      if (String(url) === '/api/account?resource=bookings') {
        return { ok:true, status:200, async json(){ return { success:true, account:{ accountId:'A13ABCDEF0123456789', email:'owner@example.com' }, bookings:[booking] }; } };
      }
      if (String(url).startsWith('/api/bookings?bookingId=')) {
        return { ok:true, status:200, async json(){ return { success:true, booking }; } };
      }
      if (String(url) === '/api/account' && options.method === 'POST') {
        const body = JSON.parse(options.body);
        if (body.action === 'claim-booking') return { ok:true, status:200, async json(){ return { success:true, booking }; } };
        return { ok:true, status:200, async json(){ return { success:true, account:{ accountId:'A13ABCDEF0123456789', email:body.email }, sessionExpiresAt:'2026-09-22T00:00:00.000Z' }; } };
      }
      if (String(url) === '/api/account' && options.method === 'DELETE') {
        return { ok:true, status:200, async json(){ return { success:true, authenticated:false }; } };
      }
      throw new Error(`Unexpected fetch ${url}`);
    },
    MosigoV6BookingSync: {
      getState: () => ({ bookingId }),
      getRecoveryKey: () => 'recovery_key_1234567890',
      hydrate(value) { calls.push(['syncHydrate', value.bookingId]); }
    },
    MosigoV10BookingDurability: {
      getRecoveryKey: () => 'recovery_key_1234567890'
    },
    MosigoV4BookingRuntime: {
      hydrate(value) { calls.push(['runtimeHydrate', value.bookingId]); }
    },
    MosigoV12SecureSharing: {
      setOwnerAccessProvider(fn) { provider = fn; },
      async copyShareLink(options) { calls.push(['share', options]); return { link:'https://example/#share' }; },
      async revokeShare(id) { calls.push(['revoke', id]); return { active:false }; },
      async getShareStatus(id) { calls.push(['status', id]); return { active:true }; }
    },
    MosigoV12SecureSharingUi: { refresh(){} },
    setTimeout(fn) { fn(); },
    CustomEvent: class CustomEvent { constructor(type, init){ this.type=type; this.detail=init?.detail; } },
    window: { dispatchEvent(){}, addEventListener(){} },
    goTo(id) { calls.push(['goTo', id]); }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename:'account-ownership.js' });
  return { sandbox, calls, bookingId, booking, getProvider:()=>provider };
}

test('account runtime loads owned bookings and grants secure-sharing owner access by booking membership', async () => {
  assert.doesNotThrow(() => new Function(source));
  const { sandbox, bookingId, getProvider } = createRuntime();
  await sandbox.MosigoV13AccountOwnership.refresh();
  const state = sandbox.MosigoV13AccountOwnership.getState();
  assert.equal(state.authenticated, true);
  assert.equal(state.bookings.length, 1);
  assert.equal(state.bookings[0].bookingId, bookingId);
  assert.equal(getProvider()(bookingId), true);
  assert.equal(sandbox.MosigoV13AccountOwnership.ownsBooking(bookingId), true);
});

test('account runtime opens owned booking through cookie-authenticated canonical endpoint', async () => {
  const { sandbox, calls, bookingId } = createRuntime();
  await sandbox.MosigoV13AccountOwnership.refresh();
  const opened = await sandbox.MosigoV13AccountOwnership.openBooking(bookingId);
  assert.equal(opened.bookingId, bookingId);
  const request = calls.find((call) => call[0] === 'fetch' && call[1].startsWith('/api/bookings?bookingId='));
  assert.equal(request[2].credentials, 'same-origin');
  assert.ok(calls.some((call)=>call[0]==='runtimeHydrate'&&call[1]===bookingId));
  assert.ok(calls.some((call)=>call[0]==='syncHydrate'&&call[1]===bookingId));
  assert.ok(calls.some((call)=>call[0]==='goTo'&&call[1]==='s-order'));
});

test('account runtime delegates share copy/revoke without accessing cookie material', async () => {
  const { sandbox, calls, bookingId } = createRuntime();
  await sandbox.MosigoV13AccountOwnership.refresh();
  await sandbox.MosigoV13AccountOwnership.copyShareLink(bookingId, 60);
  await sandbox.MosigoV13AccountOwnership.revokeShare(bookingId);
  assert.ok(calls.some((call)=>call[0]==='share'&&call[1].bookingId===bookingId));
  assert.ok(calls.some((call)=>call[0]==='revoke'&&call[1]===bookingId));
});
