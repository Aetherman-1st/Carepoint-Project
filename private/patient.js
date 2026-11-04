const clinicSelect = document.getElementById('clinicSelect');
const doctorSelect = document.getElementById('doctorSelect');
const doctorNote = document.getElementById('doctorNote');
const dateInput = document.getElementById('dateInput');
const timeSelect = document.getElementById('timeSelect');
const visitType = document.getElementById('visitType');
const onlineNote = document.getElementById('onlineNote');
const reasonInput = document.getElementById('reasonInput');
const bookingForm = document.getElementById('bookingForm');
const bookBtn = document.getElementById('bookBtn');
const bookingStatus = document.getElementById('bookingStatus');
const appointmentList = document.getElementById('appointmentList');
const apptFilter = document.getElementById('apptFilter');

const onboardingOverlay = document.getElementById('onboardingOverlay');
const onboardingForm = document.getElementById('onboardingForm');
const onboardingSuccess = document.getElementById('onboardingSuccess');
const onboardingProgress = document.getElementById('onboardingProgress');
const onboardingStepLabel = document.getElementById('onboardingStepLabel');
const onboardingBack = document.getElementById('onboardingBack');
const onboardingNext = document.getElementById('onboardingNext');
const onboardingError = document.getElementById('onboardingError');
const onboardingAge = document.getElementById('onboardingAge');
const onboardingConditions = document.getElementById('onboardingConditions');
const onboardingMedications = document.getElementById('onboardingMedications');
const noMedications = document.getElementById('noMedications');
const onboardingDone = document.getElementById('onboardingDone');
const careProfileCard = document.getElementById('careProfileCard');
const editCareProfile = document.getElementById('editCareProfile');

let clinics = [];
let appointments = [];
let currentUser = null;
let onboardingStep = 1;
let onboardingProfile = null;

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
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTime(value) {
  if (!value) return '';
  const [hour, minute] = value.split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function setStatus(message, type) {
  bookingStatus.textContent = message;
  bookingStatus.className = `form-status${type ? ' ' + type : ''}`;
}

function fillClinics() {
  clinicSelect.innerHTML =
    '<option value="">Select a clinic</option>' +
    clinics
      .map((clinic) => {
        const detail = [clinic.specialty, clinic.city].filter(Boolean).join(' · ');
        return `<option value="${clinic.id}">${esc(clinic.name)}${detail ? ` · ${esc(detail)}` : ''}</option>`;
      })
      .join('');

  const params = new URLSearchParams(window.location.search);
  const requested = params.get('clinic');
  if (requested && clinics.some((clinic) => String(clinic.id) === String(requested))) {
    clinicSelect.value = requested;
    fillDoctors();
  }
}

function fillDoctors() {
  const clinic = clinics.find((item) => String(item.id) === clinicSelect.value);
  if (!clinic) {
    doctorSelect.innerHTML = '<option value="">Choose a clinic first</option>';
    doctorSelect.disabled = true;
    return;
  }

  const hasDoctors = clinic.doctors.length > 0;
  doctorNote.classList.toggle('hidden', hasDoctors);
  doctorSelect.disabled = !hasDoctors;

  if (!hasDoctors) {
    doctorSelect.innerHTML = '<option value="">No specialists listed</option>';
    return;
  }

  doctorSelect.innerHTML =
    '<option value="">Select a specialist</option>' +
    clinic.doctors
      .map(
        (doctor) =>
          `<option value="${doctor.id}">${esc(doctor.name)} · ${esc(doctor.specialty)}</option>`
      )
      .join('');
}

function renderPatientAvatar(user) {
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
      window.location.href = '/login?next=' + encodeURIComponent('/patient');
      return null;
    }

    currentUser = data.user;
    const name = [data.user.first_name, data.user.last_name].filter(Boolean).join(' ');
    document.getElementById('patientName').textContent = data.user.first_name || 'there';
    document.getElementById('userName').textContent = name || data.user.email;
    renderPatientAvatar(data.user);
    return data.user;
  } catch (err) {
    window.location.href = '/login?next=' + encodeURIComponent('/patient');
    return null;
  }
}

async function loadClinics() {
  try {
    const response = await fetch('/api/clinics');
    clinics = await response.json();
    fillClinics();
  } catch (err) {
    clinicSelect.innerHTML = '<option value="">Clinics unavailable</option>';
  }
}

function isUpcoming(appointment) {
  return (
    ['Pending', 'Confirmed'].includes(appointment.status) &&
    appointment.appointment_date >= todayISO()
  );
}

function renderStats() {
  const upcoming = appointments.filter(isUpcoming).length;
  const completed = appointments.filter((appointment) => appointment.status === 'Completed').length;
  const cancelled = appointments.filter((appointment) => appointment.status === 'Cancelled').length;

  const count = window.CarePointMotion
    ? window.CarePointMotion.countTo
    : (element, value) => { element.textContent = String(value); };

  count(document.getElementById('statUpcoming'), upcoming);
  count(document.getElementById('statCompleted'), completed);
  count(document.getElementById('statCancelled'), cancelled);
}

function renderCharts() {
  const charts = window.CarePointCharts;
  if (!charts) return;

  const months = [];
  const now = new Date();

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      key,
      label: date.toLocaleDateString(undefined, { month: 'short' })
    });
  }

  const counts = new Map(months.map((month) => [month.key, 0]));
  appointments.forEach((appointment) => {
    const key = String(appointment.appointment_date || '').slice(0, 7);
    if (counts.has(key)) counts.set(key, counts.get(key) + 1);
  });

  charts.barChart(
    document.getElementById('chartActivity'),
    months.map((month) => ({ label: month.label, value: counts.get(month.key) })),
    { label: 'Appointments per month' }
  );

  const statusColors = {
    Pending: '#b45309',
    Confirmed: '#15803d',
    Completed: '#1d4ed8',
    Cancelled: '#6b7280'
  };

  const statuses = ['Pending', 'Confirmed', 'Completed', 'Cancelled'].map((status) => ({
    label: status,
    value: appointments.filter((appointment) => appointment.status === status).length,
    color: statusColors[status]
  }));

  charts.donutChart(document.getElementById('chartStatus'), statuses, {
    label: 'Appointments by status',
    centerLabel: 'appointments'
  });
}

function sortAppointments(list) {
  const upcoming = list.filter(isUpcoming).sort((a, b) =>
    `${a.appointment_date} ${a.appointment_time}`.localeCompare(`${b.appointment_date} ${b.appointment_time}`)
  );
  const rest = list
    .filter((appointment) => !isUpcoming(appointment))
    .sort((a, b) =>
      `${b.appointment_date} ${b.appointment_time}`.localeCompare(`${a.appointment_date} ${a.appointment_time}`)
    );
  return [...upcoming, ...rest];
}

function filteredAppointments() {
  const today = todayISO();
  const filter = apptFilter.value;

  if (filter === 'upcoming') return appointments.filter(isUpcoming);
  if (filter === 'cancelled') return appointments.filter((appointment) => appointment.status === 'Cancelled');
  if (filter === 'past') {
    return appointments.filter(
      (appointment) => appointment.appointment_date < today && appointment.status !== 'Cancelled'
    );
  }
  return appointments;
}

function renderAppointments() {
  const list = sortAppointments(filteredAppointments());

  if (list.length === 0) {
    appointmentList.innerHTML =
      '<div class="empty">No appointments yet.</div>';
    return;
  }

  appointmentList.innerHTML = list
    .map((appointment, index) => {
      const statusClass = appointment.status.toLowerCase();
      const visitLabel = appointment.doctor_name
        ? [appointment.doctor_name, appointment.doctor_specialty].filter(Boolean).join(' · ')
        : 'Clinic visit';
      const canCancel =
        ['Pending', 'Confirmed'].includes(appointment.status) &&
        appointment.appointment_date >= todayISO();

      return `
        <article class="appt-item is-entering" style="--item-index: ${index}">
          <div class="appt-top">
            <div>
              <div class="appt-title">${esc(appointment.clinic_name)}</div>
              <div class="appt-sub">${esc(visitLabel)}</div>
            </div>
            <span class="pill ${statusClass}">${esc(appointment.status)}</span>
          </div>
          <div class="appt-meta">
            <span>${esc(formatDate(appointment.appointment_date))}</span>
            <span>${esc(formatTime(appointment.appointment_time))}</span>
            <span>${esc(appointment.clinic_city)}</span>
            ${appointment.visit_type === 'online' ? '<span class="appt-online">Online · Zoom</span>' : ''}
          </div>
          ${appointment.reason ? `<div class="appt-sub">Reason: ${esc(appointment.reason)}</div>` : ''}
          ${
            canCancel || appointment.visit_type === 'online'
              ? `<div class="appt-actions">
                   ${appointment.visit_type === 'online' ? '<a class="btn btn-sm btn-outline" href="/meetings">Meeting link</a>' : ''}
                   ${canCancel ? `<button type="button" class="btn btn-sm btn-danger" data-cancel="${appointment.id}">Cancel appointment</button>` : ''}
                 </div>`
              : ''
          }
        </article>
      `;
    })
    .join('');
}

async function loadAppointments() {
  try {
    const response = await fetch('/api/appointments');
    if (!response.ok) throw new Error('Failed');
    appointments = await response.json();
    renderStats();
    renderAppointments();
    renderCharts();
  } catch (err) {
    appointmentList.innerHTML = '<div class="empty">Could not load your appointments. Please refresh.</div>';
    renderCharts();
  }
}

function showToast(message, type) {
  const toast = document.createElement('div');
  toast.className = `toast${type ? ' ' + type : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

function setOnboardingError(message) {
  onboardingError.textContent = message;
  onboardingError.classList.toggle('show', Boolean(message));
  if (message) {
    onboardingError.classList.add('shake');
    setTimeout(() => onboardingError.classList.remove('shake'), 350);
  }
}

function syncConditionChips() {
  const values = onboardingConditions.value
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  document.querySelectorAll('.onboarding-chip').forEach((chip) => {
    chip.classList.toggle('is-active', values.includes(chip.dataset.condition.toLowerCase()));
  });
}

function setOnboardingStep(step) {
  onboardingStep = Math.min(3, Math.max(1, step));
  setOnboardingError('');

  document.querySelectorAll('.onboarding-step').forEach((section) => {
    section.classList.toggle('hidden', Number(section.dataset.step) !== onboardingStep);
  });

  onboardingProgress.style.width = `${(onboardingStep / 3) * 100}%`;
  onboardingStepLabel.textContent = `Step ${onboardingStep} of 3`;
  onboardingBack.classList.toggle('hidden', onboardingStep === 1);
  onboardingNext.textContent = onboardingStep === 3 ? 'Save my profile' : 'Continue';

  const target =
    onboardingStep === 1 ? onboardingAge : onboardingStep === 2 ? onboardingConditions : onboardingMedications;
  setTimeout(() => target.focus(), 80);
}

function openOnboarding() {
  onboardingOverlay.classList.remove('hidden', 'is-closing');
  document.body.style.overflow = 'hidden';
  onboardingForm.classList.remove('hidden');
  onboardingSuccess.classList.add('hidden');
  setOnboardingStep(1);
}

function closeOnboarding() {
  if (onboardingOverlay.classList.contains('hidden')) return;

  onboardingOverlay.classList.add('is-closing');
  window.setTimeout(() => {
    onboardingOverlay.classList.remove('is-closing');
    onboardingOverlay.classList.add('hidden');
    document.body.style.overflow = '';
  }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 190);
}

function fillOnboarding(profile) {
  onboardingAge.value = profile.age || '';
  onboardingConditions.value = profile.conditions || '';
  onboardingMedications.value = profile.medications || '';

  if ((profile.medications || '').trim().toLowerCase() === 'none') {
    noMedications.checked = true;
    onboardingMedications.disabled = true;
  }

  syncConditionChips();
}

function renderCareProfile(profile) {
  if (!profile) {
    careProfileCard.classList.add('hidden');
    return;
  }

  document.getElementById('careProfileAge').textContent = profile.age || 'Not shared';
  document.getElementById('careProfileConditions').textContent = profile.conditions || 'Not shared';
  document.getElementById('careProfileMedications').textContent = profile.medications || 'Not shared';
  careProfileCard.classList.remove('hidden');
}

async function loadOnboarding() {
  if (!currentUser) return;

  try {
    const response = await fetch('/api/onboarding');
    if (!response.ok) return;
    const data = await response.json();
    onboardingProfile = data.profile || null;

    if (onboardingProfile) {
      fillOnboarding(onboardingProfile);
      renderCareProfile(onboardingProfile);
    }

    const force = new URLSearchParams(window.location.search).get('onboarding') === '1';
    if ((!onboardingProfile || force) && (currentUser.role !== 'admin' || force)) {
      openOnboarding();
    }
  } catch (err) {
    return;
  }
}

function onboardingStepIsValid() {
  if (onboardingStep === 1) {
    const age = Number(onboardingAge.value);
    if (!Number.isInteger(age) || age < 1 || age > 120) {
      setOnboardingError('Please enter an age between 1 and 120.');
      onboardingAge.focus();
      return false;
    }
  }
  return true;
}

document.querySelectorAll('.onboarding-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const value = chip.dataset.condition;
    const current = onboardingConditions.value.trim();

    if (value === 'None') {
      onboardingConditions.value = 'None';
    } else {
      const values = current
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item && item.toLowerCase() !== 'none');
      if (!values.some((item) => item.toLowerCase() === value.toLowerCase())) {
        values.push(value);
      }
      onboardingConditions.value = values.join(', ');
    }

    syncConditionChips();
  });
});

onboardingConditions.addEventListener('input', syncConditionChips);

noMedications.addEventListener('change', () => {
  if (noMedications.checked) {
    if (onboardingMedications.value.trim()) {
      onboardingMedications.dataset.previous = onboardingMedications.value;
    }
    onboardingMedications.value = 'None';
    onboardingMedications.disabled = true;
  } else {
    onboardingMedications.disabled = false;
    onboardingMedications.value =
      onboardingMedications.value.trim().toLowerCase() === 'none'
        ? onboardingMedications.dataset.previous || ''
        : onboardingMedications.value;
  }
});

onboardingBack.addEventListener('click', () => setOnboardingStep(onboardingStep - 1));

onboardingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setOnboardingError('');

  if (!onboardingStepIsValid()) return;

  if (onboardingStep < 3) {
    setOnboardingStep(onboardingStep + 1);
    return;
  }

  onboardingNext.disabled = true;
  onboardingNext.classList.add('is-loading');
  onboardingNext.textContent = 'Saving...';

  try {
    const response = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        age: Number(onboardingAge.value),
        conditions: onboardingConditions.value.trim(),
        medications: noMedications.checked ? 'None' : onboardingMedications.value.trim()
      })
    });

    const data = await response.json();

    if (!response.ok) {
      setOnboardingError(data.message || 'Could not save your care profile.');
      onboardingNext.disabled = false;
      onboardingNext.classList.remove('is-loading');
      onboardingNext.textContent = 'Save my profile';
      return;
    }

    onboardingProfile = data.profile;
    renderCareProfile(onboardingProfile);
    onboardingProgress.style.width = '100%';
    onboardingStepLabel.textContent = 'All done';
    onboardingForm.classList.add('hidden');
    onboardingSuccess.classList.remove('hidden');
  } catch (err) {
    setOnboardingError('Could not save your care profile. Please try again.');
    onboardingNext.disabled = false;
    onboardingNext.classList.remove('is-loading');
    onboardingNext.textContent = 'Save my profile';
  }
});

editCareProfile.addEventListener('click', openOnboarding);

onboardingDone.addEventListener('click', () => {
  closeOnboarding();
  showToast('Your care profile is saved.', 'ok');
});

clinicSelect.addEventListener('change', fillDoctors);

const visitTypeButtons = document.querySelectorAll('[data-visit-type]');

function setVisitType(value) {
  const next = value === 'online' ? 'online' : 'in_person';
  visitType.value = next;

  visitTypeButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.visitType === next);
    button.setAttribute('aria-pressed', button.dataset.visitType === next ? 'true' : 'false');
  });

  onlineNote.classList.toggle('hidden', next !== 'online');
}

visitTypeButtons.forEach((button) => {
  button.addEventListener('click', () => setVisitType(button.dataset.visitType));
});

const zoomHeroBtn = document.getElementById('zoomHeroBtn');
if (zoomHeroBtn) {
  zoomHeroBtn.addEventListener('click', () => {
    setVisitType('online');
    const booking = document.getElementById('booking');
    if (booking) booking.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

if (new URLSearchParams(window.location.search).get('online') === '1') {
  setVisitType('online');
  const booking = document.getElementById('booking');
  if (booking) {
    window.setTimeout(() => {
      booking.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 250);
  }
}

bookingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('', '');

  const clinic = clinics.find((item) => String(item.id) === clinicSelect.value);
  const needsDoctor = Boolean(clinic && clinic.doctors.length > 0);

  if (!clinicSelect.value || (needsDoctor && !doctorSelect.value) || !dateInput.value || !timeSelect.value) {
    setStatus(
      needsDoctor
        ? 'Please choose a clinic, specialist, date and time.'
        : 'Please choose a clinic, date and time.',
      'err'
    );
    return;
  }

  bookBtn.disabled = true;
  bookBtn.classList.add('is-loading');
  bookBtn.textContent = 'Requesting...';

  try {
    const response = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: clinicSelect.value,
        doctor_id: doctorSelect.value || null,
        appointment_date: dateInput.value,
        appointment_time: timeSelect.value,
        reason: reasonInput.value.trim(),
        visit_type: visitType.value
      })
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.message || 'Could not book the appointment.', 'err');
    } else {
      setStatus(data.message || 'Appointment requested. Status: Pending.', 'ok');
      reasonInput.value = '';
      timeSelect.value = '';
      await loadAppointments();
    }
  } catch (err) {
    setStatus('Could not book the appointment. Please try again.', 'err');
  }

  bookBtn.disabled = false;
  bookBtn.classList.remove('is-loading');
  bookBtn.textContent = 'Request appointment';
});

appointmentList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-cancel]');
  if (!button) return;

  if (!window.confirm('Cancel this appointment?')) return;

  button.disabled = true;
  button.classList.add('is-loading');
  button.textContent = 'Cancelling...';

  try {
    const response = await fetch(`/api/appointments/${button.dataset.cancel}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Cancelled' })
    });

    if (!response.ok) {
      const data = await response.json();
      window.alert(data.message || 'Could not cancel the appointment.');
      button.disabled = false;
      button.classList.remove('is-loading');
      button.textContent = 'Cancel appointment';
      return;
    }

    await loadAppointments();
  } catch (err) {
    window.alert('Could not cancel the appointment. Please try again.');
    button.disabled = false;
    button.classList.remove('is-loading');
    button.textContent = 'Cancel appointment';
  }
});

apptFilter.addEventListener('change', renderAppointments);

document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/logout', { method: 'POST' });
  } catch (err) {
    return;
  }
  window.location.href = '/';
});

dateInput.min = todayISO();
loadSession().then((user) => {
  if (user) loadOnboarding();
});
loadClinics();
loadAppointments();
