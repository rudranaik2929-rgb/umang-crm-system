-- =====================================================================
-- UMANG CRM — EMPLOYEE LIVE GPS LOCATIONS
-- Run in Supabase SQL Editor (safe to re-run).
-- =====================================================================
-- One row per employee (latest location only). Backend upserts on
-- employee_id so we UPDATE rather than insert duplicates.
-- =====================================================================

create table if not exists public.employee_locations (
  employee_id text primary key
    references public.employees (employee_id) on delete cascade,
  latitude numeric not null,
  longitude numeric not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_employee_locations_updated_at
  on public.employee_locations (updated_at desc);

comment on table public.employee_locations is
  'Latest GPS ping per employee for Employee Tracking map (one row per employee).';
comment on column public.employee_locations.employee_id is
  'PK — one location row per employee; upsert overwrites latitude/longitude/updated_at.';
comment on column public.employee_locations.updated_at is
  'When this GPS ping was last received (used for green/orange/red marker freshness).';

-- Optional: seed from legacy employees.last_lat / last_lng if present
insert into public.employee_locations (employee_id, latitude, longitude, updated_at)
select
  e.employee_id,
  e.last_lat,
  e.last_lng,
  coalesce(e.last_seen_at, now())
from public.employees e
where e.last_lat is not null
  and e.last_lng is not null
on conflict (employee_id) do nothing;

-- Verify
select count(*)::text as location_rows from public.employee_locations;
select employee_id, latitude, longitude, updated_at
from public.employee_locations
order by updated_at desc nulls last
limit 20;
