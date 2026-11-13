const crypto = require('crypto');

const localBuckets = new Map();
const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function clientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return String(cfIp).trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();

  return req.ip || 'unknown';
}

function emailOrChallenge(req) {
  const body = req.body || {};
  if (body.email) return String(body.email).trim().toLowerCase();
  if (body.challenge) return String(body.challenge).trim();
  return clientIp(req);
}

function localTestBypass(req) {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.DISABLE_LOCAL_RATE_LIMIT === '1' &&
    !globalThis.__cloudflareAssets &&
    LOOPBACK_IPS.has(clientIp(req))
  );
}

function hashKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function localLimit(name, key, limit, periodSeconds) {
  const now = Date.now();
  const bucketKey = `${name}:${key}`;
  const windowMs = periodSeconds * 1000;
  let bucket = localBuckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    localBuckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  if (localBuckets.size > 5000) {
    for (const [storedKey, stored] of localBuckets) {
      if (stored.resetAt <= now) localBuckets.delete(storedKey);
    }
  }

  return bucket.count <= limit;
}

async function allow(name, bindingName, key, limit, periodSeconds) {
  const bindings = globalThis.__rateLimitBindings || {};
  const binding = bindings[bindingName];

  if (binding && typeof binding.limit === 'function') {
    try {
      const result = await binding.limit({ key: hashKey(`${name}:${key}`) });
      return Boolean(result && result.success);
    } catch (err) {
      return localLimit(name, hashKey(key), limit, periodSeconds);
    }
  }

  return localLimit(name, hashKey(key), limit, periodSeconds);
}

function rateLimit({ name, binding, limit, periodSeconds, key, message }) {
  return async (req, res, next) => {
    if (localTestBypass(req)) return next();

    try {
      const value = (typeof key === 'function' ? key(req) : clientIp(req)) || 'unknown';
      const allowed = await allow(name, binding, value, limit, periodSeconds);

      if (!allowed) {
        res.setHeader('Retry-After', String(periodSeconds));
        return res.status(429).json({
          message: message || 'Too many requests. Please try again later.'
        });
      }
    } catch (err) {
      return next();
    }

    return next();
  };
}

const authIp = rateLimit({
  name: 'auth-ip',
  binding: 'AUTH_IP_RATE_LIMITER',
  limit: 30,
  periodSeconds: 60,
  key: clientIp
});

const authEmail = rateLimit({
  name: 'auth-email',
  binding: 'AUTH_EMAIL_RATE_LIMITER',
  limit: 10,
  periodSeconds: 60,
  key: emailOrChallenge
});

const contactIp = rateLimit({
  name: 'contact-ip',
  binding: 'CONTACT_RATE_LIMITER',
  limit: 5,
  periodSeconds: 60,
  key: clientIp
});

const contactEmail = rateLimit({
  name: 'contact-email',
  binding: 'CONTACT_RATE_LIMITER',
  limit: 5,
  periodSeconds: 60,
  key: emailOrChallenge
});

module.exports = {
  clientIp,
  localTestBypass,
  authIp,
  authEmail,
  contactIp,
  contactEmail
};
