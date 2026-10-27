'use strict';

// Manual, one-object isolated-store probe. Never touches the booking APIs.
// This is deliberately not imported by any serverless function or CI workflow.
const { createRequire } = require('node:module');
const path = require('node:path');
const { assertIsolatedStore, createRunContext } = require('./smoke-retention-preflight.js');

function authorizeIsolatedWrite(env = process.env) {
  if (env.CI || env.GITHUB_ACTIONS || env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL) {
    throw new Error('Isolated write probe is forbidden in CI or deployed runtimes');
  }
  if (env.MOSIGO_ISOLATED_WRITE_ONCE !== 'yes' ||
      env.MOSIGO_ISOLATED_ACCEPT_RETAINED_MARKER !== 'yes') {
    throw new Error('Explicit one-object write and retention acknowledgements required');
  }
  if (env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Unset ambient Blob read-write token; use scoped OIDC only');
  }

  const productionStoreId = String(env.MOSIGO_SMOKE_PRODUCTION_STORE_ID || '').trim();
  const testStoreId = String(env.MOSIGO_SMOKE_TEST_STORE_ID || '').trim();
  const confirmed = String(env.MOSIGO_SMOKE_CONFIRMED_TEST_STORE_ID || '').trim();
  const confirmedProduction = String(env.MOSIGO_SMOKE_CONFIRMED_PRODUCTION_STORE_ID || '').trim();
  assertIsolatedStore(productionStoreId, testStoreId);
  if (confirmedProduction !== productionStoreId) throw new Error('Independent production store ID confirmation required');
  if (confirmed !== testStoreId) throw new Error('Independent test store ID confirmation required');
  if ((env.MOSIGO_BLOB_STORE_ID && env.MOSIGO_BLOB_STORE_ID !== productionStoreId) ||
      (env.BLOB_STORE_ID && env.BLOB_STORE_ID !== productionStoreId)) {
    throw new Error('Production store ID does not match the active application configuration');
  }
  const oidcToken = String(env.VERCEL_OIDC_TOKEN || '').trim();
  if (!oidcToken) throw new Error('A short-lived OIDC credential is required');
  return Object.freeze({ productionStoreId, testStoreId, oidcToken });
}

async function checkIsolatedStore({ context, blob, now = Date.now(), entropy } = {}) {
  if (!context?.oidcToken || !blob ||
      typeof blob.put !== 'function' || typeof blob.get !== 'function' ||
      typeof blob.list !== 'function') {
    throw new TypeError('Scoped credentials and an explicit Blob client are required');
  }
  assertIsolatedStore(context.productionStoreId, context.testStoreId);

  const run = createRunContext({
    productionStoreId: context.productionStoreId,
    testStoreId: context.testStoreId,
    now,
    ...(entropy ? { entropy } : {})
  });
  const pathname = 'mosigo-isolated-smoke/' + run.runId + '.json';
  const metadata = JSON.stringify({
    runId: run.runId, testOwner: run.testOwner, storeId: run.storeId,
    createdAt: run.createdAt, expiresAt: run.expiresAt,
    evidenceRef: 'local-write-read-self-check'
  });
  const auth = { storeId: context.testStoreId, oidcToken: context.oidcToken };

  await blob.put(pathname, metadata, {
    ...auth, access: 'private', allowOverwrite: false,
    addRandomSuffix: false, contentType: 'application/json'
  });

  const loaded = await blob.get(pathname, { ...auth, access: 'private', useCache: false });
  if (!loaded || (loaded.statusCode && loaded.statusCode !== 200) || !loaded.stream) {
    throw new Error('Isolated marker readback was not successful');
  }
  const readback = await new Response(loaded.stream).text();
  if (readback !== metadata) throw new Error('Isolated marker differs from its readback');

  const listing = await blob.list({
    ...auth, prefix: pathname, limit: 2, mode: 'expanded'
  });
  if (!listing || listing.hasMore !== false ||
      !Array.isArray(listing.blobs) || listing.blobs.length !== 1 ||
      listing.blobs[0].pathname !== pathname) {
    throw new Error('Isolated marker listing was ambiguous');
  }

  // TTL is metadata only. No automated expiry, cleanup, or delete authorization.
  return Object.freeze({
    isolated: true, verifiedWriteReadList: true, markerCount: 1,
    retentionDaysMetadataOnly: 7, deletionEnabled: false,
    productionWrites: 0
  });
}

async function main() {
  const context = authorizeIsolatedWrite();
  const runtimeRequire = createRequire(path.resolve(__dirname, '../src/package.json'));
  const blob = runtimeRequire('@vercel/blob');
  const summary = await checkIsolatedStore({ context, blob });
  process.stdout.write(JSON.stringify(summary) + '\n');
}

if (require.main === module) {
  main().catch(() => {
    // The SDK may include private Blob URLs or token-bearing request data in errors.
    process.stderr.write('Isolated store probe failed. Check local authorization and store scope.\n');
    process.exitCode = 1;
  });
}

module.exports = { authorizeIsolatedWrite, checkIsolatedStore };
