const crypto = require('crypto');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEV_SECRET = 'carepoint-development-secret-change-me';
const SECRET = process.env.SESSION_SECRET || (IS_PRODUCTION ? '' : DEV_SECRET);

if (!SECRET || (IS_PRODUCTION && SECRET === DEV_SECRET)) {
  throw new Error('SESSION_SECRET must be set to a strong random value in production.');
}

const COOKIE_NAME = 'cp_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const REMEMBER_TTL_SECONDS = 30 * 24 * 60 * 60;

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

function ttlFor(remember) {
  return remember ? REMEMBER_TTL_SECONDS : SESSION_TTL_SECONDS;
}

function createSession(user, options = {}) {
  const remember = Boolean(options.remember);
  const payload = {
    uid: user.id,
    email: user.email,
    fn: user.first_name,
    ln: user.last_name,
    role: user.role || 'user',
    sv: Number(options.sessionVersion || user.session_version || 1),
    remember,
    exp: Math.floor(Date.now() / 1000) + ttlFor(remember)
  };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data)}`;
}

function readSession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expected = sign(data);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

function parseCookies(header = '') {
  const cookies = {};
  header.split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    if (!key) return;
    try {
      cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
    } catch (err) {
      cookies[key] = part.slice(index + 1).trim();
    }
  });
  return cookies;
}

function requestIsSecure(req) {
  if (!req) return IS_PRODUCTION;
  return Boolean(
    req.secure ||
      String(req.headers['x-forwarded-proto'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase() === 'https'
  );
}

function sessionCookie(token, options = {}) {
  const remember = Boolean(options.remember || options.persistent);
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (remember) parts.push(`Max-Age=${REMEMBER_TTL_SECONDS}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie(options = {}) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  REMEMBER_TTL_SECONDS,
  createSession,
  readSession,
  parseCookies,
  requestIsSecure,
  sessionCookie,
  clearSessionCookie
};
