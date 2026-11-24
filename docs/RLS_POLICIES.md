# CarePoint RLS and trigger reference

This document describes the database objects added by `supabase/aal2-admin.sql`.
That migration is additive: it does not remove the existing permissive policies.
Instead it adds **restrictive** policies, so a request must satisfy both the old
policy and the new AAL2 rule.

`aal` is the Supabase authenticator assurance level claim. `aal2` means the admin
completed the second factor. A password-only session is `aal1` and must not see
admin data.

## Tables: restrictive AAL2 policies

These policies apply to the `authenticated` database role. `anon` is not granted
access to these tables. The Worker's `carepoint_app` role has `BYPASSRLS`, so
server-side worker actions are unaffected.

| Policy | Table | Who it applies to | What it allows / denies | Why |
| --- | --- | --- | --- | --- |
| `aal2_restrict_users` | `public.users` | `authenticated` | Allows all rows only when the JWT says `aal2`; otherwise denies read and write. | Admin account screens read and change users. Password-only tokens must not reach this data. |
| `aal2_restrict_clinics` | `public.clinics` | `authenticated` | Same AAL2-only rule for every command. | Clinics are part of the admin dashboard and appointment views. |
| `aal2_restrict_doctors` | `public.doctors` | `authenticated` | Same AAL2-only rule for every command. | Doctors are part of the admin dashboard and appointment views. |
| `aal2_restrict_appointments` | `public.appointments` | `authenticated` | Same AAL2-only rule for every command. | Appointments contain patient data and are read and updated by admins. |
| `aal2_restrict_contact_messages` | `public.contact_messages` | `authenticated` | Same AAL2-only rule for every command. | Admin inbox messages are private support conversations. |
| `aal2_restrict_contact_replies` | `public.contact_replies` | `authenticated` | Same AAL2-only rule for every command. | Replies are admin-authored support content. |
| `aal2_restrict_onboarding_profiles` | `public.onboarding_profiles` | `authenticated` | Same AAL2-only rule for every command. | Admin user profiles include age, conditions and medications. |
| `aal2_restrict_login_codes` | `public.login_codes` | `authenticated` | Same AAL2-only rule for every command. | Login codes are security-sensitive and are visible in admin user details. |
| `aal2_restrict_audit_logs` | `public.audit_logs` | `authenticated` | Same AAL2-only rule for every command. | Audit entries describe sensitive admin and account actions. |

If a table does not exist, the migration skips it with a notice instead of
aborting.

## Admin membership: restrictive policies

`admin_members` is special because the login page must read the signed-in admin's
own row **before** the second factor is completed, to decide whether to show the
MFA screen.

| Policy | Table | Who it applies to | What it allows / denies | Why |
| --- | --- | --- | --- | --- |
| `aal2_admin_members_select` | `public.admin_members` | `authenticated` | Allows the caller's own row at any assurance level; allows any other row only at `aal2`. | The login page needs the caller's own role to start MFA. It must not enumerate other admins. |
| `aal2_admin_members_insert` | `public.admin_members` | `authenticated` | Requires `aal2`; writes are also revoked from `authenticated`. | Membership changes belong to the owner/Worker, not to browser clients. |
| `aal2_admin_members_update` | `public.admin_members` | `authenticated` | Requires `aal2`; writes are also revoked from `authenticated`. | Prevents an admin token from promoting or changing membership. |
| `aal2_admin_members_delete` | `public.admin_members` | `authenticated` | Requires `aal2`; writes are also revoked from `authenticated`. | Prevents an admin token from removing admin access. |

## Protected admin accounts

| Policy | Table | Who it applies to | What it allows / denies | Why |
| --- | --- | --- | --- | --- |
| `protect_admin_users_update` | `public.users` | `authenticated` | Blocks updates when the target has `role = 'admin'` or has an `admin_members` row. | Admin accounts must not be banned or changed through direct REST, even by another admin. |
| `protect_admin_users_delete` | `public.users` | `authenticated` | Blocks deletes for the same protected accounts. | Admin accounts must not be deleted through direct REST. The Worker enforces the same rule. |

## RPCs

| Function | Who it applies to | What it allows / denies | Why |
| --- | --- | --- | --- |
| `public.is_admin(uid uuid)` | `authenticated` | Returns `true` only when the JWT is `aal2` and the caller is in `admin_members` with role `admin` or `superadmin`. | The admin app uses this as its final gate. Password-only sessions get `false`. |
| `public.is_admin_aal2(uid uuid)` | `authenticated` | Same AAL2 + membership check, using the JWT subject when `uid` is omitted. | Kept for compatibility with the earlier policy draft and for explicit AAL2 checks. |

## Views

Views cannot carry RLS policies. The migration therefore sets these views to
`security_invoker = true`, so the caller's AAL2 policies on the base tables are
enforced instead of the view owner's rights.

| View | Base tables | Enforcement | Why |
| --- | --- | --- | --- |
| `public.admin_appointments` | `appointments`, `clinics`, `doctors`, `users` | Inherits the restrictive AAL2 policies on all four tables. | Admin dashboard appointment list. |
| `public.admin_users` | `users`, `onboarding_profiles`, `appointments`, `login_codes` | Inherits the restrictive AAL2 policies on all four tables. | Admin account list and patient profile. |
| `public.admin_contact_messages` | `contact_messages`, `contact_replies`, `users` | Inherits the restrictive AAL2 policies on all three tables. | Admin support inbox. |

## Triggers

| Trigger | Table | What it does | Why |
| --- | --- | --- | --- |
| `enforce_appointment_status_transition` | `public.appointments` | Rejects any status change except `Pending -> Confirmed/Cancelled` and `Confirmed -> Completed/Cancelled`. | Stops skipped or reversed workflow states. |
| `audit_user_change` | `public.users` | Writes `user_banned`, `user_unbanned` or `user_deleted` to `audit_logs` when `banned_at` changes or a user is deleted. | Leaves a database-level trail even if a direct SQL client changes an account. |
| `audit_appointment_status` | `public.appointments` | Writes `appointment_status_changed` with the old and new status. | Records who moved an appointment. |
| `audit_contact_reply` | `public.contact_replies` | Writes `contact_reply_created` with the message id and delivery flag. | Records admin replies. |
| `audit_admin_member_change` | `public.admin_members` | Writes `admin_member_added`, `admin_member_changed` or `admin_member_removed`. | Records changes to who is an admin. |

Audit triggers are only created when `public.audit_logs` exists. If it is missing,
the migration skips them with a notice so normal updates are not broken.

## Rollback

`supabase/aal2-rollback.sql` drops the policies, triggers and helper functions
added above, and restores `is_admin()` to the previous membership-only check. It
does not delete rows. Views keep `security_invoker = true` because that is the
safe state.
