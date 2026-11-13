const SUPABASE_URL = process.env.SUPABASE_URL || 'https://upldnuraxojivoqvckzt.supabase.co';
const PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_Mxc0T3RIAncl8efvHOvjAg_l_yAY7lq';
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'yazeed.omari2007@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_TEST_PASSWORD;

const stamp = Date.now();
const testEmail = `rls-test-${stamp}@example.com`;
const testPassword = `RlsTest!${stamp}`;

let passed = 0;
let testUserId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log(`  ok  ${message}`);
}

async function signIn(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.message || 'Sign-in failed');
  }
  return data.access_token;
}

async function getUser(token) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Could not load auth user');
  return data;
}

async function rest(token, path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    data = text;
  }
  return { status: response.status, data };
}

async function createTestUser() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: testEmail, password: testPassword, email_confirm: true })
  });
  const data = await response.json();
  if (!response.ok || !data.id) {
    throw new Error(data.message || 'Could not create test user');
  }
  testUserId = data.id;
}

async function deleteTestUser() {
  if (!testUserId || !SECRET_KEY) return;
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${testUserId}`, {
    method: 'DELETE',
    headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` }
  });
  testUserId = null;
}

async function main() {
  if (!SECRET_KEY) throw new Error('SUPABASE_SECRET_KEY is required');
  if (!ADMIN_PASSWORD) throw new Error('ADMIN_TEST_PASSWORD is required');

  await createTestUser();

  console.log('Normal authenticated user');
  const userToken = await signIn(testEmail, testPassword);

  const userIsAdmin = await rest(userToken, 'rpc/is_admin', { method: 'POST', body: '{}' });
  assert(userIsAdmin.status === 200 && userIsAdmin.data === false, 'normal user is not an admin');

  for (const path of [
    'admin_users?select=id&limit=1',
    'admin_appointments?select=id&limit=1',
    'admin_contact_messages?select=id&limit=1',
    'admin_members?select=role',
    'users?select=id&limit=1'
  ]) {
    const result = await rest(userToken, path);
    assert(
      result.status === 200 && Array.isArray(result.data) && result.data.length === 0,
      `normal user cannot read ${path.split('?')[0]}`
    );
  }

  const replyAttempt = await rest(userToken, 'contact_replies', {
    method: 'POST',
    body: JSON.stringify({ message_id: 1, admin_id: 3, body: 'blocked', emailed: false })
  });
  assert(replyAttempt.status === 403, 'normal user cannot insert admin replies');

  const promoteAttempt = await rest(userToken, 'users?id=eq.3', {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ role: 'admin' })
  });
  assert(
    promoteAttempt.status === 200 && Array.isArray(promoteAttempt.data) && promoteAttempt.data.length === 0,
    'normal user cannot change the admin role'
  );

  console.log('Admin user');
  const adminToken = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  const adminUser = await getUser(adminToken);

  const adminIsAdmin = await rest(adminToken, 'rpc/is_admin', { method: 'POST', body: '{}' });
  assert(adminIsAdmin.status === 200 && adminIsAdmin.data === true, 'admin role is recognized');

  const users = await rest(adminToken, 'admin_users?select=id,email,protected&limit=5');
  assert(users.status === 200 && Array.isArray(users.data) && users.data.length > 0, 'admin can read accounts');

  const appointments = await rest(adminToken, 'admin_appointments?select=id,status&limit=5');
  assert(
    appointments.status === 200 && Array.isArray(appointments.data),
    'admin can read appointments'
  );

  const messages = await rest(adminToken, 'admin_contact_messages?select=id,replies&limit=5');
  assert(
    messages.status === 200 && Array.isArray(messages.data),
    'admin can read contact messages'
  );

  const member = await rest(
    adminToken,
    `admin_members?select=user_id,role&auth_user_id=eq.${encodeURIComponent(adminUser.id)}`
  );
  assert(
    member.status === 200 &&
      Array.isArray(member.data) &&
      member.data.length === 1 &&
      member.data[0].role === 'admin',
    'admin identity is mapped to a protected role row'
  );

  console.log(`\nAdmin RLS passed (${passed} checks).`);
}

main()
  .catch((err) => {
    console.error('\nAdmin RLS failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await deleteTestUser().catch((err) => console.error('Cleanup failed:', err.message));
  });
