const requestForm = document.getElementById('requestForm');
const resetForm = document.getElementById('resetForm');
const emailInput = document.getElementById('email');
const codeInput = document.getElementById('code');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const requestError = document.getElementById('requestError');
const resetError = document.getElementById('resetError');
const resetStatus = document.getElementById('resetStatus');
const resetSent = document.getElementById('resetSent');
const requestBtn = document.getElementById('requestBtn');
const resetBtn = document.getElementById('resetBtn');
const backBtn = document.getElementById('backBtn');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');

let challenge = null;

function showError(element, message) {
  element.textContent = message;
  element.classList.add('show', 'shake');
  setTimeout(() => element.classList.remove('shake'), 350);
}

function clearError(element) {
  element.classList.remove('show');
  element.textContent = '';
}

function setStatus(message, type) {
  resetStatus.textContent = message;
  resetStatus.className = `form-status${type ? ' ' + type : ''}`;
}

function showResetStep(data) {
  challenge = data.challenge;
  resetSent.textContent = 'If an account exists for that email, a 6-digit code was sent. Check your inbox.';
  codeInput.value = '';
  newPasswordInput.value = '';
  confirmPasswordInput.value = '';
  clearError(resetError);
  setStatus('', '');
  requestForm.classList.add('hidden');
  resetForm.classList.remove('hidden');
  authTitle.textContent = 'Choose a new password';
  authSubtitle.textContent = 'Enter the code and your new password.';
  codeInput.focus();
}

function showRequestStep() {
  challenge = null;
  resetForm.classList.add('hidden');
  requestForm.classList.remove('hidden');
  authTitle.textContent = 'Reset your password';
  authSubtitle.textContent = 'We will email you a 6-digit reset code.';
  clearError(resetError);
  setStatus('', '');
}

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError(requestError);

  const email = emailInput.value.trim();
  if (!email) {
    showError(requestError, 'Enter your email address.');
    return;
  }

  requestBtn.disabled = true;
  requestBtn.classList.add('is-loading');
  requestBtn.textContent = 'Sending...';

  try {
    const response = await fetch('/api/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();

    if (!response.ok) {
      showError(requestError, data.message || 'Could not send a reset code.');
      return;
    }

    if (data.challenge) {
      showResetStep(data);
    } else {
      showError(requestError, data.message || 'Could not send a reset code. Please try again.');
    }
  } catch (err) {
    showError(requestError, 'Could not send a reset code. Please try again.');
  } finally {
    requestBtn.disabled = false;
    requestBtn.classList.remove('is-loading');
    requestBtn.textContent = 'Send reset code';
  }
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
  clearError(resetError);
});

[newPasswordInput, confirmPasswordInput].forEach((input) => {
  input.addEventListener('input', () => clearError(resetError));
});

resetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError(resetError);
  setStatus('', '');

  const code = codeInput.value.trim();
  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!/^\d{6}$/.test(code)) {
    showError(resetError, 'Enter the 6-digit reset code.');
    return;
  }

  if (newPassword.length < 8) {
    showError(resetError, 'Your new password must be at least 8 characters.');
    return;
  }

  if (newPassword !== confirmPassword) {
    showError(resetError, 'The passwords do not match.');
    return;
  }

  resetBtn.disabled = true;
  resetBtn.classList.add('is-loading');
  resetBtn.textContent = 'Resetting...';

  try {
    const response = await fetch('/api/password-reset/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, code, new_password: newPassword })
    });
    const data = await response.json();

    if (!response.ok) {
      showError(resetError, data.message || 'Could not reset your password.');
      return;
    }

    setStatus(data.message || 'Password reset. Redirecting to login...', 'ok');
    setTimeout(() => {
      window.location.href = data.redirect || '/login';
    }, 900);
  } catch (err) {
    showError(resetError, 'Could not reset your password. Please try again.');
  } finally {
    resetBtn.disabled = false;
    resetBtn.classList.remove('is-loading');
    resetBtn.textContent = 'Reset password';
  }
});

backBtn.addEventListener('click', showRequestStep);
