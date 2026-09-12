module.exports = function handler(req, res) {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const payload = {
    ok: true,
    service: 'mosigo',
    status: 'ready',
    environment: process.env.VERCEL_ENV || 'local',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null
  };

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).json(payload);
};
