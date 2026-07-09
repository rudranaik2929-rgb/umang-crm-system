-- =====================================================================
-- UMANG CRM — EMPLOYEE LOCALITY COLUMN (run in Supabase SQL Editor)
-- =====================================================================
-- Safe to re-run (idempotent).
--
-- Adds locality to employees table for:
--   • Employee Management page (serial # + locality column)
--   • Add / Edit Employee form (required locality field)
-- =====================================================================

alter table employees add column if not exists locality text;

create index if not exists idx_employees_locality on employees(locality) where locality is not null;

comment on column employees.locality is 'Primary work locality / area for this employee (e.g. Nalasopara West, Virar)';

-- Optional: set a default for existing employees without locality
-- update employees set locality = 'General', updated_at = now() where locality is null or trim(locality) = '';

-- Verify
select
  count(*)::text as total_employees,
  count(*) filter (where coalesce(active, true) is not false)::text as active_employees,
  count(*) filter (where locality is not null and trim(locality) <> '')::text as with_locality,
  count(*) filter (where locality is null or trim(locality) = '')::text as missing_locality
from employees;

select employee_id, name, role, locality, active
from employees
order by name;
