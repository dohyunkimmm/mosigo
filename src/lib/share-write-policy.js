'use strict';

// Deployment policy is opt-in. A missing variable retains the existing
// sharing semantics until a product decision and UI rollout are approved.
function resolveShareWritePolicy(env = process.env) {
  const policy = String(env?.MOSIGO_SHARE_WRITE_POLICY || 'edit').trim();
  if (policy !== 'edit' && policy !== 'read-only') {
    throw new Error('MOSIGO_SHARE_WRITE_POLICY must be edit or read-only');
  }
  return policy;
}

module.exports = { resolveShareWritePolicy };
