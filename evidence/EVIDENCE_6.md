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

## 3. Production probe (same script, default URLs)

Command: `node scripts/test-ratelimit.js`. Exit code `0`.

| Test | Request | Expected | Actual status codes |
| --- | --- | --- | --- |
| 12 parallel wrong logins, same throwaway email | `POST https://carepoint-admin.pages.dev/api/login` x12 | 4 × 401, 8 × 429 | 12 × `401` — **FAIL**: the admin Pages function forwards to Supabase Auth and has no app-level email/IP counter (Supabase upstream did not rate-limit at this volume) |
| Same email, 4 different IP/UA header sets | same endpoint x4 | 429 | 4 × `401` — FAIL, same cause |
| Public login, 11 sequential wrong attempts | `POST https://carepoint-15l.pages.dev/login` x11 | 10 × 401 then 429 | 11 × `429` at first — the shared edge IP key was still in its 7-minute cooldown from the earlier probe |
| Same email, 4 different IP/UA header sets | same endpoint x4 | 429 | 4 × `429` — PASS |

After the cooldown expired, a clean production run with a fresh throwaway
email gave the required public result:

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

The edge overwrites client-supplied `x-forwarded-for`, so header changes on
production do not change the IP key; a spoofed `cf-connecting-ip` was rejected
by the edge WAF (`403 error code: 1000`) and was removed from the script.
The production Worker has not been redeployed with the atomic guard from this
change; the production admin Pages sign-in path remains an open gap recorded
above.
