import {
  json,
  originAllowed,
  requireSession,
  applyRefresh,
  publicApiBase,
  clearSessionCookie
} from '../../_lib/core.js';

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return json({ message: 'Method not allowed.' }, 405, {
      Allow: 'GET, POST, PUT, PATCH, DELETE'
    });
  }
  if (!originAllowed(request)) {
    return json({ message: 'Request blocked.' }, 403);
  }

  const { session, error } = await requireSession(env, request);
  if (error) return error;

  const url = new URL(request.url);
  const subPath = url.pathname.replace(/^\/api\/action\/?/, '');

  if (!subPath || subPath.includes('..')) {
    return json({ message: 'Not found.' }, 404);
  }

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${session.tokens.access_token}`);
  for (const name of ['Accept', 'Content-Type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let body;
  if (method !== 'GET' && method !== 'DELETE') body = await request.text();

  let upstream;
  try {
    upstream = await fetch(`${publicApiBase(env)}/api/admin/${subPath}${url.search}`, {
      method,
      headers,
      body
    });
  } catch (err) {
    return applyRefresh(env, session, json({ message: 'Could not reach the service.' }, 502));
  }

  const text = await upstream.text();
  const response = new Response(text, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      'Cache-Control': 'no-store'
    }
  });

  if (upstream.status === 401) {
    response.headers.append('Set-Cookie', clearSessionCookie());
  }

  return applyRefresh(env, session, response);
}
