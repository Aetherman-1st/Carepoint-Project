# Open permission and product decisions

Prepared for supervisor review. Nothing in this document changes behaviour; the "default in code"
column describes what the application does today and whether that behaviour is live.

## 1. Clinic patient-data visibility

**Question:** Which patient details may a clinic account see on its own appointments?

- A. Name, age, phone, conditions, medications (no email, no account id).
- B. Everything in A plus patient email.
- C. Full patient profile, including onboarding and document uploads.

**Default in code:** A. Clinic appointment list returns name and phone; the detail endpoint returns
name, phone, age, conditions and medications. Email is not selected. Live in `routes/clinic.js`.

**Recommendation:** A. Clinics need contact and clinical context, not the login email, which is a
phishing and account-takeover vector.

Status: awaiting approval

## 2. Clinic profile and image editing

**Question:** How much of the public clinic profile may a clinic edit itself?

- A. All text fields plus an image chosen from a fixed set of local asset paths.
- B. Text fields only; image changes go through admin.
- C. Text fields plus arbitrary image upload (stored and served by the app).

**Default in code:** A. `PUT /api/clinic/profile` accepts name, specialty, address, city, phone,
description and a local `image_url` path only; external and traversal paths are rejected. Live in
`routes/clinic.js`.

**Recommendation:** A for now. Arbitrary upload (C) needs the sanitising pipeline, storage quota and
moderation first; B adds admin work for a low-risk field.

Status: awaiting approval

## 3. Clinic reschedule and cancel

**Question:** May a clinic move an appointment to a new date/time, or only confirm and cancel it?

- A. Clinic may confirm and cancel only; patients and admin handle rescheduling.
- B. Clinic may also reschedule within its own open slots.
- C. Clinic may edit any appointment field, including doctor and visit type.

**Default in code:** A. Clinic `PATCH /api/clinic/appointments/:id` only accepts legal status
transitions; there is no clinic reschedule path. Live in `routes/clinic.js`.

**Recommendation:** A for now, then B once slot availability and conflict checks are centralised.
Allowing C lets a clinic rewrite clinical context without an audit trail.

Status: awaiting approval

## 4. Doctor CRUD

**Question:** Who may create, edit and delete doctors linked to a clinic?

- A. Clinic staff manage doctors for their own clinic only.
- B. Clinic may create and edit, but only admin may delete.
- C. Doctors are managed centrally by admin only.

**Default in code:** A. `GET/POST/PUT/DELETE /api/clinic/doctors` are scoped to
`req.user.clinic_id`; duplicate names per clinic are rejected. Live in `routes/clinic.js`.

**Recommendation:** B. Day-to-day edits belong to the clinic, but deletion can orphan appointments,
so a retained "retired" flag or admin-only delete is safer.

Status: awaiting approval

## 5. Superadmin powers

**Question:** Do we need a superadmin tier above the current admin allowlist?

- A. No superadmin; all admins in `admin_members` are equal.
- B. Superadmin may manage admin membership and destructive user actions; admins keep day-to-day work.
- C. Superadmin with full database and impersonation access.

**Default in code:** A. There is no superadmin role or permission; `admin_members` plus AAL2 is the
only gate. Live in `routes/admin.js` and `lib/auth.js`.

**Recommendation:** B if the team grows past one operator; A is acceptable while the allowlist is
small. C is too broad without a break-glass audit trail.

Status: awaiting approval

## 6. Admin status transitions

**Question:** What appointment and account status changes may an admin make?

- A. Appointment status only along Pending -> Confirmed/Cancelled and Confirmed ->
  Completed/Cancelled; account suspension is a ban/unban toggle.
- B. Admin may set any appointment status at any time.
- C. Admin may also introduce richer account states (suspended, disabled, archived).

**Default in code:** A. `ALLOWED_TRANSITIONS` blocks Completed/Cancelled from changing; banning only
writes `banned_at`. Live in `routes/admin.js` and `routes/appointments.js`.

**Recommendation:** A, with C only if we add an explicit state machine and audit events. B breaks
reporting and lets completed visits be reopened silently.

Status: awaiting approval

## 7. Admin MFA re-auth window

**Question:** How long may an admin act after re-entering their password?

- A. 5 minutes, client-side prompt, refreshed after each successful re-entry.
- B. 15 minutes, enforced server-side with a signed re-auth claim.
- C. No timed window; require password for every destructive action.

**Default in code:** A, but the window is client-side only; the API does not check how recently the
password was entered. Live in `admin-app/admin.js` (5-minute `reauthUntil`).

**Recommendation:** B. Keep the 5-minute UX but enforce a short-lived server-side claim on
ban/unban/delete, status changes and replies, so a stolen tab cannot bypass the prompt.

Status: awaiting approval

## 8. Admin account recovery

**Question:** How should an admin recover access if they lose their password or MFA device?

- A. Supabase forgot/reset email flow, generic responses, MFA re-enrolled on next login.
- B. Another admin initiates a recovery link after identity verification.
- C. Manual database/Supabase console reset by the owner.

**Default in code:** A. Admin forgot/reset pages exist and return generic responses; hosted Supabase
SMTP and redirect settings are not yet configured. Pages live in `admin-app/`.

**Recommendation:** A plus a documented B fallback for lost MFA. C should stay an emergency-only
owner procedure because it bypasses audit.

Status: awaiting approval

## 9. Avatar migration

**Question:** Should profile images stay inline data URLs or move into the file store?

- A. Keep `users.avatar_url` as a sanitised data URL; existing avatars keep rendering unchanged.
- B. Move new avatars into `uploaded_files` and store a file id/URL in `avatar_url`.
- C. Move all avatars, backfill old data URLs, and drop the data URL format.

**Default in code:** A. The profile endpoint accepts a data URL, checks the real image signature and
returns a normalised data URL. Live in `routes/profile.js`.

**Recommendation:** A for now, then B for new uploads. C adds a migration and can break cached HTML
and emails that still hold old data URLs.

Status: awaiting approval

## 10. Upload retention and antivirus

**Question:** How long do uploads live, and what scanning is required before release?

- A. Keep approved files indefinitely; run structural validation only (no antivirus yet).
- B. Keep files for a fixed retention period (for example 90 days) and purge after download.
- C. Require an external antivirus scan before any file is downloadable.

**Default in code:** A. `uploaded_files.content` is retained; rejected rows keep metadata but null
content; scan result is `structural_pass_no_av`. Live in `routes/files.js` and
`lib/file-validation.js`.

**Recommendation:** C before real patient documents, with B as the retention policy. A is only
acceptable for non-clinical pilots because structural checks cannot detect malware.

Status: awaiting approval

## 11. Reply emailing

**Question:** What happens when an admin replies to a contact message?

- A. Send the reply by email and mark `emailed` only when delivery succeeds.
- B. Store the reply in-app and never email.
- C. Email the reply and mark it sent regardless of delivery outcome.

**Default in code:** A. The admin reply endpoint uses the mailer and sets `emailed` from the delivery
result. Live in `routes/admin.js` and `lib/mailer.js`.

**Recommendation:** A. C hides delivery failures and creates a false record; B loses the primary
support channel.

Status: awaiting approval

## 12. Banning clinic or admin-linked users

**Question:** Which accounts may an admin ban or delete?

- A. Any non-admin user and clinic account; admin and `admin_members` accounts are protected.
- B. Non-admin users only; clinic accounts need owner approval.
- C. Any account, including other admins.

**Default in code:** A. `protectedUser` blocks ban/delete when `role = 'admin'` or the user is in
`admin_members`; clinic accounts are not protected. Live in `routes/admin.js`.

**Recommendation:** B. Clinic accounts can own appointments and doctors, so an accidental ban has
wide effects; require a second operator or owner approval. Keep admins protected.

Status: awaiting approval

## 13. BYPASSRLS database role

**Question:** May the application database role bypass row-level security?

- A. No; `carepoint_app` is not a table owner and has no BYPASSRLS; RLS protects file tables.
- B. Yes, for a dedicated maintenance role only, used by scheduled jobs.
- C. Yes, for the application role so queries ignore RLS.

**Default in code:** A. The app uses a non-owner role without BYPASSRLS; file tables have RLS enabled
with no anon/authenticated grants. Live in `supabase/files.sql` and the deployed database.

**Recommendation:** A. If background jobs need broad access, add a narrowly scoped B role with an
audit trail; never grant C, because one injection then reads every tenant's rows.

Status: awaiting approval
