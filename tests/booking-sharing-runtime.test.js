const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'src', 'runtime', 'booking-sharing.js'), 'utf8');

function createRuntime({ clipboardFails = false, ownerAccess = true } = {}) {
  const bookingId = 'M10ABCD1234';
  const recoveryKey = 'owner_recovery_key_1234567890';
  const shareToken = 'share_token_abcdefghijklmnopqrstuvwxyz';
  const calls = [];
  const events = [];
  const location = {
    origin: 'https://mosigo-nine.vercel.app',
    pathname: '/',
    search: '?ignored=1',
    hash: ''
  };
  const sandbox = {
    console: { warn() {} },
    location,
    history: {
      state: null,
      replaceState(state, title, replacement) {
        calls.push(['replaceState', replacement]);
        location.hash = '';
      }
    },
    navigator: {
      clipboard: {
        async writeText(value) {
          calls.push(['clipboard', value]);
          if (clipboardFails) throw new Error('clipboard denied');
        }
      }
    },
    async fetch(url, options = {}) {
      calls.push(['fetch', String(url), options]);
      if (String(url) === '/api/booking-shares' && options.method === 'POST') {
        return {
          ok: true,
          status: 201,
          async json() {
            return {
              success: true,
              schemaVersion: 'v12',
              bookingId,
              shareToken,
              share: { active: true, expiresAt: '2026-09-14T01:00:00.000Z', generation: 1 }
            };
          }
        };
      }
      if (String(url).startsWith('/api/bookings?bookingId=')) {
        return {
          ok: true,
          status: 200,
          async json() { return { success: true, booking: { bookingId, revision: 3 } }; }
        };
      }
      if (String(url) === '/api/booking-shares' && options.method === 'DELETE') {
        return {
          ok: true,
          status: 200,
          async json() { return { success: true, bookingId, share: { active: false, revoked: true } }; }
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    },
    MosigoV10BookingDurability: {
      getRecoveryKey: (id) => ownerAccess && id === bookingId ? recoveryKey : ''
    },
    MosigoV6BookingSync: {
      getState: () => ({ bookingId }),
      getRecoveryKey: () => ownerAccess ? recoveryKey : '',
      setShareToken(id, token) { calls.push(['setShareToken', id, token]); },
      hydrate(booking) { calls.push(['syncHydrate', booking.bookingId]); }
    },
    MosigoV7BookingRecovery: { getLatestId: () => bookingId },
    MosigoV4BookingRuntime: {
      hydrate(booking) { calls.push(['runtimeHydrate', booking.bookingId]); }
    },
    setTimeout(fn) { fn(); },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    window: {
      dispatchEvent(event) { events.push(event); },
      addEventListener() {}
    },
    URL,
    Intl
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'booking-sharing.js' });
  return { sandbox, bookingId, recoveryKey, shareToken, calls, events, location };
}

test('secure sharing runtime is syntax-valid and exposes sharing facade', () => {
  assert.doesNotThrow(() => new Function(source));
  const { sandbox } = createRuntime();
  assert.ok(sandbox.MosigoV12SecureSharing);
  assert.equal(typeof sandbox.MosigoV12SecureSharing.copyShareLink, 'function');
  assert.equal(typeof sandbox.MosigoV12SecureSharing.revokeShare, 'function');
  assert.equal(typeof sandbox.MosigoV12SecureSharing.recoverFromShareFragment, 'function');
  assert.equal(typeof sandbox.MosigoV12SecureSharing.hasOwnerAccess, 'function');
  assert.equal(sandbox.MosigoV12SecureSharing.hasOwnerAccess(), true);
});

test('secure share link uses an expiring server token in the URL fragment only', async () => {
  const { sandbox, bookingId, shareToken, calls } = createRuntime();
  const issued = await sandbox.MosigoV12SecureSharing.copyShareLink({ ttlMinutes: 60 });
  assert.match(issued.link, /^https:\/\/mosigo-nine\.vercel\.app\/#mosigo-share=/);
  assert.ok(issued.link.includes(encodeURIComponent(`${bookingId}.${shareToken}`)));
  assert.equal(issued.link.includes('?ignored=1'), false);
  assert.equal(issued.link.includes('?shareToken='), false);
  const post = calls.find((call) => call[0] === 'fetch' && call[1] === '/api/booking-shares');
  assert.equal(post[2].headers['X-Mosigo-Recovery-Key'], 'owner_recovery_key_1234567890');
  const copied = calls.find((call) => call[0] === 'clipboard');
  assert.equal(copied[1], issued.link);
});

test('newly issued share is revoked when clipboard delivery fails', async () => {
  const { sandbox, calls } = createRuntime({ clipboardFails: true });
  const issued = await sandbox.MosigoV12SecureSharing.copyShareLink({ ttlMinutes: 60 });
  assert.equal(issued, null);
  const postIndex = calls.findIndex((call) => call[0] === 'fetch' && call[1] === '/api/booking-shares' && call[2]?.method === 'POST');
  const deleteIndex = calls.findIndex((call) => call[0] === 'fetch' && call[1] === '/api/booking-shares' && call[2]?.method === 'DELETE');
  assert.ok(postIndex >= 0 && deleteIndex > postIndex, 'failed copy should revoke the newly issued capability');
  assert.equal(sandbox.MosigoV12SecureSharing.getState().status, 'error');
  assert.match(sandbox.MosigoV12SecureSharing.getState().error, /즉시 폐기/);
});

test('owner access detection distinguishes temporary share recipients', () => {
  const { sandbox } = createRuntime({ ownerAccess: false });
  assert.equal(sandbox.MosigoV12SecureSharing.hasOwnerAccess(), false);
});

test('share recovery redacts the fragment before sending the server-validated token header', async () => {
  const { sandbox, bookingId, shareToken, calls, location } = createRuntime();
  const fragment = `#mosigo-share=${encodeURIComponent(`${bookingId}.${shareToken}`)}`;
  location.hash = fragment;
  const booking = await sandbox.MosigoV12SecureSharing.recoverFromShareFragment(fragment);
  assert.equal(booking.bookingId, bookingId);
  const replaceIndex = calls.findIndex((call) => call[0] === 'replaceState');
  const fetchIndex = calls.findIndex((call) => call[0] === 'fetch' && call[1].startsWith('/api/bookings?bookingId='));
  assert.ok(replaceIndex >= 0 && fetchIndex > replaceIndex);
  const fetchCall = calls[fetchIndex];
  assert.equal(fetchCall[2].headers['X-Mosigo-Share-Token'], shareToken);
  assert.equal(location.hash, '');
  assert.ok(calls.some((call) => call[0] === 'setShareToken' && call[2] === shareToken));
  assert.ok(calls.some((call) => call[0] === 'runtimeHydrate' && call[1] === bookingId));
  assert.equal(sandbox.MosigoV12SecureSharing.getState().status, 'recovered');
  assert.equal(sandbox.MosigoV12SecureSharing.getState().redacted, true);
});

test('owner can revoke the current server-side share capability', async () => {
  const { sandbox, calls } = createRuntime();
  const result = await sandbox.MosigoV12SecureSharing.revokeShare();
  assert.equal(result.active, false);
  const request = calls.find((call) => call[0] === 'fetch' && call[2]?.method === 'DELETE');
  assert.ok(request);
  assert.equal(request[2].headers['X-Mosigo-Recovery-Key'], 'owner_recovery_key_1234567890');
});
