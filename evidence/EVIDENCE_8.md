# EVIDENCE 8 — forms and buttons audit (Agent B)

Date: 2026-11-25. No secrets or tokens are recorded; cookies/challenges are masked.

Environments:
- LIVE = `https://carepoint-15l.pages.dev` (production Pages site, real API).
- ADMIN = `https://carepoint-admin.pages.dev` (production admin app, read-only audit).
- LOCAL = `http://127.0.0.1:3199` (`node -r dotenv/config server.js`, same repo code, same real Supabase Postgres via pooler port 6543). Used only where a live session cookie cannot be obtained (see 405 finding below).
- Throwaway users: ids 76 and 77, `forms.audit.*@example.com`; throwaway clinic id 19; throwaway doctor id 14; appointment id 36. All deleted after the run (cleanup counted 1 appointment, 1 onboarding, 2 signup codes, 1 reset code, 1 contact message, 1 clinic, 2 users).

Command shape (all calls): `curl -sS -w '\n%{http_code}' -X <METHOD> <URL> -H 'Origin: <same origin>' -H 'Content-Type: application/json' -H 'Cookie: cp_session=<masked>' --data '<payload>'`

One line per tested item: `id | request | status | short response`.

```
P01 | GET LIVE / | 200 | <!DOCTYPE html> ... <title>CarePoint | Clinic appointments</title>
P02 | GET LIVE /login | 200 | <!DOCTYPE html> ... <title>Log in | CarePoint</title>
P03 | GET LIVE /signup | 200 | <!DOCTYPE html> ... <title>Create account | CarePoint</title>
P04 | GET LIVE /contact | 200 | <!DOCTYPE html> ... <title>Contact | CarePoint</title>
P05 | GET LIVE /clinics | 200 | <!DOCTYPE html> ... <title>Clinics | CarePoint</title>
P06 | GET LIVE /api/clinics | 200 | [{"id":2,"name":"Ahmad Clinic",...}]
P07 | GET LIVE /api/chatbot/config | 200 | {"provider":"tidio","tidioPublicKey":"<masked>","lunaEmbedUrl":null}
P08 | POST LIVE /api/contact valid | 201 | {"message":"Your message was sent."}
P09 | POST LIVE /api/contact empty | 400 | {"message":"Please add your name, email and message."}
P10 | POST LIVE /api/chatbot/message | 200 | {"reply":"Clinic hours vary by location...","suggestions":[...]}
P11 | POST LIVE /signup throwaway | 201 | {"verificationRequired":true,"challenge":"<masked>","email":"forms.audit.two@example.com"}
P12 | POST LIVE /signup/verify | 405 | empty body (Cloudflare asset layer, not app)
P13 | POST LIVE /signup/resend | 405 | empty body
P14 | POST LIVE /login wrong password | 401 | {"code":"invalid_credentials","message":"Invalid email or password."}
P15 | POST LIVE /login correct password, unverified | 403 | {"code":"email_not_verified","canResendVerification":true}
P16 | POST LIVE /login/verify | 405 | empty body
P17 | POST LIVE /login/resend | 405 | empty body
P18 | POST LIVE /signup/resend-verification | 405 | empty body
P19 | POST LIVE /api/password-reset/request | 200 | {"message":"If an account exists for that email, we sent a password reset code.","challenge":"<masked>"}
P20 | POST LIVE /api/password-reset/verify bogus | 400 | {"message":"This reset code is invalid. Request a new one."}
P21 | POST LIVE /logout | 200 | {"message":"Logged out"}
P22 | GET LIVE /patient anonymous | 302 | Found. Redirecting to /login?next=%2Fpatient
P23 | GET LIVE /clinic anonymous | 302 | Found. Redirecting to /login?next=%2Fclinic
U01 | GET LOCAL /api/session (user cookie) | 200 | {"user":{"id":76,"role":"user",...}}
U02 | GET LOCAL /api/clinics | 200 | [{"id":2,"name":"Ahmad Clinic",...}]
U03 | GET LOCAL /api/appointments | 200 | [{"id":36,"status":"Pending",...}]
U04 | GET LOCAL /api/onboarding | 200 | {"profile":null}
U05 | POST LOCAL /api/onboarding | 200 | {"message":"Care profile saved","profile":{"age":34,...}}
U06 | POST LOCAL /api/appointments (first run) | 201 | {"message":"Appointment requested","id":36,"visit_type":"in_person"}
U06b | POST LOCAL /api/appointments (repeat) | 409 | {"message":"That time is already requested. Please choose another time."}
U07 | PATCH LOCAL /api/appointments/36 (reschedule) | 200 | {"message":"Appointment rescheduled",...}
U08 | PATCH LOCAL /api/appointments/36 (cancel) | 200 | {"message":"Appointment updated","status":"Cancelled"}
U09 | GET LOCAL /api/meetings | 200 | {"zoomConfigured":true,"zoomReady":true,"meetings":[]}
U10 | GET LOCAL /patient with user cookie | 200 | <!DOCTYPE html> ... <title>My portal | CarePoint</title>
U11 | GET LOCAL /profile with user cookie | 200 | <!DOCTYPE html> ... <title>My profile | CarePoint</title>
U12 | GET LOCAL /meetings with user cookie | 200 | <!DOCTYPE html> ... <title>Meetings | CarePoint</title>
U13 | PUT LOCAL /api/profile | 200 | {"message":"Profile updated.","profile":{...,"phone":"+1 555 010 1234"}}
U14 | PUT LOCAL /api/profile avatar_url null (Remove) | 200 | {"message":"Profile updated.","profile":{...,"avatar_url":null}}
U15 | POST LOCAL /api/password-change wrong old | 401 | {"message":"Old password is incorrect."}
U16 | POST LOCAL /api/password-change correct | 200 | {"message":"Password changed successfully."}
U17 | GET LOCAL /api/session after password change | 200 | {"user":null,"accountStatus":"session_expired"}
U18 | POST LOCAL /logout | 200 | {"message":"Logged out"}
C01 | GET LOCAL /api/session (clinic cookie) | 200 | {"user":{"id":77,"role":"clinic","clinic_id":19,...}}
C02 | GET LOCAL /clinic with clinic cookie | 200 | <!DOCTYPE html> ... <title>Clinic | CarePoint</title>
C03 | GET LOCAL /api/clinic/profile | 200 | {"clinic":{"id":19,"name":"Audit Test Clinic ...","is_active":true}}
C04 | GET LOCAL /api/clinic/appointments | 200 | []
C05 | GET LOCAL /api/clinic/doctors | 200 | []
C06 | GET LOCAL /api/clinic/appointments/36/patient (wrong clinic) | 404 | {"message":"Appointment not found."}
C07 | PATCH LOCAL /api/clinic/appointments/36 (wrong clinic) | 404 | {"message":"Appointment not found."}
C08 | PUT LOCAL /api/clinic/profile | 200 | {"message":"Clinic profile updated.","clinic":{...,"city":"Amman"}}
C09 | POST LOCAL /api/clinic/doctors | 201 | {"message":"Doctor added.","doctor":{"id":14,"name":"Audit Doctor"}}
C10 | POST LOCAL /api/clinic/doctors invalid | 400 | {"message":"Doctor name and specialty are required."}
C11 | GET LOCAL /api/clinic/appointments/36/patient (after moving appt to test clinic) | 404 | {"message":"Appointment not found."} (DB rewrite had failed: shell expanded $1/$2)
C12 | PATCH LOCAL /api/clinic/appointments/36 (same cause) | 404 | {"message":"Appointment not found."}
C13 | PUT LOCAL /api/clinic/doctors/14 | 200 | {"message":"Doctor updated.","doctor":{"id":14,...}}
C14 | DELETE LOCAL /api/clinic/doctors/14 | 200 | {"message":"Doctor deleted."}
C15 | GET LOCAL /api/clinic/appointments/36/patient (clinic 19) | 200 | {"patient":{"user_id":76,"first_name":"Form","age":34,...}}
C16 | PATCH LOCAL /api/clinic/appointments/36 Confirmed | 200 | {"message":"Appointment marked confirmed.","status":"Confirmed"}
A01 | POST LOCAL /signup/verify | 200 | {"message":"Email verified","redirect":"/patient","needsOnboarding":false}
A02 | POST LOCAL /login/verify bogus | 400 | {"message":"This code is invalid. Please log in again."}
A03 | POST LOCAL /signup/resend no challenge | 400 | {"message":"Please create your account again to request a new code."}
A04 | POST LOCAL /login/resend no challenge | 400 | {"message":"Please log in again to request a new code."}
A05 | POST LOCAL /signup/resend-verification | 400 | {"message":"This email is already verified. You can log in now."}
D01 | GET ADMIN / | 200 | <!DOCTYPE html> ... <title>Admin login | CarePoint</title>
D02 | POST ADMIN /api/login bad creds | 401 | {"message":"Invalid email or password."}
D03 | GET ADMIN /api/session no cookie | 401 | {"authenticated":false}
D04 | POST ADMIN /api/mfa/verify no cookie | 401 | {"message":"Please sign in again."}
D05 | POST ADMIN /api/reauth no cookie | 401 | {"message":"Please sign in again."}
D06 | POST ADMIN /api/action/reply no cookie | 401 | {"message":"Please sign in again."}
D07 | POST ADMIN /api/password/forgot | 200 | {"ok":true}
D08 | POST ADMIN /api/password/reset invalid | 400 | {"message":"This reset link is invalid or expired."}
D09 | POST ADMIN /api/logout | 200 | {"ok":true}
D10 | GET ADMIN /api/db/users no cookie | 401 | {"message":"Please sign in again."}
```

Finding (not fixed in this area): all five nested auth POST paths on the live site return 405 with an empty body (`P12`,`P13`,`P16`,`P17`,`P18`), while the same code paths return app JSON locally (`A01`–`A05`). The live site is a Cloudflare Pages deployment whose `run_worker_first` list (root `wrangler.worker.jsonc`, outside Agent B area) names only `/login`, `/signup`, `/logout` etc., not `/login/verify`, `/login/resend`, `/signup/verify`, `/signup/resend`, `/signup/resend-verification`. No `public/` or `private/` code fix is appropriate; deployment config owner must add those paths. This is logged, not silently worked around.
