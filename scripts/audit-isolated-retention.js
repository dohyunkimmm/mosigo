'use strict';

// Bounded, read-only audit of the physically isolated test Blob store.
// Never used in CI, in a deployed function, or by production smoke.
const { createRequire } = require('node:module');
const path = require('node:path');
const { assertIsolatedStore, planRetention } = require('./smoke-retention-preflight.js');

const PREFIX = 'mosigo-isolated-smoke/';
const PATH = /^mosigo-isolated-smoke\/(smoke-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{16})\.json$/;
const MAX_MARKER_BYTES = 4096;

function authorizeIsolatedAudit(env = process.env) {
  if (env.CI || env.GITHUB_ACTIONS || env.VERCEL ||
      env.VERCEL_ENV || env.VERCEL_URL) {
    throw new Error('An approved local, non-CI environment is required');
  }
  if (env.MOSIGO_ISOLATED_AUDIT_READ_ONLY !== 'yes') {
    throw new Error('Explicit read-only audit opt-in required');
  }
  if (env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Unset ambient Blob token; use store-scoped OIDC only');
  }
  const productionStoreId = String(env.MOSIGO_SMOKE_PRODUCTION_STORE_ID || '').trim();
  const testStoreId = String(env.MOSIGO_SMOKE_TEST_STORE_ID || '').trim();
  assertIsolatedStore(productionStoreId, testStoreId);
  if (env.MOSIGO_SMOKE_CONFIRMED_PRODUCTION_STORE_ID !== productionStoreId ||
      env.MOSIGO_SMOKE_CONFIRMED_TEST_STORE_ID !== testStoreId) {
    throw new Error('Independently confirmed production and test IDs required');
  }
  if ((env.BLOB_STORE_ID && env.BLOB_STORE_ID !== testStoreId) ||
      (env.MOSIGO_BLOB_STORE_ID && env.MOSIGO_BLOB_STORE_ID !== productionStoreId)) {
    throw new Error('Application production store ID mismatch');
  }
  const oidcToken = String(env.VERCEL_OIDC_TOKEN || '').trim();
  if (!oidcToken) throw new Error('Short-lived OIDC token required');
  return Object.freeze({ productionStoreId, testStoreId, oidcToken });
}

async function readSmallMarker(stream) {
  if (!stream || typeof stream.getReader !== 'function') {
    throw new Error('Unexpected isolated marker response stream');
  }
  const reader = stream.getReader();
  let bytes = 0;
  const parts = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error('Unexpected marker stream chunk');
      bytes += value.byteLength;
      if (bytes > MAX_MARKER_BYTES) throw new Error('Isolated marker size bound exceeded');
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of parts) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch {
    return null;
  }
}

async function auditIsolatedRetention({
  context, blob, now = Date.now(), pageSize = 25, maxPages = 2
} = {}) {
  if (!context?.oidcToken || !blob ||
      typeof blob.list !== 'function' || typeof blob.get !== 'function') {
    throw new TypeError('Explicit scoped credentials and read-only Blob methods required');
  }
  assertIsolatedStore(context.productionStoreId, context.testStoreId);
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 4 ||
      pageSize * maxPages > 100) {
    throw new RangeError('Bounded isolated Blob scan required');
  }
  const auth = { storeId: context.testStoreId, oidcToken: context.oidcToken };
  const records = [];
  const visitedPaths = new Set();
  const visitedCursors = new Set();
  let cursor, pages = 0, complete = false;
  do {
    const listing = await blob.list({
      ...auth, prefix: PREFIX, limit: pageSize, mode: 'expanded',
      ...(cursor ? { cursor } : {})
    });
    if (!Array.isArray(listing?.blobs) || typeof listing.hasMore !== 'boolean' ||
        listing.blobs.length > pageSize) {
      throw new Error('Invalid isolated Blob list response');
    }
    for (const item of listing.blobs) {
      const pathname = item?.pathname;
      if (typeof pathname !== 'string' || !pathname.startsWith(PREFIX) ||
          visitedPaths.has(pathname)) {
        throw new Error('Isolated Blob listing escaped scope or repeated a record');
      }
      visitedPaths.add(pathname);
      const match = PATH.exec(pathname);
      if (!match) {
        records.push(null);
        continue;
      }
      if (!Number.isSafeInteger(item.size) || item.size < 0 ||
          item.size > MAX_MARKER_BYTES) {
        throw new Error('Isolated marker metadata size invalid');
      }
      const response = await blob.get(pathname, {
        ...auth, access: 'private', useCache: false
      });
      if (!response || (response.statusCode && response.statusCode !== 200)) {
        throw new Error('Isolated marker could not be read');
      }
      const value = await readSmallMarker(response.stream);
      // JSON in the store is self-asserted, not independent proof. Also bind the
      // declared run ID to the listed object name to reject mismatched markers.
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          value.runId !== match[1] ||
          value.evidenceRef !== 'local-write-read-self-check') {
        records.push(null);
        continue;
      }
      records.push(value);
    }
    pages++;
    if (!listing.hasMore) {
      complete = true;
      break;
    }
    if (typeof listing.cursor !== 'string' || !listing.cursor ||
        visitedCursors.has(listing.cursor)) {
      throw new Error('Missing or repeated isolated Blob cursor');
    }
    visitedCursors.add(listing.cursor);
    cursor = listing.cursor;
  } while (pages < maxPages);

  const plan = planRetention({
    productionStoreId: context.productionStoreId,
    testStoreId: context.testStoreId,
    records, now
  });
  // Incomplete scans can report partial counts but never deletion eligibility.
  return Object.freeze({
    ...plan, complete, pages, maximumObjects: pageSize * maxPages
  });
}

async function main() {
  const context = authorizeIsolatedAudit();
  const requireRuntime = createRequire(path.resolve(__dirname, '../src/package.json'));
  const { list, get } = requireRuntime('@vercel/blob');
  const report = await auditIsolatedRetention({ context, blob: { list, get } });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) {
  main().catch(() => {
    // Never print SDK errors that can include private URLs or credentials.
    process.stderr.write('Isolated read-only audit failed; verify approved scope.\n');
    process.exitCode = 1;
  });
}

module.exports = { PREFIX, authorizeIsolatedAudit, readSmallMarker, auditIsolatedRetention };
