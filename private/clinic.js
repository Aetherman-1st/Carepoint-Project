const state = {
  profile: null,
  stats: null,
  appointments: [],
  doctors: []
};

const STATUSES = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
const viewCopy = {
  overview: ['Overview', 'Your clinic at a glance.'],
  appointments: ['Appointments', 'Visits for your clinic.'],
  doctors: ['Doctors', 'Specialists linked to your clinic.'],
  profile: ['Clinic profile', 'Public information patients see.']
};

let modalReturnFocus = null;

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
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
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

function statusPill(status) {
  return `<span class="pill ${String(status).toLowerCase()}">${esc(status)}</span>`;
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

function switchView(view) {
  document.querySelectorAll('.admin-view').forEach((section) => {
    section.classList.toggle('hidden', section.id !== `view-${view}`);
  });
  document.querySelectorAll('.admin-nav [data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  const copy = viewCopy[view] || viewCopy.overview;
  document.getElementById('viewTitle').textContent = copy[0];
  document.getElementById('viewSubtitle').textContent = copy[1];
  positionIndicator();
}

function positionIndicator() {
  const indicator = document.querySelector('.admin-nav-indicator');
  const active = document.querySelector('.admin-nav button.active');
  if (!indicator || !active || window.innerWidth <= 860) return;
  indicator.style.height = active.offsetHeight + 'px';
  indicator.style.transform = `translateY(${active.offsetTop}px)`;
}

async function loadSession() {
  const response = await fetch('/api/session');
  const data = await response.json();
  if (!data.user || data.user.role !== 'clinic') {
    window.location.href = '/login?next=' + encodeURIComponent('/clinic');
    return null;
  }
  const name = data.user.clinic_name || [data.user.first_name, data.user.last_name].filter(Boolean).join(' ');
  document.getElementById('clinicUserName').textContent = name || data.user.email;
  return data.user;
}

function renderStats() {
  const stats = state.stats || {};
  document.getElementById('statTotal').textContent = stats.total || 0;
  document.getElementById('statPending').textContent = stats.pending || 0;
  document.getElementById('statUpcoming').textContent = stats.upcoming || 0;
  document.getElementById('statDoctors').textContent = stats.doctors || 0;
}

function renderClinicDetails() {
  const clinic = state.profile;
  if (!clinic) return;
  const rows = [
    ['Name', clinic.name],
    ['Specialty', clinic.specialty],
    ['City', clinic.city],
    ['Phone', clinic.phone],
    ['Address', clinic.address]
  ];
  document.getElementById('clinicDetails').innerHTML = rows
    .map(
      ([label, value]) =>
        `<div><dt>${esc(label)}</dt><dd>${value ? esc(value) : '<span class="patient-profile-empty">Not provided</span>'}</dd></div>`
    )
    .join('');
}

function renderRecentAppointments() {
  const body = document.getElementById('recentAppointments');
  const recent = [...state.appointments]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  if (recent.length === 0) {
    body.innerHTML = '<tr><td colspan="3"><div class="empty">No appointments yet.</div></td></tr>';
    return;
  }

  body.innerHTML = recent
    .map(
      (appointment) => `
        <tr>
          <td><div class="cell-strong">${esc(appointment.patient_first_name)} ${esc(appointment.patient_last_name)}</div></td>
          <td><div>${esc(formatDate(appointment.appointment_date))}</div><div class="cell-sub">${esc(formatTime(appointment.appointment_time))}</div></td>
          <td>${statusPill(appointment.status)}</td>
        </tr>
      `
    )
    .join('');
}

function filteredAppointments() {
  const filter = document.getElementById('apptStatusFilter').value;
  if (filter === 'all') return state.appointments;
  return state.appointments.filter((appointment) => appointment.status === filter);
}

function renderAppointments() {
  const body = document.getElementById('clinicAppointments');
  const empty = document.getElementById('appointmentsEmpty');
  const list = filteredAppointments();

  if (list.length === 0) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  body.innerHTML = list
    .map((appointment) => {
      const allowed = {
        Pending: ['Pending', 'Confirmed', 'Cancelled'],
        Confirmed: ['Confirmed', 'Completed', 'Cancelled'],
        Completed: ['Completed'],
        Cancelled: ['Cancelled']
      };
      return `
        <tr>
          <td>
            <div class="cell-strong">${esc(appointment.patient_first_name)} ${esc(appointment.patient_last_name)}</div>
            <div class="cell-sub">${appointment.visit_type === 'online' ? 'Online · Zoom' : 'In person'}</div>
          </td>
          <td>
            <div>${esc(appointment.patient_email)}</div>
            <div class="cell-sub">${esc(appointment.patient_phone || 'No phone')}</div>
          </td>
          <td>
            <div>${esc(formatDate(appointment.appointment_date))}</div>
            <div class="cell-sub">${esc(formatTime(appointment.appointment_time))}</div>
          </td>
          <td>
            <div>${esc(appointment.doctor_name)}</div>
            <div class="cell-sub">${esc(appointment.doctor_specialty || '')}</div>
          </td>
          <td>
            <select class="status-select status-${appointment.status.toLowerCase()}" data-appt-id="${appointment.id}" aria-label="Status for ${esc(appointment.patient_first_name)} ${esc(appointment.patient_last_name)}">
              ${allowed[appointment.status]
                .map(
                  (status) =>
                    `<option value="${status}"${status === appointment.status ? ' selected' : ''}>${status}</option>`
                )
                .join('')}
            </select>
          </td>
          <td><button type="button" class="table-action" data-patient-details="${appointment.id}">Patient</button></td>
        </tr>
      `;
    })
    .join('');
}

function renderDoctors() {
  const body = document.getElementById('clinicDoctors');
  const empty = document.getElementById('doctorsEmpty');

  if (state.doctors.length === 0) {
    body.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  body.innerHTML = state.doctors
    .map(
      (doctor) => `
        <tr>
          <td><div class="cell-strong">${esc(doctor.name)}</div><div class="cell-sub">${esc(doctor.bio || '')}</div></td>
          <td>${esc(doctor.specialty)}</td>
          <td>${doctor.appointment_count}</td>
          <td>
            <div class="user-actions">
              <button type="button" class="table-action" data-doctor-edit="${doctor.id}">Edit</button>
              <button type="button" class="table-action danger" data-doctor-delete="${doctor.id}">Delete</button>
            </div>
          </td>
        </tr>
      `
    )
    .join('');
}

function fillClinicForm() {
  const clinic = state.profile;
  if (!clinic) return;
  document.getElementById('clinicName').value = clinic.name || '';
  document.getElementById('clinicSpecialty').value = clinic.specialty || '';
  document.getElementById('clinicCity').value = clinic.city || '';
  document.getElementById('clinicPhone').value = clinic.phone || '';
  document.getElementById('clinicAddress').value = clinic.address || '';
  document.getElementById('clinicDescription').value = clinic.description || '';
  document.getElementById('clinicImage').value = clinic.image_url || '';
}

function resetDoctorForm() {
  document.getElementById('doctorId').value = '';
  document.getElementById('doctorName').value = '';
  document.getElementById('doctorSpecialty').value = '';
  document.getElementById('doctorBio').value = '';
  document.getElementById('doctorFormTitle').textContent = 'Add a doctor';
  document.getElementById('doctorSaveBtn').textContent = 'Add doctor';
  document.getElementById('doctorCancelBtn').classList.add('hidden');
  document.getElementById('doctorStatus').textContent = '';
}

function editDoctor(id) {
  const doctor = state.doctors.find((item) => item.id === id);
  if (!doctor) return;
  document.getElementById('doctorId').value = doctor.id;
  document.getElementById('doctorName').value = doctor.name;
  document.getElementById('doctorSpecialty').value = doctor.specialty;
  document.getElementById('doctorBio').value = doctor.bio || '';
  document.getElementById('doctorFormTitle').textContent = 'Edit doctor';
  document.getElementById('doctorSaveBtn').textContent = 'Save doctor';
  document.getElementById('doctorCancelBtn').classList.remove('hidden');
  switchView('doctors');
  document.getElementById('doctorName').focus();
}

function openPatientModal(id) {
  const appointment = state.appointments.find((item) => item.id === id);
  if (!appointment) return;
  const modal = document.getElementById('patientModal');
  const body = document.getElementById('patientModalBody');
  modalReturnFocus = document.activeElement;
  body.innerHTML = '<div class="patient-profile-loading"><span class="skeleton skeleton-line skeleton-line-lg"></span></div>';
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  document.getElementById('patientModalClose').focus();

  fetch(`/api/clinic/appointments/${id}/patient`)
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Could not load patient details.');
      const patient = data.patient;
      body.innerHTML = `
        <div class="patient-profile-head">
          <div class="patient-profile-identity">
            <span class="page-eyebrow">Patient details</span>
            <h2 id="patientModalTitle">${esc(patient.first_name)} ${esc(patient.last_name)}</h2>
            <p>${esc(patient.email)}</p>
          </div>
        </div>
        <div class="patient-profile-grid">
          <section class="patient-profile-panel">
            <h3>Contact</h3>
            <dl class="patient-profile-list">
              <div><dt>Phone</dt><dd>${patient.phone ? esc(patient.phone) : '<span class="patient-profile-empty">Not provided</span>'}</dd></div>
              <div><dt>Appointment</dt><dd>${esc(formatDate(appointment.appointment_date))} at ${esc(formatTime(appointment.appointment_time))}</dd></div>
              <div><dt>Reason</dt><dd>${appointment.reason ? esc(appointment.reason) : '<span class="patient-profile-empty">Not provided</span>'}</dd></div>
            </dl>
          </section>
          <section class="patient-profile-panel">
            <h3>Care profile</h3>
            <dl class="patient-profile-list">
              <div><dt>Age</dt><dd>${patient.age ? esc(patient.age) : '<span class="patient-profile-empty">Not shared</span>'}</dd></div>
              <div><dt>Conditions</dt><dd class="patient-profile-long">${patient.conditions ? esc(patient.conditions) : '<span class="patient-profile-empty">Not shared</span>'}</dd></div>
              <div><dt>Medications</dt><dd class="patient-profile-long">${patient.medications ? esc(patient.medications) : '<span class="patient-profile-empty">Not shared</span>'}</dd></div>
            </dl>
          </section>
        </div>
        ${appointment.zoom_join_url ? `<p class="field-note">Zoom join link: <a href="${esc(appointment.zoom_join_url)}" target="_blank" rel="noopener">Open meeting</a></p>` : ''}
      `;
    })
    .catch((err) => {
      body.innerHTML = `<div class="patient-profile-error"><h2 id="patientModalTitle">Patient unavailable</h2><p>${esc(err.message)}</p></div>`;
    });
}

function closePatientModal() {
  const modal = document.getElementById('patientModal');
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
  modalReturnFocus = null;
}

async function loadProfile() {
  const response = await fetch('/api/clinic/profile');
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Could not load clinic profile.');
  state.profile = data.clinic;
  state.stats = data.stats;
  renderStats();
  renderClinicDetails();
  fillClinicForm();
}

async function loadAppointments() {
  const response = await fetch('/api/clinic/appointments');
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Could not load appointments.');
  state.appointments = data;
  renderRecentAppointments();
  renderAppointments();
}

async function loadDoctors() {
  const response = await fetch('/api/clinic/doctors');
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Could not load doctors.');
  state.doctors = data;
  renderDoctors();
}

document.querySelectorAll('.admin-nav [data-view]').forEach((button) => {
  button.addEventListener('click', () => switchView(button.dataset.view));
});
document.querySelectorAll('[data-goto]').forEach((button) => {
  button.addEventListener('click', () => switchView(button.dataset.goto));
});

document.getElementById('apptStatusFilter').addEventListener('change', renderAppointments);

document.getElementById('clinicAppointments').addEventListener('change', async (event) => {
  const select = event.target.closest('select[data-appt-id]');
  if (!select) return;
  const id = Number(select.dataset.apptId);
  const appointment = state.appointments.find((item) => item.id === id);
  if (!appointment) return;
  const previous = appointment.status;
  const requested = select.value;
  if (requested === previous) return;

  select.disabled = true;
  try {
    const response = await fetch(`/api/clinic/appointments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: requested })
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.message || 'Could not update the appointment.', 'warn');
      select.value = previous;
      return;
    }
    appointment.status = requested;
    await loadProfile();
    await loadAppointments();
    showToast(data.message, 'ok');
  } catch (err) {
    showToast('Could not update the appointment.', 'warn');
    select.value = previous;
  } finally {
    select.disabled = false;
  }
});

document.getElementById('clinicAppointments').addEventListener('click', (event) => {
  const button = event.target.closest('[data-patient-details]');
  if (button) openPatientModal(Number(button.dataset.patientDetails));
});

document.getElementById('clinicDoctors').addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-doctor-edit]');
  if (editButton) {
    editDoctor(Number(editButton.dataset.doctorEdit));
    return;
  }

  const deleteButton = event.target.closest('[data-doctor-delete]');
  if (!deleteButton) return;
  const id = Number(deleteButton.dataset.doctorDelete);
  const doctor = state.doctors.find((item) => item.id === id);
  if (!doctor) return;
  if (!window.confirm(`Delete ${doctor.name}? Doctors with appointments cannot be deleted.`)) return;

  deleteButton.disabled = true;
  try {
    const response = await fetch(`/api/clinic/doctors/${id}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.message || 'Could not delete the doctor.', 'warn');
      return;
    }
    await loadDoctors();
    showToast(data.message, 'ok');
  } catch (err) {
    showToast('Could not delete the doctor.', 'warn');
  } finally {
    deleteButton.disabled = false;
  }
});

document.getElementById('doctorForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = Number(document.getElementById('doctorId').value) || null;
  const name = document.getElementById('doctorName').value.trim();
  const specialty = document.getElementById('doctorSpecialty').value.trim();
  const bio = document.getElementById('doctorBio').value.trim();
  const status = document.getElementById('doctorStatus');
  const button = document.getElementById('doctorSaveBtn');

  if (!name || !specialty) {
    status.textContent = 'Doctor name and specialty are required.';
    status.className = 'form-status err';
    return;
  }

  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = 'Saving...';
  status.textContent = '';
  status.className = 'form-status';

  try {
    const response = await fetch(id ? `/api/clinic/doctors/${id}` : '/api/clinic/doctors', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, specialty, bio })
    });
    const data = await response.json();
    if (!response.ok) {
      status.textContent = data.message || 'Could not save the doctor.';
      status.className = 'form-status err';
      return;
    }
    resetDoctorForm();
    await loadDoctors();
    await loadProfile();
    showToast(data.message, 'ok');
  } catch (err) {
    status.textContent = 'Could not save the doctor.';
    status.className = 'form-status err';
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = id ? 'Save doctor' : 'Add doctor';
  }
});

document.getElementById('doctorCancelBtn').addEventListener('click', resetDoctorForm);

document.getElementById('clinicProfileForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const status = document.getElementById('clinicProfileStatus');
  const button = document.getElementById('clinicProfileSave');
  const payload = {
    name: document.getElementById('clinicName').value.trim(),
    specialty: document.getElementById('clinicSpecialty').value.trim(),
    city: document.getElementById('clinicCity').value.trim(),
    phone: document.getElementById('clinicPhone').value.trim(),
    address: document.getElementById('clinicAddress').value.trim(),
    description: document.getElementById('clinicDescription').value.trim(),
    image_url: document.getElementById('clinicImage').value.trim()
  };

  if (!payload.name) {
    status.textContent = 'Clinic name is required.';
    status.className = 'form-status err';
    return;
  }

  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = 'Saving...';
  status.textContent = '';
  status.className = 'form-status';

  try {
    const response = await fetch('/api/clinic/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      status.textContent = data.message || 'Could not save your clinic profile.';
      status.className = 'form-status err';
      return;
    }
    state.profile = data.clinic;
    renderClinicDetails();
    status.textContent = data.message;
    status.className = 'form-status ok';
    showToast(data.message, 'ok');
  } catch (err) {
    status.textContent = 'Could not save your clinic profile.';
    status.className = 'form-status err';
  } finally {
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = 'Save clinic profile';
  }
});

document.getElementById('patientModalClose').addEventListener('click', closePatientModal);
document.getElementById('patientModal').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closePatientModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !document.getElementById('patientModal').classList.contains('hidden')) {
    closePatientModal();
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

window.addEventListener('resize', positionIndicator);

(async () => {
  const user = await loadSession();
  if (!user) return;
  try {
    await Promise.all([loadProfile(), loadAppointments(), loadDoctors()]);
  } catch (err) {
    showToast(err.message || 'Could not load clinic data.', 'warn');
  }
  resetDoctorForm();
  positionIndicator();
})();
