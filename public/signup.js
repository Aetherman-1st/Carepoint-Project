const form = document.getElementById('signupForm');
const firstnameInput = document.getElementById('firstname');
const lastnameInput = document.getElementById('lastname');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm');
const error = document.getElementById('error');
const btn = document.getElementById('signupBtn');

function showError(message) {
  error.textContent = message;
  error.classList.add('show', 'shake');
  setTimeout(() => error.classList.remove('shake'), 350);
}

function clearError() {
  error.classList.remove('show');
  error.textContent = '';
}

window.addEventListener('load', () => {
  form.classList.add('show');
});

btn.addEventListener('click', (e) => {
  const ripple = document.createElement('span');
  ripple.classList.add('ripple');
  const size = Math.max(btn.clientWidth, btn.clientHeight);
  ripple.style.width = size + 'px';
  ripple.style.height = size + 'px';
  ripple.style.left = (e.offsetX - size / 2) + 'px';
  ripple.style.top = (e.offsetY - size / 2) + 'px';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();

  const first_name = firstnameInput.value;
  const last_name = lastnameInput.value;
  const email = emailInput.value;
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

  btn.textContent = 'Creating...';
  btn.disabled = true;

  try {
    const response = await fetch('/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name, last_name, email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      showError(data.message);
      btn.textContent = 'Create account';
      btn.disabled = false;
      return;
    }

    btn.classList.add('success');
    btn.textContent = 'Account created!';
    setTimeout(() => {
      window.location.href = '/index.html';
    }, 1200);
  } catch (err) {
    showError('Something went wrong');
    btn.textContent = 'Create account';
    btn.disabled = false;
  }
});
