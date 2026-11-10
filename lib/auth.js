require('dotenv').config();
const pool = require('../db');
const { parseCookies, readSession, clearSessionCookie, requestIsSecure } = require('./session');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

function isAdminEmail(email) {
  return typeof email === 'string' && email.trim().toLowerCase() === ADMIN_EMAIL;
}

function normalizedRole(user) {
  if (!user) return null;
  if (isAdminEmail(user.email)) return 'admin';
  if (user.role === 'clinic') return 'clinic';
  if (user.role === 'admin') return 'admin';
  return 'user';
}

function roleHome(role) {
  if (role === 'admin') return '/admin';
  if (role === 'clinic') return '/clinic';
  return '/patient';
}

async function attachUser(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || '');
  const session = readSession(cookies.cp_session);
  req.user = null;
  req.session = null;
  req.accountStatus = null;

  if (!session) return next();

  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, role, clinic_id, banned_at,
              email_verified_at, session_version
       FROM users WHERE id = $1`,
      [session.uid]
    );

    if (result.rows.length === 0) {
      req.accountStatus = 'deleted';
      res.setHeader('Set-Cookie', clearSessionCookie({ secure: requestIsSecure(req) }));
      return next();
    }

    const user = result.rows[0];
    if (user.banned_at) {
      req.accountStatus = 'banned';
      res.setHeader('Set-Cookie', clearSessionCookie({ secure: requestIsSecure(req) }));
      return next();
    }

    if (Number(session.sv || 1) !== Number(user.session_version || 1)) {
      req.accountStatus = 'session_expired';
      res.setHeader('Set-Cookie', clearSessionCookie({ secure: requestIsSecure(req) }));
      return next();
    }

    req.session = session;
    req.user = {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: normalizedRole(user),
      clinic_id: user.clinic_id || null,
      session_version: user.session_version || 1
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
  if (req.accountStatus === 'session_expired') {
    return res.status(401).json({ message: 'Your session expired. Please log in again.' });
  }
  res.status(401).json({ message: 'Please log in to continue.' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return requireAuth(req, res, next);
    if (roles.includes(req.user.role)) return next();
    res.status(403).json({ message: 'You do not have permission to access this area.' });
  };
}

const requireUser = requireRole('user');
const requireClinic = requireRole('clinic');
const requireAdmin = requireRole('admin');

function pageGuard(role) {
  return (req, res, next) => {
    if (!req.user) return res.redirect(loginRedirect(req));
    if (req.user.role !== role) return res.redirect(roleHome(req.user.role));
    next();
  };
}

const requireUserPage = pageGuard('user');
const requireClinicPage = pageGuard('clinic');
const requireAdminPage = pageGuard('admin');

module.exports = {
  ADMIN_EMAIL,
  isAdminEmail,
  normalizedRole,
  roleHome,
  attachUser,
  requireAuth,
  requireRole,
  requireUser,
  requireClinic,
  requireAdmin,
  requireUserPage,
  requireClinicPage,
  requireAdminPage
};
