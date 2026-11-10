const express = require('express');
const pool = require('../db');
const { requireClinic } = require('../lib/auth');
const zoom = require('../lib/zoom');

const router = express.Router();
const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function positiveId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.use(requireClinic);

router.get('/profile', async (req, res) => {
  try {
    const clinic = await pool.query(
      `SELECT id, name, specialty, address, city, phone, description, image_url, is_active, created_at
       FROM clinics WHERE id = $1`,
      [req.user.clinic_id]
    );

    if (clinic.rows.length === 0) {
      return res.status(404).json({ message: 'Your clinic account is not linked to a clinic.' });
    }

    const stats = await pool.query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE status = 'Pending')::int AS pending,
         count(*) FILTER (WHERE status = 'Confirmed')::int AS confirmed,
         count(*) FILTER (WHERE status = 'Completed')::int AS completed,
         count(*) FILTER (WHERE status = 'Cancelled')::int AS cancelled,
         count(*) FILTER (
           WHERE status IN ('Pending', 'Confirmed') AND appointment_date >= CURRENT_DATE
         )::int AS upcoming
       FROM appointments WHERE clinic_id = $1`,
      [req.user.clinic_id]
    );

    const doctors = await pool.query(
      'SELECT count(*)::int AS count FROM doctors WHERE clinic_id = $1',
      [req.user.clinic_id]
    );

    res.json({
      clinic: clinic.rows[0],
      stats: { ...stats.rows[0], doctors: doctors.rows[0].count }
    });
  } catch (err) {
    console.error('Clinic profile load failed:', err.message);
    res.status(500).json({ message: 'Could not load your clinic profile.' });
  }
});

router.put('/profile', async (req, res) => {
  const body = req.body || {};
  const name = cleanText(body.name, 160);
  const specialty = cleanText(body.specialty, 160);
  const address = cleanText(body.address, 300);
  const city = cleanText(body.city, 120);
  const phone = cleanText(body.phone, 60);
  const description = cleanText(body.description, 2000);
  const imageUrl = cleanText(body.image_url, 500);

  if (!name) {
    return res.status(400).json({ message: 'Clinic name is required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE clinics
       SET name = $1, specialty = $2, address = $3, city = $4, phone = $5,
           description = $6, image_url = $7
       WHERE id = $8
       RETURNING id, name, specialty, address, city, phone, description, image_url, is_active, created_at`,
      [
        name,
        specialty || null,
        address || null,
        city || null,
        phone || null,
        description || null,
        imageUrl || null,
        req.user.clinic_id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Your clinic could not be found.' });
    }

    res.json({ message: 'Clinic profile updated.', clinic: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Another clinic already uses that name.' });
    }
    console.error('Clinic profile update failed:', err.message);
    res.status(500).json({ message: 'Could not update your clinic profile.' });
  }
});

router.get('/appointments', async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';

  try {
    const params = [req.user.clinic_id];
    let filter = 'WHERE a.clinic_id = $1';

    if (STATUSES.includes(status)) {
      params.push(status);
      filter += ` AND a.status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT
         a.id,
         to_char(a.appointment_date, 'YYYY-MM-DD') AS appointment_date,
         a.appointment_time,
         a.reason,
         a.status,
         a.visit_type,
         a.zoom_meeting_id,
         a.zoom_join_url,
         a.zoom_password,
         a.zoom_status,
         a.created_at,
         u.id AS patient_id,
         u.first_name AS patient_first_name,
         u.last_name AS patient_last_name,
         u.email AS patient_email,
         u.phone AS patient_phone,
         COALESCE(d.name, 'Clinic visit') AS doctor_name,
         d.specialty AS doctor_specialty
       FROM appointments a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN doctors d ON d.id = a.doctor_id
       ${filter}
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Clinic appointments load failed:', err.message);
    res.status(500).json({ message: 'Could not load clinic appointments.' });
  }
});

router.patch('/appointments/:id', async (req, res) => {
  const id = positiveId(req.params.id);
  const status = (req.body || {}).status;

  if (!id || !STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid appointment update.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM appointments WHERE id = $1 AND clinic_id = $2',
      [id, req.user.clinic_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    const appointment = result.rows[0];
    const allowed = {
      Pending: ['Confirmed', 'Cancelled'],
      Confirmed: ['Completed', 'Cancelled'],
      Completed: [],
      Cancelled: []
    };

    if (!allowed[appointment.status].includes(status)) {
      return res.status(400).json({
        message: `A ${appointment.status.toLowerCase()} appointment cannot be changed to ${status.toLowerCase()}.`
      });
    }

    await pool.query('UPDATE appointments SET status = $1, updated_at = now() WHERE id = $2', [
      status,
      id
    ]);

    if (status === 'Cancelled' && appointment.zoom_meeting_id) {
      const removed = await zoom.deleteMeeting(appointment.zoom_meeting_id);
      await pool.query(
        'UPDATE appointments SET zoom_status = $1, updated_at = now() WHERE id = $2',
        [removed ? 'cancelled' : 'cancel_pending', id]
      );
    }

    res.json({ message: `Appointment marked ${status.toLowerCase()}.`, status });
  } catch (err) {
    console.error('Clinic appointment update failed:', err.message);
    res.status(500).json({ message: 'Could not update the appointment.' });
  }
});

router.get('/appointments/:id/patient', async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid appointment.' });

  try {
    const result = await pool.query(
      `SELECT a.user_id, u.first_name, u.last_name, u.email, u.phone,
              op.age, op.conditions, op.medications
       FROM appointments a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN onboarding_profiles op ON op.user_id = u.id
       WHERE a.id = $1 AND a.clinic_id = $2`,
      [id, req.user.clinic_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    res.json({ patient: result.rows[0] });
  } catch (err) {
    console.error('Clinic patient load failed:', err.message);
    res.status(500).json({ message: 'Could not load patient details.' });
  }
});

router.get('/doctors', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.id, d.name, d.specialty, d.bio,
              (SELECT count(*)::int FROM appointments a WHERE a.doctor_id = d.id) AS appointment_count
       FROM doctors d
       WHERE d.clinic_id = $1
       ORDER BY d.name`,
      [req.user.clinic_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not load doctors.' });
  }
});

router.post('/doctors', async (req, res) => {
  const name = cleanText((req.body || {}).name, 160);
  const specialty = cleanText((req.body || {}).specialty, 160);
  const bio = cleanText((req.body || {}).bio, 2000);

  if (!name || !specialty) {
    return res.status(400).json({ message: 'Doctor name and specialty are required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO doctors (clinic_id, name, specialty, bio)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, specialty, bio`,
      [req.user.clinic_id, name, specialty, bio || null]
    );
    res.status(201).json({ message: 'Doctor added.', doctor: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A doctor with that name already exists at this clinic.' });
    }
    res.status(500).json({ message: 'Could not add the doctor.' });
  }
});

router.put('/doctors/:id', async (req, res) => {
  const id = positiveId(req.params.id);
  const name = cleanText((req.body || {}).name, 160);
  const specialty = cleanText((req.body || {}).specialty, 160);
  const bio = cleanText((req.body || {}).bio, 2000);

  if (!id || !name || !specialty) {
    return res.status(400).json({ message: 'Doctor name and specialty are required.' });
  }

  try {
    const result = await pool.query(
      `UPDATE doctors
       SET name = $1, specialty = $2, bio = $3
       WHERE id = $4 AND clinic_id = $5
       RETURNING id, name, specialty, bio`,
      [name, specialty, bio || null, id, req.user.clinic_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    res.json({ message: 'Doctor updated.', doctor: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'A doctor with that name already exists at this clinic.' });
    }
    res.status(500).json({ message: 'Could not update the doctor.' });
  }
});

router.delete('/doctors/:id', async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) return res.status(400).json({ message: 'Invalid doctor.' });

  try {
    const doctor = await pool.query('SELECT id FROM doctors WHERE id = $1 AND clinic_id = $2', [
      id,
      req.user.clinic_id
    ]);
    if (doctor.rows.length === 0) {
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    const appointments = await pool.query(
      'SELECT count(*)::int AS count FROM appointments WHERE doctor_id = $1',
      [id]
    );

    if (appointments.rows[0].count > 0) {
      return res.status(409).json({
        message:
          'This doctor has appointments and cannot be deleted. Remove or reassign those appointments first.'
      });
    }

    await pool.query('DELETE FROM doctors WHERE id = $1', [id]);
    res.json({ message: 'Doctor deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete the doctor.' });
  }
});

module.exports = router;
