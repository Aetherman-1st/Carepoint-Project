Item 1: authored supabase/aal2-admin.sql (15 restrictive AAL2 policies, 2 RPC checks, 3 security_invoker views, 5 audit/status triggers, protected-admin rules); local PG18 apply x2 and rollback x2 exit 0; pending owner apply.
Item 2: authored supabase/aal2-rollback.sql; local PG18 rollback x2 exit 0.
Item 3: authored docs/RLS_POLICIES.md (one row per policy/trigger/view/RPC); npm test 17/17.
Item 4: checked Worker admin data routes; all 4 use requireAdmin which rejects aal != aal2 with 403; no route change needed; node --check exit 0.
Item 5: committed and pushed; waiting for owner to say "SQL applied".
Item 6: pending owner apply, then live REST AAL1/no-token checks in evidence/EVIDENCE_1.md and evidence/EVIDENCE_3.md.
