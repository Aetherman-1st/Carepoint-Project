# Evidence 9 — admin negative access tests

All calls were made with `node` `fetch` from `/home/aetherman/Carepoint-Project`.
Token/cookie values are deliberately not printed here; they are masked as
`<AAL1 token>`, `<tampered token>`, `<patient cp_session>`.

Test material: a locally fabricated JWT whose payload has `aal: aal1`, a
tampered signature, and a valid HMAC-signed public `cp_session` cookie for a
local non-admin user (`id=3`). No real admin account or admin token was used.
Because no throwaway Supabase AAL1 token was obtainable (signup returned
`400 email_address_invalid` for test domains and `429` for a throwaway Gmail
address), the AAL1 case ran against a local Worker with a local mock of
`GET /auth/v1/user` that returned a throwaway non-admin auth user. Every other
row uses the live production endpoints.

| Test | Request | Expected | Actual status / response |
| --- | --- | --- | --- |
| Admin data route with AAL1 token | `PATCH http://127.0.0.1:3101/api/admin/users/3`, `Authorization: Bearer <AAL1 token>`, body `{}` | 403 — AAL2 required | `403 {"message":"Two-factor authentication is required."}` |
| Admin data route with AAL2 token (control) | same, `Authorization: Bearer <AAL2 token>` | passes gate; 400 on invalid body | `400 {"message":"Invalid account update."}` |
| Admin data route with no token | `PATCH http://127.0.0.1:3101/api/admin/users/3`, body `{}` | 401 | `401 {"message":"Please sign in again."}` |
| Patient cookie on admin data route | `PATCH http://127.0.0.1:3101/api/admin/users/3`, `Cookie: cp_session=<patient cp_session>`, body `{}` | 401 — public cookie is not admin auth | `401 {"message":"Please sign in again."}` |
| Admin API with no token | `PATCH https://carepoint-15l.pages.dev/api/admin/users/3`, `Origin: https://carepoint-15l.pages.dev`, body `{}` | 401 | `401 {"message":"Please sign in again."}` |
| Admin API with tampered token | same, `Authorization: Bearer <tampered token>` | 401 | `401 {"message":"Please sign in again."}` |
| Patient cookie on admin API | same, `Cookie: cp_session=<patient cp_session>` | 401 | `401 {"message":"Please sign in again."}` |
| Admin DB proxy with no cookie | `GET https://carepoint-admin.pages.dev/api/db/admin_users` | 401 | `401 {"message":"Please sign in again."}` |
| Admin DB proxy with tampered admin cookie | same, `Cookie: cp_admin_session=tampered.value` | 401 | `401 {"message":"Please sign in again."}` |
| Patient cookie on admin DB proxy | same, `Cookie: cp_session=<patient cp_session>` | 401 | `401 {"message":"Please sign in again."}` |
| Admin session with no cookie | `GET https://carepoint-admin.pages.dev/api/session` | 401 unauthenticated | `401 {"authenticated":false}` |
| Patient cookie on admin session | same, `Cookie: cp_session=<patient cp_session>` | 401 unauthenticated | `401 {"authenticated":false}` |

Commands used for the static gate check:

```
grep -nE "router\.(get|post|patch|delete|put)\(" routes/admin.js
```
Returns the four mutating admin routes, all behind `requireAdmin`.

```
grep -n "aal2\|requireAdmin" routes/admin.js
```
`requireAdmin` validates the token via Supabase `/auth/v1/user`, then rejects
`claims.aal !== 'aal2'` with 403 before the `admin_members` lookup
(`routes/admin.js:34-70`).

Notes:
- A tampered bearer token returned `403 {"error_code":"bad_jwt", ...}` from
  Supabase `/auth/v1/user`; `requireAdmin` converts any upstream failure to
  `401`, as recorded above.
- The admin Pages functions rely on the sealed HttpOnly `cp_admin_session`
  cookie (`admin-app/functions/_lib/core.js`); a public `cp_session` cookie is
  never accepted there.
- No admin data was read or mutated: all rejected requests stopped at the
  guard, and the one control request used an invalid body (`400`).
