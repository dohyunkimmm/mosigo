'use strict';

// The Vercel Node.js 24 req.query getter currently invokes deprecated url.parse().
// Prefer the standard WHATWG URL parser whenever the HTTP request URL is present.
function parseRequestQuery(req) {
  if (typeof req?.url === 'string') {
    const result = Object.create(null);
    const params = new URL(req.url, 'http://localhost').searchParams;
    for (const [key, value] of params) {
      if (!Object.hasOwn(result, key)) {
        result[key] = value;
      } else if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
    }
    return result;
  }
  // Only used by in-process test doubles that do not supply IncomingMessage.url.
  return req?.query || {};
}

function readRequestQuery(req, name) {
  const value = parseRequestQuery(req)[name];
  if (Array.isArray(value)) return String(value[0] || '').trim();
  return String(value || '').trim();
}

module.exports = { parseRequestQuery, readRequestQuery };
