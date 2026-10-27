require('dotenv').config();
const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || 'carepoint-development-secret-change-me';
const TTL_SECONDS = 7 * 24 * 60 * 60;
const COOKIE_NAME = 'cp_session';

function sign(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

function createSession(user) {
  const payload = {
    uid: user.id,
    email: user.email,
    fn: user.first_name,
    ln: user.last_name,
    role: user.role || 'user',
    exp: Math.floor(Date.now() / 1000) + TTL_SECONDS
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

function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TTL_SECONDS}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

module.exports = {
  COOKIE_NAME,
  createSession,
  readSession,
  parseCookies,
  sessionCookie,
  clearSessionCookie
};
