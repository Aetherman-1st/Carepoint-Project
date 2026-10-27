const express = require('express');
const pool = require('../db');
const { requireAuth, isAdminEmail } = require('../lib/auth');

const router = express.Router();

const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

const baseSelect = `
  SELECT
    a.id,
    to_char(a.appointment_date, 'YYYY-MM-DD') AS appointment_date,
    a.appointment_time,
    a.reason,
    a.status,
    a.created_at,
    c.name AS clinic_name,
    c.specialty AS clinic_specialty,
    c.address AS clinic_address,
    c.city AS clinic_city,
    COALESCE(d.name, 'Clinic visit') AS doctor_name,
    d.specialty AS doctor_specialty,
    u.first_name AS patient_first_name,
    u.last_name AS patient_last_name,
    u.email AS patient_email
  FROM appointments a
  JOIN clinics c ON c.id = a.clinic_id
  LEFT JOIN doctors d ON d.id = a.doctor_id
  JOIN users u ON u.id = a.user_id
`;

function todayString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

router.get('/', requireAuth, async (req, res) => {
  const admin = isAdminEmail(req.user.email);
  try {
    const result = admin
      ? await pool.query(`${baseSelect} ORDER BY a.appointment_date DESC, a.appointment_time DESC`)
      : await pool.query(
          `${baseSelect} WHERE a.user_id = $1 ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
          [req.user.id]
        );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not load appointments' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { clinic_id, doctor_id, appointment_date, appointment_time, reason } = req.body || {};
  const clinicId = Number(clinic_id);
  const doctorId = doctor_id ? Number(doctor_id) : null;

  if (!clinicId || !appointment_date || !appointment_time) {
    return res.status(400).json({ message: 'Please choose a clinic, date and time.' });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) {
    return res.status(400).json({ message: 'Please choose a valid date.' });
  }

  const [year, month, day] = appointment_date.split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (
    parsedDate.getFullYear() !== year ||
    parsedDate.getMonth() !== month - 1 ||
    parsedDate.getDate() !== day
  ) {
    return res.status(400).json({ message: 'Please choose a valid date.' });
  }

  if (appointment_date < todayString()) {
    return res.status(400).json({ message: 'Appointments cannot be booked in the past.' });
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(appointment_time)) {
    return res.status(400).json({ message: 'Please choose a valid time.' });
  }

  const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : null;

  try {
    const clinic = await pool.query('SELECT id FROM clinics WHERE id = $1', [clinicId]);
    if (clinic.rows.length === 0) {
      return res.status(400).json({ message: 'That clinic is not available.' });
    }

    if (doctorId) {
      const doctor = await pool.query('SELECT id FROM doctors WHERE id = $1 AND clinic_id = $2', [
        doctorId,
        clinicId
      ]);
      if (doctor.rows.length === 0) {
        return res.status(400).json({ message: 'That doctor is not available at this clinic.' });
      }
    }

    const conflict = doctorId
      ? await pool.query(
          `SELECT 1 FROM appointments
           WHERE doctor_id = $1 AND appointment_date = $2 AND appointment_time = $3
             AND status IN ('Pending', 'Confirmed')`,
          [doctorId, appointment_date, appointment_time]
        )
      : await pool.query(
          `SELECT 1 FROM appointments
           WHERE clinic_id = $1 AND doctor_id IS NULL AND appointment_date = $2 AND appointment_time = $3
             AND status IN ('Pending', 'Confirmed')`,
          [clinicId, appointment_date, appointment_time]
        );

    if (conflict.rows.length > 0) {
      return res.status(409).json({ message: 'That time is already requested. Please choose another time.' });
    }

    const result = await pool.query(
      `INSERT INTO appointments (user_id, clinic_id, doctor_id, appointment_date, appointment_time, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [req.user.id, clinicId, doctorId, appointment_date, appointment_time, cleanReason]
    );

    res.status(201).json({ message: 'Appointment requested', id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: 'Could not book the appointment' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  const admin = isAdminEmail(req.user.email);

  if (!id || !STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid appointment update.' });
  }

  try {
    const result = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Appointment not found.' });
    }

    const appointment = result.rows[0];

    if (!admin) {
      if (appointment.user_id !== req.user.id) {
        return res.status(403).json({ message: 'You cannot change this appointment.' });
      }
      if (status !== 'Cancelled') {
        return res.status(403).json({ message: 'You can only cancel your appointment.' });
      }
      if (['Completed', 'Cancelled'].includes(appointment.status)) {
        return res.status(400).json({ message: 'This appointment can no longer be cancelled.' });
      }
    }

    await pool.query('UPDATE appointments SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
    res.json({ message: 'Appointment updated', status });
  } catch (err) {
    res.status(500).json({ message: 'Could not update the appointment' });
  }
});

module.exports = router;
