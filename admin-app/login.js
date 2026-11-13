(function () {
  const config = window.CAREPOINT_ADMIN_CONFIG || {};
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);

  const form = document.getElementById('adminLoginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const error = document.getElementById('error');
  const button = document.getElementById('loginBtn');
  const toggleBtn = document.getElementById('toggleBtn');

  function showError(message) {
    error.textContent = message;
    error.classList.add('show');
  }

  function clearError() {
    error.textContent = '';
    error.classList.remove('show');
  }

  async function isAdmin() {
    const { data, error: roleError } = await client.rpc('is_admin');
    return !roleError && data === true;
  }

  async function redirectIfReady() {
    const { data } = await client.auth.getSession();
    if (!data.session) return;
    if (await isAdmin()) {
      window.location.replace('./admin.html');
      return;
    }
    await client.auth.signOut();
  }

  toggleBtn.addEventListener('click', function () {
    const showing = passwordInput.type === 'text';
    passwordInput.type = showing ? 'password' : 'text';
    toggleBtn.textContent = showing ? 'Show' : 'Hide';
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearError();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('Enter your email and password.');
      return;
    }

    button.disabled = true;
    button.textContent = 'Signing in...';

    try {
      const { error: loginError } = await client.auth.signInWithPassword({ email, password });
      if (loginError) {
        showError(loginError.message === 'Invalid login credentials'
          ? 'Email or password is incorrect.'
          : loginError.message);
        return;
      }

      if (!(await isAdmin())) {
        await client.auth.signOut();
        showError('This account does not have administrator access.');
        return;
      }

      window.location.replace('./admin.html');
    } catch (err) {
      showError('Could not sign in. Please try again.');
    } finally {
      button.disabled = false;
      button.textContent = 'Log in';
    }
  });

  redirectIfReady();
})();
