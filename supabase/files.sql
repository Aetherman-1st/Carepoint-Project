create table if not exists public.uploaded_files (
  id uuid primary key,
  owner_id integer not null references public.users(id) on delete cascade,
  original_name text not null,
  storage_key text not null unique,
  extension text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  content bytea,
  status text not null default 'pending_scan'
    check (status in ('pending_scan', 'approved', 'rejected', 'scan_failed')),
  scan_result text,
  scan_checked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists uploaded_files_owner_idx on public.uploaded_files (owner_id, created_at desc);
create index if not exists uploaded_files_status_idx on public.uploaded_files (status);

create table if not exists public.file_scan_logs (
  id bigserial primary key,
  file_id uuid not null references public.uploaded_files(id) on delete cascade,
  user_id integer not null references public.users(id) on delete cascade,
  status text not null,
  result text,
  created_at timestamptz not null default now()
);

create index if not exists file_scan_logs_file_idx on public.file_scan_logs (file_id, created_at desc);
create index if not exists file_scan_logs_user_idx on public.file_scan_logs (user_id, created_at desc);

alter table public.uploaded_files enable row level security;
alter table public.file_scan_logs enable row level security;
