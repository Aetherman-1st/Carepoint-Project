import {
  json,
  originAllowed,
  readJson,
  readJsonSafe,
  requireSession,
  applyRefresh,
  sealedCookie,
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

  const { session, error } = await requireSession(env, request);
  if (error) return error;

  const body = await readJson(request);
  const factorId = String((body && body.factorId) || '');
  const code = String((body && body.code) || '').replace(/\s+/g, '');

  if (!factorId || !/^\d{6}$/.test(code)) {
    return json({ message: 'Enter the 6-digit code from your authenticator app.' }, 400);
  }

  const token = session.tokens.access_token;

  let challengeResponse;
  try {
    challengeResponse = await sbFetch(
      env,
      `/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`,
      { method: 'POST', token, body: {} }
    );
  } catch (err) {
    return applyRefresh(env, session, json({ message: 'Could not start verification.' }, 502));
  }

  if (!challengeResponse.ok) {
    return applyRefresh(env, session, json({ message: 'Could not start verification.' }, 502));
  }

  const challenge = await readJsonSafe(challengeResponse);
  if (!challenge || !challenge.id) {
    return json({ message: 'Could not start verification.' }, 502);
  }

  let verifyResponse;
  try {
    verifyResponse = await sbFetch(
      env,
      `/auth/v1/factors/${encodeURIComponent(factorId)}/verify`,
      {
        method: 'POST',
        token,
        body: { challenge_id: challenge.id, code }
      }
    );
  } catch (err) {
    return applyRefresh(env, session, json({ message: 'Could not verify the code. Please try again.' }, 502));
  }

  if (!verifyResponse.ok) {
    return applyRefresh(env, session, json({ message: 'That code is invalid. Try again.' }, 400));
  }

  const verified = await readJsonSafe(verifyResponse);
  if (!verified || !verified.access_token) {
    return json({ message: 'Verification failed. Please try again.' }, 502);
  }

  const cookie = await sealedCookie(env, {
    access_token: verified.access_token,
    refresh_token: verified.refresh_token
  });

  const response = json({ ok: true, aal: 'aal2' });
  response.headers.append('Set-Cookie', cookie);
  return response;
}
