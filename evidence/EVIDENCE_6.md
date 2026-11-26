# Evidence 6 — login rate limiting / lockout

All commands were run from `/home/aetherman/Carepoint-Project`. Emails used
below are nonexistent throwaway addresses (`@example.invalid`); no real admin
account was used.

## 1. Counter storage and atomicity

Command (static inspection):
```
grep -n "INSERT INTO login_attempts\|ON CONFLICT\|RETURNING" lib/login-attempts.js
```
Result: counters live in the Postgres table `public.login_attempts`
(`supabase/login-attempts.sql`), keyed by `(scope, kind, key)` where `key` is
`sha256(email)` or `sha256(client IP)`. Not KV, not an in-process map for
lockout decisions.

Command (local PostgreSQL 18, `scripts` test harness calling the real module):
```
DOTENV_CONFIG_PATH=.env.local-postgres.bak node -r dotenv/config -e "const l=require('./lib/login-attempts'); (async()=>{const e=l.hashKey('probe-returning@example.invalid'), i=l.hashKey('203.0.113.77'); for(let n=1;n<=3;n++) console.log(n, JSON.stringify(await l.recordFailure('probe',e,i,{maxAttempts:4,windowSeconds:900,cooldownSeconds:900}))); await l.resetAttempts('probe',e,i)})()"
```
Exit code: `0`. Response (3 sequential failures), returned by
`INSERT ... ON CONFLICT ... RETURNING attempts, locked_until`:

| Call | email row | ip row |
| --- | --- | --- |
| 1 | `attempts=1, locked_until=null` | `attempts=1, locked_until=null` |
| 2 | `attempts=2, locked_until=null` | `attempts=2, locked_until=null` |
| 3 | `attempts=3, locked_until=null` | `attempts=3, locked_until=null` |

Command: `node --check lib/login-attempts.js` → exit `0`.
Command: `npm test` → `# tests 17`, `# pass 17`, `# fail 0`, exit `0`.
Design rationale: `docs/RATE_LIMITING.md`.

## 2. Live public login lockout (production, throwaway email)

Command (representative request):
```
curl -sS -o /tmp/body -w '%{http_code}' -X POST \
  'https://carepoint-15l.pages.dev/login' \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://carepoint-15l.pages.dev' \
  -H 'x-forwarded-for: 203.0.113.41' \
  --data '{"email":"<throwaway>@example.invalid","password":"wrongpass123"}'
```
Eleven sequential wrong logins for one throwaway email, each with a distinct
`x-forwarded-for` value:

| # | Status | Short response |
| --- | --- | --- |
| 1 | 401 | `{"code":"invalid_credentials","message":"Invalid email or password."}` |
| 2 | 401 | same |
| 3 | 401 | same |
| 4 | 401 | same |
| 5 | 401 | same |
| 6 | 401 | same |
| 7 | 401 | same |
| 8 | 401 | same |
| 9 | 401 | same |
| 10 | 429 | `{"code":"login_locked","message":"Too many attempts. Try again in 7 minutes."}` |
| 11 | 429 | same |

Note: the edge overwrites client-supplied `x-forwarded-for`, so all requests
shared the real edge IP key; the email counter reached 10 across these plus
one earlier probe (9 + 1). This is itself evidence that spoofed IP headers do
not reset the counter. `Retry-After` is set by `lib/login-attempts.js:83`.
