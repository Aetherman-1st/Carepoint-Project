const express = require('express');
const pool = require('../db');
const { requireAuth, isAdminEmail } = require('../lib/auth');
const zoom = require('../lib/zoom');

const router = express.Router();

const meetingSelect = `
  SELECT
    a.id,
    to_char(a.appointment_date, 'YYYY-MM-DD') AS appointment_date,
    a.appointment_time,
    a.status,
    a.visit_type,
    a.zoom_meeting_id,
    a.zoom_join_url,
    a.zoom_password,
    a.zoom_status,
    a.reason,
    c.name AS clinic_name,
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
  WHERE a.visit_type = 'online'
`;

router.get('/', requireAuth, async (req, res) => {
  const admin = isAdminEmail(req.user.email);

  try {
    const result = admin
      ? await pool.query(
          `${meetingSelect} ORDER BY a.appointment_date DESC, a.appointment_time DESC`
        )
      : await pool.query(
          `${meetingSelect} AND a.user_id = $1
           ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
          [req.user.id]
        );

    const zoomCheck = zoom.isConfigured()
      ? await zoom.checkConnection()
      : { ok: false, error: 'Zoom credentials are not configured.' };

    res.json({
      zoomConfigured: zoom.isConfigured(),
      zoomReady: zoomCheck.ok,
      zoomError: admin ? zoomCheck.error : null,
      meetings: result.rows
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not load meetings' });
  }
});

module.exports = router;
