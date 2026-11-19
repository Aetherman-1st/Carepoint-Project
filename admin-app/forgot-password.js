(function () {
  const config = window.CAREPOINT_ADMIN_CONFIG || {};
  const client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true
  }
});
  const form = document.getElementById('forgotForm');
  const email = document.getElementById('email');
  const message = document.getElementById('message');
  const button = document.getElementById('submitBtn');
  const generic = 'If an account exists for that email, a reset link was sent.';

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    message.textContent = '';
    message.className = 'form-status';
    button.disabled = true;
    button.textContent = 'Sending...';
    try {
      await client.auth.resetPasswordForEmail(email.value.trim(), {
        redirectTo: window.location.origin + '/reset-password.html'
      });
    } catch (err) {}
    finally {
      message.textContent = generic;
      message.className = 'form-status ok';
      button.disabled = false;
      button.textContent = 'Send reset link';
    }
  });
})();
