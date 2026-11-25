(function () {
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
      await fetch('/api/password/forgot', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim() })
      });
    } catch (err) {
      /* always show the generic message */
    } finally {
      message.textContent = generic;
      message.className = 'form-status ok';
      button.disabled = false;
      button.textContent = 'Send reset link';
    }
  });
})();
