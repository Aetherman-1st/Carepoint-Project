import {
  json,
  originAllowed,
  readJson,
  readJsonSafe,
  sbFetch,
  decodeJwt,
  sealedCookie
} from '../_lib/core.js';

function clientIp(request) {
  const cfIp = String(request.headers.get('CF-Connecting-IP') || '').trim();
  if (cfIp) return cfIp;
  const forwarded = String(request.headers.get('X-Forwarded-For') || '').split(',')[0].trim();
  return forwarded || 'unknown';
}

function callBackend(env, request, path, email, ip) {
  const headers = new Headers({
    'Content-Type': 'application/json',
    Origin: new URL(request.url).origin
  });
  if (ip && ip !== 'unknown') headers.set('X-Forwarded-For', ip);

  return env.BACKEND.fetch(
    new Request(new URL(path, request.url).toString(), {
      method: 'POST',
      headers,
      body: JSON.stringify({ email })
    })
  );
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return json({ message: 'Method not allowed.' }, 405, { Allow: 'POST' });
  }
  if (!originAllowed(request)) {
    return json({ message: 'Request blocked.' }, 403);
  }
  if (!env.ADMIN_SESSION_SECRET) {
    return json({ message: 'Server is not configured.' }, 500);
  }
  if (!env.BACKEND) {
    return json({ message: 'Server is not configured.' }, 500);
  }

  const body = await readJson(request);
  const email = String((body && body.email) || '').trim().toLowerCase();
  const password = typeof (body && body.password) === 'string' ? body.password : '';

  if (!email || !password) {
    return json({ message: 'Email and password are required.' }, 400);
  }

  const ip = clientIp(request);
  let guardResponse;
  try {
    guardResponse = await callBackend(env, request, '/admin-auth/guard', email, ip);
  } catch (err) {
    return json({ message: 'Could not reach the sign-in service. Please try again.' }, 502);
  }

  if (guardResponse.status === 429) {
    const payload = await guardResponse.json().catch(() => null);
    const response = json(
      { message: (payload && payload.message) || 'Too many attempts. Try again later.' },
      429
    );
    response.headers.set('Retry-After', guardResponse.headers.get('Retry-After') || '300');
    return response;
  }
  if (!guardResponse.ok) {
    return json({ message: 'Could not sign in right now. Please try again.' }, 503);
  }

  let upstream;
  try {
    upstream = await sbFetch(env, '/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email, password }
    });
  } catch (err) {
    return json({ message: 'Could not reach the sign-in service. Please try again.' }, 502);
  }

  if (upstream.status === 429) {
    const response = json({ message: 'Too many attempts. Try again later.' }, 429);
    response.headers.set('Retry-After', upstream.headers.get('Retry-After') || '300');
    return response;
  }

  if (!upstream.ok) {
    return json({ message: 'Invalid email or password.' }, 401);
  }

  const session = await readJsonSafe(upstream);
  if (!session || !session.access_token) {
    return json({ message: 'Invalid email or password.' }, 401);
  }

  const claims = decodeJwt(session.access_token);
  const userId = claims && claims.sub;
  if (!userId) {
    return json({ message: 'Invalid email or password.' }, 401);
  }

  let members = null;
  try {
    const memberResponse = await sbFetch(
      env,
      `/rest/v1/admin_members?select=role&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { token: session.access_token }
    );
    if (memberResponse.ok) members = await readJsonSafe(memberResponse);
  } catch (err) {
    members = null;
  }

  if (!Array.isArray(members) || members.length === 0) {
    try {
      await sbFetch(env, '/auth/v1/logout?scope=local', {
        method: 'POST',
        token: session.access_token
      });
    } catch (err) {}
    return json({ message: 'Invalid email or password.' }, 401);
  }

  try {
    await callBackend(env, request, '/admin-auth/reset', email, ip);
  } catch (err) {}

  const cookie = await sealedCookie(env, {
    access_token: session.access_token,
    refresh_token: session.refresh_token
  });

  const response = json({
    ok: true,
    aal: (claims && claims.aal) || 'aal1',
    mfa: ((claims && claims.aal) || 'aal1') !== 'aal2'
  });
  response.headers.append('Set-Cookie', cookie);
  return response;
}
