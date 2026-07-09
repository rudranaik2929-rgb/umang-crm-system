-- =====================================================================
-- UMANG CRM — EXCEL IMPORT AUTO-ASSIGN FIX (run in Supabase SQL Editor)
-- =====================================================================
-- Safe to re-run (idempotent).
--
-- Run this AFTER deploying the latest backend (Render) with Excel import fix.
--
-- Excel template (row 1 headers):
--   Lead date | Customer Name | Mobile number | Locality | Assign to
--   (Source is optional 6th column)
--
-- What this script does:
--   1. Ensures assignment columns exist on leads + employees
--   2. Links login users ↔ employees (required for employee dashboard)
--   3. Converts assigned_to from employee NAME → employee_id
--   4. Backfills assignments from import activity logs (if import ran but DB lost assign)
--   5. Sets stage = assigned + assigned_at for Excel (bulk_import) leads
--   6. Syncs employee lead counters
--   7. Prints verification counts at the end
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. REQUIRED COLUMNS
-- ---------------------------------------------------------------------
alter table leads add column if not exists name text;
alter table leads add column if not exists phone text;
alter table leads add column if not exists email text;
alter table leads add column if not exists budget text;
alter table leads add column if not exists location text;
alter table leads add column if not exists property_type text;
alter table leads add column if not exists notes text;
alter table leads add column if not exists source text;

alter table leads add column if not exists assigned_to text;
alter table leads add column if not exists assigned_at timestamptz;
alter table leads add column if not exists assigned_by text;
alter table leads add column if not exists last_employee_action_at timestamptz;

alter table leads add column if not exists follow_up_at timestamptz;
alter table leads add column if not exists priority text;
alter table leads add column if not exists call_status text;
alter table leads add column if not exists stage text not null default 'new';
alter table leads add column if not exists status text not null default 'active';
alter table leads add column if not exists lead_type text not null default 'standard';
alter table leads add column if not exists external_created_at timestamptz;
alter table leads add column if not exists created_at timestamptz default now();
alter table leads add column if not exists updated_at timestamptz default now();

alter table employees add column if not exists user_id text;
alter table employees add column if not exists email text;
alter table employees add column if not exists active boolean default true;
alter table employees add column if not exists last_assigned_at timestamptz;
alter table employees add column if not exists leads_assigned integer not null default 0;
alter table employees add column if not exists leads_closed integer not null default 0;

alter table users add column if not exists employee_id text;
alter table users add column if not exists email text;

-- Activities table (import logs)
create table if not exists activities (
  activity_id text primary key,
  lead_id text,
  user_id text,
  type text,
  text text,
  created_at timestamptz default now()
);
alter table activities add column if not exists lead_id text;
alter table activities add column if not exists type text;
alter table activities add column if not exists text text;
alter table activities add column if not exists created_at timestamptz default now();

-- ---------------------------------------------------------------------
-- 2. INDEXES (employee dashboard + import queries)
-- ---------------------------------------------------------------------
create index if not exists idx_leads_assigned_to on leads(assigned_to) where assigned_to is not null;
create index if not exists idx_leads_assigned_at on leads(assigned_at desc) where assigned_at is not null;
create index if not exists idx_leads_bulk_import on leads(source, assigned_to) where source = 'bulk_import';
create index if not exists idx_leads_assigned_stage_status on leads(assigned_to, stage, status) where assigned_to is not null;
create index if not exists idx_activities_lead_type on activities(lead_id, type) where lead_id is not null;

-- ---------------------------------------------------------------------
-- 3. LINK LOGIN USER ↔ EMPLOYEE (My Dashboard / assign notifications)
-- ---------------------------------------------------------------------
update users u
set employee_id = e.employee_id, updated_at = now()
from employees e
where lower(trim(coalesce(u.email, ''))) = lower(trim(coalesce(e.email, '')))
  and e.employee_id is not null
  and coalesce(u.email, '') <> ''
  and (u.employee_id is null or u.employee_id <> e.employee_id);

update employees e
set user_id = u.user_id, updated_at = now()
from users u
where lower(trim(coalesce(u.email, ''))) = lower(trim(coalesce(e.email, '')))
  and u.user_id is not null
  and coalesce(u.email, '') <> ''
  and (e.user_id is null or e.user_id <> u.user_id);

-- ---------------------------------------------------------------------
-- 4. FIX assigned_to — MUST be employees.employee_id (not name / user_id)
-- ---------------------------------------------------------------------

-- Full name match (e.g. "Khyati Shah")
update leads l
set assigned_to = e.employee_id, updated_at = now()
from employees e
where l.assigned_to is not null
  and l.assigned_to <> e.employee_id
  and lower(trim(l.assigned_to)) = lower(trim(e.name));

-- First name only when UNIQUE among active employees (e.g. "Khyati" → one Khyati)
update leads l
set assigned_to = e.employee_id, updated_at = now()
from employees e
where l.assigned_to is not null
  and l.assigned_to not like 'emp_%'
  and not exists (select 1 from employees x where x.employee_id = l.assigned_to)
  and lower(trim(l.assigned_to)) = lower(trim(split_part(e.name, ' ', 1)))
  and coalesce(e.active, true) is not false
  and (
    select count(*)::int
    from employees e2
    where coalesce(e2.active, true) is not false
      and lower(trim(split_part(e2.name, ' ', 1))) = lower(trim(l.assigned_to))
  ) = 1;

-- assigned_to = employees.user_id
update leads l
set assigned_to = e.employee_id, updated_at = now()
from employees e
where l.assigned_to = e.user_id
  and e.user_id is not null
  and l.assigned_to <> e.employee_id;

-- assigned_to = users.user_id
update leads l
set assigned_to = u.employee_id, updated_at = now()
from users u
where l.assigned_to = u.user_id
  and u.employee_id is not null
  and l.assigned_to <> u.employee_id;

-- ---------------------------------------------------------------------
-- 5. BACKFILL from Excel import activity log (bulk_import_assign)
--    Text format: "... Excel import assigned Customer → Employee Name"
-- ---------------------------------------------------------------------
update leads l
set
  assigned_to = e.employee_id,
  assigned_at = coalesce(l.assigned_at, a.created_at, l.updated_at, l.created_at, now()),
  stage = 'assigned',
  updated_at = now()
from activities a
join employees e
  on lower(trim(e.name)) = lower(trim(
    regexp_replace(coalesce(a.text, ''), '^.*→\s*', '')
  ))
where a.lead_id = l.lead_id
  and a.type = 'bulk_import_assign'
  and l.source = 'bulk_import'
  and (l.assigned_to is null or l.assigned_to <> e.employee_id)
  and coalesce(a.text, '') like '%Excel import assigned%→%';

-- ---------------------------------------------------------------------
-- 6. ASSIGNMENT TIMESTAMPS + STAGE for Excel / all assigned leads
-- ---------------------------------------------------------------------
update leads
set assigned_at = coalesce(assigned_at, updated_at, created_at, now())
where assigned_to is not null
  and assigned_at is null;

update leads
set stage = 'assigned', updated_at = now()
where assigned_to is not null
  and status = 'active'
  and stage = 'new';

-- Excel imports without source column default to bulk_import in app; fix any blank source
update leads
set source = 'bulk_import', updated_at = now()
where source is null
  and external_created_at is not null
  and assigned_to is not null;

update leads set call_status = null where call_status is not null and trim(call_status) = '';
update leads set priority = null where priority is not null and trim(priority) = '';

-- ---------------------------------------------------------------------
-- 7. SYNC employee counters
-- ---------------------------------------------------------------------
update employees e
set
  leads_assigned = coalesce(stats.total_assigned, 0),
  leads_closed = coalesce(stats.total_closed, 0),
  updated_at = now()
from (
  select
    assigned_to as employee_id,
    count(*)::integer as total_assigned,
    count(*) filter (where stage = 'closed')::integer as total_closed
  from leads
  where assigned_to is not null
  group by assigned_to
) stats
where e.employee_id = stats.employee_id;

update employees e
set leads_assigned = 0, leads_closed = 0, updated_at = now()
where not exists (select 1 from leads l where l.assigned_to = e.employee_id);

-- ---------------------------------------------------------------------
-- 8. COLUMN COMMENTS
-- ---------------------------------------------------------------------
comment on column leads.assigned_to is 'employee_id — manager assign, bulk assign, or Excel Assign to column';
comment on column leads.assigned_at is 'When lead was assigned (Excel import / manager assign)';
comment on column leads.assigned_by is 'user_id or employee_id of who assigned';
comment on column leads.source is 'bulk_import = Excel/CSV upload';
comment on column leads.external_created_at is 'Excel Lead date column (enquiry date)';

-- ---------------------------------------------------------------------
-- 9. VERIFY — read these rows after run
-- ---------------------------------------------------------------------
select 'total_leads' as metric, count(*)::text as value from leads
union all
select 'excel_bulk_import', count(*)::text from leads where source = 'bulk_import'
union all
select 'excel_assigned', count(*)::text from leads where source = 'bulk_import' and assigned_to is not null
union all
select 'excel_unassigned', count(*)::text from leads where source = 'bulk_import' and assigned_to is null
union all
select 'assigned_wrong_format', count(*)::text from leads l
  where l.assigned_to is not null
    and not exists (select 1 from employees e where e.employee_id = l.assigned_to)
union all
select 'active_employees', count(*)::text from employees where coalesce(active, true) is not false;

-- Per employee — Excel leads on their dashboard (should match Assign to column):
select
  e.name as employee_name,
  e.employee_id,
  count(l.lead_id) filter (where l.source = 'bulk_import') as excel_leads,
  count(l.lead_id) filter (where l.source = 'bulk_import' and l.stage = 'assigned') as excel_assigned_stage
from employees e
left join leads l on l.assigned_to = e.employee_id
where coalesce(e.active, true) is not false
group by e.employee_id, e.name
order by excel_leads desc, e.name;

-- Rows that still need manual fix or re-import (Assign to name did not match any employee):
select
  l.lead_id,
  l.name as customer_name,
  l.phone,
  l.assigned_to as bad_assign_value,
  l.created_at
from leads l
where l.source = 'bulk_import'
  and l.assigned_to is not null
  and not exists (select 1 from employees e where e.employee_id = l.assigned_to)
order by l.created_at desc
limit 50;

-- =====================================================================
-- NOTE: Leads imported BEFORE this fix with NULL assigned_to cannot be
-- auto-fixed from SQL alone — re-upload the Excel after backend deploy.
-- =====================================================================
