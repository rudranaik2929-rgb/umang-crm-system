-- =====================================================================
-- UMANG CRM — EMPLOYEE LOCATION COLUMN (run in Supabase SQL Editor)
-- =====================================================================
-- Safe to re-run (idempotent).
--
-- Adds location to employees table for:
--   • Employee Management page (serial # + location column)
--   • Add / Edit Employee form (required location field)
-- =====================================================================

alter table employees add column if not exists location text;

-- If you previously ran EMPLOYEE_LOCALITY_FIX.sql, copy data across
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'locality'
  ) then
    update employees
    set location = locality
    where (location is null or trim(location) = '')
      and locality is not null
      and trim(locality) <> '';
  end if;
end $$;

drop index if exists idx_employees_locality;
create index if not exists idx_employees_location on employees(location) where location is not null;

comment on column employees.location is 'Primary work location / area for this employee (e.g. Nalasopara West, Virar)';

-- Optional: drop old locality column after migration
-- alter table employees drop column if exists locality;

-- Verify
select
  count(*)::text as total_employees,
  count(*) filter (where coalesce(active, true) is not false)::text as active_employees,
  count(*) filter (where location is not null and trim(location) <> '')::text as with_location,
  count(*) filter (where location is null or trim(location) = '')::text as missing_location
from employees;

select employee_id, name, role, location, active
from employees
order by name;
