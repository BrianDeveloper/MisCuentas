-- Migración 0001: esquema inicial de Mis Cuentas sobre PostgreSQL (Supabase).

create table if not exists public.clients (
  id bigserial primary key,
  name text not null,
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.movements (
  id bigserial primary key,
  client_id bigint not null references public.clients(id) on delete cascade,
  type text not null check (type in ('deuda', 'abono')),
  currency text not null check (currency in ('USD', 'Bs')),
  amount double precision not null,
  rate_bs double precision not null,
  amount_usd double precision not null,
  amount_bs double precision not null,
  concept text not null default '',
  date text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_movements_client on public.movements(client_id);

create table if not exists public.rates (
  date text primary key,
  usd_ves double precision not null,
  eur_ves double precision not null default 0
);

create table if not exists public.app_settings (
  key text primary key,
  value text not null
);

create table if not exists public.app_sessions (
  token text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

-- RLS: bloquear acceso directo. Todo el acceso pasa por Edge Functions
-- (service_role, que bypasea RLS). anon/authenticated sin privilegios.
alter table public.clients enable row level security;
alter table public.movements enable row level security;
alter table public.rates enable row level security;
alter table public.app_settings enable row level security;
alter table public.app_sessions enable row level security;

revoke all on table public.clients from anon, authenticated;
revoke all on table public.movements from anon, authenticated;
revoke all on table public.rates from anon, authenticated;
revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.app_sessions from anon, authenticated;

grant usage on schema public to service_role;
grant service_role to postgres;