# Forms and buttons audit

Scope: every `form`, `button`, submit control and click-action element in `public/`, `private/` and `admin-app/`. Admin app was audited read-only; no admin file was changed.

Date: 2026-11-25. Evidence: `evidence/EVIDENCE_8.md`. Test users were throwaway (`forms.audit.*@example.com`) and were deleted after the run. No secrets or token values appear in either document.

Verification keys:
- `Pnn` / `Dnn` — real HTTP call to the live site (`https://carepoint-15l.pages.dev`) or live admin app (`https://carepoint-admin.pages.dev`).
- `Unn` / `Cnn` / `Ann` — real HTTP call on a local instance of the same code using the same live Postgres database, with a minted session cookie for a throwaway user (`U`) or throwaway clinic (`C`).
- `S` — static source inspection plus a successful page GET (client-only control, no endpoint).

Result values: `OK`, `OK (client-only)`, `Expected reject`, `BROKEN`, `Not run (see note)`.

## public/

Shared header on `403.html`, `404.html`, `500.html`, `clinics.html`, `contact.html`, `how-it-works.html`, `index.html`, `services.html`

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| all listed | `button#navToggle` | Opens/closes mobile nav (`public/ui.js`) | none, DOM only | S; P01–P05 pages 200 | OK (client-only) |
| all listed | `a#loginLink` ("Log in") | Navigates to `/login` | none | P02 200 | OK |
| all listed | `a#bookLink` ("Book an appointment/visit") | Navigates to `/book`; anonymous users get login redirect | none | live `GET /book` 302 to login | OK |
| all listed | `a#portalLink` ("My portal", hidden by default) | `public/site.js` shows it after `/api/session` returns a user; links `/patient` | `GET /api/session` | P06-adjacent: `GET /api/session` 200; U01 200 with user | OK |
| all listed | dynamic `a#headerProfileLink` | Built by `public/site.js` from session avatar; links `/profile` | `GET /api/session` | S; U11 200 | OK (client-only) |
| 403/404/500 | `a#errorHomeAction` | Links `/` | none | P01 200 | OK |
| 403/404/500 | `a[href="/clinics"]` ("Browse clinics") | Links `/clinics` | none | P05 200 | OK |

`index.html`, `clinics.html`, `contact.html`, `how-it-works.html`, `services.html` content controls

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| index | `a.js-book` hero CTA (×2) | Links `/book` | none | live `GET /book` 302 | OK |
| index | `a[href="/how-it-works"]` | Links `/how-it-works` | none | live 200 | OK |
| index/services/how-it-works | `a[href="/clinics"]` | Links `/clinics` | none | P05 200 | OK |
| index/how-it-works | `a[href="/signup"]` | Links `/signup` | none | P03 200 | OK |
| services | `a[href="/contact"]` | Links `/contact` | none | P04 200 | OK |
| contact | `a.clinics-contact-btn` | Links `/contact` | none | P04 200 | OK |
| clinics | dynamic `.chip[data-specialty]` (injected by `public/site.js`) | Filters clinic cards by specialty, client-side | `GET /api/clinics` | P06 200; S | OK (client-only) |
| clinics | `input` search box | Filters clinic cards by text, client-side | none | S | OK (client-only) |
| clinics | dynamic `button.js-clinic-book[data-clinic]` | Navigates `/book?clinic=<id>` | none | S; live `/book` 302 | OK |
| clinics | dynamic `button.js-clear-search` | Clears search and specialty filter | none | S | OK (client-only) |
| contact | `form#contactForm` with name/email/subject/message + `button#contactBtn` (submit) | Validates, then posts the message | `POST /api/contact` → `INSERT contact_messages` | P08 201 valid, P09 400 empty | OK |
| any page with widget | `button#cpChatToggle`, `button#cpChatClose` (injected by `public/chatbot.js`) | Opens/closes chat panel | none | S; P07 200 | OK (client-only) |
| any page with widget | dynamic suggestion `button` chips | Fills/sends a suggested question | `POST /api/chatbot/message` | P10 200; S | OK |
| any page with widget | `form#cpChatForm` + `button#cpChatSend` (submit) | Sends chat message with last 10 history entries | `POST /api/chatbot/message` (no DB write in repo) | P10 200 | OK |
| error pages | `button` "Stay on this page" (injected by `public/error-client.js`) | Cancels the 3 s redirect overlay | none | S | OK (client-only) |
| index | `<video id="heroVideo">` autoplay/loop handlers (`public/hero-video.js`) | Keeps muted hero video playing; no form/control | none | S | OK (client-only) |

`login.html` (`public/script.js`)

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| login | `form#loginForm` + `button#loginBtn` (submit) | Sends email/password/remember | `POST /login` (session cookie on success) | P14 401 wrong password; P15 403 unverified | OK |
| login | `button#toggleBtn` ("Show"/"Hide") | Toggles password input type | none | S | OK (client-only) |
| login | `button#resendVerificationBtn` | Shown on `canResendVerification`; resends account verification code | `POST /signup/resend-verification` | P18 405 live; A05 400 (route works locally) | **BROKEN live** (deployment config, not public code) |
| login | `form#twoFactorForm` + `button#verifyBtn` (submit) | Submits 6-digit login code | `POST /login/verify` | P16 405 live; A02 400 (route works locally) | **BROKEN live** (deployment config) |
| login | `button#resendBtn` | Resends login code | `POST /login/resend` | P17 405 live; A04 400 locally | **BROKEN live** (deployment config) |
| login | `button#backBtn` | Returns to credentials step | none | S | OK (client-only) |

`signup.html` (`public/signup.js`)

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| signup | `form#signupForm` + `button#signupBtn` (submit) | Validates names/email/password and creates account | `POST /signup` → `INSERT users`, `INSERT signup_codes` | P11 201 with throwaway user | OK |
| signup | `form#signupVerifyForm` + `button#verifySignupBtn` (submit) | Verifies 6-digit email code | `POST /signup/verify` → users.email_verified_at, session cookie | P12 405 live; A01 200 locally | **BROKEN live** (deployment config) |
| signup | `button#resendSignupBtn` | Requests a new signup code | `POST /signup/resend` → new signup_codes row | P13 405 live; A03 400 locally | **BROKEN live** (deployment config) |
| signup | `button#backToSignupBtn` | Returns to signup step | none | S | OK (client-only) |

`forgot-password.html` (`public/forgot-password.js`)

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| forgot-password | `form#requestForm` + `button#requestBtn` (submit) | Requests password reset code | `POST /api/password-reset/request` → `INSERT password_reset_codes` | P19 200 | OK |
| forgot-password | `form#resetForm` + `button#resetBtn` (submit) | Sets new password from challenge + 6-digit code | `POST /api/password-reset/verify` → users.password_hash, session_version | P20 400 bogus code | OK (reachable; success needs real email code) |
| forgot-password | `button#backBtn` | Returns to request step | none | S | OK (client-only) |
| forgot-password | `button#navToggle` | Mobile nav | none | S | OK (client-only) |

## private/

`patient.html` (`private/patient.js`)

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| patient | `a[href="#booking"]` ("Book an appointment") | Scrolls to booking form | none | S; U10 200 | OK (client-only) |
| patient | `button#zoomHeroBtn` | Scrolls to booking and preselects online visit | none | S | OK (client-only) |
| patient | `button#logoutBtn` | Ends session | `POST /logout` | U18 200 | OK |
| patient | `button.nav-toggle` | Mobile nav | none | S | OK (client-only) |
| patient | `form#bookingForm`: clinic/date/time/reason selects + `button[data-visit-type]` (in-person/online) + `button#bookBtn` (submit) | Creates appointment; online also requests Zoom meeting | `POST /api/appointments` → `INSERT appointments` | U06 201 valid conflict-free booking; U06b 409 duplicate slot | OK |
| patient | `button[data-cancel]` (injected per appointment) | Cancels own appointment | `PATCH /api/appointments/:id` `{status:'Cancelled'}` | U08 200 | OK |
| patient | `button[data-reschedule]` (injected) | Opens reschedule modal | none | S | OK (client-only) |
| patient | `form#rescheduleForm` + submit "Reschedule" | Changes date/time/reason/visit type | `PATCH /api/appointments/:id` | U07 200 | OK |
| patient | `button#rescheduleModalClose`, `button#rescheduleFormCancel`, backdrop click | Closes modal | none | S | OK (client-only) |
| patient | `button#editCareProfile` ("Update") | Opens onboarding form | `GET /api/onboarding` | U04 200; S | OK |
| patient | `form#onboardingForm` + `button[data-condition]` chips + `button#onboardingBack`, `button#onboardingNext`, `button#onboardingDone` | Multi-step care profile; final step saves | `POST /api/onboarding` → `INSERT/UPDATE onboarding_profiles`, users.onboarding_completed_at | U05 200 | OK |

`profile.html` (`private/profile.js`)

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| profile | `input[type=file]#avatarInput` | Reads image into data URL for save; routed through shared validation (`lib/file-validation.js`) | included in `PUT /api/profile` as avatar_url | U14 200 with avatar_url null; file path covered by task 4 evidence | OK |
| profile | `button#removeAvatar` | Clears avatar preview and queues avatar_url null | `PUT /api/profile` on Save | U14 200 | OK |
| profile | `form#profileForm` + `button#saveProfile` (submit) | Saves first/last name, phone, optional avatar | `PUT /api/profile` → `UPDATE users` | U13 200; U14 200 | OK |
| profile | `form#passwordForm` + `button#changePasswordBtn` (submit) | Changes password; invalidates other sessions | `POST /api/password-change` → users.password_hash, session_version | U15 401 wrong old; U16 200 correct; U17 session_expired | OK |
| profile | `button#logoutBtn` | Ends session | `POST /logout` | U18 200 | OK |
| profile | `a#portalLink`, `a[href="/patient"]` | Navigation | none | U10 200 | OK |

`clinic.html` (`private/clinic.js`)

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| clinic | `button[data-view]` ×4 (overview/appointments/doctors/profile) | Switches dashboard view | none | S; C02 200 | OK (client-only) |
| clinic | `button[data-goto]` ×2 ("Edit profile", "View all") | Switches view | none | S | OK (client-only) |
| clinic | `button#logoutBtn` | Ends session | `POST /logout` | U18 200 (same shared endpoint) | OK |
| clinic | `form#doctorForm` + `button#doctorSaveBtn` (submit), `button#doctorCancelBtn` | Adds or edits doctor | `POST /api/clinic/doctors` → `INSERT doctors`; `PUT /api/clinic/doctors/:id` → `UPDATE doctors` | C09 201, C13 200, C10 400 invalid | OK |
| clinic | `button[data-doctor-edit]` (injected) | Loads doctor into form | `GET /api/clinic/doctors` | C05 200; S | OK |
| clinic | `button[data-doctor-delete]` (injected) | Deletes doctor after confirm | `DELETE /api/clinic/doctors/:id` | C14 200 | OK |
| clinic | `form#clinicProfileForm` + `button#clinicProfileSave` (submit) | Saves clinic details | `PUT /api/clinic/profile` → `UPDATE clinics` | C08 200 on throwaway clinic id 19 | OK |
| clinic | `select[data-status]` in appointments table | Changes appointment status | `PATCH /api/clinic/appointments/:id` | C16 200 Confirmed | OK |
| clinic | `button[data-patient-details]` (injected) | Opens patient detail modal | `GET /api/clinic/appointments/:id/patient` | C15 200 | OK |
| clinic | `button#patientModalClose`, backdrop click, `select#apptStatusFilter` | Closes modal / filters list | none (client-side filter) | S; C04 200 | OK (client-only) |

`meetings.html` (`private/meetings.js`)

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| meetings | `button#refreshMeetings` | Reloads meetings | `GET /api/meetings` | U09 200 | OK |
| meetings | `button[data-copy-link]` (injected) | Copies Zoom join URL to clipboard | none | S; U09 200 payload has meetings support | OK (client-only) |
| meetings | `a[href="/patient?online=1#booking"]` ("Create Zoom meeting") | Navigates to booking | none | U12 200 meetings page, `/patient` U10 200 | OK |
| meetings | `button#logoutBtn`, `button.nav-toggle` | Logout / mobile nav | `POST /logout` | U18 200 | OK |

## admin-app/ (read-only audit; no files changed)

`index.html`, `login.js`

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| admin login | `form#adminLoginForm` + `button#loginBtn` (submit) | Signs in with email/password | `POST /api/login` (HttpOnly cookie) | D01 200 page, D02 401 bad creds | OK |
| admin login | `button#toggleBtn` | Show/hide password | none | S | OK (client-only) |
| admin login | `form#mfaForm` + `button#mfaBtn` (submit), `a#mfaBack` | TOTP verification / back to login | `POST /api/mfa/verify`, `POST /api/logout` | D04 401 no cookie; full AAL2 needs the account holder's code | Not run (needs real TOTP) |
| admin login | `a[href="/forgot-password.html"]` if shown | Links password reset | none | `GET /forgot-password.html` 200 | OK |

`admin.html`, `admin.js`

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| admin | `button[data-view]` ×4 | Switches view | none | D01 200 page; S | OK (client-only) |
| admin | `button[data-goto]` ×2 | Switches view | none | S | OK (client-only) |
| admin | `button#logoutBtn` | Revokes admin session | `POST /api/logout` | D09 200 | OK |
| admin | `button[data-user-view]` (injected) | Opens account profile modal | `GET /api/db/...` | D10 401 no cookie; S | OK (auth guard) |
| admin | `button[data-user-ban]`, `button[data-profile-ban]` | Ban/unban user after reauth | `POST /api/action/users/:id` + `POST /api/reauth` | D05 401 no cookie; S | OK (auth guard; AAL2 not run) |
| admin | `button[data-user-delete]`, `button[data-profile-delete]` | Delete user after reauth | `DELETE /api/action/users/:id` | D05 401; S | OK (auth guard) |
| admin | `select[data-status]` in appointments | Changes appointment status | `PATCH /api/action/appointments/:id/status` | D10 401 no cookie; S | OK (auth guard) |
| admin | `form.reply-form[data-id]` + `button` "Send reply" (injected) | Replies to a contact message | `POST /api/action/reply` | D06 401 no cookie | OK (auth guard) |
| admin | `form#reauthForm` + `button#reauthSubmit`, `button#reauthCancel` | AAL2 step-up before destructive action | `POST /api/reauth` | D05 401 no cookie | OK (auth guard) |
| admin | `button#patientModalClose`, backdrop click, `select#apptStatusFilter`, `select#messageFilter` | Close modal / client-side filters | none | S | OK (client-only) |

`forgot-password.html` / `reset-password.html` (admin app)

| Page | Element | What it does | Endpoint or DB write | How verified | Result |
| --- | --- | --- | --- | --- | --- |
| admin forgot | `form#forgotForm` + `button#submitBtn` | Requests admin reset link | `POST /api/password/forgot` | D07 200 | OK |
| admin reset | `form#resetForm` + `button#submitBtn` | Sets new admin password from link token | `POST /api/password/reset` | D08 400 invalid token | OK |

## Findings

1. **Live nested auth endpoints return 405** (`P12`, `P13`, `P16`, `P17`, `P18`): `/signup/verify`, `/signup/resend`, `/login/verify`, `/login/resend`, `/signup/resend-verification`. The same handlers return normal JSON on the local instance (`A01`–`A05`). Cause: the Cloudflare Pages `run_worker_first` allowlist in root `wrangler.worker.jsonc` does not include these nested paths, so the asset layer answers 405 before the Worker runs. Fix belongs to the deployment config owner, outside this task's `public/` and `private/` area. Logged, not changed here.
2. `POST /api/appointments` correctly rejects duplicate clinic/date/time with 409 (`U06b`).
3. Password change correctly expires the old session (`U16` 200 → `U17` `session_expired`).
4. No broken control was found whose fix lives in `public/` or `private/`; therefore no source fix was made. Admin app is read-only in this task.
5. Cleanup: throwaway users 76/77, clinic 19, doctor 14, appointment 36, onboarding profile, signup/reset codes and the test contact message were deleted (see evidence header).
