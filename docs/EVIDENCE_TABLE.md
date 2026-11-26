# CarePoint evidence table

One row per task. Statuses reflect the current repository and deployed state.

| ID | requirement | how verified | result | evidence file |
| --- | --- | --- | --- | --- |
| Task 1 | Database-level AAL2 enforcement (restrictive RLS policies, audit/status triggers, `security_invoker` views, protected-admin rules) | SQL authored and reviewed; applied twice and rolled back twice against local PostgreSQL 18 with exit 0; live apply pending | SQL written and committed, not yet applied — awaiting supervisor MFA enrollment | `supabase/aal2-admin.sql` |
| Task 2 | Admin session must not be readable by JavaScript (HttpOnly) | Live admin login inspected the `Set-Cookie` flags; `document.cookie` and `localStorage` checked in the browser | HttpOnly cookie, JS cannot read it, localStorage empty | `evidence/EVIDENCE_2.md` |
| Task 3 | RLS policy documentation | One row per policy, trigger, view and RPC in the migration inventory | SQL migration file written | `supabase/aal2-admin.sql`, `docs/RLS_POLICIES.md` |
| Task 4 | Upload content validation must reject fake images | Local upload tests with mislabeled `.png` files (wrong signature/MIME/extension) | Fake `.png` files rejected | `evidence/EVIDENCE_4.md` |
| Task 5 | Upload lifecycle and antivirus limitation documented | End-to-end upload/scan/approve/download review; Workers have no AV engine | Lifecycle diagram written, antivirus documented as risk | `docs/UPLOAD_LIFECYCLE.md` |
| Task 6 | Login rate limiting keyed by email and IP, durable and atomic | 12 parallel wrong logins, sequential attempts, varied IP headers; production guard probe | 429 after 4 attempts, IP blocking confirmed | `evidence/EVIDENCE_6.md` |
| Task 7 | Consolidated evidence table | This document | This file | `docs/EVIDENCE_TABLE.md` |
| Task 8 | Every button and form audited | ~70 live/local calls across public, private and admin surfaces | All buttons and forms tested | `docs/FORMS_AUDIT.md`, `evidence/EVIDENCE_8.md` |
| Task 9 | Public and admin negative access tests | AAL1/no-token/tampered/patient-cookie cases plus public negative suite | 40/40 public + 12/12 admin negative tests pass | `evidence/EVIDENCE_9_*.md` |
| Task 10 | Permission/product decisions for supervisor | 13 questions with options, current default, live status and recommendation | 13 decisions sent to supervisor, awaiting approval | `docs/DECISIONS.md` |
