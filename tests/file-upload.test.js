const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { Image } = require('imagescript');
const { PDFDocument } = require('pdf-lib');

process.env.NODE_ENV = 'test';
process.env.DISABLE_LOCAL_RATE_LIMIT = '1';

const dbPath = require.resolve('../db');
const files = new Map();
const logs = [];

const db = {
  async query(sql, params) {
    const compact = String(sql).replace(/\s+/g, ' ').trim();

    if (compact.startsWith('INSERT INTO uploaded_files')) {
      files.set(params[0], {
        id: params[0],
        owner_id: params[1],
        original_name: params[2],
        storage_key: params[3],
        extension: params[4],
        mime_type: params[5],
        size_bytes: params[6],
        content: params[7],
        status: 'pending_scan',
        scan_result: 'queued'
      });
      return { rowCount: 1, rows: [] };
    }

    if (compact.startsWith('INSERT INTO file_scan_logs')) {
      logs.push({
        file_id: params[0],
        user_id: params[1],
        status: params[2],
        result: params[3]
      });
      return { rowCount: 1, rows: [] };
    }

    if (compact.includes("status = 'approved'")) {
      const file = files.get(params[5]);
      if (!file || file.owner_id !== params[6] || file.status !== 'pending_scan') {
        return { rowCount: 0, rows: [] };
      }
      file.content = params[0];
      file.extension = params[1];
      file.mime_type = params[2];
      file.size_bytes = params[3];
      file.status = 'approved';
      file.scan_result = params[4];
      return { rowCount: 1, rows: [] };
    }

    if (compact.includes("SET content = NULL, status = $1")) {
      const file = files.get(params[2]);
      if (!file || file.owner_id !== params[3] || file.status !== 'pending_scan') {
        return { rowCount: 0, rows: [] };
      }
      file.content = null;
      file.status = params[0];
      file.scan_result = params[1];
      return { rowCount: 1, rows: [] };
    }

    if (compact.startsWith('SELECT original_name, mime_type, size_bytes, content, status')) {
      const file = files.get(params[0]);
      if (!file || file.owner_id !== params[1]) return { rows: [] };
      return { rows: [file] };
    }

    throw new Error(`Unexpected query: ${compact}`);
  }
};

require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: db
};

const filesRoute = require('../routes/files');

function createApp() {
  const app = express();
  app.use((req, res, next) => {
    const userId = Number(req.get('x-test-user'));
    if (userId) req.user = { id: userId, role: 'user' };
    next();
  });
  app.use('/api/files', filesRoute);
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ message: 'File is too large.' });
    }
    return res.status(500).json({ message: 'Test error' });
  });
  return app;
}

async function makePng() {
  return Buffer.from(await new Image(2, 2).fill(0xff0000ff).encodePNG());
}

async function makePdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  return Buffer.from(await pdf.save());
}

async function upload(baseUrl, userId, filename, body) {
  return fetch(`${baseUrl}/api/files`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-file-name': encodeURIComponent(filename),
      'x-test-user': String(userId)
    },
    body
  });
}

test('safe file uploads', async (t) => {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(() => new Promise((resolve) => server.close(resolve)));

  await t.test('accepts a valid image and allows the owner to download it', async () => {
    const response = await upload(baseUrl, 1, 'photo.png', await makePng());
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.file.status, 'approved');
    assert.equal(payload.file.mime_type, 'image/png');
    assert.equal(payload.scan.antivirus_available, false);

    const download = await fetch(`${baseUrl}/api/files/${payload.file.id}/download`, {
      headers: { 'x-test-user': '1' }
    });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-disposition'), /^attachment;/);
    assert.ok((await download.arrayBuffer()).byteLength > 0);
  });

  await t.test('accepts a valid PDF', async () => {
    const response = await upload(baseUrl, 1, 'records.pdf', await makePdf());
    assert.equal(response.status, 201);
    assert.equal((await response.json()).file.mime_type, 'application/pdf');
  });

  await t.test('rejects a disallowed extension', async () => {
    const response = await upload(baseUrl, 1, 'photo.gif', await makePng());
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'unsupported_extension');
  });

  await t.test('rejects a renamed file with mismatched content', async () => {
    const response = await upload(baseUrl, 1, 'photo.jpg', await makePng());
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, 'signature_mismatch');
  });

  await t.test('rejects an oversized file', async () => {
    const response = await upload(baseUrl, 1, 'large.png', Buffer.alloc(2 * 1024 * 1024 + 1));
    assert.equal(response.status, 413);
  });

  await t.test('rejects another user downloading the file', async () => {
    const file = [...files.values()].find((item) => item.status === 'approved');
    assert.ok(file);
    const response = await fetch(`${baseUrl}/api/files/${file.id}/download`, {
      headers: { 'x-test-user': '2' }
    });
    assert.equal(response.status, 404);
  });

  await t.test('does not serve pending files', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    files.set(id, {
      id,
      owner_id: 1,
      original_name: 'pending.png',
      mime_type: 'image/png',
      size_bytes: 1,
      content: Buffer.from([1]),
      status: 'pending_scan'
    });
    const response = await fetch(`${baseUrl}/api/files/${id}/download`, {
      headers: { 'x-test-user': '1' }
    });
    assert.equal(response.status, 409);
  });

  await t.test('logs only file id, user, status, and result', () => {
    assert.ok(logs.length > 0);
    for (const entry of logs) {
      assert.deepEqual(Object.keys(entry).sort(), ['file_id', 'result', 'status', 'user_id']);
    }
  });
});
