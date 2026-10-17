const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const error = document.getElementById('error');
const btn = document.getElementById('loginBtn');
const toggleBtn = document.getElementById('toggleBtn');

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

  const email = emailInput.value;
  const password = passwordInput.value;

  if (!email) {
    showError('Enter your email');
    return;
  }

  if (!password) {
    showError('Enter your password');
    return;
  }

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
      showError(data.message);
    } else {
      btn.classList.add('success');
      btn.textContent = 'Welcome!';
      setTimeout(() => {
        btn.classList.remove('success');
        btn.textContent = 'Log in';
        btn.disabled = false;
      }, 1200);
      return;
    }
  } catch (err) {
    showError('Something went wrong');
  }

  btn.textContent = 'Log in';
  btn.disabled = false;
});
