import {
  json,
  originAllowed,
  readJson,
  readJsonSafe,
  sbFetch
} from '../../_lib/core.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ message: 'Method not allowed.' }, 405, { Allow: 'POST' });
  }
  if (!originAllowed(request)) {
    return json({ message: 'Request blocked.' }, 403);
  }

  const body = await readJson(request);
  const accessToken = String((body && body.access_token) || '');
  const password = typeof (body && body.password) === 'string' ? body.password : '';

  if (!accessToken) {
    return json({ message: 'This reset link is invalid or expired.' }, 400);
  }
  if (password.length < 8) {
    return json({ message: 'Use at least 8 characters.' }, 400);
  }

  let upstream;
  try {
    upstream = await sbFetch(env, '/auth/v1/user', {
      method: 'PUT',
      token: accessToken,
      body: { password }
    });
  } catch (err) {
    return json({ message: 'Could not reach the password service. Please try again.' }, 502);
  }

  if (!upstream.ok) {
    const payload = await readJsonSafe(upstream);
    return json(
      {
        message:
          (payload && (payload.msg || payload.message)) ||
          'Could not update the password. Request a new reset link.'
      },
      400
    );
  }

  try {
    await sbFetch(env, '/auth/v1/logout?scope=global', {
      method: 'POST',
      token: accessToken
    });
  } catch (err) {
    /* best effort */
  }

  return json({ ok: true });
}
