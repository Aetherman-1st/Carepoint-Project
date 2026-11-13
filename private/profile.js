const profileForm = document.getElementById('profileForm');
const firstNameInput = document.getElementById('firstName');
const lastNameInput = document.getElementById('lastName');
const phoneInput = document.getElementById('phone');
const emailInput = document.getElementById('email');
const avatarInput = document.getElementById('avatarInput');
const removeAvatarButton = document.getElementById('removeAvatar');
const avatarInitials = document.getElementById('profileInitials');
const avatarImage = document.getElementById('profileAvatarImage');
const accountEmail = document.getElementById('accountEmail');
const accountSince = document.getElementById('accountSince');
const profileStatus = document.getElementById('profileStatus');
const saveProfileButton = document.getElementById('saveProfile');
const logoutButton = document.getElementById('logoutBtn');
const passwordForm = document.getElementById('passwordForm');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
const changePasswordButton = document.getElementById('changePasswordBtn');
const passwordStatus = document.getElementById('passwordStatus');

let currentProfile = null;
let avatarData = null;
let avatarChanged = false;

function initialsFor(profile) {
  const first = (profile.first_name || '').trim().charAt(0);
  const last = (profile.last_name || '').trim().charAt(0);
  return (first + last || (profile.email || '?').charAt(0)).toUpperCase();
}

function setStatus(message, type) {
  profileStatus.textContent = message;
  profileStatus.className = `form-status${type ? ' ' + type : ''}`;
}

function setPasswordStatus(message, type) {
  passwordStatus.textContent = message;
  passwordStatus.className = `form-status${type ? ' ' + type : ''}`;
}

function setAvatarPreview(profile) {
  const url = profile.avatar_url;
  avatarInitials.textContent = initialsFor(profile);

  if (url) {
    avatarImage.src = url;
    avatarImage.alt = `${profile.first_name || 'Your'} profile photo`;
    avatarImage.classList.remove('hidden');
    avatarInitials.classList.add('hidden');
  } else {
    avatarImage.removeAttribute('src');
    avatarImage.alt = '';
    avatarImage.classList.add('hidden');
    avatarInitials.classList.remove('hidden');
  }
}

function formatMemberSince(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function fillProfile(profile) {
  currentProfile = profile;
  firstNameInput.value = profile.first_name || '';
  lastNameInput.value = profile.last_name || '';
  phoneInput.value = profile.phone || '';
  emailInput.value = profile.email || '';
  accountEmail.textContent = profile.email || '—';
  accountSince.textContent = formatMemberSince(profile.created_at);
  setAvatarPreview(profile);
}

async function loadProfile() {
  try {
    const response = await fetch('/api/profile');
    if (response.status === 401) {
      window.location.href = '/login?next=/profile';
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load your profile.');
    fillProfile(data.profile);
  } catch (err) {
    setStatus(err.message || 'Could not load your profile.', 'err');
  }
}

function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const size = 320;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;

        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, size, size);

        const scale = Math.max(size / image.width, size / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);

        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      image.onerror = () => reject(new Error('That image could not be read.'));
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}

avatarInput.addEventListener('change', async () => {
  const file = avatarInput.files && avatarInput.files[0];
  if (!file) return;

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    setStatus('Please choose a JPG, PNG or WebP image.', 'err');
    avatarInput.value = '';
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    setStatus('Please choose an image smaller than 8 MB.', 'err');
    avatarInput.value = '';
    return;
  }

  setStatus('Preparing photo...', '');
  try {
    avatarData = await resizeAvatar(file);
    avatarChanged = true;
    setAvatarPreview({
      first_name: firstNameInput.value,
      last_name: lastNameInput.value,
      email: emailInput.value,
      avatar_url: avatarData
    });
    setStatus('Photo ready. Save changes to keep it.', 'ok');
  } catch (err) {
    setStatus(err.message || 'That image could not be read.', 'err');
  } finally {
    avatarInput.value = '';
  }
});

removeAvatarButton.addEventListener('click', () => {
  if (!currentProfile) return;
  avatarData = null;
  avatarChanged = true;
  setAvatarPreview({
    first_name: firstNameInput.value,
    last_name: lastNameInput.value,
    email: emailInput.value,
    avatar_url: null
  });
  setStatus('Photo removed. Save changes to keep it.', 'ok');
});

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('', '');

  const firstName = firstNameInput.value.trim();
  const lastName = lastNameInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!firstName || !lastName) {
    setStatus('Please add your first and last name.', 'err');
    (!firstName ? firstNameInput : lastNameInput).focus();
    return;
  }

  const payload = {
    first_name: firstName,
    last_name: lastName,
    phone
  };

  if (avatarChanged) payload.avatar_url = avatarData;

  saveProfileButton.disabled = true;
  saveProfileButton.classList.add('is-loading');
  saveProfileButton.textContent = 'Saving...';

  try {
    const response = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus(data.message || 'Could not save your profile.', 'err');
      return;
    }

    avatarChanged = false;
    avatarData = null;
    fillProfile(data.profile);
    if (typeof window.renderHeaderAvatar === 'function') {
      window.renderHeaderAvatar(data.profile);
    }
    setStatus(data.message || 'Profile updated.', 'ok');
  } catch (err) {
    setStatus('Could not save your profile. Please try again.', 'err');
  } finally {
    saveProfileButton.disabled = false;
    saveProfileButton.classList.remove('is-loading');
    saveProfileButton.textContent = 'Save changes';
  }
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setPasswordStatus('', '');

  const currentPassword = currentPasswordInput.value;
  const newPassword = newPasswordInput.value;
  const confirmNewPassword = confirmNewPasswordInput.value;

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    setPasswordStatus('Fill in all password fields.', 'err');
    return;
  }

  if (newPassword.length < 8) {
    setPasswordStatus('New password must be at least 8 characters.', 'err');
    return;
  }

  if (newPassword !== confirmNewPassword) {
    setPasswordStatus('New passwords do not match.', 'err');
    return;
  }

  changePasswordButton.disabled = true;
  changePasswordButton.classList.add('is-loading');
  changePasswordButton.textContent = 'Updating...';

  try {
    const response = await fetch('/api/password-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: currentPassword, newPassword })
    });
    const data = await response.json();

    if (!response.ok) {
      setPasswordStatus(data.message || 'Could not change the password.', 'err');
      return;
    }

    currentPasswordInput.value = '';
    newPasswordInput.value = '';
    confirmNewPasswordInput.value = '';
    setPasswordStatus('Password updated. Other sessions were signed out.', 'ok');
  } catch (err) {
    setPasswordStatus('Could not change the password. Please try again.', 'err');
  } finally {
    changePasswordButton.disabled = false;
    changePasswordButton.classList.remove('is-loading');
    changePasswordButton.textContent = 'Update password';
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await fetch('/logout', { method: 'POST' });
  } catch (err) {
    return;
  }
  window.location.href = '/';
});

loadProfile();
