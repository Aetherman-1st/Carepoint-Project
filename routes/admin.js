const express = require('express');
const pool = require('../db');
const { requireAdmin, isAdminEmail } = require('../lib/auth');

const router = express.Router();

function userId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function isProtectedAccount(user) {
  return user.role === 'admin' || isAdminEmail(user.email);
}

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
