import {
  json,
  originAllowed,
  readJson,
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
  const email = String((body && body.email) || '').trim().toLowerCase();

  if (email) {
    const origin = new URL(request.url).origin;
    const redirectTo = encodeURIComponent(origin + '/reset-password.html');
    try {
      await sbFetch(env, `/auth/v1/recover?redirect_to=${redirectTo}`, {
        method: 'POST',
        body: { email }
      });
    } catch (err) {
      /* always answer generically to avoid account enumeration */
    }
  }

  return json({ ok: true });
}
