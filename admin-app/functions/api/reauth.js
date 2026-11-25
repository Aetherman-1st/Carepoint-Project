import {
  json,
  originAllowed,
  readJson,
  requireSession,
  sbFetch
} from '../_lib/core.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ message: 'Method not allowed.' }, 405, { Allow: 'POST' });
  }
  if (!originAllowed(request)) {
    return json({ message: 'Request blocked.' }, 403);
  }

  const { session, error } = await requireSession(env, request);
  if (error) return error;

  const body = await readJson(request);
  const password = typeof (body && body.password) === 'string' ? body.password : '';
  const email = session.claims && session.claims.email;

  if (!password) return json({ message: 'Password is required.' }, 400);
  if (!email) return json({ message: 'Please sign in again.' }, 401);

  const upstream = await sbFetch(env, '/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password }
  });

  if (!upstream.ok) {
    return json({ message: 'Password is incorrect.' }, 401);
  }

  return json({ ok: true });
}
