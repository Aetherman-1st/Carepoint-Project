# Rate limiting and login lockouts

## Where the counters live

Login failure counters are stored in Postgres, in `public.login_attempts`
(`supabase/login-attempts.sql`). They are not stored in a KV namespace or in
process memory.

| Column | Purpose |
| --- | --- |
| `scope` | `public` or `admin`, so the two login surfaces cannot influence each other |
| `kind` | `email` or `ip` — one row per independent key |
| `key` | `sha256(normalized email)` or `sha256(client IP)`; raw PII/IPs are never stored |
| `attempts` | failures in the current window |
| `window_started_at` | start of the current window |
| `locked_until` | cooldown expiry, set when `attempts >= maxAttempts` |
| `updated_at` | used to purge rows older than one day |

The primary key is `(scope, kind, key)`. The read path is a single indexed
query that takes `max(locked_until)` over the email row and the IP row
(`lib/login-attempts.js:29`).

Requests are keyed by **both** email and IP. A caller who changes
`cf-connecting-ip` / `x-forwarded-for`, User-Agent or cookies keeps the same
email key and stays locked. A caller who changes email keeps the same IP key
and stays locked. Both keys must be clean before a credential check proceeds.

## Why the Postgres counter is sufficient

The update is one atomic statement per key
(`lib/login-attempts.js:45`):

```sql
INSERT INTO login_attempts (scope, kind, key, attempts, window_started_at,
                            locked_until, updated_at)
VALUES ($1, $2, $3, 1, now(), NULL, now())
ON CONFLICT (scope, kind, key) DO UPDATE SET
  attempts = ..., window_started_at = ..., locked_until = ..., updated_at = now()
RETURNING attempts, locked_until
```

- **Atomic.** The increment, window reset and lock decision happen in a
  single statement. Postgres takes a row lock on conflict, so concurrent
  failures from many isolates cannot lose updates or read a stale count.
  `RETURNING` gives the caller the authoritative post-update value from that
  same transaction instead of a second, racy `SELECT`.
- **Durable.** The table is reached through Hyperdrive (Worker) or `pg`
  (local runs), so counters survive isolate eviction, restarts and
  multi-region routing. A KV binding or an in-process `Map` would be
  eventually consistent or per-isolate and could be bypassed by routing.
- **Cheap.** One point read on the guarded request, two small upserts on a
  failure, one delete for rows older than a day. No extra service is needed.
- **Least privilege.** RLS is enabled with no `anon`/`authenticated` policies;
  only the application role `carepoint_app` is granted DML. Counter keys are
  hashed, so the table holds neither passwords nor plaintext emails/IPs.

## Configured limits

| Route | Scope | Limit | Window | Cooldown |
| --- | --- | --- | --- | --- |
| `POST /login` (public) | `public` | 10 failures | 7 min | 7 min |
| `POST /admin-auth/login` (Worker admin route) | `admin` | 5 failures | 5 min | 5 min |

A correct password clears both keys (`resetAttempts`). A banned or
unverified public account is not treated as a failed credential for the
counter. The response for an unknown email and a wrong password is the same
`401 invalid_credentials`; a locked key returns `429` with `Retry-After`.

## Other limiters (not authoritative for lockout)

`lib/rate-limit.js` provides coarse burst limits backed by Cloudflare rate
limiter bindings, with an in-process `Map` fallback for local development:
30/min IP and 10/min email on auth routes, 5/min IP and email on contact,
20/min per user on uploads. These absorb high-volume noise; the durable
Postgres counter above is the one that decides account/IP lockout. The
`NO_DEPLOY` local flag (`DISABLE_LOCAL_RATE_LIMIT=1`) only affects the
non-production burst limiter.

## Scope note

The primary admin sign-in page is served by `admin-app/functions/api/login.js`
on Cloudflare Pages and forwards credential checks to Supabase Auth. That
upstream applies its own failed-login limits; the durable per-email/per-IP
counter described here governs the public login and the Worker
`/admin-auth/login` route. The negative tests in
`evidence/EVIDENCE_9_admin.md` cover both surfaces.
