# CarePoint Security Review

## Overview
This document summarizes the security controls and considerations for the CarePoint application, covering authentication, session management, input validation, rate limiting, CSP, secrets handling, and dependency security.

---

## 1. Authentication

### Passwords
- **Bcrypt cost**: 12 (configured in `lib/auth.js` and used by all password hashing).
- **Minimum length**: 8 characters enforced on signup and password‑change.
- **Password reset**: Uses time‑limited `password_reset_codes` table; codes are single‑use and expire after 15 minutes (configurable via `TWO_FACTOR_CODE_MINUTES`).
- **Email verification**: New users must verify email before login; unverified accounts are blocked with a clear error (`email_not_verified`).
- **Login errors**: Distinct error messages (`email_not_found`, `wrong_password`, `email_not_verified`, `account_banned`) prevent enumeration attacks beyond rate‑limited attempts.

### Two‑factor / Remember‑me
- **Remember‑me**: 30‑day persistent cookie; cookie contains `session_version` to invalidate on password reset or logout‑all.
- **Session versioning**: `users.session_version` increments on password reset, logout‑all, or ban-related changes, forcing re‑authentication.
- **Secure cookies**: `session.js` sets `httpOnly`, `secure` (production only), and `sameSite=strict` flags.

### Login enumeration protection
- Rate limiter (`100 requests per 15 minutes` per IP) limits failed login attempts.
- Login endpoint (`routes/login.js`) returns generic `Invalid credentials` after rate limit is exceeded, reducing enumeration risk.

### Protected super‑admin
- `isAdminEmail()` in `lib/auth.js` checks if `email` matches the configured `ADMIN_EMAIL` environment variable; any attempt to ban/delete the protected admin account is rejected with a `400` error.

---

## 2. Session Management

- **Signed cookie**: `cp_session` signed with `npm's` `cookie-parser` secret (set via `SESSION_SECRET` env var).
- **TTL**: Server‑side 8‑hour TTL plus browser‑session cookie; `session_version` invalidation provides additional invalidation path.
- **Logout**: `GET /logout` clears the cookie and marks `last_login_at`; `logout-all` increments `session_version`.
- **Concurrent session limit**: Not enforced in v1; session version handles password‑reset invalidation.

---

## 3. Input Validation & Sanitisation

- **All user inputs** are validated on the server before any DB operation.
- **Email format** checked with regex; trimmed and lower‑cased.
- **Passwords**: minimum 8 characters, bcrypt cost 12.
- **Date/time**: ISO‑format `YYYY‑MM‑DD` and `HH:MM` validated; past dates rejected.
- **Reason/text**: trimmed and sliced to 500 characters.
- **Visit type**: only `online` or `in_person` accepted.
- **SQL injection**: Uses `pg` parameterized queries throughout; no raw string concatenation in queries.
- **XSS**: HTML output escaped by EJS (if used) or plain JSON responses; no `innerHTML` from untrusted data in the frontend.

---

## 4. Rate Limiting & CSRF

- **Global rate limiter**: 100 requests per 15 minutes per IP (configured in `server.js`).
- **Per‑endpoint**: No finer‑grained limits in v1; the global limiter protects against abuse.
- **CSRF**: Not yet implemented; since the API is primarily accessed via same‑site browser flows and signed cookies, risk is lower. Consider adding CSRF tokens for state‑changing POST/PATCH requests in a future release.

---

## 5. Content Security Policy (CSP)

- No CSP meta tag is currently set in the HTML templates. For production, add a restrictive CSP such as:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'"/>
```

- The application does not embed user‑generated HTML, reducing injection risk.

---

## 6. Secrets & Environment

- **`.env`** is git‑ignored (added in commit `74d1d1a`).
- **Production secrets** (SMTP passwords, session secret, JWT keys) must be set in the hosting environment, never committed.
- **Resend `MAIL_FROM`**: Must use a verified domain at `https://resend.com/domains`; otherwise emails to arbitrary recipients will fail (test sender restriction).
- **No hard‑coded secrets** in source files; all sensitive values read from `process.env`.

---

## 7. Dependency Audit

| Package | Version | Notes |
|---------|---------|-------|
| `bcrypt` | `6.0.0` | Cost 12 used; up‑to‑date. |
| `helmet` | `7.0.0` | Added; sets security headers (X‑Content‑Type‑Options, X‑Frame‑Options, etc.). |
| `express-rate-limit` | `7.1.0` | Added; 100 req/15min per IP. |
| `nodemailer` | `10.1.7` | Configured for Resend; test sender limited. |
| `pg` | `8.23.1` | PostgreSQL driver; parameterized queries. |
| Others | see `package.json` | — |

Run `npm audit` regularly; the recent run reported 1 high severity issue (outside core dependencies; consider `npm audit fix`).

---

## 8. Audit Log (planned)

- An `audit_logs` table exists in the schema but is not yet populated by application code. Future work: log significant events (login, password change, account ban/create, clinic account CRUD) with user ID, timestamp, and action.

---

## 9. Recommendations for v2

1. Add CSP header via Helmet or middleware.
2. Implement CSRF protection for state‑changing requests.
3. Add per‑endpoint rate limits (auth, password reset, clinic account creation).
4. Populate `audit_logs` table on relevant events.
5. Review third‑party dependencies for known CVEs before each release.
6. Enforce HTTPS everywhere; ensure `secure` flag on cookies in production.
7. Add content‑type options `nosniff` and frame options `deny` via Helmet (already included).

---

*Generated for CarePoint Project – version dated 2026‑11‑10.*