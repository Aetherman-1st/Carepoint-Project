const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../lib/auth');
const { hashPassword, verifyPassword } = require('../lib/password');
const { createSession, sessionCookie, requestIsSecure } = require('../lib/session');

const router = express.Router();
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

router.post('/', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: 'Provide old and new passwords.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  try {
    const current = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (current.rows.length === 0) {
      return res.status(401).json({ message: 'Please log in to continue.' });
    }

    const match = await verifyPassword(oldPassword, current.rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Old password is incorrect.' });
    }

    const hashed = await hashPassword(newPassword, BCRYPT_ROUNDS);

    const updated = await pool.query(
      `UPDATE users
       SET password_hash = $1,
           session_version = session_version + 1,
           updated_at = now()
       WHERE id = $2
       RETURNING id, first_name, last_name, email, role, clinic_id, session_version`,
      [hashed, req.user.id]
    );

    const user = updated.rows[0];
    const token = createSession(
      {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role
      },
      { remember: Boolean(req.session && req.session.remember), sessionVersion: user.session_version }
    );

    res.setHeader(
      'Set-Cookie',
      sessionCookie(token, {
        persistent: Boolean(req.session && req.session.remember),
        secure: requestIsSecure(req)
      })
    );

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not change the password.' });
  }
});

module.exports = router;
