require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { createSession } = require('../lib/session');

const PORT = Number(process.env.TEST_PORT) || 3102;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_APP_URL = process.env.ADMIN_APP_URL || 'https://carepoint-admin.pages.dev';
const stamp = Date.now();
const prefix = `task2.${stamp}`;
let server;
let passed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ok  ${message}`);
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

function sessionFor(user) {
  return `cp_session=${createSession(user, { remember: false, sessionVersion: user.session_version || 1 })}`;
}

async function main() {
  console.log('Seeding cross-role fixtures...');
  const passwordHash = await bcrypt.hash('TaskTwo!2345', 12);

  const clinics = await pool.query(
    `INSERT INTO clinics (name, specialty, city)
     VALUES ($1, 'General', 'Amman'), ($2, 'Dental', 'Irbid')
     RETURNING id, name`,
    [`${prefix} Clinic A`, `${prefix} Clinic B`]
  );
  const clinicA = clinics.rows[0];
  const clinicB = clinics.rows[1];

  const doctors = await pool.query(
    `INSERT INTO doctors (clinic_id, name, specialty)
     VALUES ($1, $2, 'General'), ($3, $4, 'Dental')
     RETURNING id, clinic_id`,
    [clinicA.id, `${prefix} Doctor A`, clinicB.id, `${prefix} Doctor B`]
  );
  const doctorA = doctors.rows[0];
  const doctorB = doctors.rows[1];

  const users = await pool.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, clinic_id, email_verified_at)
     VALUES
       ('Patient', 'A', $1, $4, 'user', NULL, now()),
       ('Patient', 'B', $2, $4, 'user', NULL, now()),
       ('Clinic', 'A', $3, $4, 'clinic', $5, now()),
       ('Clinic', 'B', $6, $4, 'clinic', $7, now()),
       ('Admin', 'Two', $8, $4, 'admin', NULL, now())
     RETURNING id, email, role, clinic_id, session_version`,
    [
      `${prefix}.patient.a@example.com`,
      `${prefix}.patient.b@example.com`,
      `${prefix}.clinic.a@example.com`,
      passwordHash,
      clinicA.id,
      `${prefix}.clinic.b@example.com`,
      clinicB.id,
      `${prefix}.admin@example.com`
    ]
  );

  const patientA = users.rows[0];
  const patientB = users.rows[1];
  const clinicUserA = users.rows[2];
  const clinicUserB = users.rows[3];
  const admin = users.rows[4];

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const appointments = await pool.query(
    `INSERT INTO appointments (user_id, clinic_id, doctor_id, appointment_date, appointment_time, status)
     VALUES
       ($1, $2, $3, $4, '09:00', 'Pending'),
       ($5, $6, $7, $4, '10:00', 'Pending'),
       ($1, $8, $3, $4, '11:00', 'Confirmed')
     RETURNING id, user_id, clinic_id`,
    [patientA.id, clinicA.id, doctorA.id, tomorrow, patientB.id, clinicB.id, doctorB.id, clinicA.id]
  );
  const appointmentA = appointments.rows[0];
  const appointmentB = appointments.rows[1];

  const cookiePatientA = sessionFor(patientA);
  const cookiePatientB = sessionFor(patientB);
  const cookieClinicA = sessionFor(clinicUserA);
  const cookieClinicB = sessionFor(clinicUserB);
  const cookieAdmin = sessionFor(admin);

  console.log('Starting isolated test server...');
  server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      ADMIN_APP_URL,
      EMAIL_TRANSPORT: 'console',
      NODE_ENV: 'development'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (chunk) => process.env.VERBOSE_TEST && process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.env.VERBOSE_TEST && process.stderr.write(chunk));
  await waitForServer();

  console.log('Patient ownership');
  const patientAppointments = await fetch(`${BASE}/api/appointments`, {
    headers: { Cookie: cookiePatientA }
  });
  const patientAppointmentsData = await patientAppointments.json();
  assert(patientAppointments.status === 200, 'patient can load own appointments');
  assert(
    patientAppointmentsData.length === 2 &&
      patientAppointmentsData.every((row) => row.patient_email === patientA.email),
    'patient sees only their own appointments'
  );

  const cancelOther = await fetch(`${BASE}/api/appointments/${appointmentB.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookiePatientA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Cancelled' })
  });
  assert(cancelOther.status === 403, 'patient cannot cancel another patient appointment');

  const patientClinicApi = await fetch(`${BASE}/api/clinic/profile`, {
    headers: { Cookie: cookiePatientA }
  });
  assert(patientClinicApi.status === 403, 'patient cannot use clinic APIs');

  const legacyAdminApi = await fetch(`${BASE}/api/admin/users`, {
    headers: { Cookie: cookiePatientA }
  });
  assert(legacyAdminApi.status === 404, 'admin API is no longer exposed on the public site');

  console.log('Clinic ownership');
  const clinicProfile = await fetch(`${BASE}/api/clinic/profile`, {
    headers: { Cookie: cookieClinicA }
  });
  const clinicProfileData = await clinicProfile.json();
  assert(clinicProfile.status === 200 && clinicProfileData.clinic.id === clinicA.id, 'clinic sees its own profile');

  const clinicAppointments = await fetch(`${BASE}/api/clinic/appointments`, {
    headers: { Cookie: cookieClinicA }
  });
  const clinicAppointmentsData = await clinicAppointments.json();
  assert(
    clinicAppointmentsData.length === 2 &&
      clinicAppointmentsData.every((row) => row.patient_email !== patientB.email),
    'clinic sees only its own clinic appointments'
  );

  const clinicUpdateOther = await fetch(`${BASE}/api/clinic/appointments/${appointmentB.id}`, {
    method: 'PATCH',
    headers: { Cookie: cookieClinicA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'Confirmed' })
  });
  assert(clinicUpdateOther.status === 404, 'clinic cannot update another clinic appointment');

  const clinicPatientOther = await fetch(`${BASE}/api/clinic/appointments/${appointmentB.id}/patient`, {
    headers: { Cookie: cookieClinicA }
  });
  assert(clinicPatientOther.status === 404, 'clinic cannot read another clinic patient');

  const clinicPatientOwn = await fetch(`${BASE}/api/clinic/appointments/${appointmentA.id}/patient`, {
    headers: { Cookie: cookieClinicA }
  });
  assert(clinicPatientOwn.status === 200, 'clinic can read its own appointment patient');

  const clinicOwnDoctor = await fetch(`${BASE}/api/clinic/doctors`, {
    method: 'POST',
    headers: { Cookie: cookieClinicA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `${prefix} New Doctor`, specialty: 'Cardiology' })
  });
  assert(clinicOwnDoctor.status === 201, 'clinic can add its own doctor');

  const clinicEditOtherDoctor = await fetch(`${BASE}/api/clinic/doctors/${doctorB.id}`, {
    method: 'PUT',
    headers: { Cookie: cookieClinicA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `${prefix} Hacked`, specialty: 'X' })
  });
  assert(clinicEditOtherDoctor.status === 404, 'clinic cannot edit another clinic doctor');

  const clinicPatientApi = await fetch(`${BASE}/api/appointments`, {
    headers: { Cookie: cookieClinicA }
  });
  assert(clinicPatientApi.status === 403, 'clinic cannot use patient appointment API');

  const clinicAdminApi = await fetch(`${BASE}/api/admin/users`, {
    headers: { Cookie: cookieClinicA }
  });
  assert(clinicAdminApi.status === 404, 'admin API remains unavailable to clinic accounts');

  console.log('Admin separation');
  const adminLogin = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: admin.email, password: 'TaskTwo!2345' })
  });
  const adminLoginData = await adminLogin.json();
  assert(adminLogin.status === 403 && adminLoginData.code === 'admin_login_moved', 'admin cannot sign in on the public site');
  assert(adminLoginData.admin_url === ADMIN_APP_URL, 'public admin login points to the admin app');

  const adminPage = await fetch(`${BASE}/admin`, { redirect: 'manual' });
  assert(adminPage.status === 302 && adminPage.headers.get('location') === '/', 'public admin page is removed');

  const adminClinicApi = await fetch(`${BASE}/api/clinic/profile`, {
    headers: { Cookie: cookieAdmin }
  });
  assert(adminClinicApi.status === 403, 'admin cannot use clinic APIs');

  const publicClinicLogin = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: clinicUserA.email, password: 'TaskTwo!2345' })
  });
  const publicClinicLoginData = await publicClinicLogin.json();
  assert(publicClinicLogin.status === 200 && publicClinicLoginData.redirect === '/clinic', 'clinic can still sign in on the public site');

  const publicPatientLogin = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: patientA.email, password: 'TaskTwo!2345' })
  });
  assert(publicPatientLogin.status === 200, 'patient can still sign in on the public site');

  const contactMessage = await fetch(`${BASE}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Public Test',
      email: `${prefix}.contact@example.com`,
      subject: 'Hello',
      message: 'Public contact form still works.'
    })
  });
  assert(contactMessage.status === 201, 'public contact form still works');

  const adminContactRead = await fetch(`${BASE}/api/contact`, {
    headers: { Cookie: cookieAdmin }
  });
  assert(adminContactRead.status === 404, 'admin contact inbox is removed from the public API');

  const guestApi = await fetch(`${BASE}/api/appointments`);
  assert(guestApi.status === 401, 'guest cannot use patient APIs');

  const guestClinicPage = await fetch(`${BASE}/clinic`, { redirect: 'manual' });
  assert(guestClinicPage.status === 302 && /\/login/.test(guestClinicPage.headers.get('location') || ''), 'guest clinic page redirects to login');

  const patientClinicPage = await fetch(`${BASE}/clinic`, {
    headers: { Cookie: cookiePatientA },
    redirect: 'manual'
  });
  assert(patientClinicPage.status === 302 && patientClinicPage.headers.get('location') === '/patient', 'patient visiting clinic page redirects to patient');

  const clinicPatientPage = await fetch(`${BASE}/patient`, {
    headers: { Cookie: cookieClinicA },
    redirect: 'manual'
  });
  assert(clinicPatientPage.status === 302 && clinicPatientPage.headers.get('location') === '/clinic', 'clinic visiting patient page redirects to clinic');

  const adminPatientPage = await fetch(`${BASE}/patient`, {
    headers: { Cookie: cookieAdmin },
    redirect: 'manual'
  });
  assert(adminPatientPage.status === 302 && adminPatientPage.headers.get('location') === ADMIN_APP_URL, 'admin visiting patient page redirects to the admin app');

  const clinicPage = await fetch(`${BASE}/clinic`, {
    headers: { Cookie: cookieClinicA },
    redirect: 'manual'
  });
  assert(clinicPage.status === 200, 'clinic page loads for clinic account');

  console.log(`\nTask 2 permissions passed (${passed} checks).`);
}

async function cleanup() {
  await pool.query('DELETE FROM users WHERE lower(email) LIKE $1', [`${prefix}%`]);
  await pool.query('DELETE FROM clinics WHERE name LIKE $1', [`${prefix}%`]);
}

main()
  .catch((err) => {
    console.error('\nTask 2 permissions failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) server.kill('SIGTERM');
    await cleanup().catch((cleanupError) => console.error('Cleanup failed:', cleanupError.message));
    await pool.end().catch(() => {});
  });
