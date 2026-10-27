const clinicGrid = document.getElementById('clinicGrid');
const serviceList = document.getElementById('serviceList');
const searchInput = document.getElementById('clinicSearch');
const chips = document.getElementById('specialtyChips');

let clinics = [];
let activeSpecialty = 'All';

const clinicCrossIcon =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"></path></svg>';
const clinicCalendarIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 11h18"></path></svg>';

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initialsFor(user) {
  const first = (user.first_name || '').trim().charAt(0);
  const last = (user.last_name || '').trim().charAt(0);
  return (first + last || (user.email || '?').charAt(0)).toUpperCase();
}

function renderHeaderAvatar(user) {
  const actions = document.getElementById('headerActions');
  if (!actions || !user) return;

  actions.classList.add('has-avatar');
  let link = document.getElementById('headerProfileLink');

  if (!link) {
    link = document.createElement('a');
    link.id = 'headerProfileLink';
    link.className = 'header-avatar';
    actions.appendChild(link);
  }

  link.href = '/profile';
  link.title = 'My profile';
  link.setAttribute('aria-label', 'My profile');
  link.replaceChildren();

  if (user.avatar_url) {
    const image = document.createElement('img');
    image.src = user.avatar_url;
    image.alt = '';
    link.appendChild(image);
  } else {
    const initials = document.createElement('span');
    initials.textContent = initialsFor(user);
    link.appendChild(initials);
  }
}

window.renderHeaderAvatar = renderHeaderAvatar;

function getSpecialties() {
  return [
    'All',
    ...Array.from(new Set(clinics.map((clinic) => clinic.specialty).filter(Boolean)))
  ];
}

function renderChipGroup(container, active) {
  if (!container) return;

  if (clinics.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = getSpecialties()
    .map((specialty) => {
      const cross =
        specialty === 'All'
          ? `<span class="chip-cross" aria-hidden="true">${clinicCrossIcon}</span>`
          : '';
      return `<button type="button" class="chip${specialty === active ? ' active' : ''}" data-specialty="${esc(specialty)}">${cross}${esc(specialty)}</button>`;
    })
    .join('');
}

function renderChips() {
  renderChipGroup(chips, activeSpecialty);
}

function filterClinics(term, specialty) {
  return clinics.filter((clinic) => {
    const matchesSpecialty = specialty === 'All' || clinic.specialty === specialty;
    const haystack = [
      clinic.name,
      clinic.specialty,
      clinic.city,
      clinic.address,
      ...(clinic.doctors || []).map((doctor) => `${doctor.name} ${doctor.specialty}`)
    ]
      .join(' ')
      .toLowerCase();
    return matchesSpecialty && (!term || haystack.includes(term));
  });
}

function clinicCardMarkup(clinic, index, animate) {
  const doctors = clinic.doctors || [];
  const doctorNames = doctors.map((doctor) => doctor.name).join(', ');
  const location = [clinic.address, clinic.city].filter(Boolean).join(', ');
  const meta = [
    location ? { label: 'Address', value: location } : null,
    clinic.phone ? { label: 'Phone', value: clinic.phone } : null,
    doctorNames ? { label: 'Specialists', value: doctorNames } : null
  ].filter(Boolean);
  const metaMarkup = meta.length
    ? `<dl class="clinic-directory-meta">${meta
        .map((item) => `<div><dt>${item.label}</dt><dd>${esc(item.value)}</dd></div>`)
        .join('')}</dl>`
    : '';
  const mediaMarkup = clinic.image_url
    ? `
      <div class="clinic-directory-media">
        <img src="${esc(clinic.image_url)}" alt="Photo of ${esc(clinic.name)}" loading="lazy" decoding="async">
      </div>`
    : '';

  return `
    <article class="clinic-directory-card${animate ? ' is-entering' : ''}"${
      animate ? ` style="--card-index: ${index}"` : ''
    }>
      ${mediaMarkup}
      <div class="clinic-directory-body">
        <div class="clinic-directory-top">
          <span class="clinic-mark" aria-hidden="true">${clinicCrossIcon}</span>
          <div class="clinic-directory-heading">
            <h3>${esc(clinic.name)}</h3>
            ${
              clinic.specialty
                ? `<span class="clinic-specialty-tag">${esc(clinic.specialty)}</span>`
                : ''
            }
          </div>
        </div>
        ${
          clinic.description
            ? `<p class="clinic-directory-desc">${esc(clinic.description)}</p>`
            : ''
        }
        ${metaMarkup}
        <div class="clinic-directory-footer">
          <button type="button" class="clinic-book-btn js-clinic-book" data-clinic="${esc(clinic.id)}">
            ${clinicCalendarIcon}
            <span>Book a visit</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function clinicStateMarkup(message, withClear) {
  return `
    <div class="clinic-state${withClear ? ' clinic-state-empty' : ''}">
      <span class="clinic-state-icon" aria-hidden="true">${clinicCrossIcon}</span>
      <p>${message}</p>
      ${
        withClear
          ? '<button type="button" class="clinic-clear-btn js-clear-search">Clear search</button>'
          : ''
      }
    </div>
  `;
}

function renderClinicGrid(container, items, animate) {
  container.innerHTML = items
    .map((clinic, index) => clinicCardMarkup(clinic, index, animate))
    .join('');

  if (window.CarePointMotion) window.CarePointMotion.refresh(container);
}

function renderServices() {
  if (!serviceList) return;

  if (clinics.length === 0) {
    serviceList.innerHTML = '<p class="empty-state">No services available yet.</p>';
    return;
  }

  const groups = new Map();
  clinics.forEach((clinic) => {
    if (!clinic.specialty) return;
    if (!groups.has(clinic.specialty)) groups.set(clinic.specialty, []);
    groups.get(clinic.specialty).push(clinic.name);
  });

  if (groups.size === 0) {
    serviceList.innerHTML = '<p class="empty-state">No services listed yet.</p>';
    return;
  }

  serviceList.innerHTML = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(
      ([specialty, names], index) => `
        <article class="service-item is-entering" style="--item-index: ${index}">
          <h2>${esc(specialty)}</h2>
          <p>${names.map((name) => esc(name)).join(', ')}</p>
        </article>
      `
    )
    .join('');

  if (window.CarePointMotion) window.CarePointMotion.refresh(serviceList);
}

function renderClinics(animate = false) {
  if (!clinicGrid) return;

  if (clinics.length === 0) {
    clinicGrid.innerHTML = clinicStateMarkup('No clinics available yet.', false);
    return;
  }

  const term = (searchInput ? searchInput.value : '').trim().toLowerCase();
  const visible = filterClinics(term, activeSpecialty);
  if (visible.length === 0) {
    clinicGrid.innerHTML = clinicStateMarkup('No clinics match your search.', true);
    return;
  }

  renderClinicGrid(clinicGrid, visible, animate);
}

function goToBooking(clinicId) {
  window.location.href = clinicId
    ? `/book?clinic=${encodeURIComponent(clinicId)}`
    : '/book';
}

if (chips && searchInput && clinicGrid) {
  chips.addEventListener('click', (event) => {
    const button = event.target.closest('.chip');
    if (!button) return;
    activeSpecialty = button.dataset.specialty;
    renderChips();
    renderClinics();
  });

  searchInput.addEventListener('input', () => renderClinics());

  clinicGrid.addEventListener('click', (event) => {
    const clearButton = event.target.closest('.js-clear-search');
    if (clearButton) {
      searchInput.value = '';
      activeSpecialty = 'All';
      renderChips();
      renderClinics();
      searchInput.focus();
      return;
    }

    const button = event.target.closest('.js-clinic-book');
    if (!button) return;
    goToBooking(button.dataset.clinic);
  });
}

async function loadSession() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    if (!data.user) return;

    const loginLink = document.getElementById('loginLink');
    const bookLink = document.getElementById('bookLink');
    const portalLink = document.getElementById('portalLink');
    const admin = data.user.role === 'admin';

    if (loginLink) loginLink.classList.add('hidden');
    if (bookLink) bookLink.classList.add('hidden');
    if (portalLink) {
      portalLink.classList.remove('hidden');
      portalLink.textContent = admin ? 'Admin dashboard' : 'My portal';
      portalLink.href = admin ? '/admin' : '/patient';
    }

    renderHeaderAvatar(data.user);

    document.querySelectorAll('.js-book').forEach((link) => {
      link.href = '/book';
    });
  } catch (err) {
    return;
  }
}

async function loadClinics() {
  try {
    const response = await fetch('/api/clinics');
    if (!response.ok) throw new Error('Failed');
    clinics = await response.json();
    renderChips();
    renderClinics(true);
    renderServices();
  } catch (err) {
    if (clinicGrid) {
      clinicGrid.innerHTML = clinicStateMarkup('Could not load clinics.', false);
    }
    if (serviceList) {
      serviceList.innerHTML = '<p class="empty-state">Could not load services.</p>';
    }
  }
}

const contactForm = document.getElementById('contactForm');
if (contactForm) {
  const status = document.getElementById('contactStatus');
  const button = document.getElementById('contactBtn');

  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    status.className = 'form-status';

    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const subject = document.getElementById('contactSubject').value.trim();
    const message = document.getElementById('contactMessage').value.trim();

    if (!name || !email || !message) {
      status.textContent = 'Please add your name, email and message.';
      status.className = 'form-status err';
      return;
    }

    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message })
      });
      const data = await response.json();

      if (!response.ok) {
        status.textContent = data.message || 'Could not send your message.';
        status.className = 'form-status err';
      } else {
        status.textContent = data.message;
        status.className = 'form-status ok';
        contactForm.reset();
      }
    } catch (err) {
      status.textContent = 'Could not send your message. Please try again.';
      status.className = 'form-status err';
    }

    button.disabled = false;
    button.classList.remove('is-loading');
    button.removeAttribute('aria-busy');
  });
}

loadSession();
if (clinicGrid || serviceList) loadClinics();
