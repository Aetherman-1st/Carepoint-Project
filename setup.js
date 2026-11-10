require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY,
      first_name text,
      last_name text,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'user',
      phone text,
      avatar_url text,
      email_verified_at timestamptz,
      onboarding_completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz,
      last_login_ip text,
      banned_at timestamptz
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at timestamptz;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

    CREATE TABLE IF NOT EXISTS clinics (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      specialty text,
      address text,
      city text,
      phone text,
      description text,
      image_url text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE clinics ADD COLUMN IF NOT EXISTS image_url text;
    ALTER TABLE clinics ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
    ALTER TABLE clinics DROP COLUMN IF EXISTS rating;
    ALTER TABLE clinics
      ALTER COLUMN specialty DROP NOT NULL,
      ALTER COLUMN address DROP NOT NULL,
      ALTER COLUMN city DROP NOT NULL,
      ALTER COLUMN phone DROP NOT NULL,
      ALTER COLUMN description DROP NOT NULL;

    ALTER TABLE users ADD COLUMN IF NOT EXISTS clinic_id integer REFERENCES clinics(id) ON DELETE SET NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
    CREATE INDEX IF NOT EXISTS users_clinic_idx ON users (clinic_id);

    CREATE TABLE IF NOT EXISTS doctors (
      id serial PRIMARY KEY,
      clinic_id integer NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      name text NOT NULL,
      specialty text NOT NULL,
      bio text,
      UNIQUE (clinic_id, name)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clinic_id integer NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      doctor_id integer REFERENCES doctors(id) ON DELETE CASCADE,
      appointment_date date NOT NULL,
      appointment_time text NOT NULL,
      reason text,
      status text NOT NULL DEFAULT 'Pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE appointments ALTER COLUMN doctor_id DROP NOT NULL;

    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS visit_type text NOT NULL DEFAULT 'in_person';
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS zoom_meeting_id text;
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS zoom_join_url text;
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS zoom_start_url text;
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS zoom_password text;
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS zoom_status text;

    CREATE INDEX IF NOT EXISTS appointments_date_idx ON appointments (appointment_date);
    CREATE INDEX IF NOT EXISTS appointments_user_idx ON appointments (user_id);
    CREATE INDEX IF NOT EXISTS appointments_clinic_idx ON appointments (clinic_id);
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_doctor_slot_active_idx
      ON appointments (clinic_id, doctor_id, appointment_date, appointment_time)
      WHERE status IN ('Pending', 'Confirmed') AND doctor_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS appointments_clinic_slot_active_idx
      ON appointments (clinic_id, appointment_date, appointment_time)
      WHERE status IN ('Pending', 'Confirmed') AND doctor_id IS NULL;

    CREATE TABLE IF NOT EXISTS contact_messages (
      id serial PRIMARY KEY,
      name text NOT NULL,
      email text NOT NULL,
      subject text,
      message text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS login_codes (
      id serial PRIMARY KEY,
      challenge text NOT NULL UNIQUE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed boolean NOT NULL DEFAULT false,
      attempts integer NOT NULL DEFAULT 0,
      sent boolean NOT NULL DEFAULT false,
      sent_at timestamptz,
      delivery_error text,
      verified_at timestamptz,
      request_ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE login_codes ADD COLUMN IF NOT EXISTS remember boolean NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS login_codes_user_idx ON login_codes (user_id);
    CREATE INDEX IF NOT EXISTS login_codes_challenge_idx ON login_codes (challenge);

    CREATE TABLE IF NOT EXISTS signup_codes (
      id serial PRIMARY KEY,
      challenge text NOT NULL UNIQUE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed boolean NOT NULL DEFAULT false,
      attempts integer NOT NULL DEFAULT 0,
      sent boolean NOT NULL DEFAULT false,
      sent_at timestamptz,
      delivery_error text,
      verified_at timestamptz,
      request_ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS signup_codes_user_idx ON signup_codes (user_id);
    CREATE INDEX IF NOT EXISTS signup_codes_challenge_idx ON signup_codes (challenge);

    CREATE TABLE IF NOT EXISTS onboarding_profiles (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      age integer NOT NULL CHECK (age BETWEEN 1 AND 120),
      conditions text,
      medications text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS contact_replies (
      id serial PRIMARY KEY,
      message_id integer NOT NULL REFERENCES contact_messages(id) ON DELETE CASCADE,
      admin_id integer REFERENCES users(id) ON DELETE SET NULL,
      body text NOT NULL,
      emailed boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS contact_replies_message_idx ON contact_replies (message_id);

    CREATE TABLE IF NOT EXISTS password_reset_codes (
      id serial PRIMARY KEY,
      challenge text NOT NULL UNIQUE,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash text NOT NULL,
      expires_at timestamptz NOT NULL,
      consumed boolean NOT NULL DEFAULT false,
      attempts integer NOT NULL DEFAULT 0,
      request_ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_codes (user_id);
    CREATE INDEX IF NOT EXISTS password_reset_challenge_idx ON password_reset_codes (challenge);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id serial PRIMARY KEY,
      actor_id integer REFERENCES users(id) ON DELETE SET NULL,
      actor_email text,
      action text NOT NULL,
      entity_type text,
      entity_id integer,
      details jsonb,
      request_ip text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_id);
  `);

  if (ADMIN_EMAIL) {
    const existing = await pool.query('SELECT id FROM users WHERE lower(email) = lower($1)', [ADMIN_EMAIL]);

    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE users SET role = $1, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $2',
        ['admin', existing.rows[0].id]
      );
      console.log(`Admin access reserved for ${ADMIN_EMAIL}.`);
    } else if (ADMIN_PASSWORD.length >= 8) {
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS);
      await pool.query(
        'INSERT INTO users (email, password_hash, role, email_verified_at) VALUES ($1, $2, $3, now())',
        [ADMIN_EMAIL, hashed, 'admin']
      );
      console.log(`Admin account created for ${ADMIN_EMAIL}.`);
    } else {
      console.log(
        `No account exists for ${ADMIN_EMAIL}. Set ADMIN_PASSWORD (at least 8 characters) and run this script again to create it.`
      );
    }
  } else {
    console.log('Set ADMIN_EMAIL in .env to reserve admin access.');
  }

  const counts = await pool.query(`
    SELECT
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM clinics) AS clinics,
      (SELECT count(*) FROM doctors) AS doctors,
      (SELECT count(*) FROM appointments) AS appointments,
      (SELECT count(*) FROM contact_messages) AS messages
  `);

  const c = counts.rows[0];
  console.log(
    `Ready: ${c.users} users, ${c.clinics} clinics, ${c.doctors} doctors, ${c.appointments} appointments, ${c.messages} messages.`
  );
  await pool.end();
}

run().catch(async (err) => {
  console.error('Setup failed:', err.message);
  await pool.end();
  process.exit(1);
});
