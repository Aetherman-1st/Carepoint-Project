require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('../db');

const PORT = Number(process.env.TEST_PORT) || 3101;
const BASE = `http://127.0.0.1:${PORT}`;
const stamp = Date.now();
const email = `task1.test.${stamp}@example.com`;
const unverifiedEmail = `task1.unverified.${stamp}@example.com`;
const resetEmail = `task1.reset.${stamp}@example.com`;
const password = 'TaskOne!2345';
const newPassword = 'TaskOne!6789';
let server;
let passed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ok  ${message}`);
}

function cookieFrom(response) {
  const raw = response.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

async function json(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Expected JSON, got: ${text.slice(0, 200)}`);
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/session`);
      if (response.ok) return;
    } catch (err) {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Server did not start');
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE lower(email) = ANY($1)', [
    [email, unverifiedEmail, resetEmail]
  ]);
}

async function main() {
  console.log('Starting isolated test server...');
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      EMAIL_TRANSPORT: 'console',
      NODE_ENV: 'development'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (chunk) => process.env.VERBOSE_TEST && process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.env.VERBOSE_TEST && process.stderr.write(chunk));
  await waitForServer();
  await cleanup();

  console.log('Signup, verification, and persistence');
  const signup = await fetch(`${BASE}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name: 'Task', last_name: 'One', email, password })
  });
  const signupData = await json(signup);
  assert(signup.status === 201, 'signup returns 201');
  assert(signupData.verificationRequired === true, 'signup requires email verification');
  assert(/^\d{6}$/.test(signupData.devCode || ''), 'development signup code is returned');
  assert(signupData.emailDeliveryFailed === false, 'console delivery is not a delivery failure');

  const dbUser = await pool.query('SELECT id, email_verified_at FROM users WHERE lower(email) = $1', [email]);
  assert(dbUser.rows.length === 1, 'signup persists the user row');
  assert(dbUser.rows[0].email_verified_at === null, 'user starts unverified');

  const verify = await fetch(`${BASE}/signup/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge: signupData.challenge, code: signupData.devCode })
  });
  const verifyData = await json(verify);
  let cookie = cookieFrom(verify);
  assert(verify.status === 200, 'signup verification succeeds');
  assert(cookie.startsWith('cp_session='), 'verification sets a session cookie');

  const verifiedRow = await pool.query('SELECT email_verified_at FROM users WHERE id = $1', [dbUser.rows[0].id]);
  assert(verifiedRow.rows[0].email_verified_at !== null, 'verification persists email_verified_at');

  const session1 = await fetch(`${BASE}/api/session`, { headers: { Cookie: cookie } });
  const session1Data = await json(session1);
  assert(session1Data.user && session1Data.user.email === email, 'session resolves the verified user');
  assert(session1Data.user.role === 'user', 'new signup gets the user role');

  const appointments = await fetch(`${BASE}/api/appointments`, { headers: { Cookie: cookie } });
  assert(appointments.status === 200, 'verified patient can load appointments');

  const logout = await fetch(`${BASE}/logout`, { method: 'POST', headers: { Cookie: cookie } });
  cookie = cookieFrom(logout);
  const afterLogout = await fetch(`${BASE}/api/session`, { headers: { Cookie: cookie } });
  const afterLogoutData = await json(afterLogout);
  assert(afterLogoutData.user === null, 'logout clears the session');

  console.log('Login error messages');
  const missing = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `missing.${stamp}@example.com`, password })
  });
  const missingData = await json(missing);
  assert(missing.status === 404 && missingData.code === 'email_not_found', 'unknown email gets a clear 404');

  const wrong = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'WrongPassword!1' })
  });
  const wrongData = await json(wrong);
  assert(wrong.status === 401 && wrongData.code === 'wrong_password', 'wrong password gets a clear 401');

  const login = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, remember: true })
  });
  const loginData = await json(login);
  assert(login.status === 200 && loginData.twoFactorRequired, 'valid password starts 2FA');

  const loginVerify = await fetch(`${BASE}/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge: loginData.challenge, code: loginData.devCode })
  });
  const loginVerifyData = await json(loginVerify);
  cookie = cookieFrom(loginVerify);
  const rawCookie = loginVerify.headers.get('set-cookie') || '';
  assert(loginVerify.status === 200, 'login verification succeeds');
  assert(/Max-Age=2592000/.test(rawCookie), 'remember-me sets a 30-day cookie');
  assert(loginVerifyData.user.role === 'user', 'login returns the user role');

  console.log('Unverified account recovery');
  const hashed = await bcrypt.hash(password, 12);
  const unverified = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash)
     VALUES ('Unverified', 'Patient', $1, $2) RETURNING id`,
    [unverifiedEmail, hashed]
  );
  const unverifiedLogin = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: unverifiedEmail, password })
  });
  const unverifiedData = await json(unverifiedLogin);
  assert(
    unverifiedLogin.status === 403 && unverifiedData.code === 'email_not_verified',
    'unverified login gets a clear resendable error'
  );

  const resend = await fetch(`${BASE}/signup/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: unverifiedEmail, password })
  });
  const resendData = await json(resend);
  assert(resend.status === 200 && resendData.verificationRequired, 'unverified user can request a new code');
  const unverifiedVerify = await fetch(`${BASE}/signup/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge: resendData.challenge, code: resendData.devCode })
  });
  assert(unverifiedVerify.status === 200, 'resend verification code can verify the account');

  console.log('Password reset and session invalidation');
  const resetHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, email_verified_at)
     VALUES ('Reset', 'Patient', $1, $2, now())`,
    [resetEmail, resetHash]
  );
  const resetLogin = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: resetEmail, password })
  });
  const resetLoginData = await json(resetLogin);
  const resetSession = await fetch(`${BASE}/login/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge: resetLoginData.challenge, code: resetLoginData.devCode })
  });
  const resetCookie = cookieFrom(resetSession);
  assert(resetSession.status === 200, 'reset test account can log in');

  const resetRequest = await fetch(`${BASE}/api/password-reset/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: resetEmail })
  });
  const resetRequestData = await json(resetRequest);
  assert(resetRequest.status === 200 && /^\d{6}$/.test(resetRequestData.devCode || ''), 'password reset code is created');

  const resetVerify = await fetch(`${BASE}/api/password-reset/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge: resetRequestData.challenge,
      code: resetRequestData.devCode,
      new_password: newPassword
    })
  });
  assert(resetVerify.status === 200, 'password reset succeeds');

  const oldSession = await fetch(`${BASE}/api/session`, { headers: { Cookie: resetCookie } });
  const oldSessionData = await json(oldSession);
  assert(oldSessionData.user === null, 'password reset invalidates old sessions');

  const newLogin = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: resetEmail, password: newPassword })
  });
  const newLoginData = await json(newLogin);
  assert(newLogin.status === 200 && newLoginData.twoFactorRequired, 'new password works after reset');

  await cleanup();
  console.log(`\nTask 1 auth flow passed (${passed} checks).`);
}

main()
  .catch((err) => {
    console.error('\nTask 1 auth flow failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) server.kill('SIGTERM');
    await pool.end().catch(() => {});
  });
