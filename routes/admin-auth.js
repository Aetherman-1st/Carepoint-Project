const express = require('express');
const { logAudit } = require('../lib/audit');
const limiter = require('../lib/login-attempts');

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://upldnuraxojivoqvckzt.supabase.co';
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY || 'sb_publishable_Mxc0T3RIAncl8efvHOvjAg_l_yAY7lq';

const MAX_ATTEMPTS = 4;
const WINDOW_SECONDS = 5 * 60;
const COOLDOWN_SECONDS = 5 * 60;
const LIMITS = { maxAttempts: MAX_ATTEMPTS, windowSeconds: WINDOW_SECONDS, cooldownSeconds: COOLDOWN_SECONDS };

router.post('/login', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const email = limiter.normalizeEmail(req.body && req.body.email);
  const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  let keys;
  try {
    keys = await limiter.guard('admin', req, email, res, LIMITS);
  } catch (err) {
    console.error('Admin login limiter check failed:', err.message);
    keys = null;
    res.status(503).json({ message: 'Could not sign in right now. Please try again.' });
    return;
  }
  if (!keys) return;

  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
  } catch (err) {
    console.error('Admin login upstream unreachable:', err.message);
    return res.status(502).json({ message: 'Could not reach the sign-in service. Please try again.' });
  }

  if (!response.ok) {
    await logAudit({
      req,
      actorEmail: email,
      action: 'admin_login_failed',
      details: { reason: 'invalid_credentials' }
    });
    return res.status(401).json({ message: 'Invalid email or password.' });
  }

  const session = await response.json();

  try {
    await limiter.resetAttempts('admin', keys.emailKey, keys.ipKey);
  } catch (err) {
    console.error('Admin login limiter reset failed:', err.message);
  }
  await logAudit({ req, actorEmail: email, action: 'admin_login_success' });

  return res.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: session.user
  });
});

module.exports = router;
