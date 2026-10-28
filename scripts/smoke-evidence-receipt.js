'use strict';

// Independent read-only evidence for one previously-written isolated fixture.
// The receipt proves byte/path/time consistency only; it NEVER grants delete rights.
const { createHash, timingSafeEqual } = require('node:crypto');
const { assertIsolatedStore, OWNER, TTL_MS } = require('./smoke-retention-preflight.js');

const PATH = /^mosigo-isolated-smoke\/(smoke-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{16})\.json$/;
const DEPLOYMENT_ID = /^dpl_[A-Za-z0-9]+$/;
const MAX_BYTES = 4096;
const SKEW_MS = 5 * 60 * 1000;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function timestamp(value) {
  const time = value instanceof Date ? value.getTime()
    : typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(time) || time < 0) throw new Error('Invalid evidence timestamp');
  return time;
}

function makeReadOnlyReceipt({
  productionStoreId, testStoreId, pathname, content,
  uploadedAt, listedSize, sourceDeploymentId, now = Date.now()
} = {}) {
  assertIsolatedStore(productionStoreId, testStoreId);
  if (!DEPLOYMENT_ID.test(sourceDeploymentId || '')) {
    throw new Error('A verified lab deployment ID is required');
  }
  const match = PATH.exec(pathname || '');
  if (!match) throw new Error('Not an isolated marker pathname');
  if (!(typeof content === 'string' || Buffer.isBuffer(content) ||
        content instanceof Uint8Array)) {
    throw new TypeError('An exact marker body is required');
  }
  const bytes = Buffer.from(content);
  if (!bytes.length || bytes.length > MAX_BYTES ||
      listedSize !== bytes.length) {
    throw new Error('Bounded marker bytes must match store listing size');
  }
  let marker;
  try {
    marker = JSON.parse(new TextDecoder('utf-8', { fatal:true }).decode(bytes));
  } catch {
    throw new Error('Malformed marker bytes');
  }
  if (!marker || typeof marker !== 'object' || Array.isArray(marker) ||
      marker.runId !== match[1] || marker.storeId !== testStoreId ||
      marker.testOwner !== OWNER ||
      marker.evidenceRef !== 'isolated-vercel-build-e2e') {
    throw new Error('Marker identity or provenance declaration mismatch');
  }
  const created = timestamp(marker.createdAt);
  const uploaded = timestamp(uploadedAt);
  const expiry = timestamp(marker.expiresAt);
  const inspected = timestamp(now);
  if (expiry - created !== TTL_MS ||
      Math.abs(created - uploaded) > SKEW_MS ||
      uploaded > inspected + SKEW_MS ||
      created > inspected + SKEW_MS) {
    throw new Error('Isolated fixture timing mismatch');
  }
  return Object.freeze({
    version: 1,
    purpose: 'mosigo-isolated-fixture-readonly-review',
    sourceDeploymentId,
    markerContentSha256: sha256(bytes),
    markerPathSha256: sha256(Buffer.from(pathname, 'utf8')),
    uploadedAt: new Date(uploaded).toISOString(),
    expiresAt: new Date(expiry).toISOString(),
    sizeBytes: bytes.length,
    safeToDelete: false,
    deletionAuthorized: false
  });
}

function verifyReadOnlyReceipt(receipt, input) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
      Object.keys(receipt).sort().join(',') !==
      ['version','purpose','sourceDeploymentId','markerContentSha256',
        'markerPathSha256','uploadedAt','expiresAt','sizeBytes',
        'safeToDelete','deletionAuthorized'].sort().join(',')) {
    throw new Error('Invalid independent receipt structure');
  }
  const expected = makeReadOnlyReceipt({
    ...input, sourceDeploymentId: receipt.sourceDeploymentId
  });
  for (const key of ['version','purpose','sourceDeploymentId','uploadedAt',
    'expiresAt','sizeBytes','safeToDelete','deletionAuthorized']) {
    if (receipt[key] !== expected[key]) throw new Error('Evidence receipt mismatch');
  }
  for (const key of ['markerContentSha256','markerPathSha256']) {
    const value = receipt[key];
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value) ||
        !timingSafeEqual(Buffer.from(value,'hex'), Buffer.from(expected[key],'hex'))) {
      throw new Error('Evidence digest mismatch');
    }
  }
  return Object.freeze({
    matched: true, reviewOnly: true, safeToDelete: false,
    candidateDeletions: 0
  });
}

module.exports = { makeReadOnlyReceipt, verifyReadOnlyReceipt };
