const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireAdmin, isAdminEmail } = require('../lib/auth');

const router = express.Router();
const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

function userId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isProtectedAccount(user) {
  return user.role === 'admin' || isAdminEmail(user.email);
}


router.get('/clinics', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.specialty, c.city, c.is_active,
              (SELECT count(*)::int FROM appointments a WHERE a.clinic_id = c.id) AS appointment_count,
              (SELECT count(*)::int FROM doctors d WHERE d.clinic_id = c.id) AS doctor_count,
              (SELECT count(*)::int FROM users u WHERE u.clinic_id = c.id AND u.role = 'clinic') AS account_count
       FROM clinics c
       ORDER BY c.name`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not load clinics.' });
  }
});

router.get('/clinic-accounts', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.clinic_id, u.created_at,
              u.last_login_at, u.banned_at, c.name AS clinic_name
       FROM users u
       JOIN clinics c ON c.id = u.clinic_id
       WHERE u.role = 'clinic'
       ORDER BY c.name, u.email`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not load clinic accounts.' });
  }
});

router.post('/clinic-accounts', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const clinicId = Number(body.clinic_id);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const firstName = String(body.first_name || '').trim().slice(0, 80) || 'Clinic';
  const lastName = String(body.last_name || '').trim().slice(0, 80) || 'Team';

  if (!Number.isInteger(clinicId) || clinicId < 1) {
    return res.status(400).json({ message: 'Choose a clinic for this account.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  try {
    const clinic = await pool.query('SELECT id, name, is_active FROM clinics WHERE id = $1', [clinicId]);
    if (clinic.rows.length === 0) {
      return res.status(404).json({ message: 'Clinic not found.' });
    }
    if (!clinic.rows[0].is_active) {
      return res.status(400).json({ message: 'This clinic is inactive.' });
    }

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await pool.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, clinic_id, email_verified_at)
       VALUES ($1, $2, $3, $4, 'clinic', $5, now())
       RETURNING id, first_name, last_name, email, role, clinic_id, created_at`,
      [firstName, lastName, email, hashed, clinicId]
    );

    res.status(201).json({ message: 'Clinic account created.', account: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }
    res.status(500).json({ message: 'Could not create the clinic account.' });
  }
});

router.put('/clinic-accounts/:id', requireAdmin, async (req, res) => {
  const id = userId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid account.' });

  const body = req.body || {};
  const clinicId = Number(body.clinic_id);
  const email = String(body.email || '').trim().toLowerCase();
  const firstName = String(body.first_name || '').trim().slice(0, 80) || 'Clinic';
  const lastName = String(body.last_name || '').trim().slice(0, 80) || 'Team';
  const password = String(body.password || '');

  if (!Number.isInteger(clinicId) || clinicId < 1) {
    return res.status(400).json({ message: 'Choose a clinic for this account.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }
  if (password && password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }

  try {
    const account = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [id]);
    if (account.rows.length === 0 || account.rows[0].role !== 'clinic') {
      return res.status(404).json({ message: 'Clinic account not found.' });
    }
    if (isAdminEmail(account.rows[0].email)) {
      return res.status(400).json({ message: 'This account is protected.' });
    }

    const clinic = await pool.query('SELECT id, is_active FROM clinics WHERE id = $1', [clinicId]);
    if (clinic.rows.length === 0 || !clinic.rows[0].is_active) {
      return res.status(400).json({ message: 'Choose an active clinic.' });
    }

    const params = [firstName, lastName, email, clinicId, id];
    let passwordSql = '';
    if (password) {
      const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
      params.push(hashed);
      passwordSql = `, password_hash = $${params.length}, session_version = session_version + 1`;
    }

    const result = await pool.query(
      `UPDATE users
       SET first_name = $1, last_name = $2, email = $3, clinic_id = $4${passwordSql}
       WHERE id = $5
       RETURNING id, first_name, last_name, email, role, clinic_id`,
      params
    );

    res.json({ message: 'Clinic account updated.', account: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'An account with that email already exists.' });
    }
    res.status(500).json({ message: 'Could not update the clinic account.' });
  }
});

router.get('/users', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id,
        u.first_name,
        u.last_name,
        u.email,
        u.role,
        u.created_at,
        u.last_login_at,
        u.last_login_ip,
        u.banned_at,
        (SELECT count(*)::int FROM appointments a WHERE a.user_id = u.id) AS appointment_count,
        (SELECT max(a.appointment_date) FROM appointments a WHERE a.user_id = u.id) AS latest_appointment,
        (SELECT count(*)::int FROM login_codes lc WHERE lc.user_id = u.id) AS codes_requested
      FROM users u
      ORDER BY u.created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not load users' });
  }
});

router.get('/users/:id', requireAdmin, async (req, res) => {
  const id = userId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid account.' });

  try {
    const account = await pool.query(
      `SELECT
         u.id,
         u.first_name,
         u.last_name,
         u.email,
         u.role,
         u.phone,
         u.avatar_url,
         u.email_verified_at,
         u.onboarding_completed_at,
         u.created_at,
         u.last_login_at,
         u.last_login_ip,
         u.banned_at,
         op.age,
         op.conditions,
         op.medications
       FROM users u
       LEFT JOIN onboarding_profiles op ON op.user_id = u.id
       WHERE u.id = $1`,
      [id]
    );

    if (account.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const appointments = await pool.query(
      `SELECT
         a.id,
         a.appointment_date,
         a.appointment_time,
         a.reason,
         a.status,
         a.created_at,
         c.name AS clinic_name,
         c.city AS clinic_city,
         d.name AS doctor_name,
         d.specialty AS doctor_specialty
       FROM appointments a
       JOIN clinics c ON c.id = a.clinic_id
       LEFT JOIN doctors d ON d.id = a.doctor_id
       WHERE a.user_id = $1
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [id]
    );

    const user = account.rows[0];
    user.protected = isProtectedAccount(user);
    res.json({ user, appointments: appointments.rows });
  } catch (err) {
    res.status(500).json({ message: 'Could not load the account profile.' });
  }
});

router.patch('/users/:id/ban', requireAdmin, async (req, res) => {
  const id = userId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid account.' });
  if (typeof (req.body || {}).banned !== 'boolean') {
    return res.status(400).json({ message: 'Choose whether to ban or unban this account.' });
  }

  const banned = req.body.banned;

  try {
    const account = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [id]);
    if (account.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const user = account.rows[0];
    if (user.id === req.user.id || isProtectedAccount(user)) {
      return res.status(400).json({ message: 'Administrator accounts cannot be banned.' });
    }

    const updated = await pool.query(
      `UPDATE users
       SET banned_at = CASE WHEN $1 THEN now() ELSE NULL END
       WHERE id = $2
       RETURNING id, banned_at`,
      [banned, id]
    );

    res.json({
      message: banned ? 'Account banned.' : 'Account access restored.',
      user: updated.rows[0]
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not update this account.' });
  }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  const id = userId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid account.' });

  try {
    const account = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [id]);
    if (account.rows.length === 0) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    const user = account.rows[0];
    if (user.id === req.user.id || isProtectedAccount(user)) {
      return res.status(400).json({ message: 'Administrator accounts cannot be deleted.' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'Account deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete this account.' });
  }
});

module.exports = router;
router.get('/doctors', requireAdmin, async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const clinicId = req.query.clinic_id ? Number(req.query.clinic_id) : null;

    let query = `
      SELECT d.id, d.clinic_id, d.name, d.specialty,
             (SELECT count(*)::int FROM appointments a WHERE a.doctor_id = d.id) AS appointment_count
      FROM doctors d
    `;
    const params = [limit, offset];
    if (clinicId !== null) {
      query += ` WHERE d.clinic_id = $${params.length + 1}`;
      params.push(clinicId);
    }
    query += ` ORDER BY d.name LIMIT $1 OFFSET $2`;
    const result = await pool.query(query, params);

    let countQuery = `SELECT count(*)::int AS total FROM doctors`;
    const countParams = [];
    if (clinicId !== null) {
      countQuery += ` WHERE clinic_id = $1`;
      countParams.push(clinicId);
    }
    const countResult = await pool.query(countQuery, countParams);

    res.json({ rows: result.rows, total: countResult.rows[0].total });
  } catch (err) {
    res.status(500).json({ message: 'Could not load doctors.' });
  }
});

router.post('/doctors', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const clinicId = Number(body.clinic_id);
  const name = String(body.name || '').trim().slice(0, 100);
  const specialty = String(body.specialty || '').trim().slice(0, 80) || 'General';

  if (!Number.isInteger(clinicId) || clinicId < 1) {
    return res.status(400).json({ message: 'Choose a clinic for this doctor.' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Enter a doctor name.' });
  }

  try {
    const clinic = await pool.query('SELECT id, is_active FROM clinics WHERE id = $1', [clinicId]);
    if (clinic.rows.length === 0) {
      return res.status(404).json({ message: 'Clinic not found.' });
    }
    if (!clinic.rows[0].is_active) {
      return res.status(400).json({ message: 'This clinic is inactive.' });
    }

    const result = await pool.query(
      `INSERT INTO doctors (clinic_id, name, specialty) VALUES ($1, $2, $3) RETURNING id, clinic_id, name, specialty`,
      [clinicId, name, specialty]
    );

    res.status(201).json({ message: 'Doctor added.', doctor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not add the doctor.' });
  }
});

router.put('/doctors/:id', requireAdmin, async (req, res) => {
  const id = userId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid doctor.' });

  const body = req.body || {};
  const name = String(body.name || '').trim().slice(0, 100);
  const specialty = String(body.specialty || '').trim().slice(0, 80);

  if (!name) {
    return res.status(400).json({ message: 'Enter a doctor name.' });
  }

  try {
    const doctor = await pool.query('SELECT id, clinic_id FROM doctors WHERE id = $1', [id]);
    if (doctor.rows.length === 0) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    const updateQuery = `UPDATE doctors SET name = $1, specialty = $2 WHERE id = $3 RETURNING id, clinic_id, name, specialty`;
    const result = await pool.query(updateQuery, [name, specialty, id]);

    res.json({ message: 'Doctor updated.', doctor: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not update the doctor.' });
  }
});

router.delete('/doctors/:id', requireAdmin, async (req, res) => {
  const id = userId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid doctor.' });

  try {
    const doctor = await pool.query('SELECT id, clinic_id FROM doctors WHERE id = $1', [id]);
    if (doctor.rows.length === 0) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    const appointments = await pool.query(
      `SELECT count(*)::int AS cnt FROM appointments WHERE doctor_id = $1`,
      [id]
    );
    if (appointments.rows[0].cnt > 0) {
      return res.status(409).json({ message: 'Cannot delete doctor because appointments exist. Reassign or deactivate instead.' });
    }

    await pool.query('DELETE FROM doctors WHERE id = $1', [id]);
    res.json({ message: 'Doctor deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete the doctor.' });
  }
});
