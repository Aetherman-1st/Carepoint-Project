const crypto = require('crypto');
const express = require('express');
const pool = require('../db');
const { requireUser } = require('../lib/auth');
const { uploadUser } = require('../lib/rate-limit');
const {
  MAX_UPLOAD_BYTES,
  ValidationError,
  prepareUploadName,
  validateUpload
} = require('../lib/file-validation');

const router = express.Router();
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function decodedFilename(req) {
  const value = req.get('x-file-name');
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

async function logScan(fileId, userId, status, result) {
  await pool.query(
    'INSERT INTO file_scan_logs (file_id, user_id, status, result) VALUES ($1, $2, $3, $4)',
    [fileId, userId, status, result]
  );
}

function downloadName(name) {
  const safe = String(name || 'file').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name || 'file')}`;
}

router.post(
  '/',
  requireUser,
  uploadUser,
  express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES }),
  async (req, res) => {
    if (req.is('multipart/form-data')) {
      return res.status(415).json({ message: 'Send one file per request as a raw binary body.' });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: 'Send one file as a raw binary body.' });
    }

    const rawName = decodedFilename(req);
    let prepared;
    try {
      prepared = prepareUploadName(rawName);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(422).json({ status: 'rejected', code: err.code, message: err.message });
      }
      throw err;
    }

    const id = crypto.randomUUID();
    const storageKey = `${id}.${prepared.format.extension}`;

    try {
      await pool.query(
        `INSERT INTO uploaded_files
           (id, owner_id, original_name, storage_key, extension, mime_type, size_bytes, content, status, scan_result)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending_scan', 'queued')`,
        [
          id,
          req.user.id,
          prepared.filename,
          storageKey,
          prepared.format.extension,
          prepared.format.mimeType,
          req.body.length,
          req.body
        ]
      );
      await logScan(id, req.user.id, 'pending_scan', 'queued');
    } catch (err) {
      return res.status(500).json({ message: 'Could not store the upload.' });
    }

    try {
      const normalized = await validateUpload(req.body, rawName);

      const updated = await pool.query(
        `UPDATE uploaded_files
         SET content = $1,
             extension = $2,
             mime_type = $3,
             size_bytes = $4,
             status = 'approved',
             scan_result = $5,
             scan_checked_at = now()
         WHERE id = $6 AND owner_id = $7 AND status = 'pending_scan'`,
        [
          normalized.buffer,
          normalized.extension,
          normalized.mimeType,
          normalized.buffer.length,
          normalized.scanResult,
          id,
          req.user.id
        ]
      );

      if (updated.rowCount !== 1) {
        throw new Error('upload_status_changed');
      }

      await logScan(id, req.user.id, 'approved', normalized.scanResult);

      return res.status(201).json({
        file: {
          id,
          name: normalized.filename,
          mime_type: normalized.mimeType,
          size_bytes: normalized.buffer.length,
          status: 'approved'
        },
        scan: {
          antivirus_available: false,
          result: normalized.scanResult
        }
      });
    } catch (err) {
      const rejected = err instanceof ValidationError;
      const status = rejected ? 'rejected' : 'scan_failed';
      const result = rejected ? err.code : 'check_error';

      if (!rejected) {
        console.error('File scan failed:', id);
      }

      try {
        await pool.query(
          `UPDATE uploaded_files
           SET content = NULL, status = $1, scan_result = $2, scan_checked_at = now()
           WHERE id = $3 AND owner_id = $4 AND status = 'pending_scan'`,
          [status, result, id, req.user.id]
        );
        await logScan(id, req.user.id, status, result);
      } catch (updateErr) {
        console.error('File scan status update failed:', id);
      }

      return res.status(rejected ? 422 : 500).json({
        status,
        code: result,
        message: rejected
          ? err.message
          : 'The file could not be checked and was not accepted.'
      });
    }
  }
);

router.get('/:id/download', requireUser, async (req, res) => {
  const id = String(req.params.id || '');
  if (!UUID_PATTERN.test(id)) {
    return res.status(404).json({ message: 'File not found.' });
  }

  try {
    const result = await pool.query(
      `SELECT original_name, mime_type, size_bytes, content, status
       FROM uploaded_files
       WHERE id = $1 AND owner_id = $2`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const file = result.rows[0];
    if (file.status !== 'approved' || !file.content) {
      return res.status(409).json({
        status: file.status,
        message: 'This file is not approved for download.'
      });
    }

    const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    res.setHeader('Content-Type', file.mime_type);
    res.setHeader('Content-Length', String(content.length));
    res.setHeader('Content-Disposition', downloadName(file.original_name));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', 'sandbox');
    return res.send(content);
  } catch (err) {
    return res.status(500).json({ message: 'Could not load the file.' });
  }
});

module.exports = router;
