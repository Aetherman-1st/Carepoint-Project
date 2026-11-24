const crypto = require('crypto');
const express = require('express');
const pool = require('../db');
const { requireUser } = require('../lib/auth');
const { createSession, sessionCookie, requestIsSecure } = require('../lib/session');
const { isPersonName, isPhone } = require('../lib/validate');
const { ValidationError, validateUpload } = require('../lib/file-validation');

const router = express.Router();
const MAX_AVATAR_BYTES = 512 * 1024;
const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function normalizeAvatar(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') {
    const error = new Error('Please choose a valid profile photo.');
    error.status = 400;
    throw error;
  }

  const match = AVATAR_PATTERN.exec(value);
  if (!match) {
    const error = new Error('Profile photos must be JPG, PNG or WebP images.');
    error.status = 400;
    throw error;
  }

  const type = match[1];
  const base64 = match[2].replace(/\s/g, '');
  const buffer = Buffer.from(base64, 'base64');

  if (!buffer.length) {
    const error = new Error('That profile photo could not be read.');
    error.status = 400;
    throw error;
  }

  if (buffer.length > MAX_AVATAR_BYTES) {
    const error = new Error('Profile photos must be smaller than 512 KB.');
    error.status = 400;
    throw error;
  }

  let normalized;
  try {
    normalized = await validateUpload(
      buffer,
      `${crypto.randomUUID()}.${type === 'jpeg' ? 'jpg' : type}`
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      const error = new Error(err.message);
      error.status = 400;
      throw error;
    }
    throw err;
  }

  return `data:${normalized.mimeType};base64,${normalized.buffer.toString('base64')}`;
}

function profileFields(row) {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    phone: row.phone,
    avatar_url: row.avatar_url,
    created_at: row.created_at
  };
}

router.get('/', requireUser, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, first_name, last_name, email, phone, avatar_url, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Your account could not be found.' });
    }

    res.json({ profile: profileFields(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ message: 'Could not load your profile.' });
  }
});

router.put('/', requireUser, async (req, res) => {
  const firstName = cleanText(req.body && req.body.first_name, 80);
  const lastName = cleanText(req.body && req.body.last_name, 80);
  const phone = cleanText(req.body && req.body.phone, 40);

  if (!firstName || !lastName) {
    return res.status(400).json({ message: 'First and last name are required.' });
  }

  if (!isPersonName(firstName) || !isPersonName(lastName)) {
    return res.status(400).json({ message: 'Names can only contain letters (spaces, hyphens and apostrophes allowed).' });
  }

  if (!isPhone(phone)) {
    return res.status(400).json({ message: 'Phone can only contain digits, spaces and + ( ) - .' });
  }

  try {
    const hasAvatarUpdate = Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar_url');
    const avatarUrl = hasAvatarUpdate ? await normalizeAvatar(req.body.avatar_url) : null;
    const result = hasAvatarUpdate
      ? await pool.query(
          `UPDATE users
           SET first_name = $1, last_name = $2, phone = $3, avatar_url = $4
           WHERE id = $5
           RETURNING id, first_name, last_name, email, phone, avatar_url, created_at`,
          [firstName, lastName, phone || null, avatarUrl, req.user.id]
        )
      : await pool.query(
          `UPDATE users
           SET first_name = $1, last_name = $2, phone = $3
           WHERE id = $4
           RETURNING id, first_name, last_name, email, phone, avatar_url, created_at`,
          [firstName, lastName, phone || null, req.user.id]
        );

    const row = result.rows[0];
    if (!row) {
      return res.status(404).json({ message: 'Your account could not be found.' });
    }

    const token = createSession(
      {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        role: req.user.role
      },
      {
        remember: Boolean(req.session && req.session.remember),
        sessionVersion: req.user.session_version
      }
    );

    res.setHeader(
      'Set-Cookie',
      sessionCookie(token, {
        persistent: Boolean(req.session && req.session.remember),
        secure: requestIsSecure(req)
      })
    );
    res.json({ message: 'Profile updated.', profile: profileFields(row) });
  } catch (err) {
    res.status(err.status || 500).json({
      message: err.status ? err.message : 'Could not save your profile.'
    });
  }
});

module.exports = router;
