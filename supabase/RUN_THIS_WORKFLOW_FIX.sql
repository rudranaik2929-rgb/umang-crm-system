-- =====================================================================
-- UMANG CRM — FINAL WORKFLOW + EMPLOYEE DASHBOARD FIX
-- Run this ONCE in Supabase SQL Editor (safe to re-run)
--
-- Fixes reported issues:
--   • Telecaller marks Ringing / Not Interested / Hot — buckets stay 0
--   • Khyati / Dhwani (and all employees) KPI boxes not updating
--   • My Queue / Missed Leads empty while manager sees assignments
--   • assigned_to stored as employee NAME or user_id instead of employee_id
--   • users.employee_id not linked to employees table
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. REQUIRED COLUMNS
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
alter table leads add column if not exists budget text;
alter table leads add column if not exists location text;
alter table leads add column if not exists property_type text;
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
set employee_id = e.employee_id, updated_at = now()
from employees e
where lower(trim(u.email)) = lower(trim(e.email))
  and (u.employee_id is null or u.employee_id <> e.employee_id);

update employees e
set user_id = u.user_id, updated_at = now()
from users u
where lower(trim(u.email)) = lower(trim(e.email))
  and (e.user_id is null or e.user_id <> u.user_id);

-- ---------------------------------------------------------------------
-- 3. FIX assigned_to — MUST be employees.employee_id
--    (Excel / manual imports often store name or user_id)
-- ---------------------------------------------------------------------

-- assigned_to = employee full name (e.g. "Khyati Shah", "Dhwani")
update leads l
set assigned_to = e.employee_id, updated_at = now()
from employees e
where l.assigned_to is not null
  and l.assigned_to <> e.employee_id
  and lower(trim(l.assigned_to)) = lower(trim(e.name));

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
-- 4. ASSIGNMENT TIMESTAMPS + STAGE
-- ---------------------------------------------------------------------
update leads
set assigned_at = coalesce(assigned_at, updated_at, created_at, now())
where assigned_to is not null and assigned_at is null;

update leads
set stage = 'assigned', updated_at = now()
where assigned_to is not null
  and status = 'active'
  and stage = 'new';

update leads set call_status = null where call_status is not null and trim(call_status) = '';
update leads set priority = null where priority is not null and trim(priority) = '';

-- Ringing leads should not stay stage=new
update leads
set stage = 'assigned', updated_at = now()
where assigned_to is not null
  and status = 'active'
  and call_status is not null
  and trim(call_status) <> ''
  and stage = 'new';

-- Hot / positive leads
update leads
set stage = 'positive', updated_at = now()
where assigned_to is not null
  and status = 'active'
  and priority = 'hot'
  and stage in ('new', 'assigned');

-- ---------------------------------------------------------------------
-- 5. last_employee_action_at — only REAL workflow actions
--     (NOT lead_assigned — that blocked missed-lead detection)
-- ---------------------------------------------------------------------

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

-- Rebuild from activity log
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

-- Backfill from current lead fields when activity row missing
-- (leads already marked ringing / negative / hot before fix deployed)
update leads
set last_employee_action_at = coalesce(updated_at, assigned_at, created_at, now()),
    updated_at = now()
where assigned_to is not null
  and last_employee_action_at is null
  and (
    (call_status is not null and trim(call_status) <> '')
    or status = 'negative'
    or priority = 'hot'
    or stage in ('positive', 'site_visit', 'booking', 'loan', 'registration')
    or follow_up_at is not null
  );

-- ---------------------------------------------------------------------
-- 6. INDEXES
-- ---------------------------------------------------------------------
create index if not exists idx_leads_assigned_to on leads(assigned_to) where assigned_to is not null;
create index if not exists idx_leads_assigned_at on leads(assigned_at desc) where assigned_at is not null;
create index if not exists idx_leads_call_status on leads(call_status) where call_status is not null;
create index if not exists idx_leads_workflow on leads(assigned_to, status, stage, call_status, priority);

-- ---------------------------------------------------------------------
-- 7. RLS (backend uses service role)
-- ---------------------------------------------------------------------
alter table leads enable row level security;
drop policy if exists leads_backend_all on leads;
create policy leads_backend_all on leads for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- 8. HEALTH CHECKS — should all be 0 or show linked employees
-- ---------------------------------------------------------------------
select 'users_missing_employee_id' as check_name, count(*)::text as value
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
select 'assigned_ringing_total', count(*)::text
from leads
where assigned_to is not null
  and status = 'active'
  and call_status is not null and trim(call_status) <> ''

union all
select 'assigned_not_interested_total', count(*)::text
from leads
where assigned_to is not null and status = 'negative'

union all
select 'assigned_hot_total', count(*)::text
from leads
where assigned_to is not null and status = 'active' and priority = 'hot';

-- ---------------------------------------------------------------------
-- 9. PER EMPLOYEE WORKFLOW BUCKETS (should match My Dashboard KPI boxes)
--     Ringing | Not Interested | Hot | Visited | Missed | My Queue
-- ---------------------------------------------------------------------
select
  e.name as employee,
  e.employee_id,
  u.email as login_email,
  case when u.employee_id = e.employee_id then 'linked' else 'NOT LINKED — re-login after fix' end as login_status,
  count(l.lead_id) filter (
    where l.assigned_to = e.employee_id and l.status = 'active'
      and l.call_status is not null and trim(l.call_status) <> ''
  ) as ringing,
  count(l.lead_id) filter (
    where l.assigned_to = e.employee_id and l.status = 'negative'
  ) as not_interested,
  count(l.lead_id) filter (
    where l.assigned_to = e.employee_id and l.status = 'active' and l.priority = 'hot'
  ) as hot,
  count(l.lead_id) filter (
    where l.assigned_to = e.employee_id and l.status = 'active'
      and l.stage in ('site_visit', 'positive') and coalesce(l.priority, '') <> 'hot'
  ) as visited_non_hot,
  count(l.lead_id) filter (
    where l.assigned_to = e.employee_id and l.status = 'active'
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
    where l.assigned_to = e.employee_id and l.status = 'active'
      and coalesce(l.lead_type, 'standard') <> 'brokerage' and l.stage <> 'broker'
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
  ) as my_queue
from employees e
left join users u on u.employee_id = e.employee_id or lower(u.email) = lower(e.email)
left join leads l on l.assigned_to = e.employee_id
where coalesce(e.active, true) is not false
group by e.employee_id, e.name, u.email, u.employee_id
order by e.name;

-- ---------------------------------------------------------------------
-- 10. KHYATI / DHWANI SPOT CHECK (sample leads with workflow state)
-- ---------------------------------------------------------------------
select
  e.name as employee,
  l.lead_id,
  l.name as lead_name,
  l.call_status,
  l.status,
  l.stage,
  l.priority,
  l.assigned_to,
  l.last_employee_action_at,
  l.updated_at
from employees e
join leads l on l.assigned_to = e.employee_id
where lower(e.name) like '%khyati%' or lower(e.name) like '%dhwani%'
order by e.name, l.updated_at desc
limit 50;

-- DONE — After running:
-- 1. Redeploy backend on Render (workflow bucket code fix)
-- 2. Redeploy frontend on Vercel
-- 3. Ask Khyati, Dhwani, all telecallers to LOG OUT and LOG IN again
-- 4. Mark one test lead as Ringing — Hot box / Ringing box should update within seconds
