const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT age, conditions, medications, created_at, updated_at FROM onboarding_profiles WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ profile: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ message: 'Could not load your care profile.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { age, conditions, medications } = req.body || {};
  const parsedAge = Number(age);

  if (!Number.isInteger(parsedAge) || parsedAge < 1 || parsedAge > 120) {
    return res.status(400).json({ message: 'Please enter an age between 1 and 120.' });
  }

  const cleanConditions = cleanText(conditions, 2000);
  const cleanMedications = cleanText(medications, 2000);

  try {
    const result = await pool.query(
      `INSERT INTO onboarding_profiles (user_id, age, conditions, medications)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE
       SET age = EXCLUDED.age,
           conditions = EXCLUDED.conditions,
           medications = EXCLUDED.medications,
           updated_at = now()
       RETURNING age, conditions, medications, created_at, updated_at`,
      [req.user.id, parsedAge, cleanConditions, cleanMedications]
    );

    await pool.query('UPDATE users SET onboarding_completed_at = now() WHERE id = $1', [req.user.id]);

    res.json({ message: 'Care profile saved', profile: result.rows[0] });
  } catch (err) {
    res.status(500).json({ message: 'Could not save your care profile.' });
  }
});

module.exports = router;
