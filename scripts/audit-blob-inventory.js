'use strict';

// #88: metadata-only, bounded read for historical production Blob audit.
// This module intentionally has no get/put/copy/delete functionality.
const { createRequire } = require('node:module');
const path = require('node:path');
const { resolveBlobStoreId } = require('../src/lib/booking-store.js');

const PREFIXES = Object.freeze([
  ['bookings', 'mosigo/bookings/'],
  ['accounts', 'mosigo/accounts/by-email/'],
  ['sessions', 'mosigo/account-sessions/'],
  ['accountIndexes', 'mosigo/account-bookings/'],
  ['shares', 'mosigo/booking-shares/']
]);

async function collectMetadata({ list, pageSize = 100, maxPages = 3 } = {}) {
  if (typeof list !== 'function') throw new TypeError('A metadata list function is required');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) throw new RangeError('Invalid pageSize');
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 20) throw new RangeError('Invalid maxPages');

  const report = { readOnly: true, complete: true, candidateDeletions: 0, scanned: [] };
  for (const [kind, prefix] of PREFIXES) {
    let cursor, pages = 0, count = 0, bytes = 0, oldest = null, newest = null, complete = false;
    const visited = new Set();
    while (pages < maxPages) {
      const result = await list({ prefix, limit: pageSize, mode: 'expanded', ...(cursor ? { cursor } : {}) });
      if (!Array.isArray(result?.blobs) || typeof result.hasMore !== 'boolean') {
        throw new Error('Unexpected Blob list response');
      }
      for (const blob of result.blobs) {
        if (typeof blob.pathname !== 'string' || !blob.pathname.startsWith(prefix)) {
          throw new Error('Blob listing escaped the audited prefix');
        }
        if (!Number.isSafeInteger(blob.size) || blob.size < 0) throw new Error('Invalid Blob metadata size');
        count += 1;
        bytes += blob.size;
        const when = new Date(blob.uploadedAt).toISOString();
        if (!oldest || when < oldest) oldest = when;
        if (!newest || when > newest) newest = when;
      }
      pages += 1;
      if (!result.hasMore) { complete = true; break; }
      if (!result.cursor || visited.has(result.cursor)) throw new Error('Missing or repeated Blob cursor');
      visited.add(result.cursor);
      cursor = result.cursor;
    }
    report.scanned.push({ kind, count, bytes, oldest, newest, pages, complete, classification: 'unattributed' });
    if (!complete) report.complete = false;
  }
  return report;
}

// A list request with only an ambient BLOB_READ_WRITE_TOKEN could target a
// completely different store. Require an explicitly confirmed OIDC target.
function auditTarget(env = process.env) {
  if (env.CI || env.GITHUB_ACTIONS || env.VERCEL) {
    throw new Error('Audit must run from an approved local, non-CI context');
  }
  if (env.MOSIGO_AUDIT_BLOB_METADATA_ONLY !== 'yes') {
    throw new Error('Explicit metadata-only opt-in is required');
  }
  const expected = resolveBlobStoreId(env);
  const approved = String(env.MOSIGO_AUDIT_EXPECTED_STORE_ID || '').trim();
  if (!approved || approved !== expected || !/^store_[A-Za-z0-9]+$/.test(approved)) {
    throw new Error('Confirmed target Blob store ID must match the application store ID');
  }
  if (!String(env.VERCEL_OIDC_TOKEN || '').trim()) {
    throw new Error('A short-lived, store-scoped Vercel OIDC token is required');
  }
  // Do not let an ambient long-lived RW token silently supersede OIDC auth.
  if (env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Unset BLOB_READ_WRITE_TOKEN; metadata audit uses OIDC only');
  }
  return { storeId: approved, oidcToken: env.VERCEL_OIDC_TOKEN };
}

function scopedList(list, credentials) {
  if (typeof list !== 'function') throw new TypeError('Blob list function required');
  if (!credentials?.storeId || !credentials?.oidcToken) {
    throw new Error('Store-scoped OIDC credentials required');
  }
  return (options) => list({ ...options, storeId: credentials.storeId, oidcToken: credentials.oidcToken });
}

async function main() {
  const credentials = auditTarget(process.env);
  // Resolve the existing src dependency only after explicit target confirmation.
  const runtimeRequire = createRequire(path.resolve(__dirname, '../src/package.json'));
  const { list } = runtimeRequire('@vercel/blob');
  const report = await collectMetadata({ list: scopedList(list, credentials) });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

if (require.main === module) {
  main().catch(() => {
    // Never print SDK error details; they could include private Blob URLs.
    process.stderr.write('Metadata audit failed; verify local setup and permitted scope.\n');
    process.exitCode = 1;
  });
}

module.exports = { PREFIXES, collectMetadata, auditTarget, scopedList };
