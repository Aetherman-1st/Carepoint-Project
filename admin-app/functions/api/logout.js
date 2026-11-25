import {
  json,
  originAllowed,
  loadSession,
  clearSessionCookie,
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

  if (env.ADMIN_SESSION_SECRET) {
    try {
      const session = await loadSession(env, request);
      if (session) {
        await sbFetch(env, '/auth/v1/logout?scope=global', {
          method: 'POST',
          token: session.tokens.access_token
        });
      }
    } catch (err) {
      /* best effort revoke; cookie is still cleared below */
    }
  }

  const response = json({ ok: true });
  response.headers.append('Set-Cookie', clearSessionCookie());
  return response;
}
