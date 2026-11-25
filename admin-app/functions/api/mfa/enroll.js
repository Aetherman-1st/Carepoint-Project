import {
  json,
  originAllowed,
  requireSession,
  applyRefresh,
  readJsonSafe,
  sbFetch
} from '../../_lib/core.js';

function factorKind(factor) {
  return factor && (factor.factor_type || factor.type);
}

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

  const token = session.tokens.access_token;

  let listResponse;
  try {
    listResponse = await sbFetch(env, '/auth/v1/user', { token });
  } catch (err) {
    return applyRefresh(env, session, json({ message: 'Could not load two-factor settings.' }, 502));
  }

  if (!listResponse.ok) {
    return applyRefresh(env, session, json({ message: 'Could not load two-factor settings.' }, 502));
  }

  const raw = await readJsonSafe(listResponse);
  const factors = raw && Array.isArray(raw.factors) ? raw.factors : [];
  const totp = factors.filter((factor) => factorKind(factor) === 'totp');
  const verified = totp.find((factor) => factor.status === 'verified');

  if (verified) {
    return applyRefresh(
      env,
      session,
      json({ enrolled: true, factor: { id: verified.id } })
    );
  }

  let enrollResponse;
  try {
    enrollResponse = await sbFetch(env, '/auth/v1/factors', {
      method: 'POST',
      token,
      body: { factor_type: 'totp', friendly_name: 'CarePoint Admin' }
    });
  } catch (err) {
    return applyRefresh(env, session, json({ message: 'Could not start two-factor setup.' }, 502));
  }

  if (!enrollResponse.ok) {
    return applyRefresh(env, session, json({ message: 'Could not start two-factor setup.' }, 502));
  }

  const factor = await readJsonSafe(enrollResponse);
  const totpInfo = (factor && factor.totp) || {};

  return applyRefresh(
    env,
    session,
    json({
      enrolled: false,
      factor: {
        id: factor && factor.id,
        qr_code: totpInfo.qr_code || '',
        secret: totpInfo.secret || '',
        uri: totpInfo.uri || ''
      }
    })
  );
}
