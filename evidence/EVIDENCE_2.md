# EVIDENCE 2 — HttpOnly admin session (Agent A)

Task: move admin auth off browser storage to HttpOnly, Secure, SameSite=Strict cookie.
Area: admin-app/ and admin Pages Functions only. Production untouched.

## Rollback point (saved before changes)

- Admin Pages project: `carepoint-admin`
- Current production deployment: `2d39e1fe-f5ef-4e08-8f23-92a29229ecbd`
  - URL: https://2d39e1fe.carepoint-admin.pages.dev
  - Branch: `main`, source commit `3dedf44`, deployed ~20h before this task
- Repo HEAD before changes: `5056230`
- Cloudflare account: `71bb4bc2b498342e252eefd2cf0fdac7`

## Local verification (wrangler pages dev, isolated dir, local test secret)

Command shape:
`wrangler pages dev . --port 8790 --binding ADMIN_SESSION_SECRET=<local-test>`
(run with CWD = a copy of `admin-dist/` so admin Functions are used)

| # | Request | Status | Key response |
|---|---------|--------|--------------|
| 1 | `GET /api/session` no cookie | 401 | `Set-Cookie: cp_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; body `{"authenticated":false}` |
| 2 | `POST /api/login` no Origin | 403 | `{"message":"Request blocked."}` (Origin guard rejects mutation) |
| 3 | `POST /api/login` Origin + invalid creds | 401 | `{"message":"Invalid email or password."}` (reached Supabase server-side) |
| 4 | `POST /api/logout` with Origin | 200 | `Set-Cookie: cp_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; body `{"ok":true}` |
| 5 | `GET /api/db/admin_users` no cookie | 401 | `{"message":"Please sign in again."}` + clearing Set-Cookie |

Cookie attributes confirmed present on both issued and cleared cookies: `HttpOnly`, `Secure`, `SameSite=Strict`.

## Build / schema checks

- `npm run build:admin` succeeded; `admin-dist/functions/` contains 11 function files.
- `node --check` passed on every new/changed admin JS file.
- No `localStorage`, `sessionStorage`, `persistSession`, `supabase-js` usage remains in `admin-app/*.js`.
- CSP `connect-src 'self'` (external Supabase and public-site origins removed).

## Preview deployment

- Status: PENDING (filled after preview deploy)
- URL:
- Deployment ID:

## Blockers / notes (honest status)

- **Success-path login, MFA verify, and one admin action are NOT yet tested live** because no admin test password was supplied. The endpoints are implemented and reach Supabase, but a real admin credential is required to prove the 200 + new-cookie path.
- Supabase project mismatch: the deployed admin app, RLS SQL, and the API are configured for `upldnuraxojivoqvckzt.supabase.co`. The credentials in the task message are for `poyuxheefybloqywdxac`. I did NOT switch projects (that would break the admin app); I used the project the app is actually wired to.
- No service_role key used. Data requests are forwarded with the admin's own access token, so RLS still applies.
- The given `cfat_...`, `ghp_...`, and service_role/secret values were pasted in chat. They should be rotated; none were written to the repo.
