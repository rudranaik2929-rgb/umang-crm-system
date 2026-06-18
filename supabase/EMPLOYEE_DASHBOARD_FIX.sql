-- =====================================================================
-- EMPLOYEE MY DASHBOARD FIX — My Queue + Missed Leads boxes
-- Run in Supabase SQL Editor AFTER FINAL_RUN_THIS.sql
-- Safe to re-run (idempotent)
-- =====================================================================
-- Fixes when:
--   • My Queue shows 0 but manager sees leads on employee
--   • Missed Leads box empty but leads have missed status
--   • assigned_to has wrong value (name / user_id instead of employee_id)
--   • users.employee_id not linked to employees row
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. REQUIRED COLUMNS (leads + employees + users)
-- ---------------------------------------------------------------------
alter table leads add column if not exists assigned_to text;
alter table leads add column if not exists assigned_at timestamptz;
alter table leads add column if not exists assigned_by text;
alter table leads add column if not exists last_employee_action_at timestamptz;
alter table leads add column if not exists follow_up_at timestamptz;
alter table leads add column if not exists call_status text;
alter table leads add column if not exists priority text;
alter table leads add column if not exists stage text not null default 'new';
alter table leads add column if not exists status text not null default 'active';
alter table leads add column if not exists lead_type text not null default 'standard';
alter table leads add column if not exists source text;
alter table leads add column if not exists created_at timestamptz default now();
alter table leads add column if not exists updated_at timestamptz default now();

alter table employees add column if not exists user_id text;
alter table employees add column if not exists email text;
alter table employees add column if not exists active boolean default true;

alter table users add column if not exists employee_id text;
alter table users add column if not exists email text;

-- ---------------------------------------------------------------------
-- 2. LINK LOGIN USER ↔ EMPLOYEE (required for My Dashboard API)
-- ---------------------------------------------------------------------
update users u
set
  employee_id = e.employee_id,
  updated_at = now()
from employees e
where lower(trim(u.email)) = lower(trim(e.email))
  and (u.employee_id is null or u.employee_id <> e.employee_id);

update employees e
set
  user_id = u.user_id,
  updated_at = now()
from users u
where lower(trim(u.email)) = lower(trim(e.email))
  and (e.user_id is null or e.user_id <> u.user_id);

-- ---------------------------------------------------------------------
-- 3. FIX assigned_to — must be employees.employee_id (not name/user_id)
-- ---------------------------------------------------------------------

-- assigned_to = employee full name (Excel / manual mistake)
update leads l
set
  assigned_to = e.employee_id,
  updated_at = now()
from employees e
where l.assigned_to is not null
  and l.assigned_to <> e.employee_id
  and lower(trim(l.assigned_to)) = lower(trim(e.name));

-- assigned_to = employees.user_id
update leads l
set
  assigned_to = e.employee_id,
  updated_at = now()
from employees e
where l.assigned_to = e.user_id
  and e.user_id is not null
  and l.assigned_to <> e.employee_id;

-- assigned_to = users.user_id
update leads l
set
  assigned_to = u.employee_id,
  updated_at = now()
from users u
where l.assigned_to = u.user_id
  and u.employee_id is not null
  and l.assigned_to <> u.employee_id;

-- ---------------------------------------------------------------------
-- 4. BACKFILL assigned_at (required for Missed Lead 24h rule)
-- ---------------------------------------------------------------------
update leads
set assigned_at = coalesce(assigned_at, updated_at, created_at, now())
where assigned_to is not null
  and assigned_at is null;

-- Assigned leads should be stage = assigned (not stuck on new)
update leads
set stage = 'assigned', updated_at = now()
where assigned_to is not null
  and status = 'active'
  and stage = 'new';

-- Empty strings → null (ringing / missed logic)
update leads set call_status = null where call_status is not null and trim(call_status) = '';
update leads set priority = null where priority is not null and trim(priority) = '';

-- ---------------------------------------------------------------------
-- 5. FIX last_employee_action_at — only real employee workflow actions
--     (NOT lead_assigned / bulk_import_assign — those block Missed box)
-- ---------------------------------------------------------------------

-- Clear assign-only timestamps
update leads l
set last_employee_action_at = null, updated_at = now()
where l.assigned_to is not null
  and l.last_employee_action_at is not null
  and not exists (
    select 1 from activities a
    where a.lead_id = l.lead_id
      and a.type in (
        'call_status_update', 'negative_response', 'positive_response',
        'lead_followup', 'site_visit_followup', 'stage_change_site_visit',
        'stage_change_positive', 'status_change_negative', 'manager_bulk_update'
      )
  );

-- Rebuild from real workflow activities only
update leads l
set last_employee_action_at = sub.workflow_at, updated_at = now()
from (
  select a.lead_id, max(a.created_at) as workflow_at
  from activities a
  where a.lead_id is not null
    and a.type in (
      'call_status_update', 'negative_response', 'positive_response',
      'lead_followup', 'site_visit_followup', 'stage_change_site_visit',
      'stage_change_positive', 'status_change_negative', 'manager_bulk_update'
    )
  group by a.lead_id
) sub
where l.lead_id = sub.lead_id
  and l.assigned_to is not null
  and sub.workflow_at >= coalesce(l.assigned_at, l.created_at);

-- ---------------------------------------------------------------------
-- 6. INDEXES (speed up employee dashboard queries)
-- ---------------------------------------------------------------------
create index if not exists idx_leads_assigned_to on leads(assigned_to) where assigned_to is not null;
create index if not exists idx_leads_assigned_at on leads(assigned_at desc) where assigned_at is not null;
create index if not exists idx_leads_missed_candidates
  on leads(assigned_to, assigned_at desc)
  where assigned_to is not null
    and status = 'active'
    and stage in ('new', 'assigned')
    and (call_status is null or trim(call_status) = '')
    and follow_up_at is null;

-- ---------------------------------------------------------------------
-- 7. RLS — backend uses service role
-- ---------------------------------------------------------------------
alter table leads enable row level security;
drop policy if exists leads_backend_all on leads;
create policy leads_backend_all on leads for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- 8. VERIFY — run output and check per employee
-- ---------------------------------------------------------------------
select 'users_missing_employee_id' as check_name,
  count(*)::text as value
from users u
where u.role not in ('admin', 'manager')
  and u.employee_id is null
  and exists (select 1 from employees e where lower(e.email) = lower(u.email))

union all
select 'leads_assigned_wrong_id', count(*)::text
from leads l
where l.assigned_to is not null
  and not exists (select 1 from employees e where e.employee_id = l.assigned_to)

union all
select 'missed_leads_24h_total', count(*)::text
from leads
where assigned_to is not null
  and status = 'active'
  and stage in ('new', 'assigned')
  and (call_status is null or trim(call_status) = '')
  and follow_up_at is null
  and coalesce(assigned_at, updated_at, created_at) <= now() - interval '24 hours'
  and (
    last_employee_action_at is null
    or last_employee_action_at < coalesce(assigned_at, updated_at, created_at)
  );

-- Per employee: My Queue vs Missed (should match CRM dashboard)
select
  e.name as employee,
  e.employee_id,
  u.email as login_email,
  case when u.employee_id is not null then 'linked' else 'NOT LINKED' end as login_status,
  count(l.lead_id) filter (
    where l.assigned_to = e.employee_id
      and l.status = 'active'
      and coalesce(l.lead_type, 'standard') <> 'brokerage'
      and l.stage <> 'broker'
  ) as total_assigned,
  count(l.lead_id) filter (
    where l.assigned_to = e.employee_id
      and l.status = 'active'
      and l.stage in ('new', 'assigned')
      and (l.call_status is null or trim(l.call_status) = '')
      and l.follow_up_at is null
      and coalesce(l.assigned_at, l.updated_at, l.created_at) <= now() - interval '24 hours'
      and (
        l.last_employee_action_at is null
        or l.last_employee_action_at < coalesce(l.assigned_at, l.updated_at, l.created_at)
      )
  ) as missed_leads,
  count(l.lead_id) filter (
    where l.assigned_to = e.employee_id
      and l.status = 'active'
      and coalesce(l.lead_type, 'standard') <> 'brokerage'
      and l.stage <> 'broker'
      and not (
        l.stage in ('new', 'assigned')
        and (l.call_status is null or trim(l.call_status) = '')
        and l.follow_up_at is null
        and coalesce(l.assigned_at, l.updated_at, l.created_at) <= now() - interval '24 hours'
        and (
          l.last_employee_action_at is null
          or l.last_employee_action_at < coalesce(l.assigned_at, l.updated_at, l.created_at)
        )
      )
  ) as my_queue_leads
from employees e
left join users u on u.employee_id = e.employee_id or lower(u.email) = lower(e.email)
left join leads l on l.assigned_to = e.employee_id
where coalesce(e.active, true) is not false
group by e.employee_id, e.name, u.email, u.employee_id
order by e.name;
