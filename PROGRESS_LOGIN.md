# Login rate limiting + remember me — progress log

Rollback point (taken 2026-11-19, main @ 659de14):
- Worker (carepoint-api): deployment 9889a801-b68b-40ab-9a70-f0d7e250dec1, version 574979ed-71b5-4357-8388-ed6d057bac3f
- Pages public (carepoint): deployment d82d7b55-4c97-4fa3-82d7-69f08bd7ecae (source fb0ec4f)
- Pages admin (carepoint-admin): deployment 5000d33a-eb47-4992-8757-7cd268171d6a (source fb0ec4f)
- Roll back worker: npx wrangler rollback 574979ed-71b5-4357-8388-ed6d057bac3f --config wrangler.worker.jsonc

- [x] Explored repo; other agent's MFA/re-auth work left untouched
- [x] Rollback point saved
- [x] login_attempts table created live (RLS on, no anon/authenticated policies; carepoint_app grant; idempotent SQL in supabase/login-attempts.sql)
- [x] lib/login-attempts.js: DB-backed check/record/reset, email+IP keys, sha256 hashed
- [x] routes/admin-auth.js: POST /admin-auth/login -> Supabase password grant server-side; 4 fails/email+IP -> 15min cooldown; 429 generic msg; reset on success; AAL1 session returned for MFA flow
- [x] admin-app login.js: uses /admin-auth/login + setSession; all 4 admin supabase clients use sessionStorage (no localStorage persistence); no remember-me UI existed in admin (verified)
- [x] public /login: 10 fails/email+IP -> 10min cooldown via same table; generic 429 msg; reset on correct password; /login/verify unchanged (own wrong-code limit)
- [x] removed conflicting authEmail burst limiter from /login mount only (signup/password-reset unchanged)
- [x] remember-me: already existed and works (checkbox -> login_codes.remember -> session vs 30d Max-Age cookie; HttpOnly/SameSite=Lax/Secure-in-prod; logout bumps session_version) - verified live locally
- [x] local tests: admin 4x401->429 both keys, generic msg identical; public 10x401->429 both emails; counter reset on success; cookie flags checked; throwaway user+counters deleted after
- [ ] git pull --rebase, commit, push, deploy worker+pages(admin), live smoke test, final report
