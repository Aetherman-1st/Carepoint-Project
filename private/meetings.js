const meetingList = document.getElementById('meetingList');
const zoomNotice = document.getElementById('zoomNotice');
const toast = document.getElementById('toast');
let toastTimer = null;

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
}

function showToast(message, type) {
  toast.textContent = message;
  toast.className = `toast${type ? ' ' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast hidden';
  }, 3200);
}

function renderAvatar(user) {
  const actions = document.getElementById('headerActions');
  const link = document.getElementById('headerProfileLink');
  if (!actions || !link) return;

  actions.classList.add('has-avatar');
  link.classList.remove('hidden');
  link.replaceChildren();

  if (user.avatar_url) {
    const image = document.createElement('img');
    image.src = user.avatar_url;
    image.alt = '';
    link.appendChild(image);
  } else {
    const first = (user.first_name || '').trim().charAt(0);
    const last = (user.last_name || '').trim().charAt(0);
    const initials = document.createElement('span');
    initials.textContent = (first + last || (user.email || '?').charAt(0)).toUpperCase();
    link.appendChild(initials);
  }
}

async function loadSession() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    if (!data.user) {
      window.location.href = '/login?next=' + encodeURIComponent('/meetings');
      return null;
    }

    const name = [data.user.first_name, data.user.last_name].filter(Boolean).join(' ');
    document.getElementById('userName').textContent = name || data.user.email;
    renderAvatar(data.user);
    return data.user;
  } catch (err) {
    window.location.href = '/login?next=' + encodeURIComponent('/meetings');
    return null;
  }
}

function isUpcoming(meeting) {
  return (
    ['Pending', 'Confirmed'].includes(meeting.status) &&
    meeting.appointment_date >= todayISO()
  );
}

function sortMeetings(list) {
  return [...list].sort((a, b) => {
    const aUpcoming = isUpcoming(a) ? 0 : 1;
    const bUpcoming = isUpcoming(b) ? 0 : 1;
    if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming;
    const aKey = `${a.appointment_date} ${a.appointment_time}`;
    const bKey = `${b.appointment_date} ${b.appointment_time}`;
    return aUpcoming === 0 ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey);
  });
}

function zoomBadge(meeting) {
  const status = (meeting.zoom_status || '').toLowerCase();
  if (status === 'scheduled') return '<span class="meeting-zoom-badge is-ready">Zoom ready</span>';
  if (status === 'pending_config') return '<span class="meeting-zoom-badge is-pending">Waiting for Zoom setup</span>';
  if (status === 'failed') return '<span class="meeting-zoom-badge is-failed">Meeting not created</span>';
  if (status === 'cancelled') return '<span class="meeting-zoom-badge is-cancelled">Meeting removed</span>';
  if (status === 'cancel_pending') return '<span class="meeting-zoom-badge is-pending">Removal pending</span>';
  return '';
}

function renderMeetings(meetings) {
  if (!meetings.length) {
    meetingList.innerHTML = `
      <div class="empty">
        <strong>No online meetings yet.</strong>
        <p>Book an appointment and choose “Online (Zoom)” to create one.</p>
      </div>
    `;
    return;
  }

  meetingList.innerHTML = sortMeetings(meetings)
    .map((meeting, index) => {
      const statusClass = meeting.status.toLowerCase();
      const canJoin =
        Boolean(meeting.zoom_join_url) &&
        ['Pending', 'Confirmed'].includes(meeting.status);
      const visitLabel = meeting.doctor_name
        ? [meeting.doctor_name, meeting.doctor_specialty].filter(Boolean).join(' · ')
        : 'Clinic visit';

      return `
        <article class="meeting-card is-entering" style="--item-index: ${index}">
          <div class="meeting-card-head">
            <div>
              <div class="appt-title">${esc(meeting.clinic_name)}</div>
              <div class="appt-sub">${esc(visitLabel)}</div>
            </div>
            <div class="meeting-badges">
              <span class="pill ${statusClass}">${esc(meeting.status)}</span>
              ${zoomBadge(meeting)}
            </div>
          </div>
          <div class="appt-meta">
            <span>${esc(formatDate(meeting.appointment_date))}</span>
            <span>${esc(formatTime(meeting.appointment_time))}</span>
            <span>${esc(meeting.clinic_city || 'Online')}</span>
          </div>
          ${
            meeting.zoom_meeting_id
              ? `<div class="meeting-id">Meeting ID: <strong>${esc(meeting.zoom_meeting_id)}</strong>${
                  meeting.zoom_password ? ` · Passcode: <strong>${esc(meeting.zoom_password)}</strong>` : ''
                }</div>`
              : ''
          }
          ${
            canJoin
              ? `<div class="meeting-actions">
                   <a class="btn btn-primary btn-sm" href="${esc(meeting.zoom_join_url)}" target="_blank" rel="noopener noreferrer">Join Zoom meeting</a>
                   <button type="button" class="btn btn-outline btn-sm" data-copy-link="${esc(meeting.zoom_join_url)}">Copy link</button>
                 </div>`
              : `<div class="meeting-actions">
                   <button type="button" class="btn btn-outline btn-sm" disabled>Join link unavailable</button>
                   <a class="btn btn-ghost btn-sm" href="/patient#appointments">Manage appointment</a>
                 </div>`
          }
        </article>
      `;
    })
    .join('');
}

async function loadMeetings() {
  try {
    const response = await fetch('/api/meetings');
    if (!response.ok) throw new Error('Failed');
    const data = await response.json();

    zoomNotice.classList.toggle('hidden', data.zoomConfigured !== false);
    renderMeetings(Array.isArray(data.meetings) ? data.meetings : []);
  } catch (err) {
    meetingList.innerHTML = '<div class="empty">Could not load your meetings. Please refresh.</div>';
  }
}

meetingList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy-link]');
  if (!button) return;

  const link = button.dataset.copyLink;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      const helper = document.createElement('textarea');
      helper.value = link;
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      document.execCommand('copy');
      helper.remove();
    }
    showToast('Meeting link copied.', 'ok');
  } catch (err) {
    showToast('Could not copy the link. Open it instead.', 'warn');
  }
});

document.getElementById('refreshMeetings').addEventListener('click', loadMeetings);

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/logout', { method: 'POST' });
  } catch (err) {
    return;
  }
  window.location.href = '/';
});

loadSession().then((user) => {
  if (user) loadMeetings();
});
