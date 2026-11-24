# Evidence 3 - admin route AAL2 check and documentation

Task: confirm every Worker route that touches admin data checks AAL2 itself, and
document the policies/triggers. Do not apply the SQL until the owner says "SQL applied".

## 1. Worker admin routes

Command:
```
grep -nE "router\.(get|post|patch|delete|put)\(" routes/admin.js
```
Output:
```
84:router.patch('/users/:id', requireAdmin, async (req, res) => {
121:router.delete('/users/:id', requireAdmin, async (req, res) => {
147:router.patch('/appointments/:id/status', requireAdmin, async (req, res) => {
208:router.post('/reply', requireAdmin, async (req, res) => {
```

All four admin-data routes use `requireAdmin`.

Command:
```
grep -n "aal2\|requireAdmin" routes/admin.js
```
Relevant output:
```
34:async function requireAdmin(req, res, next) {
49:    if (!claims || claims.aal !== 'aal2') {
84:router.patch('/users/:id', requireAdmin, async (req, res) => {
121:router.delete('/users/:id', requireAdmin, async (req, res) => {
147:router.patch('/appointments/:id/status', requireAdmin, async (req, res) => {
208:router.post('/reply', requireAdmin, async (req, res) => {
```

`requireAdmin` first validates the token with Supabase `/auth/v1/user`, then rejects
any token whose `aal` claim is not `aal2` with HTTP 403, then checks `admin_members`.
No admin-data route bypasses this gate.

Syntax check:
```
node --check routes/admin.js
```
Exit code: 0.

## 2. Documentation

Created `docs/RLS_POLICIES.md` with one row per new policy and trigger:
- 15 restrictive policies (9 table AAL2 policies, 4 `admin_members` policies,
  2 protected-admin policies)
- 2 admin RPC checks (`is_admin`, `is_admin_aal2`)
- 3 admin views and how they inherit base-table AAL2
- 5 triggers (status transition plus 4 audit triggers)

## 3. Repository tests

Command:
```
npm test
```
Result: `# tests 17`, `# pass 17`, `# fail 0`, exit code 0.

## Live REST checks (pending owner apply)

Waiting for the owner to apply `supabase/aal2-admin.sql` and say "SQL applied".
Then this section will record every admin table, view and RPC call:
- with a password-only (AAL1) test-admin access token
- with no token
- exact HTTP status code and short response body
