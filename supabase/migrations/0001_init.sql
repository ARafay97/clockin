-- Cafe staff attendance schema. Single-tenant, but every row carries site_id
-- so a second location doesn't need a rewrite.

create extension if not exists pgcrypto;

create table staff (
  id uuid primary key default gen_random_uuid(),
  site_id text not null default 'CAFE01',
  name text not null,
  role text default 'Barista',
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,          -- if <= start_time, shift crosses midnight
  created_at timestamptz not null default now()
);
create index shifts_staff_date on shifts (staff_id, date);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  date date not null,              -- the day the session STARTED
  in_at timestamptz not null,
  out_at timestamptz,
  in_flag text not null,
  out_flag text,
  shift_id uuid references shifts(id) on delete set null,
  edited_by text,                  -- set when a manager corrects an entry
  created_at timestamptz not null default now()
);
create index sessions_staff_date on sessions (staff_id, date);

-- At most one open session per staff member. This is the integrity guarantee
-- the whole state machine rests on -- enforced here, not just in application code.
create unique index sessions_one_open on sessions (staff_id) where out_at is null;

create table settings (
  site_id text primary key default 'CAFE01',
  cafe_name text not null default 'The Corner Cafe',
  grace_min int not null default 5,
  round_step int not null default 1,
  cooldown_sec int not null default 60,
  token_period_ms int not null default 60000,
  timezone text not null default 'Europe/London'
);

insert into settings (site_id) values ('CAFE01');

-- RLS: default deny on every table for both the anon and authenticated
-- Postgres roles. There are no grant policies below on purpose -- staff have
-- no Supabase accounts, and the app never issues anon/authenticated-role
-- queries against these tables. All reads and writes happen in trusted
-- server code (Server Components, Route Handlers) via the service-role
-- client, which bypasses RLS by design. Authorization for those code paths
-- is enforced by proxy.ts and per-route session checks, not by RLS grants.
alter table staff enable row level security;
alter table shifts enable row level security;
alter table sessions enable row level security;
alter table settings enable row level security;
