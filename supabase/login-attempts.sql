-- Login attempt lockout counters (durable across Worker isolates).
-- Additive and idempotent. RLS enabled, no anon/authenticated policies:
-- the public site database role (carepoint_app, BYPASSRLS) is the only intended reader.

create table if not exists public.login_attempts (
  scope text not null,
  kind text not null check (kind in ('email', 'ip')),
  key text not null,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, kind, key)
);

create index if not exists login_attempts_locked_until_idx
  on public.login_attempts (locked_until)
  where locked_until is not null;

alter table public.login_attempts enable row level security;

grant select, insert, update, delete on public.login_attempts to carepoint_app;
