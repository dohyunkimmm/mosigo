'use strict';

// Production smoke checks must not silently downgrade persistence validation
// when a release increments its major version beyond 13.
function requiresDurableStorage(version) {
  const match = /^([0-9]+)\.[0-9]+\.[0-9]+$/.exec(String(version || '').trim());
  if (!match) throw new Error('Invalid release version for Production Smoke');
  return Number(match[1]) >= 10;
}

module.exports = { requiresDurableStorage };
