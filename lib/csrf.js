const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function parsedOrigin(value) {
  try {
    return new URL(value);
  } catch (err) {
    return null;
  }
}

function originOf(value) {
  const parsed = parsedOrigin(value);
  return parsed ? parsed.origin : null;
}

function createOriginGuard({ allowedOrigins = [] } = {}) {
  const allowed = new Set(allowedOrigins.map(originOf).filter(Boolean));

  return function originGuard(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (/^Bearer\s+/i.test(req.get('authorization') || '')) return next();

    const source = parsedOrigin(req.get('origin') || req.get('referer'));
    if (!source) {
      return res.status(403).json({ message: 'Request blocked.' });
    }

    const ownHost = String(req.get('x-forwarded-host') || req.get('host') || '')
      .split(',')[0]
      .trim();
    if (source.host === ownHost || allowed.has(source.origin)) return next();
    return res.status(403).json({ message: 'Request blocked.' });
  };
}

module.exports = { createOriginGuard };
