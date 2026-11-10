const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db');
const { sendPasswordResetCode } = require('../lib/mailer');

const router = express.Router();

const CODE_MINUTES = Number(process.env.PASSWORD_RESET_CODE_MINUTES) || 10;
const MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const GENERIC_MESSAGE = 'If an account exists for that email, we sent a password reset code.';

function requestIp(req) {
  return req.headers['x-forwarded-for'] || req.ip || null;
}

router.post('/request', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE lower(email) = $1', [email]);
    if (result.rows.length === 0 || result.rows[0].banned_at) {
      return res.json({ message: GENERIC_MESSAGE });
    }

    const user = result.rows[0];
    await pool.query('UPDATE password_reset_codes SET consumed = true WHERE user_id = $1 AND consumed = false', [
      user.id
    ]);

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const challenge = crypto.randomBytes(24).toString('hex');
    const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
    const expiresAt = new Date(Date.now() + CODE_MINUTES * 60 * 1000);

    await pool.query(
      `INSERT INTO password_reset_codes (challenge, user_id, code_hash, expires_at, request_ip)
       VALUES ($1, $2, $3, $4, $5)`,
      [challenge, user.id, codeHash, expiresAt, requestIp(req)]
    );

    let delivered = false;
    let mode = 'error';
    try {
      const sent = await sendPasswordResetCode({
        to: user.email,
        name: user.first_name,
        code,
        minutes: CODE_MINUTES
      });
      delivered = sent.delivered;
      mode = sent.mode;
    } catch (err) {
      console.error('Password reset email delivery failed:', err.message);
    }

    res.json({
      message: GENERIC_MESSAGE,
      challenge,
      emailDelivered: delivered,
      expiresInMinutes: CODE_MINUTES,
      devCode: !IS_PRODUCTION && mode === 'console' ? code : undefined
    });
  } catch (err) {
    console.error('Password reset request failed:', err.message);
    res.json({ message: GENERIC_MESSAGE });
  }
});

router.post('/verify', async (req, res) => {
  const { challenge, code, new_password } = req.body || {};

  if (!challenge || !/^\d{6}$/.test(String(code || ''))) {
    return res.status(400).json({ message: 'Enter the 6-digit reset code from your email.' });
  }

  if (String(new_password || '').length < 8) {
    return res.status(400).json({ message: 'Your new password must be at least 8 characters.' });
  }

  try {
    const result = await pool.query(
      `SELECT pr.*, u.banned_at FROM password_reset_codes pr
       JOIN users u ON u.id = pr.user_id
       WHERE pr.challenge = $1`,
      [challenge]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'This reset code is invalid. Request a new one.' });
    }

    const record = result.rows[0];

    if (record.banned_at) {
      return res.status(403).json({ message: 'This account has been banned.' });
    }

    if (record.consumed) {
      return res.status(400).json({ message: 'This reset code has already been used.' });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: 'This reset code has expired. Request a new one.' });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await pool.query('UPDATE password_reset_codes SET consumed = true WHERE id = $1', [record.id]);
      return res.status(429).json({ message: 'Too many incorrect attempts. Request a new code.' });
    }

    const valid = await bcrypt.compare(String(code), record.code_hash);
    if (!valid) {
      const attempts = record.attempts + 1;
      await pool.query('UPDATE password_reset_codes SET attempts = $1 WHERE id = $2', [attempts, record.id]);
      const remaining = MAX_ATTEMPTS - attempts;
      return res.status(401).json({
        message:
          remaining > 0
            ? `That code is incorrect. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Too many incorrect attempts. Request a new code.'
      });
    }

    const hashed = await bcrypt.hash(String(new_password), BCRYPT_ROUNDS);

    await pool.query(
      `UPDATE users
       SET password_hash = $1, session_version = session_version + 1, updated_at = now()
       WHERE id = $2`,
      [hashed, record.user_id]
    );

    await pool.query('UPDATE password_reset_codes SET consumed = true WHERE id = $1', [record.id]);

    res.json({ message: 'Your password was reset. You can log in with your new password.', redirect: '/login' });
  } catch (err) {
    console.error('Password reset verification failed:', err.message);
    res.status(500).json({ message: 'Could not reset your password. Please try again.' });
  }
});

module.exports = router;
