const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createOriginGuard } = require('../lib/csrf');
const { requestTrace } = require('../lib/trace');

function createApp() {
  const app = express();
  app.use(requestTrace);
  app.use(createOriginGuard({ allowedOrigins: ['https://admin.example.test'] }));
  app.get('/safe', (req, res) => res.json({ ok: true }));
  app.post('/write', (req, res) => res.json({ ok: true }));
  return app;
}

test('csrf origin guard', async (t) => {
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => new Promise((resolve) => server.close(resolve)));

  await t.test('allows safe methods without an origin', async () => {
    const response = await fetch(`${base}/safe`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('x-request-id'));
  });

  await t.test('rejects unsafe requests without an origin or referer', async () => {
    const response = await fetch(`${base}/write`, { method: 'POST' });
    assert.equal(response.status, 403);
  });

  await t.test('allows same-origin writes', async () => {
    const response = await fetch(`${base}/write`, {
      method: 'POST',
      headers: { Origin: base }
    });
    assert.equal(response.status, 200);
  });

  await t.test('allows the configured admin origin', async () => {
    const response = await fetch(`${base}/write`, {
      method: 'POST',
      headers: { Origin: 'https://admin.example.test' }
    });
    assert.equal(response.status, 200);
  });

  await t.test('allows a same-origin referer fallback', async () => {
    const response = await fetch(`${base}/write`, {
      method: 'POST',
      headers: { Referer: `${base}/patient` }
    });
    assert.equal(response.status, 200);
  });

  await t.test('rejects a cross-origin write', async () => {
    const response = await fetch(`${base}/write`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example' }
    });
    assert.equal(response.status, 403);
  });

  await t.test('skips origin checks for bearer-token admin calls', async () => {
    const response = await fetch(`${base}/write`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token' }
    });
    assert.equal(response.status, 200);
  });
});
