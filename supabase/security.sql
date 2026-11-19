-- Admin AAL2 enforcement and audit triggers. Idempotent and additive.

-- Admin AAL2 enforcement, protected-admin RLS, status transitions, and audit triggers.
-- Apply as the database owner (postgres); carepoint_app does not own these tables.
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

revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to authenticated;

create or replace function public.is_admin_aal2(uid uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with claims as (
    select nullif((nullif(current_setting('request.jwt.claims', true), ''))::jsonb, '{}'::jsonb) as jwt
  )
  select coalesce(jwt ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1
      from public.admin_members m, claims
      where m.auth_user_id = coalesce(
              uid,
              nullif(jwt ->> 'sub', '')::uuid
            )
        and m.role in ('admin', 'superadmin')
    )
  from claims;
$$;

revoke all on function public.is_admin_aal2(uuid) from public;
grant execute on function public.is_admin_aal2(uuid) to authenticated;

alter policy admin_members_select on public.admin_members
using (
  ((nullif((nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'sub', '')::uuid) = auth_user_id
  or public.is_admin_aal2()
);

alter policy admin_users_select on public.users using (public.is_admin_aal2());
alter policy admin_users_update on public.users
using (
  public.is_admin_aal2()
  and role <> 'admin'
  and not exists (select 1 from public.admin_members m where m.user_id = users.id)
)
with check (
  public.is_admin_aal2()
  and role <> 'admin'
  and not exists (select 1 from public.admin_members m where m.user_id = users.id)
);
alter policy admin_users_delete on public.users
using (
  public.is_admin_aal2()
  and role <> 'admin'
  and not exists (select 1 from public.admin_members m where m.user_id = users.id)
);

alter policy admin_clinics_select on public.clinics using (public.is_admin_aal2());
alter policy admin_doctors_select on public.doctors using (public.is_admin_aal2());
alter policy admin_appointments_select on public.appointments using (public.is_admin_aal2());
alter policy admin_appointments_update on public.appointments
using (public.is_admin_aal2())
with check (public.is_admin_aal2());
alter policy admin_contact_messages_select on public.contact_messages using (public.is_admin_aal2());
alter policy admin_contact_replies_select on public.contact_replies using (public.is_admin_aal2());
alter policy admin_contact_replies_insert on public.contact_replies
with check (public.is_admin_aal2());
alter policy admin_onboarding_profiles_select on public.onboarding_profiles using (public.is_admin_aal2());
alter policy admin_login_codes_select on public.login_codes using (public.is_admin_aal2());

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

create or replace function public.audit_actor_user_id()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.user_id
  from public.admin_members m
  where m.auth_user_id = nullif((nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'sub', '')::uuid
  limit 1;
$$;

create or replace function public.audit_actor_email()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif((nullif(current_setting('request.jwt.claims', true), ''))::jsonb ->> 'email', '');
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

drop trigger if exists audit_user_change on public.users;
create trigger audit_user_change
after update of banned_at or delete on public.users
for each row execute function public.audit_user_change();

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

drop trigger if exists audit_appointment_status on public.appointments;
create trigger audit_appointment_status
after update of status on public.appointments
for each row execute function public.audit_appointment_status();

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

drop trigger if exists audit_contact_reply on public.contact_replies;
create trigger audit_contact_reply
after insert on public.contact_replies
for each row execute function public.audit_contact_reply();

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

drop trigger if exists audit_admin_member_change on public.admin_members;
create trigger audit_admin_member_change
after insert or update or delete on public.admin_members
for each row execute function public.audit_admin_member_change();

revoke all on function public.audit_actor_user_id() from public;
revoke all on function public.audit_actor_email() from public;
revoke all on function public.audit_user_change() from public;
revoke all on function public.audit_appointment_status() from public;
revoke all on function public.audit_contact_reply() from public;
revoke all on function public.audit_admin_member_change() from public;

notify pgrst, 'reload schema';
