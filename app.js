const path = require('path');
const helmet = require('helmet');
const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('./db');

const {
  attachUser,
  roleHome,
  requireUserPage,
  requireClinicPage
} = require('./lib/auth');
const { clearSessionCookie, requestIsSecure } = require('./lib/session');
const { authIp, authEmail, contactIp, contactEmail, localTestBypass } = require('./lib/rate-limit');

const loginRoute = require('./routes/login');
const signupRoute = require('./routes/signup');
const passwordResetRoute = require('./routes/password-reset');
const clinicsRoute = require('./routes/clinics');
const appointmentsRoute = require('./routes/appointments');
const contactRoute = require('./routes/contact');
const clinicRoute = require('./routes/clinic');
const onboardingRoute = require('./routes/onboarding');
const profileRoute = require('./routes/profile');
const meetingsRoute = require('./routes/meetings');
const passwordChangeRoute = require('./routes/password-change');
const chatbotRoute = require('./routes/chatbot');

const app = express();
const rootDir = typeof __dirname === 'string' ? __dirname : '';
const publicDir = path.join(rootDir, 'public');
const privateDir = path.join(rootDir, 'private');

function cloudflareAssets() {
  return globalThis.__cloudflareAssets || null;
}

async function sendAsset(res, assetPath, fallbackPath) {
  const assets = cloudflareAssets();
  if (!assets) {
    return res.sendFile(fallbackPath);
  }

  const response = await assets.fetch(new Request('https://assets.local' + assetPath));
  if (response.status === 404) {
    res.status(404).send('Not found');
    return;
  }

  res.status(response.status);
  response.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (name === 'content-encoding' || name === 'content-length') return;
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", 'https://code.tidio.co', 'https://*.tidio.co'],
        connectSrc: ["'self'", 'https://*.tidio.co', 'wss://*.tidio.co'],
        imgSrc: ["'self'", 'data:', 'https://*.tidio.co'],
        frameSrc: ["'self'", 'https://*.tidio.co']
      }
    }
  })
);
if (!cloudflareAssets()) {
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      skip: localTestBypass
    })
  );
}
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
  if (req.user) {
    try {
      await pool.query('UPDATE users SET session_version = session_version + 1 WHERE id = $1', [
        req.user.id
      ]);
    } catch (err) {
      console.error('Logout session invalidation failed:', err.message);
    }
  }
  res.setHeader('Set-Cookie', clearSessionCookie({ secure: requestIsSecure(req) }));
  res.json({ message: 'Logged out' });
});

function publicPage(name) {
  return (req, res, next) => {
    sendAsset(res, '/' + name, path.join(publicDir, name)).catch(next);
  };
}

app.get('/patient', requireUserPage, (req, res, next) => {
  sendAsset(res, '/patient.html', path.join(privateDir, 'patient.html')).catch(next);
});

app.get('/patient.html', requireUserPage, (req, res) => {
  res.redirect(301, '/patient' + (req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : ''));
});

app.get('/patient.js', requireUserPage, (req, res, next) => {
  sendAsset(res, '/patient.js', path.join(privateDir, 'patient.js')).catch(next);
});

app.get('/profile', requireUserPage, (req, res, next) => {
  sendAsset(res, '/profile.html', path.join(privateDir, 'profile.html')).catch(next);
});

app.get('/profile.html', requireUserPage, (req, res) => {
  res.redirect(301, '/profile');
});

app.get('/profile.js', requireUserPage, (req, res, next) => {
  sendAsset(res, '/profile.js', path.join(privateDir, 'profile.js')).catch(next);
});

app.get('/clinic', requireClinicPage, (req, res, next) => {
  sendAsset(res, '/clinic.html', path.join(privateDir, 'clinic.html')).catch(next);
});

app.get('/clinic.html', requireClinicPage, (req, res) => {
  res.redirect(301, '/clinic');
});

app.get('/clinic.js', requireClinicPage, (req, res, next) => {
  sendAsset(res, '/clinic.js', path.join(privateDir, 'clinic.js')).catch(next);
});

app.get('/meetings', requireUserPage, (req, res, next) => {
  sendAsset(res, '/meetings.html', path.join(privateDir, 'meetings.html')).catch(next);
});

app.get('/meetings.html', requireUserPage, (req, res) => {
  res.redirect(301, '/meetings');
});

app.get('/meetings.js', requireUserPage, (req, res, next) => {
  sendAsset(res, '/meetings.js', path.join(privateDir, 'meetings.js')).catch(next);
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

if (!cloudflareAssets()) {
  app.use(express.static(publicDir));
}

app.use('/login', authIp, authEmail, loginRoute);
app.use('/signup', authIp, authEmail, signupRoute);
app.use('/api/password-reset', authIp, authEmail, passwordResetRoute);
app.use('/api/clinics', clinicsRoute);
app.use('/api/appointments', appointmentsRoute);
app.use('/api/contact', contactIp, contactEmail, contactRoute);
app.use('/api/clinic', clinicRoute);
app.use('/api/onboarding', onboardingRoute);
app.use('/api/profile', profileRoute);
app.use('/api/meetings', meetingsRoute);
app.use('/api/password-change', passwordChangeRoute);
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

module.exports = app;
