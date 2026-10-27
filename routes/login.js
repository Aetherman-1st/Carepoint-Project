const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../db');
const { createSession, sessionCookie } = require('../lib/session');
const { isAdminEmail } = require('../lib/auth');
const { sendLoginCode } = require('../lib/mailer');

const router = express.Router();

const CODE_MINUTES = Number(process.env.TWO_FACTOR_CODE_MINUTES) || 10;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 5;
const RESEND_COOLDOWN_SECONDS = 60;

function requestIp(req) {
  return req.headers['x-forwarded-for'] || req.ip || null;
}

async function issueCode(user, req) {
  const windowCount = await pool.query(
    `SELECT count(*)::int AS count FROM login_codes
     WHERE user_id = $1 AND created_at > now() - interval '10 minutes'`,
    [user.id]
  );

  if (windowCount.rows[0].count >= MAX_CODES_PER_WINDOW) {
    const error = new Error('Too many verification codes requested. Please try again later.');
    error.status = 429;
    throw error;
  }

  await pool.query('UPDATE login_codes SET consumed = true WHERE user_id = $1 AND consumed = false', [
    user.id
  ]);

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const challenge = crypto.randomBytes(24).toString('hex');
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60 * 1000);

  const inserted = await pool.query(
    `INSERT INTO login_codes (challenge, user_id, code_hash, expires_at, request_ip)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [challenge, user.id, codeHash, expiresAt, requestIp(req)]
  );

  try {
    const result = await sendLoginCode({
      to: user.email,
      name: user.first_name,
      code,
      minutes: CODE_MINUTES
    });

    await pool.query(
      'UPDATE login_codes SET sent = true, sent_at = now() WHERE id = $1',
      [inserted.rows[0].id]
    );

    return {
      challenge,
      code,
      delivered: result.delivered,
      mode: result.mode,
      minutes: CODE_MINUTES
    };
  } catch (err) {
    await pool.query('UPDATE login_codes SET delivery_error = $1 WHERE id = $2', [
      String(err.message).slice(0, 500),
      inserted.rows[0].id
    ]);
    const error = new Error('We could not send the verification email. Please try again.');
    error.status = 502;
    throw error;
  }
}

router.post('/', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [
      String(email).trim()
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Incorrect email or password' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(401).json({ message: 'Incorrect email or password' });
    }

    if (user.banned_at) {
      return res.status(403).json({
        message: 'This account has been banned. Contact the CarePoint team if you believe this is a mistake.'
      });
    }

    if (!user.email_verified_at) {
      return res.status(403).json({
        message: 'Please verify your email before logging in. Return to Create account to resend the verification code.'
      });
    }

    const issued = await issueCode(user, req);

    res.json({
      twoFactorRequired: true,
      challenge: issued.challenge,
      email: user.email,
      message: issued.delivered
        ? `We sent a 6-digit code to ${user.email}.`
        : 'Email delivery is not configured. Use the development code provided.',
      emailDelivered: issued.delivered,
      devCode: issued.delivered ? undefined : issued.code,
      expiresInMinutes: issued.minutes
    });
  } catch (err) {
    res.status(err.status || 500).json({
      message: err.status ? err.message : 'Something went wrong'
    });
  }
});

router.post('/verify', async (req, res) => {
  const { challenge, code } = req.body || {};

  if (!challenge || !/^\d{6}$/.test(String(code || ''))) {
    return res.status(400).json({ message: 'Enter the 6-digit code from your email.' });
  }

  try {
    const result = await pool.query(
      `SELECT lc.*, u.first_name, u.last_name, u.email, u.role, u.banned_at
       FROM login_codes lc
       JOIN users u ON u.id = lc.user_id
       WHERE lc.challenge = $1`,
      [challenge]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ message: 'This code is invalid. Please log in again.' });
    }

    const record = result.rows[0];

    if (record.banned_at) {
      return res.status(403).json({
        message: 'This account has been banned. Contact the CarePoint team if you believe this is a mistake.'
      });
    }

    if (record.consumed) {
      return res.status(400).json({ message: 'This code has already been used. Please log in again.' });
    }

    if (new Date(record.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ message: 'This code has expired. Please request a new one.' });
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await pool.query('UPDATE login_codes SET consumed = true WHERE id = $1', [record.id]);
      return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    }

    const valid = await bcrypt.compare(String(code), record.code_hash);

    if (!valid) {
      const attempts = record.attempts + 1;
      await pool.query('UPDATE login_codes SET attempts = $1 WHERE id = $2', [attempts, record.id]);
      const remaining = MAX_ATTEMPTS - attempts;
      return res.status(401).json({
        message:
          remaining > 0
            ? `That code is incorrect. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Too many incorrect attempts. Please request a new code.'
      });
    }

    await pool.query(
      'UPDATE login_codes SET consumed = true, verified_at = now() WHERE id = $1',
      [record.id]
    );

    await pool.query('UPDATE users SET last_login_at = now(), last_login_ip = $1 WHERE id = $2', [
      requestIp(req),
      record.user_id
    ]);

    const admin = isAdminEmail(record.email);
    const role = admin ? 'admin' : record.role || 'user';
    const token = createSession({
      id: record.user_id,
      first_name: record.first_name,
      last_name: record.last_name,
      email: record.email,
      role
    });

    res.setHeader('Set-Cookie', sessionCookie(token));
    res.json({
      message: 'Login successful',
      redirect: admin ? '/admin' : '/patient',
      user: {
        id: record.user_id,
        first_name: record.first_name,
        last_name: record.last_name,
        email: record.email,
        role
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Something went wrong' });
  }
});

router.post('/resend', async (req, res) => {
  const { challenge } = req.body || {};

  if (!challenge) {
    return res.status(400).json({ message: 'Please log in again to request a new code.' });
  }

  try {
    const latest = await pool.query(
      `SELECT lc.*, u.first_name, u.last_name, u.email, u.role, u.banned_at
       FROM login_codes lc
       JOIN users u ON u.id = lc.user_id
       WHERE lc.challenge = $1`,
      [challenge]
    );

    if (latest.rows.length === 0) {
      return res.status(400).json({ message: 'Please log in again to request a new code.' });
    }

    const record = latest.rows[0];

    if (record.banned_at) {
      return res.status(403).json({
        message: 'This account has been banned. Contact the CarePoint team if you believe this is a mistake.'
      });
    }

    const lastSent = new Date(record.created_at).getTime();
    const waitMs = RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - lastSent);

    if (waitMs > 0) {
      return res.status(429).json({
        message: `Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`,
        retryAfter: Math.ceil(waitMs / 1000)
      });
    }

    const user = {
      id: record.user_id,
      first_name: record.first_name,
      last_name: record.last_name,
      email: record.email,
      role: record.role
    };

    const issued = await issueCode(user, req);

    res.json({
      message: issued.delivered ? 'A new code was sent.' : 'A new development code was created.',
      challenge: issued.challenge,
      emailDelivered: issued.delivered,
      devCode: issued.delivered ? undefined : issued.code,
      expiresInMinutes: issued.minutes
    });
  } catch (err) {
    res.status(err.status || 500).json({
      message: err.status ? err.message : 'Something went wrong'
    });
  }
});

module.exports = router;
