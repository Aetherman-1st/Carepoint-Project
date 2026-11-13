const form = document.getElementById('signupForm');
const firstnameInput = document.getElementById('firstname');
const lastnameInput = document.getElementById('lastname');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm');
const error = document.getElementById('error');
const btn = document.getElementById('signupBtn');

const verifyForm = document.getElementById('signupVerifyForm');
const codeInput = document.getElementById('signupCode');
const codeSent = document.getElementById('signupCodeSent');
const codeError = document.getElementById('signupCodeError');
const codeStatus = document.getElementById('signupCodeStatus');
const verifyBtn = document.getElementById('verifySignupBtn');
const resendBtn = document.getElementById('resendSignupBtn');
const backBtn = document.getElementById('backToSignupBtn');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authAlt = document.getElementById('authAlt');

let challenge = null;
let resendInterval = null;

function showError(message) {
  error.textContent = message;
  error.classList.add('show', 'shake');
  setTimeout(() => error.classList.remove('shake'), 350);
}

function clearError() {
  error.classList.remove('show');
  error.textContent = '';
}

function showCodeError(message) {
  codeError.textContent = message;
  codeError.classList.add('show', 'shake');
  setTimeout(() => codeError.classList.remove('shake'), 350);
}

function clearCodeMessages() {
  codeError.classList.remove('show');
  codeError.textContent = '';
  codeStatus.textContent = '';
  codeStatus.className = 'form-status';
}

function startResendCooldown(seconds) {
  if (resendInterval) clearInterval(resendInterval);

  let remaining = Math.max(0, Math.ceil(seconds));
  resendBtn.disabled = true;
  resendBtn.textContent = `Resend code (${remaining}s)`;

  resendInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(resendInterval);
      resendInterval = null;
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend code';
      return;
    }
    resendBtn.textContent = `Resend code (${remaining}s)`;
  }, 1000);
}

function showVerifyStep(data) {
  challenge = data.challenge;
  codeSent.textContent = data.emailDelivered
    ? 'A 6-digit code was sent to your email. Check your inbox.'
    : 'We could not send the verification email. Use Resend code to try again.';
  codeInput.value = '';
  clearCodeMessages();

  form.classList.add('hidden');
  verifyForm.classList.remove('hidden');
  authAlt.classList.add('hidden');
  authTitle.textContent = 'Check your email';
  authSubtitle.textContent = 'Enter the 6-digit code to verify your new account.';
  startResendCooldown(60);
  codeInput.focus();
}

function showSignupStep() {
  challenge = null;
  if (resendInterval) {
    clearInterval(resendInterval);
    resendInterval = null;
  }
  resendBtn.disabled = false;
  resendBtn.textContent = 'Resend code';
  clearCodeMessages();

  verifyForm.classList.add('hidden');
  form.classList.remove('hidden');
  authAlt.classList.remove('hidden');
  authTitle.textContent = 'Create account';
  authSubtitle.textContent = 'Use your name, email and password.';
  clearError();
}

window.addEventListener('load', () => {
  form.classList.add('show');
});

[firstnameInput, lastnameInput, emailInput, passwordInput, confirmInput].forEach((input) => {
  input.addEventListener('input', clearError);
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
  clearCodeMessages();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const first_name = firstnameInput.value.trim();
  const last_name = lastnameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirm = confirmInput.value;

  if (!first_name || !last_name || !email || !password || !confirm) {
    showError('Please fill in all fields');
    return;
  }

  if (password.length < 8) {
    showError('Password must be at least 8 characters');
    return;
  }

  if (password !== confirm) {
    showError('Passwords do not match');
    return;
  }

  btn.textContent = 'Creating account...';
  btn.disabled = true;
  btn.classList.add('is-loading');

  try {
    const response = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name, last_name, email, password })
    });

    const data = await response.json();

    if (data.verificationRequired) {
      showVerifyStep(data);
      if (data.emailDeliveryFailed) {
        codeStatus.textContent =
          'Your account was created, but the verification email could not be sent. Use Resend code to try again.';
        codeStatus.className = 'form-status err';
      }
      btn.textContent = 'Create account';
      btn.disabled = false;
      btn.classList.remove('is-loading');
      return;
    }

    if (!response.ok) {
      showError(data.message || 'Could not create your account.');
      btn.textContent = 'Create account';
      btn.disabled = false;
      btn.classList.remove('is-loading');
      return;
    }

    btn.classList.remove('is-loading');

    btn.classList.add('success');
    btn.textContent = 'Account created';
    setTimeout(() => {
      window.location.href = data.redirect || '/login';
    }, 700);
  } catch (err) {
    showError('Something went wrong');
    btn.textContent = 'Create account';
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
});

verifyForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearCodeMessages();

  const code = codeInput.value.trim();

  if (!/^\d{6}$/.test(code)) {
    showCodeError('Enter the 6-digit code from your email.');
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying...';
  verifyBtn.classList.add('is-loading');

  try {
    const response = await fetch('/signup/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, code })
    });

    const data = await response.json();

    if (!response.ok) {
      showCodeError(data.message || 'Could not verify the code.');
      verifyBtn.disabled = false;
      verifyBtn.classList.remove('is-loading');
      verifyBtn.textContent = 'Verify email';
      codeInput.focus();
      return;
    }

    verifyBtn.classList.remove('is-loading');
    verifyBtn.classList.add('success');
    verifyBtn.textContent = 'Verified';
    setTimeout(() => {
      window.location.href = data.redirect || '/patient?onboarding=1';
    }, 650);
  } catch (err) {
    showCodeError('Something went wrong');
    verifyBtn.disabled = false;
    verifyBtn.classList.remove('is-loading');
    verifyBtn.textContent = 'Verify email';
  }
});

resendBtn.addEventListener('click', async () => {
  if (!challenge) return;
  clearCodeMessages();

  resendBtn.disabled = true;
  resendBtn.textContent = 'Sending...';

  try {
    const response = await fetch('/signup/resend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge })
    });

    const data = await response.json();

    if (!response.ok) {
      showCodeError(data.message || 'Could not resend the code.');
      startResendCooldown(data.retryAfter || 30);
      return;
    }

    challenge = data.challenge;
    codeStatus.textContent = data.emailDelivered
      ? 'A new code was sent. Check your inbox.'
      : 'We could not send the code. Please try again.';
    codeStatus.className = 'form-status ok';
    codeInput.value = '';
    codeInput.focus();
    startResendCooldown(60);
  } catch (err) {
    showCodeError('Could not resend the code. Please try again.');
    startResendCooldown(30);
  }
});

backBtn.addEventListener('click', showSignupStep);
