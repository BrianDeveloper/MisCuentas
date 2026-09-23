create table if not exists public.auth_attempts (
  scope text primary key,
  fail_count int not null default 0,
  window_start timestamptz not null default now(),
  locked_until timestamptz null
);

alter table public.auth_attempts enable row level security;
revoke all on table public.auth_attempts from anon, authenticated;