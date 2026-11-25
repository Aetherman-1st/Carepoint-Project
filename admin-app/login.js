(function () {
  const loginPanel = document.getElementById('loginPanel');
  const lockoutPanel = document.getElementById('lockoutPanel');
  const lockoutCountdown = document.getElementById('lockoutCountdown');
  const mfaPanel = document.getElementById('mfaPanel');
  const form = document.getElementById('adminLoginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const error = document.getElementById('error');
  const button = document.getElementById('loginBtn');
  const toggleBtn = document.getElementById('toggleBtn');
  const mfaForm = document.getElementById('mfaForm');
  const mfaTitle = document.getElementById('mfaTitle');
  const mfaHelp = document.getElementById('mfaHelp');
  const mfaQr = document.getElementById('mfaQr');
  const mfaSecret = document.getElementById('mfaSecret');
  const mfaCode = document.getElementById('mfaCode');
  const mfaError = document.getElementById('mfaError');
  const mfaBtn = document.getElementById('mfaBtn');
  const mfaBack = document.getElementById('mfaBack');

  let pendingFactorId = null;
  let enrolling = false;
  let busy = false;

  async function api(path, options) {
    const settings = options || {};
    const response = await fetch(path, {
      credentials: 'same-origin',
      ...settings,
      headers: {
        ...(settings.body ? { 'Content-Type': 'application/json' } : {}),
        ...(settings.headers || {})
      }
    });
    const payload = await response.json().catch(function () {
      return null;
    });
    return { response, payload };
  }

  function updateLoginState() {
    button.disabled = !(emailInput.value.trim() && passwordInput.value.length > 0);
  }

  emailInput.addEventListener('input', updateLoginState);
  passwordInput.addEventListener('input', updateLoginState);

  function showError(message) {
    error.textContent = message;
    error.classList.add('show');
  }

  function clearError() {
    error.textContent = '';
    error.classList.remove('show');
  }

  function showMfaError(message) {
    mfaError.textContent = message;
    mfaError.classList.add('show');
  }

  function clearMfaError() {
    mfaError.textContent = '';
    mfaError.classList.remove('show');
  }

  let lockoutTimer = null;

  function showLockout(seconds) {
    loginPanel.classList.add('hidden');
    mfaPanel.classList.add('hidden');
    lockoutPanel.classList.remove('hidden');
    let remaining = Math.max(1, Math.floor(Number(seconds) || 300));

    function render() {
      const minutes = Math.floor(remaining / 60);
      const secs = remaining % 60;
      lockoutCountdown.textContent = minutes + ':' + String(secs).padStart(2, '0');
    }

    render();
    if (lockoutTimer) clearInterval(lockoutTimer);
    lockoutTimer = setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(lockoutTimer);
        lockoutTimer = null;
        lockoutPanel.classList.add('hidden');
        showLogin();
        return;
      }
      render();
    }, 1000);
  }

  function showLogin() {
    loginPanel.classList.remove('hidden');
    mfaPanel.classList.add('hidden');
    mfaQr.innerHTML = '';
    mfaSecret.textContent = '';
    mfaCode.value = '';
    clearMfaError();
    pendingFactorId = null;
    enrolling = false;
    updateLoginState();
    emailInput.focus();
  }

  function showMfa(enrollment, factor) {
    loginPanel.classList.add('hidden');
    mfaPanel.classList.remove('hidden');
    clearMfaError();
    mfaCode.value = '';
    mfaTitle.textContent = enrollment ? 'Set up two-factor authentication' : 'Two-factor authentication';
    mfaHelp.textContent = enrollment
      ? 'Scan the QR code with your authenticator app, then enter the 6-digit code.'
      : 'Enter the 6-digit code from your authenticator app.';
    mfaQr.innerHTML = enrollment ? factor.qr_code || '' : '';
    mfaSecret.textContent = enrollment ? 'Manual key: ' + (factor.secret || '') : '';
    pendingFactorId = factor.id;
    enrolling = enrollment;
    mfaCode.focus();
  }

  async function beginMfa() {
    const { response, payload } = await api('/api/mfa/enroll', { method: 'POST', body: '{}' });
    if (!response.ok || !payload || !payload.factor) {
      throw new Error('Could not start two-factor authentication.');
    }
    showMfa(!payload.enrolled, payload.factor);
  }

  async function routeSession() {
    const { response, payload } = await api('/api/session');
    if (!response.ok || !payload || !payload.authenticated) {
      showLogin();
      return;
    }

    if (payload.aal === 'aal2') {
      window.location.replace('./admin.html');
      return;
    }

    await beginMfa();
  }

  async function redirectIfReady() {
    try {
      await routeSession();
    } catch (err) {
      await api('/api/logout', { method: 'POST' }).catch(function () {});
      showLogin();
      showError('Could not start two-factor authentication. Please log in again.');
    }
  }

  toggleBtn.addEventListener('click', function () {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    toggleBtn.textContent = showing ? 'Show' : 'Hide';
  });

  mfaBack.addEventListener('click', async function (event) {
    event.preventDefault();
    await api('/api/logout', { method: 'POST' }).catch(function () {});
    showLogin();
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('Invalid email or password.');
      updateLoginState();
      return;
    }

    button.disabled = true;
    button.textContent = 'Signing in...';

    try {
      const { response, payload } = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      if (response.status === 429) {
        clearError();
        showLockout(Number(response.headers.get('retry-after')) || 300);
        return;
      }
      if (!response.ok) {
        showError((payload && payload.message) || 'Invalid email or password.');
        return;
      }

      await routeSession();
    } catch (err) {
      await api('/api/logout', { method: 'POST' }).catch(function () {});
      showLogin();
      showError('Could not sign in right now. Please try again.');
    } finally {
      button.textContent = 'Log in';
      updateLoginState();
    }
  });

  mfaForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) return;
    clearMfaError();

    const code = mfaCode.value.replace(/\s+/g, '');
    if (!pendingFactorId || !/^\d{6}$/.test(code)) {
      showMfaError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    busy = true;
    mfaBtn.disabled = true;
    mfaBtn.textContent = 'Verifying...';

    try {
      const { response, payload } = await api('/api/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ factorId: pendingFactorId, code })
      });

      if (!response.ok) {
        showMfaError((payload && payload.message) || 'That code is invalid. Try again.');
        return;
      }

      window.location.replace('./admin.html');
    } catch (err) {
      showMfaError('Could not verify the code. Please try again.');
    } finally {
      busy = false;
      mfaBtn.disabled = false;
      mfaBtn.textContent = 'Verify and continue';
    }
  });

  redirectIfReady();
})();
