const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const clinics = await pool.query(`
      SELECT id, name, specialty, address, city, phone, description, image_url
      FROM clinics
      WHERE is_active = true
      ORDER BY name
    `);

    const doctors = await pool.query(`
      SELECT id, clinic_id, name, specialty, bio
      FROM doctors
      WHERE clinic_id IN (SELECT id FROM clinics WHERE is_active = true)
      ORDER BY name
    `);

    const byClinic = new Map();
    for (const doctor of doctors.rows) {
      if (!byClinic.has(doctor.clinic_id)) byClinic.set(doctor.clinic_id, []);
      byClinic.get(doctor.clinic_id).push(doctor);
    }

    res.json(
      clinics.rows.map((clinic) => ({
        ...clinic,
        doctors: byClinic.get(clinic.id) || []
      }))
    );
  } catch (err) {
    res.status(500).json({ message: 'Could not load clinics' });
  }
});

module.exports = router;
