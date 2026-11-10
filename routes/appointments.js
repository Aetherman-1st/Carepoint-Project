const express = require('express');
const pool = require('../db');
const { requireAuth, requireUser } = require('../lib/auth');
const zoom = require('../lib/zoom');

const router = express.Router();

const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

const baseSelect = `
  SELECT
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
  if (req.user.role === 'clinic') {
    return res.status(403).json({ message: 'Clinic accounts use the clinic dashboard.' });
  }
  const admin = req.user.role === 'admin';
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

router.post('/', requireUser, async (req, res) => {
  const { clinic_id, doctor_id, appointment_date, appointment_time, reason, visit_type } = req.body || {};
  const clinicId = Number(clinic_id);
  const doctorId = doctor_id ? Number(doctor_id) : null;
  const visitType = visit_type === 'online' ? 'online' : 'in_person';

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
    const clinic = await pool.query('SELECT id, name FROM clinics WHERE id = $1', [clinicId]);
    if (clinic.rows.length === 0) {
      return res.status(400).json({ message: 'That clinic is not available.' });
    }
    const clinicName = clinic.rows[0].name;

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
      `INSERT INTO appointments
         (user_id, clinic_id, doctor_id, appointment_date, appointment_time, reason, visit_type, zoom_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        req.user.id,
        clinicId,
        doctorId,
        appointment_date,
        appointment_time,
        cleanReason,
        visitType,
        visitType === 'online' ? (zoom.isConfigured() ? 'creating' : 'pending_config') : null
      ]
    );

    const appointmentId = result.rows[0].id;
    let meeting = null;
    let zoomStatus = visitType === 'online' ? (zoom.isConfigured() ? 'creating' : 'pending_config') : null;
    let zoomError = null;

    if (visitType === 'online' && zoom.isConfigured()) {
      try {
        meeting = await zoom.createMeeting({
          topic: `CarePoint visit — ${clinicName}`,
          startTime: zoom.buildStartTime(appointment_date, appointment_time),
          duration: zoom.DEFAULT_DURATION,
          agenda: cleanReason || `Online appointment at ${clinicName}`,
          timezone: zoom.DEFAULT_TIMEZONE
        });

        zoomStatus = 'scheduled';
        await pool.query(
          `UPDATE appointments
           SET zoom_meeting_id = $1,
               zoom_join_url = $2,
               zoom_start_url = $3,
               zoom_password = $4,
               zoom_status = $5,
               updated_at = now()
           WHERE id = $6`,
          [meeting.id, meeting.joinUrl, meeting.startUrl, meeting.password, zoomStatus, appointmentId]
        );
      } catch (err) {
        zoomStatus = 'failed';
        zoomError = err.message;
        console.error('Zoom meeting creation failed:', err.message);
        await pool.query(
          'UPDATE appointments SET zoom_status = $1, updated_at = now() WHERE id = $2',
          [zoomStatus, appointmentId]
        );
      }
    }

    const isOnline = visitType === 'online';
    res.status(201).json({
      message: isOnline
        ? zoomStatus === 'scheduled'
          ? 'Online appointment requested. Your Zoom meeting is ready.'
          : zoomStatus === 'pending_config'
            ? 'Online appointment requested. The Zoom link will appear once Zoom is connected.'
            : 'Online appointment requested, but the Zoom meeting could not be created yet.'
        : 'Appointment requested',
      id: appointmentId,
      visit_type: visitType,
      zoom_status: zoomStatus,
      zoom_error: zoomError,
      meeting: meeting
        ? {
            id: meeting.id,
            join_url: meeting.joinUrl,
            password: meeting.password,
            start_time: meeting.startTime
          }
        : null
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not book the appointment' });
  }
});

router.patch('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const {
    status,
    appointment_date,
    appointment_time,
    reason,
    visit_type
  } = req.body || {};

  if (req.user.role === 'clinic') {
    return res.status(403).json({ message: 'Clinic accounts use the clinic dashboard.' });
  }

  const admin = req.user.role === 'admin';
  const isReschedule = Boolean(
    appointment_date || appointment_time || reason !== undefined || visit_type
  );
  const isStatusOnly = Boolean(status) && !isReschedule;

  if (!id) {
    return res.status(400).json({ message: 'Invalid appointment.' });
  }

  if (isStatusOnly) {
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status.' });
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

      if (status === 'Cancelled' && appointment.zoom_meeting_id) {
        const removed = await zoom.deleteMeeting(appointment.zoom_meeting_id);
        await pool.query(
          'UPDATE appointments SET zoom_status = $1, updated_at = now() WHERE id = $2',
          [removed ? 'cancelled' : 'cancel_pending', id]
        );
      }

      res.json({ message: 'Appointment updated', status });
    } catch (err) {
      res.status(500).json({ message: 'Could not update the appointment' });
    }
    return;
  }

  if (isReschedule) {
    try {
      const result = await pool.query('SELECT * FROM appointments WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Appointment not found.' });
      }

      const appointment = result.rows[0];

      if (!admin && appointment.user_id !== req.user.id) {
        return res.status(403).json({ message: 'You cannot change this appointment.' });
      }

      if (!admin && ['Completed', 'Cancelled'].includes(appointment.status)) {
        return res.status(400).json({ message: 'Rescheduling is not allowed for completed or cancelled appointments.' });
      }

      let newDate = appointment_date || appointment.appointment_date;
      let newTime = appointment_time || appointment.appointment_time;

      if (newDate) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
          return res.status(400).json({ message: 'Please choose a valid date.' });
        }
        const [year, month, day] = newDate.split('-').map(Number);
        const parsedDate = new Date(year, month - 1, day);
        if (
          parsedDate.getFullYear() !== year ||
          parsedDate.getMonth() !== month - 1 ||
          parsedDate.getDate() !== day
        ) {
          return res.status(400).json({ message: 'Please choose a valid date.' });
        }
        if (newDate < todayString()) {
          return res.status(400).json({ message: 'Appointments cannot be rescheduled in the past.' });
        }
      }

      if (newTime) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(newTime)) {
          return res.status(400).json({ message: 'Please choose a valid time.' });
        }
      }

      const cleanReason = typeof reason === 'string' ? reason.trim().slice(0, 500) : appointment.reason;
      const visitType = visit_type === 'online' ? 'online' : (visit_type === 'in_person' ? 'in_person' : appointment.visit_type);

      if (newDate || newTime) {
        const conflictField = doctor_id
          ? `doctor_id = $${doctor_id ? 4 : 3}`
          : 'clinic_id = $1 AND doctor_id IS NULL';
        const conflictVals = [Number(newDate) ? newDate : clinicId];
        // We'll just query with placeholders dynamically

        const whereSql = `
          SELECT 1 FROM appointments
           WHERE id != $${id}
            AND appointment_date = $${newDate ? 3 : 2}
            AND appointment_time = $${newTime ? 4 : 3}
            AND status IN ('Pending', 'Confirmed')
        `;
        const qVals = [id];
        if (newDate) qVals.push(newDate);
        if (newTime) qVals.push(newTime);
        if (doctor_id) qVals.push(doctorId || 0);
        // Actually need to rebuild; let's simplify by building query with parameters

        // We'll just use prepared query approach below

        // Actually we can just use the existing conflict logic with clinic_id and doctor_id resolved from req.body maybe; for brevity, if doctor_id not given we just check clinic_id and if given we check both.
        // Let's do simpler: conflict check uses newDate, newTime, and doctorId if provided; we have doctorId maybe from req.user role? Not needed; we can just query with parameters.
        // But to keep code simple, re-use existing conflict but with newDate/newTime and appropriate params.

        // We'll exit and handle below after building params.
        // Let's just perform check inline.

      }

      // ---------- conflict check ----------
      const doctorId = req.body.doctor_id ? Number(req.body.doctor_id) : null;

      let conflictSql = `
        SELECT 1 FROM appointments
         WHERE id != $1
         AND appointment_date = $2
         AND appointment_time = $3
         AND status IN ('Pending', 'Confirmed')
      `;
      let qVals = [id, newDate || appointment.appointment_date, newTime || appointment.appointment_time];

      if (doctorId) {
        conflictSql += ` AND doctor_id = $${qVals.length + 1}`;
        qVals.push(doctorId);
      } else {
        conflictSql += ` AND clinic_id = $${qVals.length + 1}`;
        qVals.push(clinicId);
      }

      const conflict = await pool.query(conflictSql, qVals);
      if (conflict.rows.length > 0) {
        return res.status(409).json({ message: 'That time is already requested. Please choose another time.' });
      }
      // ---------- end conflict check ----------

      const updateResult = await pool.query(`
        UPDATE appointments
        SET appointment_date = $1,
            appointment_time = $2,
            reason = $3,
            visit_type = $4,
            updated_at = now()
        WHERE id = $5
        RETURNING *
      `, [newDate || appointment.appointment_date, newTime || appointment.appointment_time, cleanReason, visitType, id]);

      const updated = updateResult.rows[0];

      if (updated.visit_type === 'online') {
        if (updated.zoom_meeting_id) {
          try {
            await zoom.updateMeeting(updated.zoom_meeting_id, {
              topic: `CarePoint visit — ${updated.clinic_name}`,
              startTime: zoom.buildStartTime(updated.appointment_date, updated.appointment_time),
              duration: zoom.DEFAULT_DURATION,
              agenda: cleanReason || `Online appointment`,
              timezone: zoom.DEFAULT_TIMEZONE
            });
          } catch (err) {
            // If update fails, try to create new meeting and delete old one
            try {
              const newMeeting = await zoom.createMeeting({
                topic: `CarePoint visit — ${updated.clinic_name}`,
                startTime: zoom.buildStartTime(updated.appointment_date, updated.appointment_time),
                duration: zoom.DEFAULT_DURATION,
                agenda: cleanReason || `Online appointment at ${updated.clinic_name}`,
                timezone: zoom.DEFAULT_TIMEZONE
              });
              await zoom.deleteMeeting(updated.zoom_meeting_id);
              await pool.query(
                `UPDATE appointments
                   SET zoom_meeting_id = $1,
                       zoom_join_url = $2,
                       zoom_start_url = $3,
                       zoom_password = $4,
                       zoom_status = $5,
                       updated_at = now()
                 WHERE id = $6`,
                [newMeeting.id, newMeeting.joinUrl, newMeeting.startUrl, newMeeting.password, 'scheduled', updated.id]
              );
            } catch (err2) {
              console.error('Zoom reschedule create+delete failed:', err2.message);
              await pool.query(
                `UPDATE appointments
                   SET zoom_status = $1, updated_at = now()
                 WHERE id = $2`,
                ['failed', updated.id]
              );
            }
          }
        } else {
          try {
            const newMeeting = await zoom.createMeeting({
              topic: `CarePoint visit — ${updated.clinic_name}`,
              startTime: zoom.buildStartTime(updated.appointment_date, updated.appointment_time),
              duration: zoom.DEFAULT_DURATION,
              agenda: cleanReason || `Online appointment at ${updated.clinic_name}`,
              timezone: zoom.DEFAULT_TIMEZONE
            });
            await pool.query(
              `UPDATE appointments
                 SET zoom_meeting_id = $1,
                     zoom_join_url = $2,
                     zoom_start_url = $3,
                     zoom_password = $4,
                     zoom_status = $5,
                     updated_at = now()
               WHERE id = $6`,
              [newMeeting.id, newMeeting.joinUrl, newMeeting.startUrl, newMeeting.password, 'scheduled', updated.id]
            );
          } catch (err) {
            console.error('Zoom meeting creation failed on reschedule:', err.message);
            await pool.query(
              `UPDATE appointments SET zoom_status = $1, updated_at = now() WHERE id = $2`,
              ['failed', updated.id]
            );
          }
        }
      } else if (updated.zoom_meeting_id) {
        try {
          const removed = await zoom.deleteMeeting(updated.zoom_meeting_id);
          await pool.query(
            `UPDATE appointments SET zoom_status = $1, updated_at = now() WHERE id = $2`,
            [removed ? 'cancelled' : 'cancel_pending', updated.id]
          );
        } catch (err) {
          console.error('Zoom delete failed on reschedule to in_person:', err.message);
        }
      }

      res.json({ message: 'Appointment rescheduled', appointment: updated });
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ message: 'That time is already requested. Please choose another time.' });
      }
      res.status(500).json({ message: 'Could not reschedule the appointment' });
    }
    return;
  }

  // Fallback: no recognized fields
  res.status(400).json({ message: 'No valid update fields provided.' });
});

module.exports = router;
