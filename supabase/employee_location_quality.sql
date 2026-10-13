-- ============================================================================
-- UMANG CRM — EMPLOYEE LOCATION QUALITY + HISTORY
-- Run once in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS everywhere).
-- ----------------------------------------------------------------------------
-- Adds:
--   * accuracy / source / captured_at / address / ip to the latest-location row
--   * employee_location_history for a breadcrumb trail (retention-pruned)
--   * an index to make the per-employee history lookup fast
--
-- accuracy = GPS accuracy radius in metres reported by the device.
-- source   = 'gps' (device ping) or 'manual' (admin correction).
-- address  = reverse-geocoded label (OSM Nominatim, server-cached).
-- ============================================================================

-- 1) Latest-location quality columns -----------------------------------------
alter table public.employee_locations add column if not exists accuracy numeric;
alter table public.employee_locations add column if not exists source text default 'gps';
alter table public.employee_locations add column if not exists captured_at timestamptz;
alter table public.employee_locations add column if not exists address text;
alter table public.employee_locations add column if not exists ip text;
alter table public.employee_locations alter column updated_at set default now();

comment on column public.employee_locations.accuracy is
  'GPS accuracy radius in metres at capture time (lower is better).';
comment on column public.employee_locations.source is
  'gps = device ping, manual = admin correction from the tracking screen.';
comment on column public.employee_locations.address is
  'Reverse-geocoded area/address label (OSM Nominatim).';

-- 2) Breadcrumb history -------------------------------------------------------
create table if not exists public.employee_location_history (
  id bigserial primary key,
  employee_id text not null,
  latitude numeric not null,
  longitude numeric not null,
  accuracy numeric,
  source text default 'gps',
  address text,
  captured_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_emp_loc_hist_emp_created
  on public.employee_location_history (employee_id, created_at desc);
create index if not exists idx_emp_loc_hist_created
  on public.employee_location_history (created_at desc);

comment on table public.employee_location_history is
  'Append-only GPS breadcrumbs. Backend prunes rows older than the retention window.';

-- Verify
select count(*)::text as latest_rows from public.employee_locations;
select count(*)::text as history_rows from public.employee_location_history;
