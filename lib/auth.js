require('dotenv').config();
const pool = require('../db');
const { parseCookies, readSession, clearSessionCookie } = require('./session');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

function isAdminEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL;
}

async function attachUser(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || '');
  const session = readSession(cookies.cp_session);
  req.user = null;
  req.accountStatus = null;

  if (!session) return next();

  try {
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, role, banned_at FROM users WHERE id = $1',
      [session.uid]
    );

    if (result.rows.length === 0) {
      req.accountStatus = 'deleted';
      res.setHeader('Set-Cookie', clearSessionCookie());
      return next();
    }

    const user = result.rows[0];
    if (user.banned_at) {
      req.accountStatus = 'banned';
      res.setHeader('Set-Cookie', clearSessionCookie());
      return next();
    }

    req.user = {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: isAdminEmail(user.email) ? 'admin' : user.role || 'user'
    };
  } catch (err) {
    req.user = null;
  }

  next();
}

function loginRedirect(req) {
  const reason = req.accountStatus ? '&account=' + req.accountStatus : '';
  return '/login?next=' + encodeURIComponent(req.originalUrl) + reason;
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  if (req.accountStatus === 'banned') {
    return res.status(403).json({ message: 'This account has been banned.' });
  }
  if (req.accountStatus === 'deleted') {
    return res.status(401).json({ message: 'This account no longer exists.' });
  }
  res.status(401).json({ message: 'Please log in to continue.' });
}

function requireAdmin(req, res, next) {
  if (req.user && isAdminEmail(req.user.email)) return next();
  res.status(403).json({ message: 'This area is restricted to administrators.' });
}

function requireUserPage(req, res, next) {
  if (req.user) return next();
  res.redirect(loginRedirect(req));
}

function requireAdminPage(req, res, next) {
  if (!req.user) {
    return res.redirect(loginRedirect(req));
  }
  if (!isAdminEmail(req.user.email)) {
    return res.redirect('/patient');
  }
  next();
}

module.exports = {
  ADMIN_EMAIL,
  isAdminEmail,
  attachUser,
  requireAuth,
  requireAdmin,
  requireUserPage,
  requireAdminPage
};
