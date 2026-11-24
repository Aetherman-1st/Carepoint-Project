# Evidence — Task 4: legacy avatar upload sanitised

Date: 2026-11-24
Area: `routes/profile.js`
Environment: local dev server on `http://127.0.0.1:3999`, local PostgreSQL (`loginpage` DB) seeded with
one throwaway user; session cookie minted with `lib/session.createSession`. User deleted at the end.

Command:

```
NODE_PATH=/home/aetherman/Carepoint-Project/node_modules node /tmp/opencode/avatar-test.js
```

The test sends `PUT /api/profile` with a data-URL `avatar_url` and an `Origin` header matching the
local host. Output (verbatim):

```
RESULT | existing legacy avatar still displays (GET) | 200 | {"avatar_preserved":true}
RESULT | real PNG accepted (real.png input) | 200 | {"status_ok":true,"returns_png":true,"message":"Profile updated."}
RESULT | HTML renamed .png rejected | 400 | {"message":"The file type could not be verified."}
RESULT | SVG with script renamed .png rejected | 400 | {"message":"The file type could not be verified."}
RESULT | PNG with appended HTML payload cleaned | 200 | {"status_ok":true,"payload_removed":true,"still_png":true}
RESULT | oversized file rejected | 400 | {"message":"Profile photos must be smaller than 512 KB."}
CLEANUP | test user deleted
```

Summary:

| Case | Status | Result |
| --- | --- | --- |
| Existing legacy data-URL avatar still displays | 200 | unchanged value returned |
| Real PNG accepted and re-encoded | 200 | returns `data:image/png;base64,...` with valid PNG signature |
| HTML renamed `.png` | 400 | rejected, type not verified |
| SVG with `<script>` renamed `.png` | 400 | rejected, type not verified |
| PNG with appended HTML payload | 200 | payload removed, output still a valid PNG |
| Oversized (>512 KB) file | 400 | rejected by size limit |

Implementation: the legacy data-URL path now decodes the payload and runs it through the shared
`lib/file-validation.js` pipeline (`validateUpload`) using a random UUID filename, so it gets the
same size check, signature detection, decode, re-encode, metadata strip and 2048 px dimension limit
as `/api/files`. Stored format remains a data URL, so existing avatars render unchanged.
