# Evidence 1 - database-level AAL2 enforcement

Task: author and validate `supabase/aal2-admin.sql` (do not apply live until the owner says "SQL applied").

## Static and local validation (pre-apply)

### 1. Forward migration is idempotent

Command:
```
psql -h /tmp/opencode/pgtest -p 55432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/aal2-admin.sql
```
Run twice against a local PostgreSQL 18 stub with the CarePoint table shape.

| Run | Exit code | Result |
| --- | --- | --- |
| 1 | 0 | `COMMIT` |
| 2 | 0 | `COMMIT` (all `create policy` / `create trigger` re-created cleanly) |

### 2. Rollback is idempotent

Command:
```
psql -h /tmp/opencode/pgtest -p 55432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/aal2-rollback.sql
```
Run twice.

| Run | Exit code | Result |
| --- | --- | --- |
| 1 | 0 | `COMMIT` |
| 2 | 0 | `COMMIT` (missing objects skipped with NOTICE) |

### 3. Objects created by the forward migration

`pg_policies` output (15 restrictive policies):

| Policy | Table | Command |
| --- | --- | --- |
| `aal2_restrict_users` | `users` | ALL |
| `aal2_restrict_clinics` | `clinics` | ALL |
| `aal2_restrict_doctors` | `doctors` | ALL |
| `aal2_restrict_appointments` | `appointments` | ALL |
| `aal2_restrict_contact_messages` | `contact_messages` | ALL |
| `aal2_restrict_contact_replies` | `contact_replies` | ALL |
| `aal2_restrict_onboarding_profiles` | `onboarding_profiles` | ALL |
| `aal2_restrict_login_codes` | `login_codes` | ALL |
| `aal2_restrict_audit_logs` | `audit_logs` | ALL |
| `aal2_admin_members_select` | `admin_members` | SELECT |
| `aal2_admin_members_insert` | `admin_members` | INSERT |
| `aal2_admin_members_update` | `admin_members` | UPDATE |
| `aal2_admin_members_delete` | `admin_members` | DELETE |
| `protect_admin_users_update` | `users` | UPDATE |
| `protect_admin_users_delete` | `users` | DELETE |

Triggers created (5):

| Trigger | Table |
| --- | --- |
| `enforce_appointment_status_transition` | `appointments` |
| `audit_user_change` | `users` |
| `audit_appointment_status` | `appointments` |
| `audit_contact_reply` | `contact_replies` |
| `audit_admin_member_change` | `admin_members` |

Views forced to `security_invoker=true`:

| View | `reloptions` |
| --- | --- |
| `admin_appointments` | `{security_invoker=true}` |
| `admin_users` | `{security_invoker=true}` |
| `admin_contact_messages` | `{security_invoker=true}` |

### 4. Behaviour test with JWT claims

One admin row (`admin_members`) and two `users` rows. The stub also has a
permissive `using (true)` select policy on each table, so only the new restrictive
AAL2 layer can change the result.

| Check | JWT `aal` | Rows returned | Expected |
| --- | --- | --- | --- |
| `users` | `aal1` | 0 | 0 |
| `admin_members` (own row) | `aal1` | 1 | 1 |
| `admin_users` view | `aal1` | 0 | 0 |
| `is_admin()` | `aal1` | `false` | `false` |
| `users` | `aal2` | 2 | 2 |
| `admin_members` | `aal2` | 1 | 1 |
| `admin_users` view | `aal2` | 2 | 2 |
| `is_admin()` | `aal2` | `true` | `true` |

### 5. Repository tests

Command:
```
npm test
```
Result: `# tests 17`, `# pass 17`, `# fail 0`, exit code 0.

## Live REST checks (pending owner apply)

Waiting for the owner to apply `supabase/aal2-admin.sql` and say "SQL applied".
Then this section will record, for every admin table, view and RPC:
- request with a password-only (AAL1) test-admin access token
- request with no token
- exact HTTP status code and short response body
