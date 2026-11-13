const loginForm = document.getElementById('loginForm');
const twoFactorForm = document.getElementById('twoFactorForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const rememberInput = document.getElementById('rememberMe');
const error = document.getElementById('error');
const btn = document.getElementById('loginBtn');
const toggleBtn = document.getElementById('toggleBtn');
const resendVerificationBtn = document.getElementById('resendVerificationBtn');

const codeInput = document.getElementById('codeInput');
const codeSent = document.getElementById('codeSent');
const authAlt = document.getElementById('authAlt');
const codeError = document.getElementById('codeError');
const codeStatus = document.getElementById('codeStatus');
const verifyBtn = document.getElementById('verifyBtn');
const resendBtn = document.getElementById('resendBtn');
const backBtn = document.getElementById('backBtn');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');

const params = new URLSearchParams(window.location.search);
const nextParam = params.get('next');
const safeNext = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null;
const accountStatus = params.get('account');

let challenge = null;
let resendInterval = null;
let verifyEndpoint = '/login/verify';
let pendingCredentials = null;

function showError(message) {
  error.textContent = message;
  error.classList.add('show', 'shake');
  setTimeout(() => error.classList.remove('shake'), 350);
}

function clearError() {
  error.classList.remove('show');
  error.textContent = '';
  resendVerificationBtn.classList.add('hidden');
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

function goToDashboard(user, redirect) {
  if (user && user.role === 'clinic') {
    window.location.href = '/clinic';
    return;
  }
  const safePatientNext =
    safeNext && /^\/(patient|profile|meetings)(\/|$|\?)/.test(safeNext) ? safeNext : null;
  window.location.href = safePatientNext || redirect || '/patient';
}

async function redirectIfLoggedIn() {
  try {
    const response = await fetch('/api/session');
    const data = await response.json();
    if (data.user) goToDashboard(data.user);
  } catch (err) {
    return;
  }
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

function showCodeStep(data, endpoint) {
  challenge = data.challenge;
  verifyEndpoint = endpoint || '/login/verify';
  codeSent.textContent = 'A 6-digit code was sent to your email. Check your inbox.';
  codeInput.value = '';
  clearCodeMessages();

  loginForm.classList.add('hidden');
  twoFactorForm.classList.remove('hidden');
  authAlt.classList.add('hidden');
  authTitle.textContent = 'Check your email';
  authSubtitle.textContent =
    verifyEndpoint === '/signup/verify'
      ? 'Enter the 6-digit code to verify your email and continue.'
      : 'Enter the 6-digit code to finish logging in.';
  startResendCooldown(60);
  codeInput.focus();
}

function showCredentialsStep() {
  challenge = null;
  verifyEndpoint = '/login/verify';
  if (resendInterval) {
    clearInterval(resendInterval);
    resendInterval = null;
  }
  resendBtn.disabled = false;
  resendBtn.textContent = 'Resend code';
  clearCodeMessages();

  twoFactorForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  authAlt.classList.remove('hidden');
  authTitle.textContent = 'Log in';
  authSubtitle.textContent = 'Book and manage your appointments.';
  clearError();
}

window.addEventListener('load', () => {
  loginForm.classList.add('show');

  if (accountStatus === 'banned') {
    showError('This account has been banned. Contact the CarePoint team if you believe this is a mistake.');
  } else if (accountStatus === 'deleted') {
    showError('This account no longer exists.');
  } else if (accountStatus === 'session_expired') {
    showError('Your session expired. Please log in again.');
  }
});

emailInput.addEventListener('input', clearError);
passwordInput.addEventListener('input', clearError);

toggleBtn.addEventListener('click', () => {
  if (passwordInput.type === 'password') {
    passwordInput.type = 'text';
    toggleBtn.textContent = 'Hide';
  } else {
    passwordInput.type = 'password';
    toggleBtn.textContent = 'Show';
  }
});

codeInput.addEventListener('input', () => {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
  clearCodeMessages();
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email) {
    showError('Enter your email');
    return;
  }

  if (!password) {
    showError('Enter your password');
    return;
  }

  pendingCredentials = { email, password };
  btn.textContent = 'Checking...';
  btn.disabled = true;
  btn.classList.add('is-loading');

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, remember: rememberInput.checked })
    });

    const data = await response.json();

    if (!response.ok) {
      showError(data.message || 'Could not log in');
      if (data.canResendVerification) {
        resendVerificationBtn.classList.remove('hidden');
      }
      btn.textContent = 'Log in';
      btn.disabled = false;
      btn.classList.remove('is-loading');
      return;
    }

    btn.textContent = 'Log in';
    btn.disabled = false;
    btn.classList.remove('is-loading');

    if (data.twoFactorRequired) {
      showCodeStep(data, '/login/verify');
      return;
    }

    goToDashboard(data.user, data.redirect);
  } catch (err) {
    showError('Something went wrong');
    btn.textContent = 'Log in';
    btn.disabled = false;
    btn.classList.remove('is-loading');
  }
});

resendVerificationBtn.addEventListener('click', async () => {
  if (!pendingCredentials) return;

  resendVerificationBtn.disabled = true;
  resendVerificationBtn.textContent = 'Sending verification code...';
  clearError();

  try {
    const response = await fetch('/signup/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingCredentials)
    });
    const data = await response.json();

    if (!response.ok && !data.verificationRequired) {
      showError(data.message || 'Could not resend the verification code.');
      return;
    }

    if (data.verificationRequired) {
      showCodeStep(data, '/signup/verify');
    }
  } catch (err) {
    showError('Could not resend the verification code. Please try again.');
  } finally {
    resendVerificationBtn.disabled = false;
    resendVerificationBtn.textContent = 'Resend verification code';
  }
});

twoFactorForm.addEventListener('submit', async (e) => {
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
    const response = await fetch(verifyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge, code })
    });

    const data = await response.json();

    if (!response.ok) {
      showCodeError(data.message || 'Could not verify the code.');
      verifyBtn.disabled = false;
      verifyBtn.classList.remove('is-loading');
      verifyBtn.textContent = 'Verify and log in';
      codeInput.focus();
      return;
    }

    verifyBtn.classList.remove('is-loading');
    verifyBtn.classList.add('success');
    verifyBtn.textContent = 'Verified';
    setTimeout(() => goToDashboard(data.user, data.redirect), 500);
  } catch (err) {
    showCodeError('Something went wrong');
    verifyBtn.disabled = false;
    verifyBtn.classList.remove('is-loading');
    verifyBtn.textContent = 'Verify and log in';
  }
});

resendBtn.addEventListener('click', async () => {
  if (!challenge) return;
  clearCodeMessages();

  resendBtn.disabled = true;
  resendBtn.textContent = 'Sending...';

  const endpoint = verifyEndpoint === '/signup/verify' ? '/signup/resend' : '/login/resend';

  try {
    const response = await fetch(endpoint, {
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

backBtn.addEventListener('click', showCredentialsStep);

redirectIfLoggedIn();
