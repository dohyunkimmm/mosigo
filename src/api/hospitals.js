const { queryHospitals } = require('../lib/hospital-query');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success:false, error:'Method Not Allowed' });
  }

  const items = queryHospitals(req.query || {});

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  res.setHeader('X-Mosigo-Data', 'prototype');
  return res.status(200).json({ success:true, source:'prototype', items });
};
