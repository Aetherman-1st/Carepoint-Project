#!/usr/bin/env node
require('dotenv').config();

process.env.DB_PORT = process.env.NEG_DB_PORT || '6543';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { Image } = require('imagescript');
const pool = require('../db');
const { createSession } = require('../lib/session');

const PORT = Number(process.env.NEG_PORT) || 3299;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');
const EVIDENCE_PATH = path.join(ROOT, 'evidence', 'EVIDENCE_9_public.md');
const stamp = `${Date.now()}.${crypto.randomBytes(2).toString('hex')}`;

const results = [];
const fixtures = {};
let server;
let seq = 0;

function short(value, max = 140) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (!text) return '<empty>';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function statusList(expected) {
  return Array.isArray(expected) ? expected.join(' or ') : String(expected);
}

function check(id, test, request, expected, response, options = {}) {
  const statuses = Array.isArray(expected) ? expected : [expected];
  let pass = statuses.includes(response.status);
  const failures = [];

  if (!pass) failures.push(`status ${response.status} not in ${statusList(expected)}`);

  for (const needle of options.contains || []) {
    if (!response.text.toLowerCase().includes(String(needle).toLowerCase())) {
      pass = false;
      failures.push(`missing "${needle}"`);
    }
  }

  let note = '';
  if (typeof options.validate === 'function') {
    const verdict = options.validate(response);
    if (!verdict.pass) {
      pass = false;
      failures.push(verdict.note || 'validation failed');
    } else if (verdict.note) {
      note = ` [${verdict.note}]`;
    }
  }

  results.push({
    id,
    test,
    request,
    expected: statusList(expected),
    actual: `${response.status} ${short(response.text)}${note}`,
    pass,
    failures
  });

  const label = pass ? 'PASS' : 'FAIL';
  console.log(`${label} ${id} ${test} -> ${response.status}${note}`);
  if (!pass) console.log(`     ${failures.join('; ')}`);
}

async function call(method, urlPath, options = {}) {
  const headers = {
    'X-Forwarded-For': `198.51.100.${(seq % 250) + 1}`,
    ...(options.headers || {})
  };
  seq += 1;

  if (options.cookie) headers.Cookie = options.cookie;
  if (options.origin !== null) headers.Origin = options.origin || BASE;

  let body = options.body;
  if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const response = await fetch(BASE + urlPath, {
    method,
    headers,
    body,
    redirect: 'manual'
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, text };
}

function sessionCookie(user) {
  const token = createSession(
    {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role
    },
    { remember: false, sessionVersion: user.session_version }
  );
  return `cp_session=${token}`;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/api/session`, {
        headers: { 'X-Forwarded-For': '198.51.100.250' }
      });
      if (response.ok) return;
    } catch (err) {
      // server still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Local server did not start');
}

async function makePng() {
  return Buffer.from(await new Image(2, 2).fill(0xff0000ff).encodePNG());
}

async function insertLoginCode(challenge, userId, code, { expiresAt, consumed = false, attempts = 0 }) {
  const codeHash = await bcrypt.hash(code, 4);
  await pool.query(
    `INSERT INTO login_codes (challenge, user_id, code_hash, expires_at, consumed, attempts, sent)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [challenge, userId, codeHash, expiresAt, consumed, attempts]
  );
}

async function seedFixtures() {
  const png = await makePng();
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dayAfter = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const passwordHash = await bcrypt.hash('NegTest!2345', 4);

  const clinicX = await pool.query(
    `INSERT INTO clinics (name, specialty, address, city, phone, description, is_active)
     VALUES ($1, 'General', '1 X Street', 'Amman', '+962 6 000 0001', 'Negative test clinic X', true)
     RETURNING id`,
    [`Neg9 Clinic X ${stamp}`]
  );
  const clinicY = await pool.query(
    `INSERT INTO clinics (name, specialty, address, city, phone, description, is_active)
     VALUES ($1, 'General', '1 Y Street', 'Amman', '+962 6 000 0002', 'Negative test clinic Y', true)
     RETURNING id`,
    [`Neg9 Clinic Y ${stamp}`]
  );

  const userA = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, email_verified_at, phone)
     VALUES ('Neg', 'PatientA', $1, $2, 'user', now(), '+962 79 000 0001')
     RETURNING id, first_name, last_name, email, role, clinic_id, session_version`,
    [`neg9.${stamp}.a@example.com`, passwordHash]
  );
  const userB = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, email_verified_at, phone)
     VALUES ('Neg', 'PatientB', $1, $2, 'user', now(), '+962 79 000 0002')
     RETURNING id, first_name, last_name, email, role, clinic_id, session_version`,
    [`neg9.${stamp}.b@example.com`, passwordHash]
  );
  const clinicUser = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, email_verified_at, phone, clinic_id)
     VALUES ('Neg', 'ClinicX', $1, $2, 'clinic', now(), '+962 6 000 0003', $3)
     RETURNING id, first_name, last_name, email, role, clinic_id, session_version`,
    [`neg9.${stamp}.clinic@example.com`, passwordHash, clinicX.rows[0].id]
  );

  fixtures.userIds = [userA.rows[0].id, userB.rows[0].id, clinicUser.rows[0].id];
  fixtures.clinicIds = [clinicX.rows[0].id, clinicY.rows[0].id];
  fixtures.emails = [userA.rows[0].email, userB.rows[0].email, clinicUser.rows[0].email];

  const apptA = await pool.query(
    `INSERT INTO appointments (user_id, clinic_id, appointment_date, appointment_time, reason, status)
     VALUES ($1, $2, $3, '09:15', 'Patient A appointment', 'Pending') RETURNING id`,
    [userA.rows[0].id, clinicX.rows[0].id, tomorrow]
  );
  const apptB = await pool.query(
    `INSERT INTO appointments (user_id, clinic_id, appointment_date, appointment_time, reason, status)
     VALUES ($1, $2, $3, '10:15', 'Patient B appointment', 'Pending') RETURNING id`,
    [userB.rows[0].id, clinicX.rows[0].id, tomorrow]
  );
  const apptY = await pool.query(
    `INSERT INTO appointments (user_id, clinic_id, appointment_date, appointment_time, reason, status)
     VALUES ($1, $2, $3, '11:15', 'Clinic Y appointment', 'Pending') RETURNING id`,
    [userB.rows[0].id, clinicY.rows[0].id, tomorrow]
  );

  async function insertFile(ownerId, name, status, content, scanResult) {
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO uploaded_files
         (id, owner_id, original_name, storage_key, extension, mime_type, size_bytes, content, status, scan_result)
       VALUES ($1, $2, $3, $4, 'png', 'image/png', $5, $6, $7, $8)`,
      [id, ownerId, name, `${id}.png`, content ? content.length : 1, content, status, scanResult]
    );
    return id;
  }

  const fileApproved = await insertFile(userB.rows[0].id, 'b-approved.png', 'approved', png, 'structural_pass_no_av');
  const filePending = await insertFile(userB.rows[0].id, 'b-pending.png', 'pending_scan', png, 'queued');
  const fileRejected = await insertFile(userB.rows[0].id, 'b-rejected.png', 'rejected', null, 'unknown_signature');

  const challengeWrong = crypto.randomBytes(16).toString('hex');
  const challengeExpired = crypto.randomBytes(16).toString('hex');
  const challengeReused = crypto.randomBytes(16).toString('hex');
  await insertLoginCode(challengeWrong, userA.rows[0].id, '123456', { expiresAt: future });
  await insertLoginCode(challengeExpired, userA.rows[0].id, '654321', { expiresAt: past });
  await insertLoginCode(challengeReused, userA.rows[0].id, '111111', { expiresAt: future, consumed: true });

  fixtures.userIds = [userA.rows[0].id, userB.rows[0].id, clinicUser.rows[0].id];
  fixtures.clinicIds = [clinicX.rows[0].id, clinicY.rows[0].id];
  fixtures.appointmentIds = [apptA.rows[0].id, apptB.rows[0].id, apptY.rows[0].id];
  fixtures.emails = [userA.rows[0].email, userB.rows[0].email, clinicUser.rows[0].email];
  fixtures.userA = userA.rows[0];
  fixtures.userB = userB.rows[0];
  fixtures.clinicUser = clinicUser.rows[0];
  fixtures.clinicX = clinicX.rows[0].id;
  fixtures.clinicY = clinicY.rows[0].id;
  fixtures.apptA = apptA.rows[0].id;
  fixtures.apptB = apptB.rows[0].id;
  fixtures.apptY = apptY.rows[0].id;
  fixtures.fileApproved = fileApproved;
  fixtures.filePending = filePending;
  fixtures.fileRejected = fileRejected;
  fixtures.png = png;
  fixtures.tomorrow = tomorrow;
  fixtures.dayAfter = dayAfter;
  fixtures.challengeWrong = challengeWrong;
  fixtures.challengeExpired = challengeExpired;
  fixtures.challengeReused = challengeReused;
}

async function cleanupFixtures() {
  const userIds = fixtures.userIds || [];
  const clinicIds = fixtures.clinicIds || [];
  const emails = fixtures.emails || [];

  if (!userIds.length && !clinicIds.length) return {};

  const counts = {};
  const statements = [
    ['file_scan_logs', 'DELETE FROM file_scan_logs WHERE user_id = ANY($1)', [userIds]],
    ['uploaded_files', 'DELETE FROM uploaded_files WHERE owner_id = ANY($1)', [userIds]],
    ['login_codes', 'DELETE FROM login_codes WHERE user_id = ANY($1)', [userIds]],
    ['signup_codes', 'DELETE FROM signup_codes WHERE user_id = ANY($1)', [userIds]],
    ['onboarding_profiles', 'DELETE FROM onboarding_profiles WHERE user_id = ANY($1)', [userIds]],
    ['appointments', 'DELETE FROM appointments WHERE user_id = ANY($1) OR clinic_id = ANY($2)', [userIds, clinicIds]],
    ['audit_logs', 'DELETE FROM audit_logs WHERE actor_email = ANY($1)', [emails]],
    ['users', 'DELETE FROM users WHERE id = ANY($1)', [userIds]],
    ['clinics', 'DELETE FROM clinics WHERE id = ANY($1)', [clinicIds]]
  ];

  for (const [name, sql, params] of statements) {
    try {
      const result = await pool.query(sql, params);
      counts[name] = result.rowCount;
    } catch (err) {
      counts[name] = `error:${err.code || err.message}`;
    }
  }
  return counts;
}

async function runTests() {
  const cookieA = sessionCookie(fixtures.userA);
  const cookieB = sessionCookie(fixtures.userB);
  const cookieClinic = sessionCookie(fixtures.clinicUser);
  const foreignOrigin = 'https://evil.example';

  // ---- IDOR: patient A vs patient B ----
  let response = await call('GET', '/api/appointments', { cookie: cookieA });
  check('N01', 'IDOR patient A reads own appointment list', 'GET /api/appointments (Cookie A)', 200, response, {
    contains: [`"id":${fixtures.apptA}`],
    validate: (res) => ({
      pass: !res.text.includes(`"id":${fixtures.apptB}`) && !res.text.includes(`"id":${fixtures.apptY}`),
      note: 'B and clinic Y appointments absent'
    })
  });

  response = await call('PATCH', `/api/appointments/${fixtures.apptB}`, {
    cookie: cookieA,
    body: { status: 'Cancelled' }
  });
  check('N02', 'IDOR patient A cancels patient B appointment', `PATCH /api/appointments/${fixtures.apptB} (Cookie A)`, 403, response, {
    contains: ['cannot change this appointment']
  });

  response = await call('PATCH', `/api/appointments/${fixtures.apptB}`, {
    cookie: cookieA,
    body: { appointment_date: fixtures.dayAfter, appointment_time: '15:00' }
  });
  check('N03', 'IDOR patient A reschedules patient B appointment', `PATCH /api/appointments/${fixtures.apptB} (Cookie A)`, 403, response, {
    contains: ['cannot change this appointment']
  });

  const apptBAfter = await pool.query(
    `SELECT status, to_char(appointment_date, 'YYYY-MM-DD') AS appointment_date
     FROM appointments WHERE id = $1`,
    [fixtures.apptB]
  );
  results.push({
    id: 'N03b',
    test: 'IDOR patient B appointment unchanged after A attempts',
    request: 'SELECT appointment B after N02/N03',
    expected: 'Pending and original date',
    actual: `${apptBAfter.rows[0].status} ${String(apptBAfter.rows[0].appointment_date).slice(0, 10)}`,
    pass: apptBAfter.rows[0].status === 'Pending' && String(apptBAfter.rows[0].appointment_date).slice(0, 10) === fixtures.tomorrow,
    failures: []
  });

  response = await call('GET', `/api/profile?user_id=${fixtures.userB.id}`, { cookie: cookieA });
  check('N04', 'IDOR patient A reads profile with B id query', `GET /api/profile?user_id=${fixtures.userB.id} (Cookie A)`, 200, response, {
    validate: (res) => {
      let body;
      try { body = JSON.parse(res.text); } catch (err) { return { pass: false, note: 'non-JSON' }; }
      return {
        pass: body.profile && body.profile.id === fixtures.userA.id && body.profile.email === fixtures.userA.email,
        note: `returned profile id ${body.profile && body.profile.id}`
      };
    }
  });

  response = await call('PUT', '/api/profile', {
    cookie: cookieA,
    body: { id: fixtures.userB.id, first_name: 'Neg', last_name: 'PatientA', phone: '+962 79 000 0001' }
  });
  const userBAfter = await pool.query('SELECT first_name, last_name, phone FROM users WHERE id = $1', [fixtures.userB.id]);
  check('N05', 'IDOR patient A updates profile with B id', 'PUT /api/profile {id:B} (Cookie A)', 200, response, {
    validate: () => ({
      pass: userBAfter.rows[0].first_name === 'Neg' && userBAfter.rows[0].last_name === 'PatientB' && userBAfter.rows[0].phone === '+962 79 000 0002',
      note: 'B row unchanged'
    })
  });

  response = await call('GET', `/api/files/${fixtures.fileApproved}/download`, { cookie: cookieA });
  check('N06', 'IDOR patient A downloads patient B approved file', `GET /api/files/${fixtures.fileApproved}/download (Cookie A)`, 404, response, {
    contains: ['File not found']
  });

  response = await call('GET', `/api/files/${fixtures.filePending}/download`, { cookie: cookieB });
  check('N07', 'Owner downloads pending file', `GET /api/files/${fixtures.filePending}/download (Cookie B)`, 409, response, {
    contains: ['not approved']
  });

  response = await call('GET', `/api/files/${fixtures.fileRejected}/download`, { cookie: cookieB });
  check('N08', 'Owner downloads rejected file', `GET /api/files/${fixtures.fileRejected}/download (Cookie B)`, 409, response, {
    contains: ['not approved']
  });

  // ---- IDOR: clinic X vs clinic Y ----
  response = await call('GET', `/api/clinic/appointments?clinic_id=${fixtures.clinicY}`, { cookie: cookieClinic });
  check('N09', 'IDOR clinic X reads clinic Y appointment list', `GET /api/clinic/appointments?clinic_id=${fixtures.clinicY} (Cookie clinic X)`, 200, response, {
    validate: (res) => ({
      pass: !res.text.includes(`"id":${fixtures.apptY}`),
      note: 'clinic Y appointment absent'
    })
  });

  response = await call('GET', `/api/clinic/appointments/${fixtures.apptY}/patient`, { cookie: cookieClinic });
  check('N10', 'IDOR clinic X reads clinic Y appointment patient', `GET /api/clinic/appointments/${fixtures.apptY}/patient (Cookie clinic X)`, 404, response, {
    contains: ['Appointment not found']
  });

  response = await call('PATCH', `/api/clinic/appointments/${fixtures.apptY}`, {
    cookie: cookieClinic,
    body: { status: 'Confirmed' }
  });
  check('N11', 'IDOR clinic X updates clinic Y appointment', `PATCH /api/clinic/appointments/${fixtures.apptY} (Cookie clinic X)`, 404, response, {
    contains: ['Appointment not found']
  });

  response = await call('GET', `/api/clinic/profile?clinic_id=${fixtures.clinicY}`, { cookie: cookieClinic });
  check('N12', 'IDOR clinic X reads clinic Y profile via query', `GET /api/clinic/profile?clinic_id=${fixtures.clinicY} (Cookie clinic X)`, 200, response, {
    validate: (res) => {
      let body;
      try { body = JSON.parse(res.text); } catch (err) { return { pass: false, note: 'non-JSON' }; }
      return {
        pass: body.clinic && body.clinic.id === fixtures.clinicX,
        note: `returned clinic id ${body.clinic && body.clinic.id}`
      };
    }
  });

  // ---- Roles ----
  response = await call('GET', '/api/clinic/profile', { cookie: cookieA });
  check('R01', 'Patient calls clinic profile', 'GET /api/clinic/profile (Cookie A)', 403, response);

  response = await call('GET', '/api/clinic/appointments', { cookie: cookieA });
  check('R02', 'Patient calls clinic appointments', 'GET /api/clinic/appointments (Cookie A)', 403, response);

  response = await call('POST', '/api/clinic/doctors', {
    cookie: cookieA,
    body: { name: 'Bad Doctor', specialty: 'Test' }
  });
  check('R03', 'Patient calls clinic doctor create', 'POST /api/clinic/doctors (Cookie A)', 403, response);

  response = await call('POST', '/api/appointments', {
    cookie: cookieClinic,
    body: { clinic_id: fixtures.clinicX, appointment_date: fixtures.tomorrow, appointment_time: '16:00' }
  });
  check('R04', 'Clinic calls patient booking', 'POST /api/appointments (Cookie clinic X)', 403, response);

  response = await call('GET', '/api/appointments');
  check('R05', 'Anonymous reads appointments', 'GET /api/appointments (no cookie)', 401, response, {
    contains: ['log in']
  });

  response = await call('GET', '/api/profile');
  check('R06', 'Anonymous reads profile', 'GET /api/profile (no cookie)', 401, response, {
    contains: ['log in']
  });

  response = await call('GET', '/api/clinic/profile');
  check('R07', 'Anonymous reads clinic profile', 'GET /api/clinic/profile (no cookie)', 401, response, {
    contains: ['log in']
  });

  response = await call('GET', `/api/files/${fixtures.fileApproved}/download`);
  check('R08', 'Anonymous downloads file', `GET /api/files/${fixtures.fileApproved}/download (no cookie)`, 401, response, {
    contains: ['log in']
  });

  response = await call('GET', '/patient');
  check('R09', 'Anonymous opens patient page', 'GET /patient (no cookie)', 302, response);

  response = await call('POST', '/api/appointments', {
    body: { clinic_id: fixtures.clinicX, appointment_date: fixtures.tomorrow, appointment_time: '17:00' }
  });
  check('R10', 'Anonymous books appointment', 'POST /api/appointments (no cookie)', 401, response, {
    contains: ['log in']
  });

  // ---- Uploads ----
  async function upload(cookie, filename, body, contentType = 'application/octet-stream') {
    return call('POST', '/api/files', {
      cookie,
      headers: {
        'Content-Type': contentType,
        'X-File-Name': encodeURIComponent(filename)
      },
      body
    });
  }

  response = await upload(cookieA, 'evil.png', Buffer.from('<html><script>alert(1)</script></html>'));
  check('U01', 'Upload HTML disguised as PNG', 'POST /api/files x-file-name=evil.png body=<html>', 422, response, {
    contains: ['unknown_signature']
  });

  response = await upload(cookieA, 'evil.png', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
  check('U02', 'Upload SVG disguised as PNG', 'POST /api/files x-file-name=evil.png body=<svg>', 422, response, {
    contains: ['unknown_signature']
  });

  response = await upload(cookieA, 'evil.exe', Buffer.from('MZ\x90\x00executable'));
  check('U03', 'Upload EXE extension', 'POST /api/files x-file-name=evil.exe body=MZ', 422, response, {
    contains: ['unsupported_extension']
  });

  response = await upload(cookieA, 'large.png', Buffer.alloc(2 * 1024 * 1024 + 1));
  check('U04', 'Upload oversized file', 'POST /api/files x-file-name=large.png body=2MB+1', 413, response);

  response = await upload(cookieA, 'evil\u0000.png', fixtures.png);
  check('U05', 'Upload null-byte filename', 'POST /api/files x-file-name=evil%00.png body=PNG', 201, response, {
    validate: (res) => {
      let body;
      try { body = JSON.parse(res.text); } catch (err) { return { pass: false, note: 'non-JSON' }; }
      const name = body.file && body.file.name;
      return { pass: Boolean(name) && !name.includes('\u0000'), note: `stored name ${name}` };
    }
  });

  response = await upload(cookieA, '../../etc/passwd.png', fixtures.png);
  check('U06', 'Upload path-traversal filename', 'POST /api/files x-file-name=..%2F..%2Fetc%2Fpasswd.png body=PNG', 201, response, {
    validate: (res) => {
      let body;
      try { body = JSON.parse(res.text); } catch (err) { return { pass: false, note: 'non-JSON' }; }
      const name = body.file && body.file.name;
      return { pass: name === 'passwd.png', note: `stored name ${name}` };
    }
  });

  let uploadStatuses = [];
  for (let index = 1; index <= 21; index += 1) {
    const attempt = await upload(cookieB, `rate-${index}.png`, fixtures.png);
    uploadStatuses.push(attempt.status);
    if (index === 21) {
      check('U07', '21st upload in limiter window', 'POST /api/files x21 (Cookie B)', 429, attempt, {
        validate: () => ({
          pass: uploadStatuses.slice(0, 20).every((status) => status === 201),
          note: `first 20: ${[...new Set(uploadStatuses.slice(0, 20))].join(',')}`
        })
      });
    }
  }

  // ---- Auth / CSRF ----
  const wrongCodes = ['000000', '000001', '000002', '000003', '000004', '000005'];
  for (let index = 0; index < wrongCodes.length; index += 1) {
    response = await call('POST', '/login/verify', {
      body: { challenge: fixtures.challengeWrong, code: wrongCodes[index] }
    });
    const id = `A0${index + 1}`;
    if (index < 5) {
      check(id, `Wrong 2FA code attempt ${index + 1}`, `POST /login/verify code=${wrongCodes[index]}`, 401, response, {
        contains: ['incorrect']
      });
    } else {
      check(id, 'Wrong 2FA code attempt 6 after lockout', `POST /login/verify code=${wrongCodes[index]}`, 429, response, {
        contains: ['Too many incorrect attempts']
      });
    }
  }

  response = await call('POST', '/login/verify', {
    body: { challenge: fixtures.challengeExpired, code: '654321' }
  });
  check('A07', 'Expired 2FA code', 'POST /login/verify expired challenge', 400, response, {
    contains: ['expired']
  });

  response = await call('POST', '/login/verify', {
    body: { challenge: fixtures.challengeReused, code: '111111' }
  });
  check('A08', 'Reused 2FA code', 'POST /login/verify consumed challenge', 400, response, {
    contains: ['already been used']
  });

  response = await call('POST', '/api/appointments', {
    cookie: cookieA,
    origin: foreignOrigin,
    body: { clinic_id: fixtures.clinicX, appointment_date: fixtures.tomorrow, appointment_time: '18:00' }
  });
  check('A09', 'POST with foreign Origin (CSRF)', 'POST /api/appointments Origin=https://evil.example (Cookie A)', 403, response, {
    contains: ['Request blocked']
  });

  response = await call('POST', '/api/appointments', {
    cookie: cookieA,
    origin: null,
    body: { clinic_id: fixtures.clinicX, appointment_date: fixtures.tomorrow, appointment_time: '18:30' }
  });
  check('A10', 'POST with no Origin or Referer', 'POST /api/appointments (no Origin/Referer, Cookie A)', 403, response, {
    contains: ['Request blocked']
  });
}

function renderEvidence(cleanupCounts) {
  const failed = results.filter((row) => !row.pass);
  const lines = [];
  lines.push('# EVIDENCE 9 — Public negative tests (Agent B)');
  lines.push('');
  lines.push(`Date: ${new Date().toISOString()}. No secrets, tokens or cookies are recorded; cookies are labelled A, B and clinic X.`);
  lines.push('');
  lines.push('Environment: local Express server from this repo (`server.js`) against the real Supabase Postgres via pooler port 6543. Throwaway patients A/B and throwaway clinics X/Y were inserted directly into app tables for the run and deleted afterwards.');
  lines.push('');
  lines.push('Command: `DB_PORT=6543 node scripts/test-negative.js`');
  lines.push('');
  lines.push('Note: the upload limiter is configured as 20 requests per 60 seconds (`lib/rate-limit.js`), not per hour. The 21st upload inside that window is the tested boundary.');
  lines.push('');
  lines.push('| test | request | expected | actual | pass/fail |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of results) {
    const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${row.id} ${cell(row.test)} | ${cell(row.request)} | ${cell(row.expected)} | ${cell(row.actual)} | ${row.pass ? 'PASS' : 'FAIL'} |`);
  }
  lines.push('');
  lines.push(`Summary: ${results.length - failed.length}/${results.length} passed.`);
  if (failed.length) {
    lines.push('');
    lines.push('Failures:');
    for (const row of failed) {
      lines.push(`- ${row.id} ${row.test}: ${row.failures.join('; ')}`);
    }
  }
  lines.push('');
  lines.push(`Cleanup: ${JSON.stringify(cleanupCounts)}.`);
  lines.push('');
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, lines.join('\n'));
}

async function main() {
  console.log(`Starting local server on ${BASE} (DB_PORT=${process.env.DB_PORT})`);
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PORT: process.env.DB_PORT,
      NODE_ENV: 'development',
      EMAIL_TRANSPORT: 'console',
      DISABLE_LOCAL_RATE_LIMIT: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (chunk) => process.env.VERBOSE_TEST && process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.env.VERBOSE_TEST && process.stderr.write(chunk));

  await waitForServer();
  await seedFixtures();
  console.log(`Fixtures: users ${fixtures.userIds.join(',')}; clinics ${fixtures.clinicIds.join(',')}; appointments ${fixtures.appointmentIds.join(',')}`);
  await runTests();
}

let cleanupCounts = {};
main()
  .catch((err) => {
    console.error('Test run failed:', err.message);
    results.push({
      id: 'FATAL',
      test: 'Test script fatal error',
      request: 'script',
      expected: 'no fatal error',
      actual: short(err.message),
      pass: false,
      failures: [err.message]
    });
  })
  .finally(async () => {
    if (server) {
      server.kill('SIGTERM');
      await new Promise((resolve) => {
        server.once('exit', resolve);
        setTimeout(resolve, 3000);
      });
    }
    cleanupCounts = await cleanupFixtures();
    renderEvidence(cleanupCounts);
    await pool.end().catch(() => {});
    const failed = results.filter((row) => !row.pass);
    console.log(`Wrote ${EVIDENCE_PATH}`);
    console.log(`Summary: ${results.length - failed.length}/${results.length} passed; cleanup ${JSON.stringify(cleanupCounts)}`);
    process.exit(failed.length ? 1 : 0);
  });
