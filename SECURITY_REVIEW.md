# CarePoint Security Review

Updated: 2026-11-19

## 1. Authentication

- Passwords are hashed with bcrypt cost 12; signup and password change require at least 8 characters.
- Login and signup/reset codes are single-use, expire after 10 minutes by default, and use hashed values.
- Public login returns the same `401 Invalid email or password.` response for an unknown email and a wrong password. `signup/resend-verification` does the same.
- Banned, unverified and admin-account states are only disclosed after the password has matched.
- Admin sign-in is separate, requires an `admin_members` row, and requires TOTP MFA at AAL2.
- Sensitive admin actions require password re-entry; the step-up window is 5 minutes.
- Admin forgot/reset password pages are available at the admin origin.

## 2. Sessions and CSRF

- The public app uses an HMAC-signed `cp_session` cookie with `HttpOnly` and `SameSite=Lax`; `Secure` is set in production.
- Session lifetime is 8 hours, or 30 days with remember-me. `users.session_version` invalidates cookies after password reset, logout and ban changes.
- State-changing cookie requests must have a same-host `Origin` or `Referer`; the configured admin origin is also allowed. Bearer-token admin API calls skip this check because browsers do not attach bearer tokens automatically.
- Every response includes an `X-Request-Id` trace header; final error responses also include `traceId`.

## 3. Authorization and Data Access

- Public API authorization is enforced server-side per endpoint and per record; clinics are limited to their own clinic, doctors and appointments.
- Clinics receive patient name, age, phone, conditions and medications for their own appointments. Patient email is not returned to clinics.
- Admin actions go through Worker endpoints that verify the Supabase user, require AAL2, require `admin_members`, and enforce appointment transitions.
- Admin accounts linked through `admin_members` are protected from ban/delete in both the Worker endpoint and the RLS migration.
- Appointment status changes are limited to Pending -> Confirmed/Cancelled and Confirmed -> Completed/Cancelled. Patients cannot cancel past appointments.
- The `is_admin_aal2` database function is live and tested. The full RLS policy rewrite and database audit/status triggers are authored in `supabase/security.sql` but could not be applied because the application DB role does not own the admin tables. Apply that migration as `postgres` to complete DB-level enforcement.

## 4. Input Validation and Uploads

- SQL uses parameterized `pg` queries.
- Dates use `YYYY-MM-DD`, times use `HH:MM`, appointment reason is limited to 500 characters, and past booking/rescheduling is rejected.
- Clinic image URLs must be local paths starting with `/`; external URLs and `..` traversal are rejected.
- Uploads are limited to JPG/PNG/PDF, 2 MB, with extension, MIME and signature checks. Files are stored in Postgres and downloaded only by their owner.
- There is no antivirus engine on Cloudflare Workers. Files use the honest scan result `structural_pass_no_av`.

## 5. Rate Limiting

- Auth: 30 requests/minute per IP and 10/minute per email.
- Contact: 5 requests/minute per IP and 5/minute per email.
- Uploads: 20/minute per user through a durable Worker rate-limit binding.
- Non-Worker local runs also use a 100 requests/15-minute global limiter.

## 6. Headers and CSP

- The public app uses Helmet CSP with allowances only for CarePoint and Tidio.
- The admin app sets a strict CSP, `frame-ancestors 'none'`, `nosniff`, no-referrer, HSTS, and `Cache-Control: no-store` through `admin-app/_headers`.
- Scripts are external files; inline event handlers are not used.

## 7. Audit Logging

- `audit_logs` records public login failures, lockouts, successful logins, password changes and resets.
- Admin Worker endpoints record bans, unbans, deletes, appointment status changes and contact replies.
- Database triggers for direct admin-table changes are authored in `supabase/security.sql` but remain blocked by table ownership.
- Audit details avoid passwords, codes, tokens and full request bodies.

## 8. Secrets and Configuration

- `.env` and `.dev.vars` are not committed.
- Production secrets must be set in Cloudflare, including `SESSION_SECRET`, SMTP credentials, Supabase values and Zoom values.
- The Supabase publishable key is public by design. No service-role key or Supabase management token is stored in the repository.
- Hosted Supabase Auth settings (SMTP, redirect URLs, JWT lifetime, rate limits) were not changed because management access is unavailable.

## 9. Dependency Notes

- Run `npm audit` and `npm test` before each release.
- Current automated tests cover safe uploads, CSRF origin checks and trace headers.

## 10. Known Limitations

- Admin Supabase tokens use the SDK default browser persistence (`localStorage`), not an HttpOnly cookie.
- The full AAL2 RLS policies and DB audit/status triggers require a `postgres`-owned migration.
- Workers cannot run ClamAV; upload scanning is structural validation only.
- CSRF uses Origin/Referer validation rather than per-form synchronizer tokens.
