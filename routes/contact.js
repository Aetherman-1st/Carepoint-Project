const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../lib/auth');
const { sendContactReply } = require('../lib/mailer');

const router = express.Router();

router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        m.id,
        m.name,
        m.email,
        m.subject,
        m.message,
        m.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', r.id,
              'body', r.body,
              'emailed', r.emailed,
              'created_at', r.created_at,
              'admin_name', nullif(concat_ws(' ', au.first_name, au.last_name), '')
            )
            ORDER BY r.created_at
          ) FILTER (WHERE r.id IS NOT NULL),
          '[]'::json
        ) AS replies
      FROM contact_messages m
      LEFT JOIN contact_replies r ON r.message_id = m.id
      LEFT JOIN users au ON au.id = r.admin_id
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Could not load messages' });
  }
});

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

router.post('/:id/replies', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const body = String((req.body || {}).body || '').trim().slice(0, 5000);

  if (!id || !body) {
    return res.status(400).json({ message: 'Please write a reply before sending.' });
  }

  try {
    const message = await pool.query('SELECT * FROM contact_messages WHERE id = $1', [id]);
    if (message.rows.length === 0) {
      return res.status(404).json({ message: 'Message not found.' });
    }

    const original = message.rows[0];
    let emailed = false;
    let deliveryError = null;

    try {
      const result = await sendContactReply({
        to: original.email,
        name: original.name,
        subject: original.subject,
        reply: body,
        original: original.message
      });
      emailed = result.delivered;
    } catch (err) {
      deliveryError = String(err.message).slice(0, 500);
    }

    const inserted = await pool.query(
      `INSERT INTO contact_replies (message_id, admin_id, body, emailed)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [id, req.user.id, body, emailed]
    );

    res.status(201).json({
      message: emailed
        ? 'Reply sent to the patient.'
        : 'Reply saved. Email delivery is in development mode, so it was logged instead.',
      emailed,
      deliveryError,
      reply: {
        id: inserted.rows[0].id,
        body,
        emailed,
        created_at: inserted.rows[0].created_at,
        admin_name: `${req.user.first_name} ${req.user.last_name}`.trim()
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Could not send the reply.' });
  }
});

module.exports = router;
