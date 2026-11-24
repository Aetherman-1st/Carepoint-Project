# Evidence — Task 10: open decisions document

Date: 2026-11-24
File: `docs/DECISIONS.md`

Command:

```
ls -l docs/DECISIONS.md
echo "sections=$(grep -c '^## ' docs/DECISIONS.md)"
echo "status_lines=$(grep -c 'Status: awaiting approval' docs/DECISIONS.md)"
```

Observed output:

```
-rw-rw-r-- 1 aetherman aetherman 9328 Nov 24 14:21 docs/DECISIONS.md
sections=13
status_lines=13
```

Content covers, in order: clinic patient-data visibility; clinic profile and image editing; clinic
reschedule/cancel; doctor CRUD; superadmin powers; admin status transitions; admin MFA re-auth
window; admin account recovery; avatar migration; upload retention and antivirus; reply emailing;
banning clinic or admin-linked users; BYPASSRLS database role.

Each section states the question, options A/B/C, the default currently implemented and whether it is
live in code, a recommendation with reasoning, and `Status: awaiting approval`. No code was changed
for these decisions.
