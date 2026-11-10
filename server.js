require('dotenv').config();
const path = require('path');
const express = require('express');
const pool = require('./db');

const {
  attachUser,
  roleHome,
  requireUserPage,
  requireClinicPage,
  requireAdminPage
} = require('./lib/auth');
const { clearSessionCookie, requestIsSecure } = require('./lib/session');

const loginRoute = require('./routes/login');
const signupRoute = require('./routes/signup');
const passwordResetRoute = require('./routes/password-reset');
const clinicsRoute = require('./routes/clinics');
const appointmentsRoute = require('./routes/appointments');
const contactRoute = require('./routes/contact');
const adminRoute = require('./routes/admin');
const onboardingRoute = require('./routes/onboarding');
const profileRoute = require('./routes/profile');
const meetingsRoute = require('./routes/meetings');
const chatbotRoute = require('./routes/chatbot');

const app = express();
const privateDir = path.join(__dirname, 'private');

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(attachUser);

app.get('/api/session', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!req.user) return res.json({ user: null, accountStatus: req.accountStatus });

  try {
    const result = await pool.query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.avatar_url, u.role,
              u.clinic_id, c.name AS clinic_name
       FROM users u
       LEFT JOIN clinics c ON c.id = u.clinic_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({ user: null });
    }

    const row = result.rows[0];
    res.json({
      user: {
        ...row,
        role: req.user.role,
        clinic_id: row.clinic_id || null,
        clinic_name: row.clinic_name || null
      }
    });
  } catch (err) {
    res.json({ user: req.user });
  }
});

app.post('/logout', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.user && (req.body || {}).all === true) {
    await pool.query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [
      req.user.id
    ]);
  }
  res.setHeader('Set-Cookie', clearSessionCookie({ secure: requestIsSecure(req) }));
  res.json({ message: 'Logged out' });
});

function publicPage(name) {
  return (req, res) => {
    res.sendFile(path.join(__dirname, 'public', name));
  };
}

app.get('/patient', requireUserPage, (req, res) => {
  res.sendFile(path.join(privateDir, 'patient.html'));
});

app.get('/patient.html', requireUserPage, (req, res) => {
  res.redirect(301, '/patient' + (req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : ''));
});

app.get('/patient.js', requireUserPage, (req, res) => {
  res.sendFile(path.join(privateDir, 'patient.js'));
});

app.get('/profile', requireUserPage, (req, res) => {
  res.sendFile(path.join(privateDir, 'profile.html'));
});

app.get('/profile.html', requireUserPage, (req, res) => {
  res.redirect(301, '/profile');
});

app.get('/profile.js', requireUserPage, (req, res) => {
  res.sendFile(path.join(privateDir, 'profile.js'));
});

app.get('/admin', requireAdminPage, (req, res) => {
  res.sendFile(path.join(privateDir, 'admin.html'));
});

app.get('/admin.html', requireAdminPage, (req, res) => {
  res.redirect(301, '/admin');
});

app.get('/admin.js', requireAdminPage, (req, res) => {
  res.sendFile(path.join(privateDir, 'admin.js'));
});

app.get('/clinic', requireClinicPage, (req, res) => {
  res.sendFile(path.join(privateDir, 'clinic.html'));
});

app.get('/clinic.html', requireClinicPage, (req, res) => {
  res.redirect(301, '/clinic');
});

app.get('/clinic.js', requireClinicPage, (req, res) => {
  res.sendFile(path.join(privateDir, 'clinic.js'));
});

app.get('/meetings', requireUserPage, (req, res) => {
  res.sendFile(path.join(privateDir, 'meetings.html'));
});

app.get('/meetings.html', requireUserPage, (req, res) => {
  res.redirect(301, '/meetings');
});

app.get('/meetings.js', requireUserPage, (req, res) => {
  res.sendFile(path.join(privateDir, 'meetings.js'));
});

app.get('/book', (req, res) => {
  const clinic = typeof req.query.clinic === 'string' ? req.query.clinic.trim() : '';
  const target = clinic
    ? `/patient?clinic=${encodeURIComponent(clinic)}#booking`
    : '/patient#booking';

  if (!req.user) {
    return res.redirect('/login?next=' + encodeURIComponent(target));
  }

  if (req.user.role !== 'user') {
    return res.redirect(roleHome(req.user.role));
  }

  res.redirect(target);
});

app.get('/clinics', publicPage('clinics.html'));
app.get('/clinics.html', (req, res) => res.redirect(301, '/clinics'));

app.get('/services', publicPage('services.html'));
app.get('/services.html', (req, res) => res.redirect(301, '/services'));

app.get('/how-it-works', publicPage('how-it-works.html'));
app.get('/how-it-works.html', (req, res) => res.redirect(301, '/how-it-works'));

app.get('/contact', publicPage('contact.html'));
app.get('/contact.html', (req, res) => res.redirect(301, '/contact'));

app.get('/login', publicPage('login.html'));
app.get('/login.html', (req, res) => {
  const query = req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : '';
  res.redirect(301, '/login' + query);
});

app.get('/signup', publicPage('signup.html'));
app.get('/signup.html', (req, res) => {
  const query = req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : '';
  res.redirect(301, '/signup' + query);
});

app.get('/forgot-password', publicPage('forgot-password.html'));
app.get('/forgot-password.html', (req, res) => res.redirect(301, '/forgot-password'));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/login', loginRoute);
app.use('/signup', signupRoute);
app.use('/api/password-reset', passwordResetRoute);
app.use('/api/clinics', clinicsRoute);
app.use('/api/appointments', appointmentsRoute);
app.use('/api/contact', contactRoute);
app.use('/api/admin', adminRoute);
app.use('/api/onboarding', onboardingRoute);
app.use('/api/profile', profileRoute);
app.use('/api/meetings', meetingsRoute);
app.use('/api/chatbot', chatbotRoute);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Not found' });
  }
  res.redirect('/');
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid request body' });
  }
  console.error(err);
  res.status(500).json({ message: 'Something went wrong' });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`CarePoint running on http://localhost:${port}`);
});
