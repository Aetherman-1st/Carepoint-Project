const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../lib/auth');
const { createSession, sessionCookie } = require('../lib/session');

const router = express.Router();
const MAX_AVATAR_BYTES = 512 * 1024;
const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function imageMatchesType(buffer, type) {
  if (type === 'jpeg') {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (type === 'png') {
    return (
      buffer.length > 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }

  if (type === 'webp') {
    return (
      buffer.length > 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
}

function normalizeAvatar(value) {
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

  if (!buffer.length || !imageMatchesType(buffer, type)) {
    const error = new Error('That profile photo could not be read.');
    error.status = 400;
    throw error;
  }

  if (buffer.length > MAX_AVATAR_BYTES) {
    const error = new Error('Profile photos must be smaller than 512 KB.');
    error.status = 400;
    throw error;
  }

  return `data:image/${type};base64,${buffer.toString('base64')}`;
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

router.get('/', requireAuth, async (req, res) => {
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

router.put('/', requireAuth, async (req, res) => {
  const firstName = cleanText(req.body && req.body.first_name, 80);
  const lastName = cleanText(req.body && req.body.last_name, 80);
  const phone = cleanText(req.body && req.body.phone, 40);

  if (!firstName || !lastName) {
    return res.status(400).json({ message: 'First and last name are required.' });
  }

  try {
    const hasAvatarUpdate = Object.prototype.hasOwnProperty.call(req.body || {}, 'avatar_url');
    const avatarUrl = hasAvatarUpdate ? normalizeAvatar(req.body.avatar_url) : null;
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

    const token = createSession({
      id: row.id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      role: req.user.role
    });

    res.setHeader('Set-Cookie', sessionCookie(token));
    res.json({ message: 'Profile updated.', profile: profileFields(row) });
  } catch (err) {
    res.status(err.status || 500).json({
      message: err.status ? err.message : 'Could not save your profile.'
    });
  }
});

module.exports = router;
