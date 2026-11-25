import {
  json,
  originAllowed,
  requireSession,
  applyRefresh,
  readJsonSafe,
  sbFetch,
  clearSessionCookie
} from '../../_lib/core.js';

const ALLOWED_TABLES = new Set([
  'admin_appointments',
  'admin_contact_messages',
  'admin_users',
  'admin_members'
]);

const ALLOWED_RPC = new Set(['is_admin']);

function allowedPath(subPath) {
  const clean = String(subPath || '').split('?')[0].replace(/^\/+|\/+$/g, '');
  const segments = clean.split('/').filter(Boolean);
  if (segments.length === 0) return false;
  if (segments[0] === 'rpc') {
    return segments.length === 2 && ALLOWED_RPC.has(segments[1]);
  }
  return segments.length === 1 && ALLOWED_TABLES.has(segments[0]);
}

export async function onRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();

  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) {
    return json({ message: 'Method not allowed.' }, 405, {
      Allow: 'GET, POST, PATCH, DELETE'
    });
  }
  if (!originAllowed(request)) {
    return json({ message: 'Request blocked.' }, 403);
  }

  const { session, error } = await requireSession(env, request);
  if (error) return error;

  const url = new URL(request.url);
  const subPath = url.pathname.replace(/^\/api\/db\/?/, '');

  if (!allowedPath(subPath)) {
    return json({ message: 'Not found.' }, 404);
  }

  const headers = new Headers();
  for (const name of ['Accept', 'Prefer', 'Content-Type']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let body;
  if (method !== 'GET' && method !== 'DELETE') body = await request.text();

  let upstream;
  try {
    upstream = await sbFetch(env, `/rest/v1/${subPath}${url.search}`, {
      method,
      token: session.tokens.access_token,
      headers,
      body
    });
  } catch (err) {
    return applyRefresh(env, session, json({ message: 'Could not reach the database.' }, 502));
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
