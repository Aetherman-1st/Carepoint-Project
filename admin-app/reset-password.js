(function () {
  const form = document.getElementById('resetForm');
  const password = document.getElementById('password');
  const confirm = document.getElementById('confirm');
  const message = document.getElementById('message');
  const sessionMessage = document.getElementById('sessionMessage');
  const button = document.getElementById('submitBtn');

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');

  if (accessToken) {
    try {
      window.history.replaceState(null, '', window.location.pathname);
    } catch (err) {
      /* ignore */
    }
    sessionMessage.classList.add('hidden');
    form.classList.remove('hidden');
    password.focus();
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    message.textContent = '';
    message.className = 'form-status';
    if (password.value.length < 8) {
      message.textContent = 'Use at least 8 characters.';
      message.className = 'form-status err';
      return;
    }
    if (password.value !== confirm.value) {
      message.textContent = 'The passwords do not match.';
      message.className = 'form-status err';
      return;
    }
    button.disabled = true;
    button.textContent = 'Updating...';
    try {
      const response = await fetch('/api/password/reset', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, password: password.value })
      });
      const payload = await response.json().catch(function () {
        return null;
      });
      if (!response.ok) {
        throw new Error((payload && payload.message) || 'Could not update the password.');
      }
      message.textContent = 'Password updated. You can log in now.';
      message.className = 'form-status ok';
      setTimeout(function () {
        window.location.replace('./');
      }, 1200);
    } catch (err) {
      message.textContent =
        err.message || 'Could not update the password. Request a new reset link.';
      message.className = 'form-status err';
      button.disabled = false;
      button.textContent = 'Update password';
    }
  });
})();
