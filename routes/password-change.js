const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

router.post('/', requireAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ message: 'Provide old and new passwords.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters.' });
  }

  try {
    const user = req.user;

    const match = await bcrypt.compare(oldPassword, user.password_hash);
    if (!match) {
      return res.status(401).json({ message: 'Old password is incorrect.' });
    }

    const hashed = await bcrypt.hash(newPassword, 12);

    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           session_version = session_version + 1,
           updated_at = now()
       WHERE id = $2`,
      [hashed, user.id]
    );

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not change the password.' });
  }
});

module.exports = router;