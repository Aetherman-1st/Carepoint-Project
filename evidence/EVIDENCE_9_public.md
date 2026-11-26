# EVIDENCE 9 — Public negative tests (Agent B)

Date: 2026-11-26T08:27:13.660Z. No secrets, tokens or cookies are recorded; cookies are labelled A, B and clinic X.

Environment: local Express server from this repo (`server.js`) against the real Supabase Postgres via pooler port 6543. Throwaway patients A/B and throwaway clinics X/Y were inserted directly into app tables for the run and deleted afterwards.

Command: `DB_PORT=6543 node scripts/test-negative.js`

Note: the upload limiter is configured as 20 requests per 60 seconds (`lib/rate-limit.js`), not per hour. The 21st upload inside that window is the tested boundary.

| test | request | expected | actual | pass/fail |
| --- | --- | --- | --- | --- |
| N01 IDOR patient A reads own appointment list | GET /api/appointments (Cookie A) | 200 | 200 [{"id":43,"appointment_date":"2026-11-27","appointment_time":"09:15","reason":"Patient A appointment","status":"Pending","visit_type":"in_p… [B and clinic Y appointments absent] | PASS |
| N02 IDOR patient A cancels patient B appointment | PATCH /api/appointments/44 (Cookie A) | 403 | 403 {"message":"You cannot change this appointment."} | PASS |
| N03 IDOR patient A reschedules patient B appointment | PATCH /api/appointments/44 (Cookie A) | 403 | 403 {"message":"You cannot change this appointment."} | PASS |
| N03b IDOR patient B appointment unchanged after A attempts | SELECT appointment B after N02/N03 | Pending and original date | Pending 2026-11-27 | PASS |
| N04 IDOR patient A reads profile with B id query | GET /api/profile?user_id=85 (Cookie A) | 200 | 200 {"profile":{"id":84,"first_name":"Neg","last_name":"PatientA","email":"neg9.1795681525925.044d.a@example.com","phone":"+962 79 000 0001","a… [returned profile id 84] | PASS |
| N05 IDOR patient A updates profile with B id | PUT /api/profile {id:B} (Cookie A) | 200 | 200 {"message":"Profile updated.","profile":{"id":84,"first_name":"Neg","last_name":"PatientA","email":"neg9.1795681525925.044d.a@example.com",… [B row unchanged] | PASS |
| N06 IDOR patient A downloads patient B approved file | GET /api/files/706f93e7-79a2-4e03-a8d0-c198b43addee/download (Cookie A) | 404 | 404 {"message":"File not found."} | PASS |
| N07 Owner downloads pending file | GET /api/files/b689266c-f8ac-424d-b999-3b1937cbe988/download (Cookie B) | 409 | 409 {"status":"pending_scan","message":"This file is not approved for download."} | PASS |
| N08 Owner downloads rejected file | GET /api/files/fb1f9709-f34d-4fcb-83a2-1ee6b32bf840/download (Cookie B) | 409 | 409 {"status":"rejected","message":"This file is not approved for download."} | PASS |
| N09 IDOR clinic X reads clinic Y appointment list | GET /api/clinic/appointments?clinic_id=25 (Cookie clinic X) | 200 | 200 [{"id":44,"appointment_date":"2026-11-27","appointment_time":"10:15","reason":"Patient B appointment","status":"Pending","visit_type":"in_p… [clinic Y appointment absent] | PASS |
| N10 IDOR clinic X reads clinic Y appointment patient | GET /api/clinic/appointments/45/patient (Cookie clinic X) | 404 | 404 {"message":"Appointment not found."} | PASS |
| N11 IDOR clinic X updates clinic Y appointment | PATCH /api/clinic/appointments/45 (Cookie clinic X) | 404 | 404 {"message":"Appointment not found."} | PASS |
| N12 IDOR clinic X reads clinic Y profile via query | GET /api/clinic/profile?clinic_id=25 (Cookie clinic X) | 200 | 200 {"clinic":{"id":24,"name":"Neg9 Clinic X 1795681525925.044d","specialty":"General","address":"1 X Street","city":"Amman","phone":"+962 6 00… [returned clinic id 24] | PASS |
| R01 Patient calls clinic profile | GET /api/clinic/profile (Cookie A) | 403 | 403 {"message":"You do not have permission to access this area."} | PASS |
| R02 Patient calls clinic appointments | GET /api/clinic/appointments (Cookie A) | 403 | 403 {"message":"You do not have permission to access this area."} | PASS |
| R03 Patient calls clinic doctor create | POST /api/clinic/doctors (Cookie A) | 403 | 403 {"message":"You do not have permission to access this area."} | PASS |
| R04 Clinic calls patient booking | POST /api/appointments (Cookie clinic X) | 403 | 403 {"message":"You do not have permission to access this area."} | PASS |
| R05 Anonymous reads appointments | GET /api/appointments (no cookie) | 401 | 401 {"message":"Please log in to continue."} | PASS |
| R06 Anonymous reads profile | GET /api/profile (no cookie) | 401 | 401 {"message":"Please log in to continue."} | PASS |
| R07 Anonymous reads clinic profile | GET /api/clinic/profile (no cookie) | 401 | 401 {"message":"Please log in to continue."} | PASS |
| R08 Anonymous downloads file | GET /api/files/706f93e7-79a2-4e03-a8d0-c198b43addee/download (no cookie) | 401 | 401 {"message":"Please log in to continue."} | PASS |
| R09 Anonymous opens patient page | GET /patient (no cookie) | 302 | 302 Found. Redirecting to /login?next=%2Fpatient | PASS |
| R10 Anonymous books appointment | POST /api/appointments (no cookie) | 401 | 401 {"message":"Please log in to continue."} | PASS |
| U01 Upload HTML disguised as PNG | POST /api/files x-file-name=evil.png body=<html> | 422 | 422 {"status":"rejected","code":"unknown_signature","message":"The file type could not be verified."} | PASS |
| U02 Upload SVG disguised as PNG | POST /api/files x-file-name=evil.png body=<svg> | 422 | 422 {"status":"rejected","code":"unknown_signature","message":"The file type could not be verified."} | PASS |
| U03 Upload EXE extension | POST /api/files x-file-name=evil.exe body=MZ | 422 | 422 {"status":"rejected","code":"unsupported_extension","message":"Only JPG, PNG, WebP, and PDF files are allowed."} | PASS |
| U04 Upload oversized file | POST /api/files x-file-name=large.png body=2MB+1 | 413 | 413 {"message":"File is too large.","traceId":"e5dc3a9a-d24c-409a-b5ce-8a2a3e1c3e12"} | PASS |
| U05 Upload null-byte filename | POST /api/files x-file-name=evil%00.png body=PNG | 201 | 201 {"file":{"id":"b360690f-606b-4c7e-9def-45d0736e4233","name":"evil_.png","mime_type":"image/png","size_bytes":179,"status":"approved"},"scan… [stored name evil_.png] | PASS |
| U06 Upload path-traversal filename | POST /api/files x-file-name=..%2F..%2Fetc%2Fpasswd.png body=PNG | 201 | 201 {"file":{"id":"5ac56b67-67bf-4fd5-96e3-8faa29609f94","name":"passwd.png","mime_type":"image/png","size_bytes":179,"status":"approved"},"sca… [stored name passwd.png] | PASS |
| U07 21st upload in limiter window | POST /api/files x21 (Cookie B) | 429 | 429 {"message":"Too many uploads. Please try again later."} [first 20: 201] | PASS |
| A01 Wrong 2FA code attempt 1 | POST /login/verify code=000000 | 401 | 401 {"message":"That code is incorrect. 4 attempts remaining."} | PASS |
| A02 Wrong 2FA code attempt 2 | POST /login/verify code=000001 | 401 | 401 {"message":"That code is incorrect. 3 attempts remaining."} | PASS |
| A03 Wrong 2FA code attempt 3 | POST /login/verify code=000002 | 401 | 401 {"message":"That code is incorrect. 2 attempts remaining."} | PASS |
| A04 Wrong 2FA code attempt 4 | POST /login/verify code=000003 | 401 | 401 {"message":"That code is incorrect. 1 attempt remaining."} | PASS |
| A05 Wrong 2FA code attempt 5 | POST /login/verify code=000004 | 401 | 401 {"message":"Too many incorrect attempts. Please request a new code."} | PASS |
| A06 Wrong 2FA code attempt 6 after lockout | POST /login/verify code=000005 | 429 | 429 {"message":"Too many incorrect attempts. Please request a new code."} | PASS |
| A07 Expired 2FA code | POST /login/verify expired challenge | 400 | 400 {"message":"This code has expired. Please request a new one."} | PASS |
| A08 Reused 2FA code | POST /login/verify consumed challenge | 400 | 400 {"message":"This code has already been used. Please log in again."} | PASS |
| A09 POST with foreign Origin (CSRF) | POST /api/appointments Origin=https://evil.example (Cookie A) | 403 | 403 {"message":"Request blocked."} | PASS |
| A10 POST with no Origin or Referer | POST /api/appointments (no Origin/Referer, Cookie A) | 403 | 403 {"message":"Request blocked."} | PASS |

Summary: 40/40 passed.

Cleanup: {"file_scan_logs":48,"uploaded_files":27,"login_codes":3,"signup_codes":0,"onboarding_profiles":0,"appointments":3,"audit_logs":6,"users":3,"clinics":2}.

Run history:
- Run 1: 39/40 passed. N03b (appointment unchanged check) failed only because the test read the `date` column as a JavaScript Date string (`Fri Nov 27`) and compared it to `YYYY-MM-DD`. No application endpoint failed.
- Fix: smallest test-only change, `to_char(appointment_date, 'YYYY-MM-DD')` in the N03b verification query.
- Run 2: 40/40 passed (table above). No application code change was needed.
