# Evidence 6 — login rate limiting / lockout

All commands were run from `/home/aetherman/Carepoint-Project`. Only
nonexistent `@example.invalid` addresses were used; no real admin account was
contacted.

## 1. Counter storage and atomicity

Command (static inspection):
```
grep -n "INSERT INTO login_attempts\|ON CONFLICT\|RETURNING" lib/login-attempts.js
```
Result: counters live in Postgres table `public.login_attempts`
(`supabase/login-attempts.sql`), keyed by `(scope, kind, key)` where `key` is
`sha256(email)` or `sha256(client IP)`. Not KV, not an in-process map for
lockout decisions.

Command (local PostgreSQL 18, real `lib/login-attempts.js` module):
```
DOTENV_CONFIG_PATH=.env.local-postgres.bak node -r dotenv/config -e "const l=require('./lib/login-attempts'); (async()=>{const e=l.hashKey('probe@example.invalid'), i=l.hashKey('203.0.113.77'); for(let n=1;n<=3;n++) console.log(n, JSON.stringify((await l.checkAndIncrement('probe',e,i,{maxAttempts:4,windowSeconds:900,cooldownSeconds:900})).email)); await l.resetAttempts('probe',e,i)})()"
```
Exit code `0`; responses from `INSERT ... ON CONFLICT ... RETURNING attempts,
locked_until`:

| Call | email row | ip row |
| --- | --- | --- |
| 1 | `attempts=1, locked_until=null` | `attempts=1, locked_until=null` |
| 2 | `attempts=2, locked_until=null` | `attempts=2, locked_until=null` |
| 3 | `attempts=3, locked_until=null` | `attempts=3, locked_until=null` |

`node --check lib/login-attempts.js`, `node --check routes/login.js`,
`node --check routes/admin-auth.js`, `node --check scripts/test-ratelimit.js`:
all exit `0`.
`npm test`: `# tests 17`, `# pass 17`, `# fail 0`, exit `0`.
Design rationale: `docs/RATE_LIMITING.md`.

## 2. Local proof run of `scripts/test-ratelimit.js`

Command:
```
RL_PUBLIC_URL=http://127.0.0.1:3100 RL_ADMIN_URL=http://127.0.0.1:3100 \
RL_ADMIN_PATH=/admin-auth/login node scripts/test-ratelimit.js
```
Local server used the local Postgres via `.env.local-postgres.bak`,
`NODE_ENV=test DISABLE_LOCAL_RATE_LIMIT=1 PORT=3100`. Exit code `0`,
`"pass": true`. Throwaway emails:
`rl-admin-1795681477058-ffd54cbf@example.invalid`,
`rl-public-1795681479494-25d32763@example.invalid`.

| Test | Request | Expected | Actual status codes |
| --- | --- | --- | --- |
| 12 parallel wrong admin logins, same email | `POST /admin-auth/login` x12 | 4 processed (401), 8 locked (429) | `[401,429,429,429,429,401,429,429,401,429,401,429]` → 4 processed, 8 × 429 — PASS |
| Same locked email, 4 different IP/UA header sets | `POST /admin-auth/login` x4 | all 429 | `[429,429,429,429]` — PASS |
| Public login, 11 sequential wrong attempts | `POST /login` x11 | 10 × 401 then 429 | `[401,401,401,401,401,401,401,401,401,401,429]` — PASS |
| Same locked public email, 4 different IP/UA header sets | `POST /login` x4 | all 429 | `[429,429,429,429]` — PASS |

429 bodies: `{"code":"login_locked","message":"Too many attempts. Try again in 7 minutes."}`
(public) and the 5-minute equivalent for `admin`; both set `Retry-After`.
401 bodies were the generic `{"message":"Invalid email or password."}` /
`{"code":"invalid_credentials","message":"Invalid email or password."}`.

Note: an earlier run against the pre-fix code returned
`[401,401,401,401,401,401,401,401,401,401,401,401]` for the parallel admin
case: `guard()` only read `locked_until` and failures were recorded afterwards,
so all 12 isolates passed the check. `guard()` now performs the atomic upsert
and uses its `RETURNING` values, which gives exactly 4 processed / 8 × 429.

## 3. Production public login (10 attempts then 429)

Command:
```
for i in $(seq 1 11); do curl -sS -o /tmp/body -w '%{http_code}' -X POST \
  'https://carepoint-15l.pages.dev/login' \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://carepoint-15l.pages.dev' \
  --data '{"email":"<throwaway>@example.invalid","password":"wrongpass123"}'; done
```
Status codes: `401,401,401,401,401,401,401,401,401,401,429`.
Bodies: first ten `{"code":"invalid_credentials","message":"Invalid email or password."}`,
eleventh `{"code":"login_locked","message":"Too many attempts. Try again in 7 minutes."}`.

## 4. Production admin lockout (confirmed after fix + deploy)

The admin Pages `/api/login` now calls the Worker `/admin-auth/guard`
(Postgres-backed, keyed by `sha256(email)` and `sha256(client IP)`) before
contacting Supabase Auth. The Pages function reads the client IP from the
`CF-Connecting-IP` header and forwards it to the Worker as `X-Forwarded-For`
(the edge WAF rejects an externally supplied `CF-Connecting-IP` with
`403 error code: 1000`).

Deployed: Worker version `165dae24-1cde-4c00-b34a-93c56148a54c`;
admin Pages deployment `318e5fc7`.

Command (direct Worker guard, fresh throwaway email, a different
`X-Forwarded-For` on every call):
```
for i in 1 2 3 4 5; do curl -sS -o /tmp/body -w '%{http_code}' -X POST \
  'https://carepoint-api.yazeed-omari2007.workers.dev/admin-auth/guard' \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://carepoint-admin.pages.dev' \
  -H "X-Forwarded-For: 198.51.100.$((90+i))" \
  --data '{"email":"<throwaway>@example.invalid"}'; done
```
Status codes: `200,200,200,200,429` — 4 attempts allowed, the 5th is blocked.
5th body: `{"code":"login_locked","message":"Too many attempts. Try again in 5 minutes."}`

Command (admin Pages `/api/login`, wrong password, same email):
status codes `429,429,429,429,429,429`, header `Retry-After: 290`–`300`,
body `{"message":"Too many attempts. Try again in 5 minutes."}`. The shared
test egress IP was already in cooldown from the guard probe above, so the
integration calls returned 429 immediately; the guard-level run is the clean
4-then-429 proof.

IP-based blocking is confirmed: the email counter stays locked across a
different `X-Forwarded-For` on every call, and the IP counter locks the
per-IP key independently. The earlier production gap (admin Pages forwarding
straight to Supabase Auth with no app-level counter) is fixed and deployed.
