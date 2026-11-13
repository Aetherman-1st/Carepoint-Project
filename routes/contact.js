const express = require('express');
const pool = require('../db');

const router = express.Router();

router.post('/', async (req, res) => {
  const { name, email, subject, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ message: 'Please add your name, email and message.' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  try {
    await pool.query(
      `INSERT INTO contact_messages (name, email, subject, message)
       VALUES ($1, $2, $3, $4)`,
      [
        String(name).trim().slice(0, 120),
        String(email).trim().slice(0, 160),
        subject ? String(subject).trim().slice(0, 160) : null,
        String(message).trim().slice(0, 2000)
      ]
    );
    res.status(201).json({ message: 'Your message was sent.' });
  } catch (err) {
    res.status(500).json({ message: 'Could not send your message. Please try again.' });
  }
});

module.exports = router;
