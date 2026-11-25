# Evidence — Task 5: upload lifecycle

Date: 2026-11-25
Area: `docs/UPLOAD_LIFECYCLE.md`, `routes/files.js` (`scan_result` on an unexpected check failure is `check_error`)

Local structural-approval test (mock database, real `validateUpload` and `routes/files.js`):

```
node tests/file-upload.test.js
```

```
# tests 9
# pass 9
# fail 0
```

The passing case asserts HTTP 201, `file.status` `approved`, and `scan.antivirus_available` false. Approval is `structural_pass_no_av` after signature, size, and rewrite checks. No antivirus engine is called.

Live anonymous upload:

```
curl -sS -D - -X POST 'https://carepoint-15l.pages.dev/api/files' \
  -H 'Origin: https://carepoint-15l.pages.dev' \
  -H 'Content-Type: application/octet-stream' \
  -H 'x-file-name: note.pdf' \
  --data-binary 'not-a-pdf'
```

Status: `401`

Body: `{"message":"Please log in to continue."}`

Temporary risk decision (not Done): files are approved with no antivirus. Options and privacy trade-offs are in `docs/UPLOAD_LIFECYCLE.md`.
