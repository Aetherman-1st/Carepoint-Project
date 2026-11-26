const crypto = require('crypto');
const pool = require('../db');

function hashKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function clientIp(req) {
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp) return String(cfIp).trim();

  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();

  return req.ip || 'unknown';
}

function keysFor(req, email) {
  return {
    emailKey: hashKey(normalizeEmail(email)),
    ipKey: hashKey(clientIp(req))
  };
}

async function lockedRemainingSeconds(scope, emailKey, ipKey) {
  const result = await pool.query(
    `SELECT max(locked_until) AS locked_until
     FROM login_attempts
     WHERE scope = $1
       AND ((kind = 'email' AND key = $2) OR (kind = 'ip' AND key = $3))
       AND locked_until > now()`,
    [scope, emailKey, ipKey]
  );
  const until = result.rows[0] && result.rows[0].locked_until;
  if (!until) return 0;
  return Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 1000));
}

function remainingFromRows(rows) {
  const locked = rows
    .map((row) => row && row.locked_until && new Date(row.locked_until).getTime())
    .filter((value) => value && value > Date.now());
  if (locked.length === 0) return 0;
  return Math.max(1, Math.ceil((Math.max(...locked) - Date.now()) / 1000));
}

async function checkAndIncrement(scope, emailKey, ipKey, { maxAttempts, windowSeconds, cooldownSeconds }) {
  const rows = [];
  for (const [kind, key] of [['email', emailKey], ['ip', ipKey]]) {
    const result = await pool.query(
      `INSERT INTO login_attempts (scope, kind, key, attempts, window_started_at, locked_until, updated_at)
       VALUES ($1, $2, $3, 1, now(), NULL, now())
       ON CONFLICT (scope, kind, key) DO UPDATE SET
         attempts = CASE
           WHEN login_attempts.locked_until > now() THEN login_attempts.attempts
           WHEN login_attempts.window_started_at < now() - make_interval(secs => $4)
                OR (login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until <= now())
             THEN 1
           ELSE login_attempts.attempts + 1 END,
         window_started_at = CASE
           WHEN login_attempts.locked_until > now() THEN login_attempts.window_started_at
           WHEN login_attempts.window_started_at < now() - make_interval(secs => $4)
                OR (login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until <= now())
             THEN now()
           ELSE login_attempts.window_started_at END,
         locked_until = CASE
           WHEN login_attempts.locked_until > now() THEN login_attempts.locked_until
           WHEN (CASE
             WHEN login_attempts.window_started_at < now() - make_interval(secs => $4)
                  OR (login_attempts.locked_until IS NOT NULL AND login_attempts.locked_until <= now())
               THEN 1 ELSE login_attempts.attempts + 1 END) > $5
             THEN now() + make_interval(secs => $6)
           ELSE NULL END,
         updated_at = now()
       RETURNING attempts, locked_until`,
      [scope, kind, key, windowSeconds, maxAttempts, cooldownSeconds]
    );
    rows.push(result.rows[0]);
  }

  await pool.query(`DELETE FROM login_attempts WHERE updated_at < now() - interval '1 day'`).catch(() => {});
  return { email: rows[0], ip: rows[1], remaining: remainingFromRows(rows) };
}

async function resetAttempts(scope, emailKey, ipKey) {
  await pool.query(
    `DELETE FROM login_attempts
     WHERE scope = $1
       AND ((kind = 'email' AND key = $2) OR (kind = 'ip' AND key = $3))`,
    [scope, emailKey, ipKey]
  );
}

function cooldownMessage(remainingSeconds) {
  const minutes = Math.max(1, Math.ceil(remainingSeconds / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

async function guard(scope, req, email, res, limits) {
  const { emailKey, ipKey } = keysFor(req, email);
  const state = await checkAndIncrement(scope, emailKey, ipKey, limits);
  if (state.remaining > 0) {
    res.setHeader('Retry-After', String(state.remaining));
    res.status(429).json({ code: 'login_locked', message: cooldownMessage(state.remaining) });
    return null;
  }
  return { emailKey, ipKey };
}

module.exports = {
  hashKey,
  normalizeEmail,
  clientIp,
  keysFor,
  lockedRemainingSeconds,
  checkAndIncrement,
  resetAttempts,
  cooldownMessage,
  guard
};
