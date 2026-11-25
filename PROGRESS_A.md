Item 1: authored supabase/aal2-admin.sql (15 restrictive AAL2 policies, 2 RPC checks, 3 security_invoker views, 5 audit/status triggers, protected-admin rules); local PG18 apply x2 and rollback x2 exit 0; pending owner apply.
Item 2: authored supabase/aal2-rollback.sql; local PG18 rollback x2 exit 0.
Item 3: authored docs/RLS_POLICIES.md (one row per policy/trigger/view/RPC); npm test 17/17.
Item 4: checked Worker admin data routes; all 4 use requireAdmin which rejects aal != aal2 with 403; no route change needed; node --check exit 0.
Item 5: committed and pushed; waiting for owner to say "SQL applied".
Item 6: pending owner apply, then live REST AAL1/no-token checks in evidence/EVIDENCE_1.md and evidence/EVIDENCE_3.md.

## Task 2 — HttpOnly admin session (Agent A)
- T2.0 rollback saved: production deployment 2d39e1fe-f5ef-4e08-8f23-92a29229ecbd (main, source 3dedf44); repo HEAD 5056230.
- T2.1 added admin Pages Functions core + POST /api/login, POST /api/logout, GET /api/session, POST /api/reauth; AES-GCM HttpOnly/Secure/SameSite=Strict cookie; Origin guard on mutations. Local: 401/403/401/200.
- T2.2 added POST /api/mfa/enroll and POST /api/mfa/verify (TOTP server-side, new cookie on AAL2). Build + syntax OK.
- T2.3 added /api/db/* whitelisted proxy (4 tables + rpc/is_admin), /api/action/* proxy to existing admin API, /api/password/forgot|reset.
- T2.4 rewrote admin-app JS/HTML to same-origin /api only; removed supabase-js and all storage; CSP connect-src 'self'.
- T2.5 preview deployed (branch agent-a-cookie-preview, deployment df1490b8-55b9-431f-b3cc-2341da65cedf, source 2c9e426): https://agent-a-cookie-preview.carepoint-admin.pages.dev; 401/403/401/200/401 verified; production untouched.
- T2.6 fix f3ca8e9: GET /auth/v1/factors is 405, list factors via GET /auth/v1/user; redeployed de1c5215-d0cf-4696-87ad-939b9fa2c2a7; live login 200, session 200 (aal1), enroll 200 (existing TOTP), verify bogus code 400. Full AAL2 + admin action needs the user's authenticator code.
