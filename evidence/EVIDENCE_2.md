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

## Preview deployment (production NOT promoted)

- Status: deployed to Preview only
- Environment: Preview, branch `agent-a-cookie-preview`
- Latest deployment ID: `de1c5215-d0cf-4696-87ad-939b9fa2c2a7` (source `f3ca8e9`)
- URL: https://de1c5215.carepoint-admin.pages.dev
- Alias (stable): https://agent-a-cookie-preview.carepoint-admin.pages.dev
- Previous deployment: `df1490b8-55b9-431f-b3cc-2341da65cedf` (source `2c9e426`)
- Production deployment still `2d39e1fe-f5ef-4e08-8f23-92a29229ecbd` (unchanged)
- Preview env secret `ADMIN_SESSION_SECRET` set via Pages API; production env vars untouched (still empty).

## Live preview verification

Command shape: `curl -D - <url>` against `https://agent-a-cookie-preview.carepoint-admin.pages.dev`

| # | Request | Status | Key response |
|---|---------|--------|--------------|
| P1 | `GET /api/session` no cookie | 401 | `set-cookie: cp_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; `{"authenticated":false}` |
| P2 | `POST /api/login` no Origin | 403 | `{"message":"Request blocked."}` |
| P3 | `POST /api/login` Origin + invalid creds | 401 | `{"message":"Invalid email or password."}` (proves preview secret + Supabase wiring: not a 500) |
| P4 | `POST /api/logout` Origin | 200 | `set-cookie: cp_admin_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; `{"ok":true}` |
| P5 | `GET /api/db/admin_users` no cookie | 401 | clearing Set-Cookie + `{"message":"Please sign in again."}` |

Static page CSP confirmed live: `connect-src 'self'` only.
Real cookie attributes observed on the deployed preview: `HttpOnly; Secure; SameSite=Strict`.

## Live success-path verification (real admin account, password not recorded)

Root cause of the first login failure: `GET /auth/v1/factors` returns **405** on this Supabase version, so `/api/mfa/enroll` returned 502 and the UI showed the generic sign-in error. Fixed in `f3ca8e9` by listing factors from `GET /auth/v1/user` (`user.factors`).

| Step | Request | Status | Result |
|------|---------|--------|--------|
| L1 | `POST /api/login` (real admin) | 200 | `{"ok":true,"aal":"aal1","mfa":true}` + HttpOnly/Secure/SameSite=Strict cookie |
| L2 | `GET /api/session` with cookie | 200 | `{"authenticated":true,...,"aal":"aal1"}` |
| L3 | `POST /api/mfa/enroll` | 200 | `{"enrolled":true,"factor":{"id":"f85b6f5c-..."}}` (existing verified TOTP) |
| L4 | `POST /api/mfa/verify` bogus code | 400 | `{"message":"That code is invalid. Try again."}` (challenge+verify wiring works) |

## Blockers / notes (honest status)

- Full AAL2 completion still needs the account holder's authenticator 6-digit code; that cannot be automated without the TOTP secret. The verify path is proven by L4 (challenge 200, invalid code 400).
- One real admin action (ban/unban, status change, reply) still needs a completed AAL2 login to prove end-to-end.
- Supabase project mismatch: the deployed admin app, RLS SQL, and the API are configured for `upldnuraxojivoqvckzt.supabase.co`. The credentials in the task message are for `poyuxheefybloqywdxac`. I did NOT switch projects (that would break the admin app); I used the project the app is actually wired to.
- No service_role key used. Data requests are forwarded with the admin's own access token, so RLS still applies.
- The given `cfat_...`, `ghp_...`, and service_role/secret values were pasted in chat. They should be rotated; none were written to the repo.
