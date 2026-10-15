const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const error = document.getElementById('error');
const btn = document.getElementById('loginBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.textContent = '';

  const email = emailInput.value;
  const password = passwordInput.value;

  btn.textContent = 'Logging in...';
  btn.disabled = true;

  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      error.textContent = data.message;
    } else {
      error.textContent = '';
      alert(data.message);
    }
  } catch (err) {
    error.textContent = 'Something went wrong';
  }

  btn.textContent = 'Log in';
  btn.disabled = false;
});
