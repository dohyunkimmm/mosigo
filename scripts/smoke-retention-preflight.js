'use strict';

// Offline-only preflight for the future physically isolated smoke store.
// Never connects to Vercel Blob, reads production records, or deletes objects.
const { randomBytes } = require('node:crypto');

const OWNER = 'mosigo-isolated-smoke';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STORE_ID = /^store_[A-Za-z0-9]+$/;
const RUN_ID = /^smoke-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{16}$/;

function assertIsolatedStore(productionStoreId, testStoreId) {
  if (!STORE_ID.test(productionStoreId || '') || !STORE_ID.test(testStoreId || '')) {
    throw new Error('Explicit, valid production and test Blob store IDs are required');
  }
  if (productionStoreId === testStoreId) {
    throw new Error('Smoke test storage must be physically distinct from production');
  }
}

function toMs(value) {
  const time = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(time) || time < 0) throw new TypeError('Valid timestamp required');
  return time;
}

function createRunContext({productionStoreId, testStoreId, now = Date.now(), entropy = randomBytes} = {}) {
  assertIsolatedStore(productionStoreId, testStoreId);
  const started = toMs(now);
  const suffix = entropy(8).toString('hex');
  if (!/^[a-f0-9]{16}$/.test(suffix)) throw new Error('Unreliable run ID entropy');
  const date = new Date(started);
  const runId = 'smoke-' + date.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z-' + suffix;
  if (!RUN_ID.test(runId)) throw new Error('Unexpected run ID format');
  return Object.freeze({
    runId, testOwner: OWNER, storeId: testStoreId,
    createdAt: date.toISOString(), expiresAt: new Date(started + TTL_MS).toISOString()
  });
}

function planRetention({productionStoreId, testStoreId, records, now = Date.now()} = {}) {
  assertIsolatedStore(productionStoreId, testStoreId);
  const instant = toMs(now);
  if (!Array.isArray(records) || records.length > 10000) {
    throw new TypeError('Bounded isolated-store records are required');
  }
  const summary = {
    readOnly: true,
    safeToDelete: false,
    candidateDeletions: 0,
    inspected: records.length,
    active: 0,
    expiredNeedsIndependentProvenance: 0,
    unattributed: 0
  };
  for (const record of records) {
    if (!record || typeof record !== 'object') { summary.unattributed++; continue; }
    if (record.storeId === productionStoreId) {
      throw new Error('Production Blob record encountered: refuse entire retention plan');
    }
    if (record.storeId !== testStoreId) {
      throw new Error('Cross-store record encountered: refuse entire retention plan');
    }
    let created, expires;
    try {
      created = toMs(record.createdAt);
      expires = toMs(record.expiresAt);
    } catch (_) {
      summary.unattributed++;
      continue;
    }
    // Even self-declared run metadata is NOT independent ownership evidence.
    if (!RUN_ID.test(record.runId || '') || record.testOwner !== OWNER ||
        !record.evidenceRef || typeof record.evidenceRef !== 'string' ||
        record.evidenceRef.length > 128 || expires <= created ||
        expires - created > TTL_MS || created > instant) {
      summary.unattributed++;
      continue;
    }
    if (expires > instant) summary.active++;
    else summary.expiredNeedsIndependentProvenance++;
  }
  // No pathnames, private URLs, tokens, credentials or individual records escape.
  return summary;
}

module.exports = { OWNER, TTL_MS, assertIsolatedStore, createRunContext, planRetention };
