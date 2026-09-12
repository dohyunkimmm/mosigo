const {
  BookingServiceError,
  applyBookingAction,
  capability,
  createBookingRequest,
  recoverBookingSnapshot
} = require('../lib/booking-service.js');

function readBody(req) {
  if (!req || req.body == null) return {};
  if (typeof req.body === 'object') return req.body;
  if (typeof req.body !== 'string' || !req.body.trim()) return {};
  try {
    return JSON.parse(req.body);
  } catch (error) {
    throw new BookingServiceError('invalid_json', 'Request body must be valid JSON.', 400);
  }
}

function writeCommonHeaders(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Mosigo-Schema', 'v9');
  res.setHeader('X-Mosigo-Data', 'prototype');
}

function writeError(res, error) {
  const known = error instanceof BookingServiceError;
  const status = known ? error.status : 500;
  return res.status(status).json({
    success: false,
    schemaVersion: 'v9',
    error: known ? error.code : 'internal_error',
    message: known ? error.message : 'Unexpected booking service error.'
  });
}

module.exports = function handler(req, res) {
  writeCommonHeaders(res);

  try {
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        source: 'prototype',
        ...capability()
      });
    }

    if (req.method === 'POST') {
      const body = readBody(req);
      const booking = createBookingRequest(body.booking || body);
      return res.status(201).json({
        success: true,
        source: 'prototype',
        schemaVersion: 'v9',
        booking
      });
    }

    if (req.method === 'PUT') {
      const body = readBody(req);
      const booking = recoverBookingSnapshot(body.booking || body);
      return res.status(200).json({
        success: true,
        source: 'prototype',
        schemaVersion: 'v9',
        recovered: true,
        recoveryScope: 'same-device',
        booking
      });
    }

    if (req.method === 'PATCH') {
      const body = readBody(req);
      const booking = applyBookingAction(body.booking, body.action);
      return res.status(200).json({
        success: true,
        source: 'prototype',
        schemaVersion: 'v9',
        booking
      });
    }

    res.setHeader('Allow', 'GET, POST, PUT, PATCH');
    return res.status(405).json({
      success: false,
      schemaVersion: 'v9',
      error: 'method_not_allowed',
      message: 'Method Not Allowed'
    });
  } catch (error) {
    return writeError(res, error);
  }
};
