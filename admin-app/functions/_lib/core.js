const DEFAULT_SUPABASE_URL = 'https://upldnuraxojivoqvckzt.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_Mxc0T3RIAncl8efvHOvjAg_l_yAY7lq';
const DEFAULT_PUBLIC_API = 'https://carepoint-15l.pages.dev';

export const COOKIE_NAME = 'cp_admin_session';
export const SESSION_MAX_AGE = 8 * 60 * 60;

export function supabaseUrl(env) {
  return String((env && env.SUPABASE_URL) || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
}

export function supabaseKey(env) {
  return (env && env.SUPABASE_ANON_KEY) || DEFAULT_SUPABASE_ANON_KEY;
}

export function publicApiBase(env) {
  return String((env && env.PUBLIC_API_BASE) || DEFAULT_PUBLIC_API).replace(/\/+$/, '');
}

export function json(data, status = 200, headers = {}) {
  const h = new Headers(headers);
  if (!h.has('Content-Type')) h.set('Content-Type', 'application/json; charset=utf-8');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function sessionCookie(value, maxAge = SESSION_MAX_AGE) {
  return [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${maxAge}`
  ].join('; ');
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function readCookie(request) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== COOKIE_NAME) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch (err) {
      return part.slice(index + 1).trim();
    }
  }
  return null;
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value) {
  let text = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const pad = text.length % 4 ? '='.repeat(4 - (text.length % 4)) : '';
  const binary = atob(text + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function keyFromSecret(secret) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function sealSession(tokens, secret) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromSecret(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(tokens))
  );
  return `${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(ciphertext))}`;
}

async function openSession(value, secret) {
  const parts = String(value || '').split('.');
  if (parts.length !== 2) return null;
  try {
    const key = await keyFromSecret(secret);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64UrlDecode(parts[0]) },
      key,
      base64UrlDecode(parts[1])
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch (err) {
    return null;
  }
}

export function decodeJwt(token) {
  try {
    const payload = String(token).split('.')[1];
    if (!payload) return null;
    const pad = payload.length % 4 ? '='.repeat(4 - (payload.length % 4)) : '';
    const jsonText = atob(payload.replace(/-/g, '+').replace(/_/g, '/') + pad);
    return JSON.parse(jsonText);
  } catch (err) {
    return null;
  }
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch (err) {
    return null;
  }
}

export async function readJsonSafe(response) {
  try {
    return await response.json();
  } catch (err) {
    return null;
  }
}

export function originAllowed(request) {
  const method = (request.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch (err) {
    return false;
  }
}

export async function sbFetch(env, path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('apikey', supabaseKey(env));
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  let body;
  if (options.body !== undefined) {
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  }
  return fetch(supabaseUrl(env) + path, { method: options.method || 'GET', headers, body });
}

export async function sealedCookie(env, tokens) {
  const sealed = await sealSession(
    { access_token: tokens.access_token, refresh_token: tokens.refresh_token },
    env.ADMIN_SESSION_SECRET
  );
  return sessionCookie(sealed);
}

export async function loadSession(env, request) {
  if (!env.ADMIN_SESSION_SECRET) return null;
  const raw = readCookie(request);
  if (!raw) return null;
  let data = await openSession(raw, env.ADMIN_SESSION_SECRET);
  if (!data || !data.access_token) return null;

  let claims = decodeJwt(data.access_token);
  const now = Math.floor(Date.now() / 1000);
  let refreshed = false;

  if (!claims || !claims.exp || claims.exp - now < 60) {
    if (!data.refresh_token) return null;
    const response = await sbFetch(env, '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: data.refresh_token }
    });
    if (!response.ok) return null;
    const session = await readJsonSafe(response);
    if (!session || !session.access_token) return null;
    data = {
      access_token: session.access_token,
      refresh_token: session.refresh_token || data.refresh_token
    };
    claims = decodeJwt(data.access_token);
    refreshed = true;
  }

  return { tokens: data, claims: claims || {}, refreshed };
}

export async function requireSession(env, request) {
  if (!env.ADMIN_SESSION_SECRET) {
    return { error: json({ message: 'Server is not configured.' }, 500) };
  }
  const session = await loadSession(env, request);
  if (!session) {
    const response = json({ message: 'Please sign in again.' }, 401);
    response.headers.append('Set-Cookie', clearSessionCookie());
    return { error: response };
  }
  return { session };
}

export async function applyRefresh(env, session, response) {
  if (session && session.refreshed) {
    response.headers.append('Set-Cookie', await sealedCookie(env, session.tokens));
  }
  return response;
}

export function sessionInfo(claims) {
  const meta = (claims && claims.user_metadata) || {};
  const name = [meta.first_name, meta.last_name].filter(Boolean).join(' ');
  return {
    authenticated: true,
    userId: (claims && claims.sub) || null,
    email: (claims && claims.email) || null,
    aal: (claims && claims.aal) || 'aal1',
    name: name || (claims && claims.email) || ''
  };
}
