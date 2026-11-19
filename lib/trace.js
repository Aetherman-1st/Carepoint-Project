const crypto = require('crypto');

function requestTrace(req, res, next) {
  const supplied = String(req.get('x-request-id') || '');
  const traceId = /^[A-Za-z0-9._-]{8,64}$/.test(supplied) ? supplied : crypto.randomUUID();
  req.traceId = traceId;
  res.setHeader('X-Request-Id', traceId);
  next();
}

module.exports = { requestTrace };
