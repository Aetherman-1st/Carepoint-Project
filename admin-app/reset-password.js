(function () {
  const config = window.CAREPOINT_ADMIN_CONFIG || {};
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true
  }
});
  const form = document.getElementById('resetForm');
  const password = document.getElementById('password');
  const confirm = document.getElementById('confirm');
  const message = document.getElementById('message');
  const sessionMessage = document.getElementById('sessionMessage');
  const button = document.getElementById('submitBtn');

  async function showForm() {
    const { data } = await client.auth.getSession();
    if (!data.session) return;
    sessionMessage.classList.add('hidden');
    form.classList.remove('hidden');
    password.focus();
  }

  client.auth.onAuthStateChange(function (event) {
    if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') showForm();
  });
  showForm();

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
      const { error } = await client.auth.updateUser({ password: password.value });
      if (error) throw error;
      message.textContent = 'Password updated. You can log in now.';
      message.className = 'form-status ok';
      await client.auth.signOut();
      setTimeout(function () { window.location.replace('./'); }, 1200);
    } catch (err) {
      message.textContent = 'Could not update the password. Request a new reset link.';
      message.className = 'form-status err';
      button.disabled = false;
      button.textContent = 'Update password';
    }
  });
})();
