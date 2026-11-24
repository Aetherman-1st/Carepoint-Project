const path = require('path');
const helmet = require('helmet');
const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('./db');

const {
  attachUser,
  roleHome
} = require('./lib/auth');
const { clearSessionCookie, requestIsSecure } = require('./lib/session');
const { authIp, authEmail, contactIp, contactEmail, localTestBypass } = require('./lib/rate-limit');
const { createOriginGuard } = require('./lib/csrf');
const { requestTrace } = require('./lib/trace');

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
const filesRoute = require('./routes/files');
const adminRoute = require('./routes/admin');
const adminAuthRoute = require('./routes/admin-auth');

const app = express();
const rootDir = typeof __dirname === 'string' ? __dirname : '';
const publicDir = path.join(rootDir, 'public');
const privateDir = path.join(rootDir, 'private');
const ADMIN_APP_URL = process.env.ADMIN_APP_URL || 'https://carepoint-admin.pages.dev';
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || 'https://carepoint-15l.pages.dev';

function cloudflareAssets() {
  return globalThis.__cloudflareAssets || null;
}

async function sendAsset(res, assetPath, fallbackPath, statusOverride) {
  const assets = cloudflareAssets();
  if (!assets) {
    if (statusOverride) res.status(statusOverride);
    return res.sendFile(fallbackPath);
  }

  const response = await assets.fetch(new Request('https://assets.local' + assetPath));
  if (response.status === 404) {
    res.status(404).send('Not found');
    return;
  }

  res.status(statusOverride || response.status);
  response.headers.forEach((value, key) => {
    const name = key.toLowerCase();
    if (name === 'content-encoding' || name === 'content-length') return;
    res.setHeader(key, value);
  });
  res.end(Buffer.from(await response.arrayBuffer()));
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(requestTrace);
app.use(express.json({ limit: '1mb' }));
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", 'https://code.tidio.co', 'https://*.tidio.co'],
        connectSrc: ["'self'", 'https://*.tidio.co', 'wss://*.tidio.co'],
        imgSrc: ["'self'", 'data:', 'https://*.tidio.co'],
        mediaSrc: ["'self'", 'https://*.tidio.co'],
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
app.use(createOriginGuard({ allowedOrigins: [ADMIN_APP_URL, PUBLIC_ORIGIN] }));

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

function loginRedirectFor(req) {
  const reason = req.accountStatus ? '&account=' + req.accountStatus : '';
  return '/login?next=' + encodeURIComponent(req.originalUrl) + reason;
}

function sendErrorPage(res, status, query) {
  const suffix = query || '';
  return sendAsset(
    res,
    '/' + status + '.html' + suffix,
    path.join(publicDir, status + '.html'),
    status
  );
}

function requirePageRole(role, deniedFor) {
  return (req, res, next) => {
    if (!req.user) return res.redirect(loginRedirectFor(req));
    if (req.user.role !== role) {
      return sendErrorPage(res, 403, '?for=' + encodeURIComponent(deniedFor)).catch(next);
    }
    next();
  };
}

const requirePatientPage = requirePageRole('user', 'patient');
const requireClinicOnlyPage = requirePageRole('clinic', 'clinic');

app.get('/patient', requirePatientPage, (req, res, next) => {
  sendAsset(res, '/patient.html', path.join(privateDir, 'patient.html')).catch(next);
});

app.get('/patient.html', requirePatientPage, (req, res) => {
  res.redirect(301, '/patient' + (req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : ''));
});

app.get('/patient.js', requirePatientPage, (req, res, next) => {
  sendAsset(res, '/patient.js', path.join(privateDir, 'patient.js')).catch(next);
});

app.get('/profile', requirePatientPage, (req, res, next) => {
  sendAsset(res, '/profile.html', path.join(privateDir, 'profile.html')).catch(next);
});

app.get('/profile.html', requirePatientPage, (req, res) => {
  res.redirect(301, '/profile');
});

app.get('/profile.js', requirePatientPage, (req, res, next) => {
  sendAsset(res, '/profile.js', path.join(privateDir, 'profile.js')).catch(next);
});

app.get('/clinic', requireClinicOnlyPage, (req, res, next) => {
  sendAsset(res, '/clinic.html', path.join(privateDir, 'clinic.html')).catch(next);
});

app.get('/clinic.html', requireClinicOnlyPage, (req, res) => {
  res.redirect(301, '/clinic');
});

app.get('/clinic.js', requireClinicOnlyPage, (req, res, next) => {
  sendAsset(res, '/clinic.js', path.join(privateDir, 'clinic.js')).catch(next);
});

app.get('/meetings', requirePatientPage, (req, res, next) => {
  sendAsset(res, '/meetings.html', path.join(privateDir, 'meetings.html')).catch(next);
});

app.get('/meetings.html', requirePatientPage, (req, res) => {
  res.redirect(301, '/meetings');
});

app.get('/meetings.js', requirePatientPage, (req, res, next) => {
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

app.use('/login', authIp, loginRoute);
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
app.use('/api/files', filesRoute);
app.use('/admin-auth', (req, res, next) => {
  const origin = req.get('origin');
  if (origin === ADMIN_APP_URL) {
    res.setHeader('Access-Control-Allow-Origin', ADMIN_APP_URL);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/admin-auth', adminAuthRoute);
app.use('/api/admin', (req, res, next) => {
  const origin = req.get('origin');
  if (origin === ADMIN_APP_URL) {
    res.setHeader('Access-Control-Allow-Origin', ADMIN_APP_URL);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use('/api/admin', adminRoute);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'Not found', traceId: req.traceId });
  }
  sendErrorPage(res, 404).catch(() => {
    res.status(404).type('text').send('Page not found');
  });
});

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid request body', traceId: req.traceId });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'File is too large.', traceId: req.traceId });
  }
  console.error(err);
  if (res.headersSent) return next(err);

  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ message: 'Something went wrong', traceId: req.traceId });
  }

  const status = Number(err && (err.status || err.statusCode));
  const pageStatus = status === 403 ? 403 : status === 404 ? 404 : 500;
  sendErrorPage(res, pageStatus).catch(() => {
    res.status(pageStatus).type('text').send('Something went wrong');
  });
});

module.exports = app;
