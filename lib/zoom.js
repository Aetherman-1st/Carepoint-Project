require('dotenv').config();

const ACCOUNT_ID = (process.env.ZOOM_ACCOUNT_ID || '').trim();
const CLIENT_ID = (process.env.ZOOM_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.ZOOM_CLIENT_SECRET || '').trim();
const ZOOM_USER_ID = (process.env.ZOOM_USER_ID || 'me').trim();
const DEFAULT_TIMEZONE = (process.env.APP_TIMEZONE || 'UTC').trim();
const DEFAULT_DURATION = Number(process.env.ZOOM_MEETING_DURATION) || 30;

const TOKEN_URL = 'https://zoom.us/oauth/token';
const API_BASE = 'https://api.zoom.us/v2';

let tokenCache = { value: null, expiresAt: 0 };

function isConfigured() {
  return Boolean(ACCOUNT_ID && CLIENT_ID && CLIENT_SECRET);
}

async function getAccessToken() {
  if (!isConfigured()) {
    throw new Error('Zoom credentials are not configured.');
  }

  const now = Date.now();
  if (tokenCache.value && now < tokenCache.expiresAt - 60 * 1000) {
    return tokenCache.value;
  }

  const params = new URLSearchParams({
    grant_type: 'account_credentials',
    account_id: ACCOUNT_ID
  });
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

  const response = await fetch(`${TOKEN_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    const detail = payload.reason || payload.error || `HTTP ${response.status}`;
    throw new Error(`Zoom authentication failed: ${detail}`);
  }

  tokenCache = {
    value: payload.access_token,
    expiresAt: now + (Number(payload.expires_in) || 3600) * 1000
  };

  return tokenCache.value;
}

async function createMeeting({ topic, startTime, duration, agenda, timezone } = {}) {
  const token = await getAccessToken();
  const user = encodeURIComponent(ZOOM_USER_ID);

  const body = {
    topic: topic || 'CarePoint appointment',
    type: 2,
    start_time: startTime,
    duration: Number(duration) || DEFAULT_DURATION,
    timezone: timezone || DEFAULT_TIMEZONE,
    agenda: agenda || 'CarePoint online appointment',
    settings: {
      join_before_host: true,
      waiting_room: true,
      approval_type: 2,
      audio: 'both',
      auto_recording: 'none'
    }
  };

  const response = await fetch(`${API_BASE}/users/${user}/meetings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = payload.message || payload.reason || `HTTP ${response.status}`;
    throw new Error(`Zoom meeting creation failed: ${detail}`);
  }

  return {
    id: payload.id != null ? String(payload.id) : null,
    topic: payload.topic || body.topic,
    joinUrl: payload.join_url || null,
    startUrl: payload.start_url || null,
    password: payload.password || null,
    startTime: payload.start_time || startTime,
    duration: payload.duration || body.duration
  };
}

async function deleteMeeting(meetingId) {
  if (!meetingId || !isConfigured()) return false;

  try {
    const token = await getAccessToken();
    const response = await fetch(`${API_BASE}/meetings/${encodeURIComponent(meetingId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });

    return response.ok || response.status === 404;
  } catch (err) {
    return false;
  }
}

function buildStartTime(date, time) {
  if (!date || !time) return null;
  return `${date}T${time}:00`;
}

module.exports = {
  isConfigured,
  getAccessToken,
  createMeeting,
  deleteMeeting,
  buildStartTime,
  DEFAULT_TIMEZONE,
  DEFAULT_DURATION
};
