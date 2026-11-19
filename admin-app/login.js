(function () {
  const config = window.CAREPOINT_ADMIN_CONFIG || {};
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);

  const loginPanel = document.getElementById('loginPanel');
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

  function showLogin() {
    loginPanel.classList.remove('hidden');
    mfaPanel.classList.add('hidden');
    mfaQr.innerHTML = '';
    mfaSecret.textContent = '';
    mfaCode.value = '';
    clearMfaError();
    pendingFactorId = null;
    enrolling = false;
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
    mfaQr.innerHTML = enrollment ? factor.totp.qr_code : '';
    mfaSecret.textContent = enrollment ? 'Manual key: ' + factor.totp.secret : '';
    pendingFactorId = factor.id;
    enrolling = enrollment;
    mfaCode.focus();
  }

  async function hasAdminMembership(userId) {
    const { data, error: memberError } = await client
      .from('admin_members')
      .select('role')
      .eq('auth_user_id', userId)
      .maybeSingle();
    return !memberError && Boolean(data);
  }

  async function beginMfa(session) {
    const { data, error: factorError } = await client.auth.mfa.listFactors();
    if (factorError) throw factorError;

    const totp = Array.isArray(data && data.totp) ? data.totp : [];
    const verified = totp.find((factor) => factor.status === 'verified');

    if (verified) {
      showMfa(false, verified);
      return;
    }

    const { data: enrollment, error: enrollError } = await client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'CarePoint Admin'
    });
    if (enrollError) throw enrollError;

    showMfa(true, enrollment);
  }

  async function routeSession(session) {
    if (!(await hasAdminMembership(session.user.id))) {
      await client.auth.signOut();
      showLogin();
      showError('Invalid email or password.');
      return;
    }

    const { data: level, error: levelError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (levelError) throw levelError;

    if (level && level.currentLevel === 'aal2') {
      window.location.replace('./admin.html');
      return;
    }

    await beginMfa(session);
  }

  async function redirectIfReady() {
    const { data } = await client.auth.getSession();
    if (!data.session) return;

    try {
      await routeSession(data.session);
    } catch (err) {
      await client.auth.signOut();
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
    await client.auth.signOut();
    showLogin();
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('Invalid email or password.');
      return;
    }

    button.disabled = true;
    button.textContent = 'Signing in...';

    try {
      const { data, error: loginError } = await client.auth.signInWithPassword({ email, password });
      if (loginError || !data.session) {
        showError('Invalid email or password.');
        return;
      }

      await routeSession(data.session);
    } catch (err) {
      await client.auth.signOut();
      showLogin();
      showError('Invalid email or password.');
    } finally {
      button.disabled = false;
      button.textContent = 'Log in';
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
      const { error: verifyError } = await client.auth.mfa.challengeAndVerify({
        factorId: pendingFactorId,
        code
      });

      if (verifyError) {
        showMfaError('That code is invalid. Try again.');
        return;
      }

      const { data: level, error: levelError } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (levelError || !level || level.currentLevel !== 'aal2') {
        showMfaError('Two-factor authentication is not complete. Try again.');
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
