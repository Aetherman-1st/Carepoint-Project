create table if not exists public.admin_members (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  user_id integer unique references public.users(id) on delete set null,
  role text not null default 'admin' check (role in ('admin', 'superadmin')),
  created_at timestamp with time zone not null default now()
);

alter table public.admin_members enable row level security;

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

drop policy if exists admin_members_select on public.admin_members;
create policy admin_members_select on public.admin_members
for select to authenticated
using (auth.uid() = auth_user_id or public.is_admin());

revoke all on public.admin_members from anon;
revoke insert, update, delete on public.admin_members from authenticated;
grant select on public.admin_members to authenticated;

alter table public.users enable row level security;
drop policy if exists admin_users_select on public.users;
create policy admin_users_select on public.users
for select to authenticated
using (public.is_admin());
drop policy if exists admin_users_update on public.users;
create policy admin_users_update on public.users
for update to authenticated
using (public.is_admin() and role <> 'admin')
with check (public.is_admin() and role <> 'admin');
drop policy if exists admin_users_delete on public.users;
create policy admin_users_delete on public.users
for delete to authenticated
using (public.is_admin() and role <> 'admin');

alter table public.clinics enable row level security;
drop policy if exists admin_clinics_select on public.clinics;
create policy admin_clinics_select on public.clinics
for select to authenticated
using (public.is_admin());

alter table public.doctors enable row level security;
drop policy if exists admin_doctors_select on public.doctors;
create policy admin_doctors_select on public.doctors
for select to authenticated
using (public.is_admin());

alter table public.appointments enable row level security;
drop policy if exists admin_appointments_select on public.appointments;
create policy admin_appointments_select on public.appointments
for select to authenticated
using (public.is_admin());
drop policy if exists admin_appointments_update on public.appointments;
create policy admin_appointments_update on public.appointments
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

alter table public.contact_messages enable row level security;
drop policy if exists admin_contact_messages_select on public.contact_messages;
create policy admin_contact_messages_select on public.contact_messages
for select to authenticated
using (public.is_admin());

alter table public.contact_replies enable row level security;
drop policy if exists admin_contact_replies_select on public.contact_replies;
create policy admin_contact_replies_select on public.contact_replies
for select to authenticated
using (public.is_admin());
drop policy if exists admin_contact_replies_insert on public.contact_replies;
create policy admin_contact_replies_insert on public.contact_replies
for insert to authenticated
with check (public.is_admin());

alter table public.onboarding_profiles enable row level security;
drop policy if exists admin_onboarding_profiles_select on public.onboarding_profiles;
create policy admin_onboarding_profiles_select on public.onboarding_profiles
for select to authenticated
using (public.is_admin());

alter table public.login_codes enable row level security;
drop policy if exists admin_login_codes_select on public.login_codes;
create policy admin_login_codes_select on public.login_codes
for select to authenticated
using (public.is_admin());

create or replace view public.admin_appointments
with (security_invoker = true)
as
select
  a.id,
  a.user_id,
  a.clinic_id,
  a.doctor_id,
  to_char(a.appointment_date, 'YYYY-MM-DD') as appointment_date,
  a.appointment_time,
  a.reason,
  a.status,
  a.visit_type,
  a.created_at,
  c.name as clinic_name,
  c.specialty as clinic_specialty,
  c.city as clinic_city,
  coalesce(d.name, 'Clinic visit') as doctor_name,
  d.specialty as doctor_specialty,
  u.first_name as patient_first_name,
  u.last_name as patient_last_name,
  u.email as patient_email
from public.appointments a
join public.clinics c on c.id = a.clinic_id
left join public.doctors d on d.id = a.doctor_id
join public.users u on u.id = a.user_id;

create or replace view public.admin_users
with (security_invoker = true)
as
select
  u.id,
  u.first_name,
  u.last_name,
  u.email,
  u.role,
  u.created_at,
  u.last_login_at,
  u.last_login_ip,
  u.banned_at,
  u.phone,
  u.avatar_url,
  u.email_verified_at,
  u.onboarding_completed_at,
  op.age,
  op.conditions,
  op.medications,
  (select count(*)::int from public.appointments a where a.user_id = u.id) as appointment_count,
  (select max(a.appointment_date) from public.appointments a where a.user_id = u.id) as latest_appointment,
  (select count(*)::int from public.login_codes lc where lc.user_id = u.id) as codes_requested,
  (u.role = 'admin' or exists (select 1 from public.admin_members m where m.user_id = u.id)) as protected
from public.users u
left join public.onboarding_profiles op on op.user_id = u.id;

create or replace view public.admin_contact_messages
with (security_invoker = true)
as
select
  m.id,
  m.name,
  m.email,
  m.subject,
  m.message,
  m.created_at,
  coalesce(
    json_agg(
      json_build_object(
        'id', r.id,
        'body', r.body,
        'emailed', r.emailed,
        'created_at', r.created_at,
        'admin_name', nullif(concat_ws(' ', au.first_name, au.last_name), '')
      )
      order by r.created_at
    ) filter (where r.id is not null),
    '[]'::json
  ) as replies
from public.contact_messages m
left join public.contact_replies r on r.message_id = m.id
left join public.users au on au.id = r.admin_id
group by m.id;

revoke all on public.admin_appointments, public.admin_users, public.admin_contact_messages from anon;
revoke all on public.admin_appointments, public.admin_users, public.admin_contact_messages from public;
grant select on public.admin_appointments, public.admin_users, public.admin_contact_messages to authenticated;
grant select on public.admin_appointments, public.admin_users, public.admin_contact_messages to service_role;

alter role carepoint_app bypassrls;

notify pgrst, 'reload schema';
