Group 1.1: applied supabase/files.sql live; uploaded_files/file_scan_logs exist with RLS on and no anon/authenticated grants.
Group 1.2: added durable UPLOAD_RATE_LIMITER Worker binding (20/min per user) and wired it into upload routing.
Group 1.3: live throwaway test passed JPG/PNG/PDF approval, wrong extension/signature and >2MB rejection, owner download 200, anonymous 401; scan result is structural_pass_no_av.
Group 2.4: admin TOTP enrollment/challenge and AAL2 gate implemented; is_admin_aal2 function created; live RLS policy rewrite blocked because admin tables are owned by postgres and carepoint_app is not owner (retried once).
Group 2.5: 5-minute password re-entry modal wired before ban/unban/delete, status changes, and replies.
Group 2.6: admin forgot/reset pages added with generic responses; Supabase redirect URL/SMTP changes blocked (no Supabase management token or SMTP secret).
Group 2.7: admin login errors are generic; public Auth settings checked; hosted Auth rate-limit/MFA settings are not exposed and could not be raised without management access.
Group 2.8: Worker audit logging added for public login success/failure/lockout/password changes and admin actions; DB trigger migration authored but blocked by postgres-owned tables.
Group 2.9: strict admin CSP/security headers added; admin JWT lifetime shortening blocked (no Supabase management access).
Group 3.1: patient reschedule now opens with the appointment id, prefills date/time/reason/visit type, validates required fields, and the API no longer references undefined doctor_id/clinicId; local live tests passed 200 reschedule (including time-only), 409 duplicate, 403 patient confirm, 400 past cancel.
Group 3.2: past Pending/Confirmed appointments can no longer be cancelled by patients; admin and patient status changes enforce Pending->Confirmed/Cancelled and Confirmed->Completed/Cancelled; local tests passed.
Group 3.3: admin status dropdown only offers legal transitions and reply now uses the Worker endpoint that sends email and sets emailed from delivery.
Group 3.4: clinic appointment list/detail no longer return or display patient email; clinics keep name, age, phone, conditions, medications.
Group 3.5: admin-rls/security SQL updated for AAL2, admin_members protection, and appointment transition trigger; live application still blocked by postgres-owned tables.
Group 4.1: added Origin/Referer CSRF guard for unsafe cookie requests, bearer-token admin bypass, and tests; live local checks reject missing/cross-origin writes and allow same-origin.
Group 4.2: public login and signup resend-verification now return identical generic invalid-credentials responses; live local checks confirmed byte-identical 401 bodies.
Group 4.3: every response now carries X-Request-Id; final JSON errors include traceId.
Group 4.4: clinic image_url now accepts only local asset paths and rejects external/traversal values; admin profile errors no longer print raw Supabase messages.
Group 4.5: UI flows rechecked: reschedule, cancel, clinic status, admin reply and admin status use the corrected endpoints; SECURITY_REVIEW.md rewritten to match current controls and blocked DB work.
Group 5.1: final npm test 17/17 passed; local integration covered reschedule, duplicate slots, past cancel, patient/admin transitions, CSRF, trace IDs, clinic privacy and image validation.
Group 5.2: production Worker, public Pages and admin Pages deployed; public/admin smoke tests passed login, CSRF, trace, CORS, CSP, reschedule persistence and logout.
Group 5.3: rollback points saved before deploy; throwaway account 72, test rows and temp files deleted; final AUDIT_REPORT.txt updated to 28.0/32 (87.5%).
