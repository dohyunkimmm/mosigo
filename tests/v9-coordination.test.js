const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE = fs.readFileSync(path.resolve(__dirname, '../src/v9-booking.js'), 'utf8');
const LATEST_KEY = 'mosigo-v7-booking-latest';
const PREFIX = 'mosigo-v7-booking:';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function booking(overrides = {}) {
  return {
    bookingId: 'M9AAAA0001',
    revision: 1,
    phase: 'requesting',
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    managerName: '김민준',
    ...overrides
  };
}

function createWindow() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    dispatchEvent(event) {
      for (const handler of listeners.get(event.type) || []) handler(event);
      return true;
    }
  };
}

class SharedStorage {
  constructor() {
    this.map = new Map();
    this.tabs = new Set();
  }

  seed(key, value) {
    this.map.set(key, String(value));
  }

  attach(tab) {
    const storage = {
      getItem: (key) => this.map.has(key) ? this.map.get(key) : null,
      setItem: (key, value) => this.write(tab, key, String(value)),
      removeItem: (key) => this.remove(tab, key)
    };
    tab.localStorage = storage;
    this.tabs.add(tab);
    return storage;
  }

  write(source, key, value) {
    const oldValue = this.map.has(key) ? this.map.get(key) : null;
    this.map.set(key, value);
    this.broadcast(source, { key, oldValue, newValue: value });
  }

  remove(source, key) {
    const oldValue = this.map.has(key) ? this.map.get(key) : null;
    this.map.delete(key);
    this.broadcast(source, { key, oldValue, newValue: null });
  }

  broadcast(source, event) {
    for (const tab of this.tabs) {
      if (tab === source) continue;
      tab.window.dispatchEvent({
        type: 'storage',
        ...event,
        storageArea: tab.localStorage
      });
    }
  }
}

function createTab(shared, initialState = null) {
  const tab = { window: createWindow() };
  const localStorage = shared.attach(tab);
  let syncState = clone(initialState);
  let runtimeState = clone(initialState) || {};
  let recoverCalls = 0;

  function readSnapshot(id) {
    const raw = localStorage.getItem(PREFIX + String(id || '').trim());
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  const sync = {
    getState: () => clone(syncState),
    hydrate(value) {
      syncState = value && typeof value === 'object' ? clone(value) : null;
      return clone(syncState);
    }
  };

  const runtime = {
    hydrate(value) {
      runtimeState = value && typeof value === 'object' ? clone(value) : {};
      return clone(runtimeState);
    },
    getState: () => clone(runtimeState)
  };

  const recovery = {
    getLatestId: () => String(localStorage.getItem(LATEST_KEY) || '').trim(),
    getSnapshot: (id = String(localStorage.getItem(LATEST_KEY) || '').trim()) => clone(readSnapshot(id)),
    async recover(id = String(localStorage.getItem(LATEST_KEY) || '').trim()) {
      recoverCalls += 1;
      const snapshot = readSnapshot(id);
      if (!snapshot) return null;
      runtime.hydrate(snapshot);
      sync.hydrate(snapshot);
      return clone(snapshot);
    }
  };

  const sandbox = {
    window: tab.window,
    localStorage,
    MosigoV6BookingSync: sync,
    MosigoV7BookingRecovery: recovery,
    MosigoV4BookingRuntime: runtime,
    setTimeout,
    clearTimeout,
    console: { warn() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: 'v9-booking.js' });

  tab.api = sandbox.MosigoV9BookingCoordination;
  tab.getSyncState = () => clone(syncState);
  tab.getRuntimeState = () => clone(runtimeState);
  tab.getRecoverCalls = () => recoverCalls;
  return tab;
}

async function settle() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

test('higher stored revision is revalidated and adopted across tabs', async () => {
  const shared = new SharedStorage();
  const first = booking();
  shared.seed(PREFIX + first.bookingId, JSON.stringify(first));
  shared.seed(LATEST_KEY, first.bookingId);

  const writer = createTab(shared, first);
  const reader = createTab(shared, first);
  const newer = booking({ revision: 2, phase: 'confirmed', updatedAt: '2026-09-20T01:00:00.000Z' });

  writer.localStorage.setItem(PREFIX + first.bookingId, JSON.stringify(newer));
  await settle();

  assert.equal(reader.getSyncState().revision, 2);
  assert.equal(reader.getSyncState().phase, 'confirmed');
  assert.ok(reader.getRecoverCalls() >= 1);
});

test('stored snapshot wins equal-revision divergence', async () => {
  const shared = new SharedStorage();
  const current = booking({ revision: 2, phase: 'confirmed', managerName: '김민준' });
  shared.seed(PREFIX + current.bookingId, JSON.stringify(current));
  shared.seed(LATEST_KEY, current.bookingId);

  const writer = createTab(shared, current);
  const reader = createTab(shared, current);
  const stored = booking({ revision: 2, phase: 'confirmed', managerName: '박성호' });

  writer.localStorage.setItem(PREFIX + current.bookingId, JSON.stringify(stored));
  await settle();

  assert.equal(reader.getSyncState().managerName, '박성호');
  assert.equal(reader.api.getState().conflict, 'equal-revision-divergence');
});

test('same-timestamp different bookings use booking ID as deterministic tie-breaker', async () => {
  const shared = new SharedStorage();
  const current = booking({ bookingId: 'M9AAAA0001' });
  const candidate = booking({ bookingId: 'M9ZZZZ0001' });
  shared.seed(PREFIX + current.bookingId, JSON.stringify(current));
  shared.seed(LATEST_KEY, current.bookingId);

  const writer = createTab(shared, current);
  const reader = createTab(shared, current);
  writer.localStorage.setItem(PREFIX + candidate.bookingId, JSON.stringify(candidate));
  writer.localStorage.setItem(LATEST_KEY, candidate.bookingId);
  await settle();

  assert.equal(reader.getSyncState().bookingId, candidate.bookingId);
});

test('snapshot and latest-key removals clear the other tab runtime', async () => {
  const shared = new SharedStorage();
  const current = booking({ revision: 2, phase: 'confirmed' });
  shared.seed(PREFIX + current.bookingId, JSON.stringify(current));
  shared.seed(LATEST_KEY, current.bookingId);

  const writer = createTab(shared, current);
  const reader = createTab(shared, current);
  writer.localStorage.removeItem(PREFIX + current.bookingId);
  writer.localStorage.removeItem(LATEST_KEY);
  await settle();

  assert.equal(reader.getSyncState(), null);
  assert.equal(reader.api.getState().status, 'cleared');
});

test('malformed storage payload is surfaced without replacing current state', async () => {
  const shared = new SharedStorage();
  const current = booking();
  shared.seed(PREFIX + current.bookingId, JSON.stringify(current));
  shared.seed(LATEST_KEY, current.bookingId);

  const writer = createTab(shared, current);
  const reader = createTab(shared, current);
  writer.localStorage.setItem(PREFIX + current.bookingId, '{broken');
  await settle();

  assert.equal(reader.getSyncState().bookingId, current.bookingId);
  assert.equal(reader.api.getState().status, 'invalid-snapshot');
  assert.equal(reader.api.getState().conflict, 'invalid-json');
});

test('facade separates local snapshot reads from server-style canonical revalidation', async () => {
  const shared = new SharedStorage();
  const stored = booking({ revision: 3, phase: 'in_progress', updatedAt: '2026-09-20T02:00:00.000Z' });
  shared.seed(PREFIX + stored.bookingId, JSON.stringify(stored));
  shared.seed(LATEST_KEY, stored.bookingId);

  const tab = createTab(shared, stored);
  const before = tab.getRecoverCalls();
  assert.equal(tab.api.getSnapshot().revision, 3);

  const canonical = await tab.api.getCanonical();
  assert.equal(canonical.revision, 3);
  assert.equal(tab.getRecoverCalls(), before + 1);
});
