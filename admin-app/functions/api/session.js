import {
  json,
  loadSession,
  sessionInfo,
  applyRefresh,
  clearSessionCookie
} from '../_lib/core.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return json({ message: 'Method not allowed.' }, 405, { Allow: 'GET' });
  }
  if (!env.ADMIN_SESSION_SECRET) {
    return json({ message: 'Server is not configured.' }, 500);
  }

  const session = await loadSession(env, request);
  if (!session) {
    const response = json({ authenticated: false }, 401);
    response.headers.append('Set-Cookie', clearSessionCookie());
    return response;
  }

  return applyRefresh(env, session, json(sessionInfo(session.claims)));
}
