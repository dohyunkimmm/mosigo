// Best-effort per-instance throttle; use shared edge/WAF limits for production.
function createIpBurstLimiter({ maxAttempts = 20, windowMs = 5 * 60 * 1000, maxClients = 500, clock = Date.now } = {}) {
  const buckets = new Map();
  return function allow(req) {
    const headers = req?.headers || {};
    // Vercel normalizes x-forwarded-for at the edge to prevent client IP spoofing.
    const source = headers['x-forwarded-for'] || headers['x-real-ip'] || req?.socket?.remoteAddress || 'unknown';
    const key = String(source).split(',')[0].trim().slice(0, 100) || 'unknown';
    const now = clock();
    const previous = buckets.get(key);
    if (!previous || now - previous.startedAt >= windowMs) {
      if (buckets.size >= maxClients) {
        for (const [ip, bucket] of buckets) {
          if (now - bucket.startedAt >= windowMs) buckets.delete(ip);
        }
      }
      while (buckets.size >= maxClients) buckets.delete(buckets.keys().next().value);
      buckets.set(key, { startedAt: now, count: 1 });
      return { allowed: true };
    }
    if (previous.count >= maxAttempts) {
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((windowMs - (now - previous.startedAt)) / 1000)) };
    }
    previous.count += 1;
    return { allowed: true };
  };
}


module.exports = { createIpBurstLimiter };
