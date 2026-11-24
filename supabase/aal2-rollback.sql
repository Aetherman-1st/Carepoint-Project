-- Rollback for supabase/aal2-admin.sql.
-- Removes the AAL2 restrictive policies, triggers and helper functions added by
-- that file, and restores is_admin() to the previous membership-only check.
-- It never deletes application data. Safe to re-run.
-- Apply as the database owner (postgres), not as carepoint_app.

begin;

-- 1. Remove triggers first so their functions can be dropped.
drop trigger if exists enforce_appointment_status_transition on public.appointments;
drop trigger if exists audit_user_change on public.users;
drop trigger if exists audit_appointment_status on public.appointments;
drop trigger if exists audit_contact_reply on public.contact_replies;
drop trigger if exists audit_admin_member_change on public.admin_members;

-- 2. Remove the restrictive AAL2 policies from admin-facing tables.
do $$
declare
  t text;
begin
  foreach t in array array[
    'users',
    'clinics',
    'doctors',
    'appointments',
    'contact_messages',
    'contact_replies',
    'onboarding_profiles',
    'login_codes',
    'audit_logs'
  ]
  loop
    if to_regclass(format('public.%I', t)) is null then
      continue;
    end if;
    execute format('drop policy if exists %I on public.%I', 'aal2_restrict_' || t, t);
  end loop;
end
$$;

drop policy if exists aal2_admin_members_select on public.admin_members;
drop policy if exists aal2_admin_members_insert on public.admin_members;
drop policy if exists aal2_admin_members_update on public.admin_members;
drop policy if exists aal2_admin_members_delete on public.admin_members;
drop policy if exists protect_admin_users_update on public.users;
drop policy if exists protect_admin_users_delete on public.users;

-- 3. Restore is_admin() to the membership-only check (no AAL2 requirement).
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_members m
    where m.auth_user_id = coalesce(uid, auth.uid())
      and m.role in ('admin', 'superadmin')
  );
$$;

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

-- 4. Drop the AAL2 helper and the audit/transition functions added by the
--    forward migration. They were not present before that migration.
drop function if exists public.is_admin_aal2(uuid);
drop function if exists public.audit_actor_user_id();
drop function if exists public.audit_actor_email();
drop function if exists public.audit_user_change();
drop function if exists public.audit_appointment_status();
drop function if exists public.audit_contact_reply();
drop function if exists public.audit_admin_member_change();
drop function if exists public.enforce_appointment_status_transition();

-- Views intentionally keep security_invoker = true. That is safe and was the
-- intended state; removing it would let view owners bypass base-table RLS.

notify pgrst, 'reload schema';

commit;
