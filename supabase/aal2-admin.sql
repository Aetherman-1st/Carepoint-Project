-- CarePoint admin AAL2 enforcement at the database level.
-- Additive, idempotent, and safe to re-run. It never deletes application data.
-- Apply as the database owner (postgres), not as carepoint_app.
--
-- Design:
--   * Existing permissive policies are left alone. This file only adds
--     RESTRICTIVE policies, so the effective rule is "old policy AND AAL2".
--   * Every admin-facing table gets a restrictive AAL2 policy for authenticated.
--   * Admin views are set to security_invoker so the base-table policies apply.
--   * is_admin() and is_admin_aal2() both require AAL2.
--   * Re-adds the audit/status triggers and protected-admin rules that were
--     authored earlier but never applied live.

begin;

-- ---------------------------------------------------------------------------
-- 0. Membership table and its grants (safe if it already exists).
-- ---------------------------------------------------------------------------
create table if not exists public.admin_members (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  user_id integer unique references public.users(id) on delete set null,
  role text not null default 'admin' check (role in ('admin', 'superadmin')),
  created_at timestamp with time zone not null default now()
);

alter table public.admin_members enable row level security;
revoke all on public.admin_members from anon;
revoke insert, update, delete on public.admin_members from authenticated;
grant select on public.admin_members to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Helpers. Both require AAL2.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1
      from public.admin_members m
      where m.auth_user_id = coalesce(uid, auth.uid())
        and m.role in ('admin', 'superadmin')
    );
$$;

create or replace function public.is_admin_aal2(uid uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1
      from public.admin_members m
      where m.auth_user_id = coalesce(uid, auth.uid())
        and m.role in ('admin', 'superadmin')
    );
$$;

revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_admin_aal2(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_admin_aal2(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Restrictive AAL2 policies on admin-facing tables.
--    If a table does not exist yet, skip it instead of aborting the script.
-- ---------------------------------------------------------------------------
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
      raise notice 'aal2-admin: skipping missing table public.%', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'aal2_restrict_' || t, t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using ((auth.jwt() ->> ''aal'') = ''aal2'') '
      'with check ((auth.jwt() ->> ''aal'') = ''aal2'')',
      'aal2_restrict_' || t,
      t
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. admin_members: own row stays readable at AAL1 so the login page can
--    decide whether to start MFA. Every other read and every write needs AAL2.
--    Writes are also blocked by the revokes above.
-- ---------------------------------------------------------------------------
drop policy if exists aal2_admin_members_select on public.admin_members;
create policy aal2_admin_members_select on public.admin_members
as restrictive
for select
to authenticated
using (
  (auth.jwt() ->> 'aal') = 'aal2'
  or auth.uid() = auth_user_id
);

drop policy if exists aal2_admin_members_insert on public.admin_members;
create policy aal2_admin_members_insert on public.admin_members
as restrictive
for insert
to authenticated
with check ((auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists aal2_admin_members_update on public.admin_members;
create policy aal2_admin_members_update on public.admin_members
as restrictive
for update
to authenticated
using ((auth.jwt() ->> 'aal') = 'aal2')
with check ((auth.jwt() ->> 'aal') = 'aal2');

drop policy if exists aal2_admin_members_delete on public.admin_members;
create policy aal2_admin_members_delete on public.admin_members
as restrictive
for delete
to authenticated
using ((auth.jwt() ->> 'aal') = 'aal2');

-- ---------------------------------------------------------------------------
-- 4. Protected admin accounts cannot be banned or deleted through RLS.
--    The Worker already blocks this; these policies close the direct-REST path.
-- ---------------------------------------------------------------------------
drop policy if exists protect_admin_users_update on public.users;
create policy protect_admin_users_update on public.users
as restrictive
for update
to authenticated
using (
  role <> 'admin'
  and not exists (
    select 1 from public.admin_members m where m.user_id = users.id
  )
)
with check (
  role <> 'admin'
  and not exists (
    select 1 from public.admin_members m where m.user_id = users.id
  )
);

drop policy if exists protect_admin_users_delete on public.users;
create policy protect_admin_users_delete on public.users
as restrictive
for delete
to authenticated
using (
  role <> 'admin'
  and not exists (
    select 1 from public.admin_members m where m.user_id = users.id
  )
);

-- ---------------------------------------------------------------------------
-- 5. Views: views cannot carry RLS policies, so make them run with the
--    caller's rights. The restrictive policies on the base tables then apply.
-- ---------------------------------------------------------------------------
do $$
declare
  v text;
begin
  foreach v in array array[
    'admin_appointments',
    'admin_users',
    'admin_contact_messages'
  ]
  loop
    if to_regclass(format('public.%I', v)) is null then
      raise notice 'aal2-admin: skipping missing view public.%', v;
      continue;
    end if;

    execute format('alter view public.%I set (security_invoker = true)', v);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 6. Status transitions: Pending -> Confirmed/Cancelled,
--    Confirmed -> Completed/Cancelled. No other changes.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_appointment_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from new.status
     and not (
       (old.status = 'Pending' and new.status in ('Confirmed', 'Cancelled'))
       or (old.status = 'Confirmed' and new.status in ('Completed', 'Cancelled'))
     ) then
    raise exception 'A % appointment cannot be changed to %.', lower(old.status), lower(new.status)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_appointment_status_transition on public.appointments;
create trigger enforce_appointment_status_transition
before update of status on public.appointments
for each row execute function public.enforce_appointment_status_transition();

-- ---------------------------------------------------------------------------
-- 7. Audit helpers and triggers. They only write when audit_logs exists, so a
--    partially provisioned database does not break normal updates.
-- ---------------------------------------------------------------------------
create or replace function public.audit_actor_user_id()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.user_id
  from public.admin_members m
  where m.auth_user_id = nullif(auth.jwt() ->> 'sub', '')::uuid
  limit 1;
$$;

create or replace function public.audit_actor_email()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(auth.jwt() ->> 'email', '');
$$;

create or replace function public.audit_user_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  action_name text;
begin
  if tg_op = 'UPDATE' and old.banned_at is not distinct from new.banned_at then
    return new;
  end if;

  action_name := case
    when tg_op = 'DELETE' then 'user_deleted'
    when new.banned_at is not null then 'user_banned'
    else 'user_unbanned'
  end;

  insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    public.audit_actor_user_id(),
    public.audit_actor_email(),
    action_name,
    'user',
    old.id,
    jsonb_build_object('banned', case when tg_op = 'DELETE' then null else new.banned_at is not null end)
  );
  return coalesce(new, old);
end;
$$;

create or replace function public.audit_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status is distinct from new.status then
    insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details)
    values (
      public.audit_actor_user_id(),
      public.audit_actor_email(),
      'appointment_status_changed',
      'appointment',
      new.id,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;
  return new;
end;
$$;

create or replace function public.audit_contact_reply()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    public.audit_actor_user_id(),
    public.audit_actor_email(),
    'contact_reply_created',
    'contact_reply',
    new.id,
    jsonb_build_object('message_id', new.message_id, 'emailed', new.emailed)
  );
  return new;
end;
$$;

create or replace function public.audit_admin_member_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  action_name text;
  target_user integer;
  target_auth uuid;
  target_role text;
begin
  action_name := case tg_op
    when 'INSERT' then 'admin_member_added'
    when 'UPDATE' then 'admin_member_changed'
    else 'admin_member_removed'
  end;
  target_user := coalesce(new.user_id, old.user_id);
  target_auth := coalesce(new.auth_user_id, old.auth_user_id);
  target_role := coalesce(new.role, old.role);

  insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    public.audit_actor_user_id(),
    public.audit_actor_email(),
    action_name,
    'admin_member',
    target_user,
    jsonb_build_object('auth_user_id', target_auth, 'role', target_role)
  );
  return coalesce(new, old);
end;
$$;

do $$
begin
  if to_regclass('public.audit_logs') is null then
    raise notice 'aal2-admin: audit_logs missing, skipping audit triggers';
    return;
  end if;

  execute 'drop trigger if exists audit_user_change on public.users';
  execute 'create trigger audit_user_change
           after update of banned_at or delete on public.users
           for each row execute function public.audit_user_change()';

  execute 'drop trigger if exists audit_appointment_status on public.appointments';
  execute 'create trigger audit_appointment_status
           after update of status on public.appointments
           for each row execute function public.audit_appointment_status()';

  execute 'drop trigger if exists audit_contact_reply on public.contact_replies';
  execute 'create trigger audit_contact_reply
           after insert on public.contact_replies
           for each row execute function public.audit_contact_reply()';

  execute 'drop trigger if exists audit_admin_member_change on public.admin_members';
  execute 'create trigger audit_admin_member_change
           after insert or update or delete on public.admin_members
           for each row execute function public.audit_admin_member_change()';
end
$$;

revoke all on function public.audit_actor_user_id() from public;
revoke all on function public.audit_actor_email() from public;
revoke all on function public.audit_user_change() from public;
revoke all on function public.audit_appointment_status() from public;
revoke all on function public.audit_contact_reply() from public;
revoke all on function public.audit_admin_member_change() from public;

notify pgrst, 'reload schema';

commit;
