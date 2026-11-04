const state = {
  appointments: [],
  messages: [],
  users: [],
  activeProfile: null
};

let modalReturnFocus = null;
let profileRequest = 0;

const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];

const viewCopy = {
  overview: ['Overview', 'Bookings and messages.'],
  appointments: ['Appointments', 'All appointment requests.'],
  patients: ['Patients', 'Accounts registered on CarePoint.'],
  messages: ['Messages', 'Messages from the contact form.']
};

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function statusPill(status) {
  return `<span class="pill ${status.toLowerCase()}">${esc(status)}</span>`;
}

function sortByCreated(list) {
  return [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

let toastTimer = null;
function showToast(message, type) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast${type ? ' ' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast hidden';
  }, 4500);
}

async function loadSession() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    if (!data.user) {
      window.location.href = '/login?next=' + encodeURIComponent('/admin');
      return;
    }
    const name = [data.user.first_name, data.user.last_name].filter(Boolean).join(' ');
    document.getElementById('adminName').textContent = name || data.user.email;
  } catch (err) {
    window.location.href = '/login?next=' + encodeURIComponent('/admin');
  }
}

async function loadData() {
  try {
    const [appointmentsResponse, messagesResponse, usersResponse] = await Promise.all([
      fetch('/api/appointments'),
      fetch('/api/contact'),
      fetch('/api/admin/users')
    ]);

    if (!appointmentsResponse.ok || !messagesResponse.ok || !usersResponse.ok) {
      throw new Error('Failed');
    }

    state.appointments = await appointmentsResponse.json();
    state.messages = await messagesResponse.json();
    state.users = await usersResponse.json();
    renderAll();
  } catch (err) {
    document.getElementById('recentAppointments').innerHTML =
      '<tr><td colspan="4"><div class="empty">Could not load dashboard data.</div></td></tr>';
    document.getElementById('adminAppointments').innerHTML =
      '<tr><td colspan="6"><div class="empty">Could not load appointments.</div></td></tr>';
    document.getElementById('adminUsers').innerHTML =
      '<tr><td colspan="8"><div class="empty">Could not load accounts.</div></td></tr>';
    document.getElementById('recentMessages').innerHTML =
      '<div class="empty">Could not load messages.</div>';
    document.getElementById('messageList').innerHTML =
      '<div class="empty">Could not load messages.</div>';
  }
}

function renderStats() {
  const count = window.CarePointMotion
    ? window.CarePointMotion.countTo
    : (element, value) => { element.textContent = String(value); };

  count(document.getElementById('statTotal'), state.appointments.length);
  count(document.getElementById('statPatients'), state.users.filter((user) => user.role !== 'admin').length);
  count(document.getElementById('statPending'), state.appointments.filter((appointment) => appointment.status === 'Pending').length);
  count(document.getElementById('statMessages'), state.messages.length);
}

function renderRecentAppointments() {
  const body = document.getElementById('recentAppointments');
  const recent = sortByCreated(state.appointments).slice(0, 5);

  if (recent.length === 0) {
    body.innerHTML = '<tr><td colspan="4"><div class="empty">No appointments.</div></td></tr>';
    return;
  }

  body.innerHTML = recent
    .map(
      (appointment, index) => `
        <tr class="is-entering" style="--item-index: ${index}">
          <td>
            <div class="cell-strong">${esc(appointment.patient_first_name)} ${esc(appointment.patient_last_name)}</div>
            <div class="cell-sub">${esc(appointment.patient_email)}</div>
          </td>
          <td>
            <div class="cell-strong">${esc(appointment.clinic_name)}</div>
            <div class="cell-sub">${esc(appointment.clinic_city)}</div>
          </td>
          <td>
            <div>${esc(formatDate(appointment.appointment_date))}</div>
            <div class="cell-sub">${esc(formatTime(appointment.appointment_time))}</div>
          </td>
          <td>${statusPill(appointment.status)}</td>
        </tr>
      `
    )
    .join('');
}

function renderRecentMessages() {
  const box = document.getElementById('recentMessages');
  const recent = sortByCreated(state.messages).slice(0, 3);

  if (recent.length === 0) {
    box.innerHTML = '<div class="empty">No messages.</div>';
    return;
  }

  box.innerHTML = recent
    .map((message, index) => {
      const replies = Array.isArray(message.replies) ? message.replies : [];
      return `
        <article class="message is-entering" style="--item-index: ${index}">
          <div class="message-head">
            <strong>${esc(message.name)}</strong>
            <span>${esc(formatTimestamp(message.created_at))}</span>
          </div>
          <span class="pill ${replies.length ? 'replied' : 'new'}">${replies.length ? 'Replied' : 'Awaiting reply'}</span>
          <p>${esc(message.message.length > 120 ? message.message.slice(0, 120) + '...' : message.message)}</p>
        </article>
      `;
    })
    .join('');
}

function filteredUsers() {
  const term = document.getElementById('userSearch').value.trim().toLowerCase();
  if (!term) return sortByCreated(state.users);

  return sortByCreated(state.users).filter((user) =>
    [
      user.first_name,
      user.last_name,
      user.email,
      user.role,
      user.banned_at ? 'banned' : 'active'
    ]
      .join(' ')
      .toLowerCase()
      .includes(term)
  );
}

function renderUsers() {
  const body = document.getElementById('adminUsers');
  const empty = document.getElementById('usersEmpty');
  const list = filteredUsers();

  if (list.length === 0) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  body.innerHTML = list
    .map((user, index) => {
      const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
      const protectedAccount = user.role === 'admin';

      return `
        <tr class="is-entering${user.banned_at ? ' is-banned' : ''}" style="--item-index: ${index}">
          <td>
            <button type="button" class="user-name-button" data-user-view="${user.id}">${esc(name || 'Unnamed account')}</button>
            <div class="cell-sub">Account #${user.id}</div>
          </td>
          <td>${esc(user.email)}</td>
          <td><span class="role-badge${user.role === 'admin' ? ' admin' : ''}">${esc(user.role)}</span></td>
          <td><span class="pill ${user.banned_at ? 'banned' : 'active'}">${user.banned_at ? 'Banned' : 'Active'}</span></td>
          <td>${esc(formatTimestamp(user.created_at))}</td>
          <td>
            <div>${user.appointment_count}</div>
            <div class="cell-sub">${user.latest_appointment ? 'Latest ' + esc(formatDate(user.latest_appointment)) : 'No visits yet'}</div>
          </td>
          <td>
            <div>${user.last_login_at ? esc(formatDateTime(user.last_login_at)) : 'Never'}</div>
            <div class="cell-sub">${user.codes_requested} verification code${user.codes_requested === 1 ? '' : 's'}</div>
          </td>
          <td>
            ${
              protectedAccount
                ? '<span class="cell-sub">Protected</span>'
                : `<div class="user-actions">
                    <button type="button" class="table-action" data-user-ban="${user.id}" data-banned="${user.banned_at ? 'true' : 'false'}">${user.banned_at ? 'Unban' : 'Ban'}</button>
                    <button type="button" class="table-action danger" data-user-delete="${user.id}">Delete</button>
                  </div>`
            }
          </td>
        </tr>
      `;
    })
    .join('');
}


function accountInitials(user) {
  const first = (user.first_name || '').trim().charAt(0);
  const last = (user.last_name || '').trim().charAt(0);
  return (first + last || (user.email || '?').charAt(0)).toUpperCase();
}

function profileValue(value) {
  return value
    ? esc(value)
    : '<span class="patient-profile-empty">Not provided</span>';
}

function patientProfileSkeleton() {
  return `
    <div class="patient-profile-loading" aria-hidden="true">
      <div class="patient-profile-loading-head">
        <span class="skeleton patient-profile-loading-avatar"></span>
        <span class="skeleton-stack">
          <span class="skeleton skeleton-line skeleton-line-md"></span>
          <span class="skeleton skeleton-line skeleton-line-lg"></span>
          <span class="skeleton skeleton-line skeleton-line-sm"></span>
        </span>
      </div>
      <span class="skeleton skeleton-line skeleton-line-lg"></span>
      <span class="skeleton skeleton-line skeleton-line-md"></span>
      <span class="skeleton skeleton-block" style="height: 120px"></span>
    </div>
  `;
}

function renderPatientProfile(data) {
  const user = data.user;
  const appointments = data.appointments || [];
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'Unnamed account';
  const patientName = [user.first_name, user.last_name].filter(Boolean).join(' ') || 'this patient';
  const avatar = user.avatar_url
    ? `<img src="${esc(user.avatar_url)}" alt="">`
    : `<span>${esc(accountInitials(user))}</span>`;
  const appointmentMarkup = appointments.length
    ? appointments
        .map(
          (appointment) => `
            <article class="patient-appointment">
              <div class="patient-appointment-main">
                <div class="patient-appointment-title">
                  <strong>${esc(appointment.clinic_name)}</strong>
                  ${statusPill(appointment.status)}
                </div>
                <p>${esc(formatDate(appointment.appointment_date))} at ${esc(formatTime(appointment.appointment_time))}</p>
                <div class="patient-appointment-meta">
                  ${appointment.doctor_name ? `<span>${esc(appointment.doctor_name)}${appointment.doctor_specialty ? ` · ${esc(appointment.doctor_specialty)}` : ''}</span>` : '<span>Clinic visit</span>'}
                  ${appointment.reason ? `<span>${esc(appointment.reason)}</span>` : ''}
                </div>
              </div>
            </article>
          `
        )
        .join('')
    : '<div class="patient-profile-empty-state">No appointments yet.</div>';

  const actionMarkup = user.protected
    ? '<p class="patient-protected-note">Administrator accounts cannot be banned or deleted.</p>'
    : `
      <button type="button" class="btn btn-outline" data-profile-ban="${user.id}" data-banned="${user.banned_at ? 'true' : 'false'}">
        ${user.banned_at ? 'Restore access' : 'Ban account'}
      </button>
      <button type="button" class="btn btn-danger" data-profile-delete="${user.id}">
        Delete account
      </button>
    `;

  document.getElementById('patientModalBody').innerHTML = `
    <div class="patient-profile-head">
      <span class="patient-profile-avatar">${avatar}</span>
      <div class="patient-profile-identity">
        <span class="page-eyebrow">Account profile</span>
        <h2 id="patientModalTitle">${esc(name)}</h2>
        <p>${esc(user.email)}</p>
        <div class="patient-profile-tags">
          <span class="role-badge${user.role === 'admin' ? ' admin' : ''}">${esc(user.role)}</span>
          <span class="pill ${user.banned_at ? 'banned' : 'active'}">${user.banned_at ? 'Banned' : 'Active'}</span>
        </div>
      </div>
    </div>

    <div class="patient-profile-grid">
      <section class="patient-profile-panel">
        <h3>Account details</h3>
        <dl class="patient-profile-list">
          <div><dt>Joined</dt><dd>${esc(formatTimestamp(user.created_at))}</dd></div>
          <div><dt>Last login</dt><dd>${user.last_login_at ? esc(formatDateTime(user.last_login_at)) : 'Never'}</dd></div>
          <div><dt>Email status</dt><dd>${user.email_verified_at ? 'Verified' : 'Not verified'}</dd></div>
          <div><dt>Onboarding</dt><dd>${user.onboarding_completed_at ? 'Complete' : 'Not complete'}</dd></div>
          <div><dt>Phone</dt><dd>${profileValue(user.phone)}</dd></div>
        </dl>
      </section>

      <section class="patient-profile-panel">
        <h3>Health profile</h3>
        <dl class="patient-profile-list">
          <div><dt>Age</dt><dd>${user.age ? esc(user.age) : profileValue(null)}</dd></div>
          <div><dt>Conditions</dt><dd class="patient-profile-long">${profileValue(user.conditions)}</dd></div>
          <div><dt>Medications</dt><dd class="patient-profile-long">${profileValue(user.medications)}</dd></div>
        </dl>
      </section>
    </div>

    <section class="patient-profile-panel patient-appointments-panel">
      <div class="patient-profile-panel-head">
        <h3>Appointments</h3>
        <span>${appointments.length} total</span>
      </div>
      <div class="patient-appointment-list">${appointmentMarkup}</div>
    </section>

    <div class="patient-profile-actions" data-patient-name="${esc(patientName)}">
      ${actionMarkup}
    </div>
  `;
}

async function loadPatientProfile(id) {
  const request = ++profileRequest;

  try {
    const response = await fetch(`/api/admin/users/${id}`);
    const data = await response.json();

    if (request !== profileRequest) return;
    if (!response.ok) throw new Error(data.message || 'Could not load the account profile.');

    state.activeProfile = data;
    renderPatientProfile(data);
  } catch (err) {
    if (request !== profileRequest) return;
    document.getElementById('patientModalBody').innerHTML = `
      <div class="patient-profile-error">
        <h2 id="patientModalTitle">Profile unavailable</h2>
        <p>${esc(err.message)}</p>
      </div>
    `;
  }
}

function openPatientModal(id) {
  const modal = document.getElementById('patientModal');
  const body = document.getElementById('patientModalBody');
  if (!modal || !body) return;

  modalReturnFocus = document.activeElement;
  state.activeProfile = null;
  body.innerHTML = patientProfileSkeleton();
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  document.getElementById('patientModalClose').focus();
  loadPatientProfile(id);
}

function closePatientModal() {
  const modal = document.getElementById('patientModal');
  if (!modal) return;

  profileRequest += 1;
  state.activeProfile = null;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');

  if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') {
    modalReturnFocus.focus();
  }
  modalReturnFocus = null;
}

async function setUserBan(id, banned, button) {
  const target = state.users.find((user) => user.id === id);
  const name = target
    ? [target.first_name, target.last_name].filter(Boolean).join(' ') || target.email
    : 'this account';
  const prompt = banned
    ? `Ban ${name}? They will be signed out and blocked from logging in.`
    : `Restore access for ${name}?`;

  if (!window.confirm(prompt)) return;

  const originalLabel = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = banned ? 'Banning...' : 'Restoring...';
  }

  try {
    const response = await fetch(`/api/admin/users/${id}/ban`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned })
    });
    const data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Could not update this account.', 'warn');
      return;
    }

    if (target) target.banned_at = data.user.banned_at;

    if (state.activeProfile && state.activeProfile.user.id === id) {
      state.activeProfile.user.banned_at = data.user.banned_at;
      renderPatientProfile(state.activeProfile);
    }

    renderUsers();
    renderStats();
    showToast(data.message, 'ok');
  } catch (err) {
    showToast('Could not update this account. Please try again.', 'warn');
  } finally {
    if (button && button.isConnected) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

async function deleteUserAccount(id, button) {
  const target = state.users.find((user) => user.id === id);
  const name = target
    ? [target.first_name, target.last_name].filter(Boolean).join(' ') || target.email
    : 'this account';

  if (
    !window.confirm(
      `Delete ${name} permanently? Their profile and appointments will be removed. This cannot be undone.`
    )
  ) {
    return;
  }

  const originalLabel = button ? button.textContent : '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Deleting...';
  }

  try {
    const response = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    const data = await response.json();

    if (!response.ok) {
      showToast(data.message || 'Could not delete this account.', 'warn');
      return;
    }

    closePatientModal();
    await loadData();
    showToast(data.message, 'ok');
  } catch (err) {
    showToast('Could not delete this account. Please try again.', 'warn');
  } finally {
    if (button && button.isConnected) {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  }
}

function filteredAppointments() {
  const term = document.getElementById('apptSearch').value.trim().toLowerCase();
  const status = document.getElementById('apptStatusFilter').value;

  return sortByCreated(state.appointments).filter((appointment) => {
    if (status !== 'all' && appointment.status !== status) return false;
    if (!term) return true;
    const haystack = [
      appointment.patient_first_name,
      appointment.patient_last_name,
      appointment.patient_email,
      appointment.clinic_name,
      appointment.clinic_city,
      appointment.doctor_name,
      appointment.doctor_specialty
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}

function renderAppointments() {
  const body = document.getElementById('adminAppointments');
  const empty = document.getElementById('appointmentsEmpty');
  const list = filteredAppointments();

  if (list.length === 0) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');

  body.innerHTML = list
    .map(
      (appointment, index) => `
        <tr class="is-entering" style="--item-index: ${index}">
          <td>
            <div class="cell-strong">${esc(appointment.patient_first_name)} ${esc(appointment.patient_last_name)}</div>
            <div class="cell-sub">${esc(appointment.patient_email)}</div>
          </td>
          <td>
            <div class="cell-strong">${esc(appointment.clinic_name)}</div>
            <div class="cell-sub">${esc(appointment.clinic_city)}</div>
          </td>
          <td>
            <div>${appointment.doctor_name ? esc(appointment.doctor_name) : 'Clinic visit'}</div>
            <div class="cell-sub">${appointment.doctor_specialty ? esc(appointment.doctor_specialty) : 'General request'}</div>
          </td>
          <td>
            <div>${esc(formatDate(appointment.appointment_date))}</div>
            <div class="cell-sub">${esc(formatTime(appointment.appointment_time))}</div>
          </td>
          <td>
            <select class="status-select status-${appointment.status.toLowerCase()}" data-id="${appointment.id}" aria-label="Status for ${esc(appointment.patient_first_name)} ${esc(appointment.patient_last_name)}">
              ${STATUSES.map(
                (status) =>
                  `<option value="${status}"${status === appointment.status ? ' selected' : ''}>${status}</option>`
              ).join('')}
            </select>
          </td>
          <td>${esc(formatTimestamp(appointment.created_at))}</td>
        </tr>
      `
    )
    .join('');
}

function filteredMessages() {
  const filter = document.getElementById('messageFilter').value;
  const list = sortByCreated(state.messages);

  if (filter === 'new') {
    return list.filter((message) => !Array.isArray(message.replies) || message.replies.length === 0);
  }
  if (filter === 'replied') {
    return list.filter((message) => Array.isArray(message.replies) && message.replies.length > 0);
  }
  return list;
}

function renderMessages() {
  const box = document.getElementById('messageList');
  const list = filteredMessages();

  if (list.length === 0) {
    box.innerHTML = '<div class="empty">No messages.</div>';
    return;
  }

  box.innerHTML = list
    .map((message, index) => {
      const replies = Array.isArray(message.replies) ? message.replies : [];
      const thread = replies
        .map(
          (reply) => `
            <div class="reply">
              <div class="reply-head">
                <strong>${esc(reply.admin_name || 'Care team')}</strong>
                <span>${esc(formatDateTime(reply.created_at))}</span>
              </div>
              <p>${esc(reply.body)}</p>
            </div>
          `
        )
        .join('');

      return `
        <article class="message is-entering" style="--item-index: ${index}">
          <div class="message-head">
            <div>
              <strong>${esc(message.name)}</strong>
              <span> &middot; ${esc(message.email)}</span>
            </div>
            <div class="message-head-right">
              <span class="pill ${replies.length ? 'replied' : 'new'}">${replies.length ? 'Replied' : 'Awaiting reply'}</span>
              <span>${esc(formatDateTime(message.created_at))}</span>
            </div>
          </div>
          ${message.subject ? `<span class="message-subject">${esc(message.subject)}</span>` : ''}
          <p>${esc(message.message)}</p>
          ${thread ? `<div class="reply-thread">${thread}</div>` : ''}
          <form class="reply-form" data-id="${message.id}">
            <textarea rows="3" placeholder="Write a reply to ${esc(message.name)}..." required></textarea>
            <div class="reply-actions">
              <span class="form-status" data-reply-status></span>
              <button type="submit" class="btn btn-sm btn-primary">Send reply</button>
            </div>
          </form>
        </article>
      `;
    })
    .join('');
}

function renderCharts() {
  const charts = window.CarePointCharts;
  if (!charts) return;

  const statusColors = {
    Pending: '#b45309',
    Confirmed: '#15803d',
    Completed: '#1d4ed8',
    Cancelled: '#6b7280'
  };

  charts.donutChart(
    document.getElementById('adminChartStatus'),
    ['Pending', 'Confirmed', 'Completed', 'Cancelled'].map((status) => ({
      label: status,
      value: state.appointments.filter((appointment) => appointment.status === status).length,
      color: statusColors[status]
    })),
    { label: 'Appointments by status', centerLabel: 'appointments' }
  );

  const months = [];
  const now = new Date();

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString(undefined, { month: 'short' })
    });
  }

  const counts = new Map(months.map((month) => [month.key, 0]));
  state.appointments.forEach((appointment) => {
    const key = String(appointment.appointment_date || '').slice(0, 7);
    if (counts.has(key)) counts.set(key, counts.get(key) + 1);
  });

  charts.barChart(
    document.getElementById('adminChartActivity'),
    months.map((month) => ({ label: month.label, value: counts.get(month.key) })),
    { label: 'Bookings per month' }
  );
}

function renderAll() {
  renderStats();
  renderRecentAppointments();
  renderRecentMessages();
  renderUsers();
  renderAppointments();
  renderMessages();
  renderCharts();
}

function positionAdminIndicator() {
  const indicator = document.querySelector('.admin-nav-indicator');
  const active = document.querySelector('.admin-nav button.active');
  if (!indicator || !active || window.innerWidth <= 860) return;

  indicator.style.height = active.offsetHeight + 'px';
  indicator.style.transform = `translateY(${active.offsetTop}px)`;
}

function switchView(view) {
  document.querySelectorAll('.admin-view').forEach((section) => {
    const visible = section.id === `view-${view}`;
    section.classList.toggle('hidden', !visible);

    if (visible && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      section.classList.remove('is-entering');
      void section.offsetWidth;
      section.classList.add('is-entering');
    }
  });

  document.querySelectorAll('.admin-nav [data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });

  const copy = viewCopy[view] || viewCopy.overview;
  document.getElementById('viewTitle').textContent = copy[0];
  document.getElementById('viewSubtitle').textContent = copy[1];
  positionAdminIndicator();
}

document.querySelectorAll('.admin-nav [data-view]').forEach((button) => {
  button.addEventListener('click', () => switchView(button.dataset.view));
});

document.querySelectorAll('[data-goto]').forEach((button) => {
  button.addEventListener('click', () => switchView(button.dataset.goto));
});

document.getElementById('apptSearch').addEventListener('input', renderAppointments);
document.getElementById('apptStatusFilter').addEventListener('change', renderAppointments);
document.getElementById('userSearch').addEventListener('input', renderUsers);
document.getElementById('messageFilter').addEventListener('change', renderMessages);

document.getElementById('adminUsers').addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-user-view]');
  if (viewButton) {
    openPatientModal(Number(viewButton.dataset.userView));
    return;
  }

  const banButton = event.target.closest('[data-user-ban]');
  if (banButton) {
    setUserBan(Number(banButton.dataset.userBan), banButton.dataset.banned !== 'true', banButton);
    return;
  }

  const deleteButton = event.target.closest('[data-user-delete]');
  if (deleteButton) {
    deleteUserAccount(Number(deleteButton.dataset.userDelete), deleteButton);
  }
});

document.getElementById('patientModalBody').addEventListener('click', (event) => {
  const banButton = event.target.closest('[data-profile-ban]');
  if (banButton) {
    setUserBan(Number(banButton.dataset.profileBan), banButton.dataset.banned !== 'true', banButton);
    return;
  }

  const deleteButton = event.target.closest('[data-profile-delete]');
  if (deleteButton) {
    deleteUserAccount(Number(deleteButton.dataset.profileDelete), deleteButton);
  }
});

document.getElementById('patientModalClose').addEventListener('click', closePatientModal);

document.getElementById('patientModal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closePatientModal();
});

document.getElementById('patientModal').addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;

  const modal = event.currentTarget;
  const focusable = [...modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.disabled && element.offsetParent !== null);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.getElementById('patientModal').classList.contains('hidden')) {
    closePatientModal();
  }
});

document.getElementById('adminAppointments').addEventListener('change', async (event) => {
  const select = event.target.closest('select[data-id]');
  if (!select) return;

  const id = Number(select.dataset.id);
  const appointment = state.appointments.find((item) => item.id === id);
  if (!appointment) return;

  const previous = appointment.status;
  const requested = select.value;
  select.disabled = true;
  select.className = 'status-select status-' + requested.toLowerCase();

  try {
    const response = await fetch(`/api/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: requested })
    });

    if (!response.ok) {
      const data = await response.json();
      window.alert(data.message || 'Could not update the appointment.');
      select.value = previous;
      select.className = 'status-select status-' + previous.toLowerCase();
      select.disabled = false;
      return;
    }

    appointment.status = requested;
    renderStats();
    renderRecentAppointments();
    renderAppointments();
  } catch (err) {
    window.alert('Could not update the appointment. Please try again.');
    select.value = previous;
    select.className = 'status-select status-' + previous.toLowerCase();
    select.disabled = false;
  }
});

document.getElementById('messageList').addEventListener('submit', async (event) => {
  const form = event.target.closest('.reply-form');
  if (!form) return;
  event.preventDefault();

  const id = Number(form.dataset.id);
  const textarea = form.querySelector('textarea');
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[data-reply-status]');
  const body = textarea.value.trim();

  if (!body) {
    status.textContent = 'Write a reply first.';
    status.className = 'form-status err';
    return;
  }

  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = 'Sending...';
  status.textContent = '';
  status.className = 'form-status';

  try {
    const response = await fetch(`/api/contact/${id}/replies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body })
    });

    const data = await response.json();

    if (!response.ok) {
      status.textContent = data.message || 'Could not send the reply.';
      status.className = 'form-status err';
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = 'Send reply';
      return;
    }

    const message = state.messages.find((item) => item.id === id);
    if (message) {
      if (!Array.isArray(message.replies)) message.replies = [];
      message.replies.push(data.reply);
    }

    renderMessages();
    renderStats();
    renderRecentMessages();
    showToast(data.message, data.emailed ? 'ok' : 'warn');
  } catch (err) {
    status.textContent = 'Could not send the reply. Please try again.';
    status.className = 'form-status err';
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = 'Send reply';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/logout', { method: 'POST' });
  } catch (err) {
    return;
  }
  window.location.href = '/';
});

window.addEventListener('resize', positionAdminIndicator);
loadSession();
loadData();
window.requestAnimationFrame(positionAdminIndicator);
