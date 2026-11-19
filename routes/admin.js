const express = require('express');
const pool = require('../db');
const zoom = require('../lib/zoom');
const { sendContactReply } = require('../lib/mailer');
const { logAudit } = require('../lib/audit');

const router = express.Router();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://upldnuraxojivoqvckzt.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
const ALLOWED_TRANSITIONS = {
  Pending: ['Confirmed', 'Cancelled'],
  Confirmed: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: []
};

function bearerToken(req) {
  const value = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1] : null;
}

function jwtPayload(token) {
  try {
    const part = token.split('.')[1];
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
}

async function requireAdmin(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ message: 'Please sign in again.' });

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`
      }
    });
    if (!response.ok) return res.status(401).json({ message: 'Please sign in again.' });

    const authUser = await response.json();
    const claims = jwtPayload(token);
    if (!claims || claims.aal !== 'aal2') {
      return res.status(403).json({ message: 'Two-factor authentication is required.' });
    }

    const member = await pool.query(
      'SELECT user_id FROM admin_members WHERE auth_user_id = $1',
      [authUser.id]
    );
    if (member.rows.length === 0) {
      return res.status(403).json({ message: 'Administrator access is required.' });
    }

    req.admin = {
      authUserId: authUser.id,
      userId: member.rows[0].user_id || null,
      email: authUser.email || null
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Please sign in again.' });
  }
}

async function protectedUser(id) {
  const result = await pool.query(
    `SELECT u.id, u.role,
            (u.role = 'admin' OR EXISTS (
              SELECT 1 FROM admin_members m WHERE m.user_id = u.id
            )) AS protected
     FROM users u WHERE u.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

router.patch('/users/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const banned = req.body && req.body.banned;
  if (!Number.isInteger(id) || id <= 0 || typeof banned !== 'boolean') {
    return res.status(400).json({ message: 'Invalid account update.' });
  }

  try {
    const target = await protectedUser(id);
    if (!target) return res.status(404).json({ message: 'Account not found.' });
    if (target.protected) return res.status(403).json({ message: 'Administrator accounts cannot be banned.' });

    const result = await pool.query(
      `UPDATE users
       SET banned_at = $1,
           session_version = session_version + CASE WHEN $1::timestamptz IS NULL THEN 0 ELSE 1 END,
           updated_at = now()
       WHERE id = $2
       RETURNING id, banned_at`,
      [banned ? new Date().toISOString() : null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Account not found.' });

    await logAudit({
      req,
      actorId: req.admin.userId,
      actorEmail: req.admin.email,
      action: banned ? 'user_banned' : 'user_unbanned',
      entityType: 'user',
      entityId: id
    });
    return res.json({ user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Could not update this account.' });
  }
});

router.delete('/users/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ message: 'Invalid account.' });
  }

  try {
    const target = await protectedUser(id);
    if (!target) return res.status(404).json({ message: 'Account not found.' });
    if (target.protected) return res.status(403).json({ message: 'Administrator accounts cannot be deleted.' });

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    await logAudit({
      req,
      actorId: req.admin.userId,
      actorEmail: req.admin.email,
      action: 'user_deleted',
      entityType: 'user',
      entityId: id
    });
    return res.json({ message: 'Account deleted.' });
  } catch (err) {
    return res.status(500).json({ message: 'Could not delete this account.' });
  }
});

router.patch('/appointments/:id/status', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body && req.body.status;
  if (!Number.isInteger(id) || id <= 0 || !STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid appointment update.' });
  }

  try {
    const result = await pool.query(
      `SELECT id, status, appointment_date, zoom_meeting_id
       FROM appointments WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Appointment not found.' });

    const appointment = result.rows[0];
    if (!ALLOWED_TRANSITIONS[appointment.status].includes(status)) {
      return res.status(400).json({
        message: `A ${appointment.status.toLowerCase()} appointment cannot be changed to ${status.toLowerCase()}.`
      });
    }

    if (status === 'Cancelled') {
      const today = new Date().toISOString().slice(0, 10);
      if (String(appointment.appointment_date).slice(0, 10) < today) {
        return res.status(400).json({ message: 'Past appointments cannot be cancelled.' });
      }
    }

    await pool.query('UPDATE appointments SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
    await logAudit({
      req,
      actorId: req.admin.userId,
      actorEmail: req.admin.email,
      action: 'appointment_status_changed',
      entityType: 'appointment',
      entityId: id,
      details: { from: appointment.status, to: status }
    });

    if (status === 'Cancelled' && appointment.zoom_meeting_id) {
      try {
        const removed = await zoom.deleteMeeting(appointment.zoom_meeting_id);
        await pool.query(
          'UPDATE appointments SET zoom_status = $1, updated_at = now() WHERE id = $2',
          [removed ? 'cancelled' : 'cancel_pending', id]
        );
      } catch (err) {
        await pool.query('UPDATE appointments SET zoom_status = $1, updated_at = now() WHERE id = $2', [
          'cancel_pending',
          id
        ]);
      }
    }

    return res.json({ message: 'Appointment updated.', status });
  } catch (err) {
    return res.status(500).json({ message: 'Could not update the appointment.' });
  }
});

router.post('/reply', requireAdmin, async (req, res) => {
  const messageId = Number(req.body && req.body.message_id);
  const body = typeof (req.body && req.body.body) === 'string' ? req.body.body.trim() : '';
  if (!Number.isInteger(messageId) || messageId <= 0 || !body || body.length > 5000) {
    return res.status(400).json({ message: 'Write a reply first.' });
  }
  if (!req.admin.userId) {
    return res.status(409).json({ message: 'This admin account is not linked to a CarePoint profile.' });
  }

  try {
    const messageResult = await pool.query(
      'SELECT id, name, email, subject, message FROM contact_messages WHERE id = $1',
      [messageId]
    );
    if (messageResult.rows.length === 0) {
      return res.status(404).json({ message: 'Message not found.' });
    }

    const message = messageResult.rows[0];
    const inserted = await pool.query(
      `INSERT INTO contact_replies (message_id, admin_id, body, emailed)
       VALUES ($1, $2, $3, false)
       RETURNING id, emailed, created_at`,
      [messageId, req.admin.userId, body]
    );

    let emailed = false;
    try {
      const delivery = await sendContactReply({
        to: message.email,
        name: message.name,
        subject: message.subject,
        reply: body,
        original: message.message
      });
      emailed = Boolean(delivery && delivery.delivered);
    } catch (err) {
      console.error('Contact reply delivery failed:', err.message);
    }

    if (emailed) {
      await pool.query('UPDATE contact_replies SET emailed = true WHERE id = $1', [inserted.rows[0].id]);
    }

    await logAudit({
      req,
      actorId: req.admin.userId,
      actorEmail: req.admin.email,
      action: 'contact_reply_created',
      entityType: 'contact_reply',
      entityId: inserted.rows[0].id,
      details: { message_id: messageId, emailed }
    });

    return res.status(emailed ? 201 : 502).json({
      message: emailed ? 'Reply sent.' : 'Reply saved but email delivery failed.',
      reply: { ...inserted.rows[0], emailed }
    });
  } catch (err) {
    return res.status(500).json({ message: 'Could not send the reply.' });
  }
});

module.exports = router;
