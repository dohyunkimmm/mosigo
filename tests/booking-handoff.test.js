const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(ROOT, 'src', 'runtime', 'booking-handoff.js'), 'utf8');

function createRuntime({ hash = '' } = {}) {
  const bookingId = 'M10ABCD1234';
  const recoveryKey = 'portable_recovery_key_1234567890';
  const calls = [];
  const events = [];
  const location = {
    origin: 'https://mosigo-nine.vercel.app',
    pathname: '/',
    search: '?ignored=1',
    hash
  };
  const history = {
    state: { test: true },
    replaceState(state, title, replacement) {
      calls.push(['replaceState', replacement]);
      location.hash = '';
    }
  };
  const sandbox = {
    console: { warn() {} },
    location,
    history,
    navigator: {
      clipboard: {
        async writeText(value) { calls.push(['clipboard', value]); }
      }
    },
    MosigoV10BookingDurability: {
      getCapability: () => ({ durableServerPersistence: true }),
      getRecoveryKey: (id) => id === bookingId ? recoveryKey : '',
      async recover(id, key) {
        calls.push(['recover', id, key]);
        if (id !== bookingId || key !== recoveryKey) return null;
        return { bookingId: id, revision: 3 };
      }
    },
    MosigoV6BookingSync: {
      getState: () => ({ bookingId })
    },
    MosigoV7BookingRecovery: {
      getLatestId: () => bookingId
    },
    MosigoV4BookingRuntime: {},
    setTimeout(fn) { fn(); },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    },
    URL,
    window: {
      addEventListener() {},
      dispatchEvent(event) { events.push(event); }
    }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'booking-handoff.js' });
  return { sandbox, bookingId, recoveryKey, calls, events, location };
}

test('portable handoff runtime is syntax-valid and exposes recovery facade', () => {
  assert.doesNotThrow(() => new Function(source));
  const { sandbox } = createRuntime();
  assert.ok(sandbox.MosigoV11BookingHandoff);
  assert.equal(typeof sandbox.MosigoV11BookingHandoff.createRecoveryLink, 'function');
  assert.equal(typeof sandbox.MosigoV11BookingHandoff.recoverFromFragment, 'function');
});

test('portable recovery link keeps the bearer credential in the URL fragment only', () => {
  const { sandbox, bookingId, recoveryKey } = createRuntime();
  const link = sandbox.MosigoV11BookingHandoff.createRecoveryLink();
  assert.match(link, /^https:\/\/mosigo-nine\.vercel\.app\/#mosigo-recovery=/);
  assert.ok(link.includes(encodeURIComponent(`${bookingId}.${recoveryKey}`)));
  assert.equal(link.includes('?ignored=1'), false);
  assert.equal(link.includes(`?recoveryKey=${recoveryKey}`), false);
});

test('portable recovery imports booking credentials and redacts the fragment before recovery', async () => {
  const { sandbox, bookingId, recoveryKey, calls, location } = createRuntime();
  const fragment = `#mosigo-recovery=${encodeURIComponent(`${bookingId}.${recoveryKey}`)}`;
  location.hash = fragment;
  const booking = await sandbox.MosigoV11BookingHandoff.recoverFromFragment(fragment);
  assert.equal(booking.bookingId, bookingId);
  assert.deepEqual(calls[0], ['replaceState', '/?ignored=1']);
  assert.deepEqual(calls[1], ['recover', bookingId, recoveryKey]);
  assert.equal(location.hash, '');
  assert.equal(sandbox.MosigoV11BookingHandoff.getState().status, 'recovered');
  assert.equal(sandbox.MosigoV11BookingHandoff.getState().redacted, true);
});

test('invalid Mosigo recovery fragments are rejected without calling durable recovery', async () => {
  const { sandbox, calls, location } = createRuntime();
  const fragment = '#mosigo-recovery=not-a-valid-token';
  location.hash = fragment;
  const booking = await sandbox.MosigoV11BookingHandoff.recoverFromFragment(fragment);
  assert.equal(booking, null);
  assert.equal(calls.some((call) => call[0] === 'recover'), false);
  assert.equal(location.hash, '');
  assert.equal(sandbox.MosigoV11BookingHandoff.getState().status, 'invalid');
});

test('copyRecoveryLink copies the portable link without exposing it to server query parameters', async () => {
  const { sandbox, calls } = createRuntime();
  const link = await sandbox.MosigoV11BookingHandoff.copyRecoveryLink();
  const copied = calls.find((call) => call[0] === 'clipboard');
  assert.equal(copied[1], link);
  assert.match(link, /#mosigo-recovery=/);
  assert.equal(link.includes('?'), false);
});
