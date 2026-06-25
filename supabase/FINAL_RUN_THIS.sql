-- =====================================================================
-- UMANG HOMETECH LLP CRM — FINAL SUPABASE SQL (run once in SQL Editor)
-- =====================================================================
-- Safe to re-run (idempotent). Covers ALL current app features:
--
--   • Housing.com + Meta integrations
--   • Manager assign + bulk assign (assigned_at, assigned_by)
--   • Excel import auto-assign (source = bulk_import, Assign to column)
--   • Workflow: Ringing, Visited, Hot, Not Interested, Follow Up
--   • Missed Lead (24h no employee response after assign)
--   • Employee performance + My Dashboard KPI boxes (count = drill-down list)
--   • My Dashboard: New Leads = assigned, not yet updated by employee
--   • My Dashboard: Total Leads = employee took action (ringing, visited, hot, not interested, etc.)
--   • Workflow pills (Hot, Ringing, Missed, etc.) count actioned leads only
--   • Visited box = stage site_visit only (Mark Visited button)
--   • Today Activity box = employee work log in last 24 hours
--   • Bookings registration_receipt jsonb = saved basic invoice on Registration task
--   • Visit follow-ups, call_status, priority
--
-- Excel import (no extra columns — uses fields below):
--   Lead Date        → external_created_at + created_at
--   Lead Name        → name
--   Phone Number     → phone
--   Locality         → location
--   Configuration    → property_type
--   Price            → budget
--   Building/Project → notes
--   Assign to        → assigned_to + assigned_at + assigned_by + stage assigned
--
-- ORDER:
--   1. Run THIS file in Supabase → SQL Editor → Run
--   2. Deploy backend (Render) + frontend (Vercel)
--   3. Optional fresh start: supabase/full_reset_clean.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LEADS — all columns
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

alter table leads add column if not exists external_lead_id text;
alter table leads add column if not exists external_created_at timestamptz;
alter table leads add column if not exists integration_uuid text;
alter table leads add column if not exists raw_payload jsonb;
alter table leads add column if not exists brokerage_amount numeric;

alter table leads add column if not exists created_at timestamptz default now();
alter table leads add column if not exists updated_at timestamptz default now();

-- ---------------------------------------------------------------------
-- 2. EMPLOYEES — round-robin + dashboard counters
-- ---------------------------------------------------------------------
alter table employees add column if not exists last_assigned_at timestamptz;
alter table employees add column if not exists leads_assigned integer not null default 0;
alter table employees add column if not exists leads_closed integer not null default 0;
alter table employees add column if not exists performance integer not null default 0;
alter table employees add column if not exists active boolean default true;
alter table employees add column if not exists last_lat numeric;
alter table employees add column if not exists last_lng numeric;
alter table employees add column if not exists last_seen_at timestamptz;

create index if not exists idx_employees_last_seen on employees(last_seen_at desc) where last_seen_at is not null;

-- ---------------------------------------------------------------------
-- 3. VISIT FOLLOW-UPS
-- ---------------------------------------------------------------------
alter table visit_followups add column if not exists lead_id text;
alter table visit_followups add column if not exists follow_up_at timestamptz;
alter table visit_followups add column if not exists follow_up_date date;
alter table visit_followups add column if not exists follow_up_time time;
alter table visit_followups add column if not exists follow_up_day text;
alter table visit_followups add column if not exists status text not null default 'scheduled';
alter table visit_followups add column if not exists notes text;
alter table visit_followups add column if not exists created_at timestamptz default now();

-- ---------------------------------------------------------------------
-- 4. BOOKINGS
-- ---------------------------------------------------------------------
alter table bookings add column if not exists brokerage_amount numeric not null default 0;
alter table bookings add column if not exists registration_receipt jsonb;

-- ---------------------------------------------------------------------
-- 5. INTEGRATION EVENTS (Housing sync checkpoint, Meta webhooks)
-- ---------------------------------------------------------------------
create table if not exists integration_events (
  event_id text primary key,
  source text not null,
  external_id text,
  status text not null,
  lead_id text,
  error text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. INDEXES — dashboard, assign queue, missed leads, Excel import
-- ---------------------------------------------------------------------
create index if not exists idx_leads_assigned_to on leads(assigned_to) where assigned_to is not null;
create index if not exists idx_leads_assigned_at on leads(assigned_at desc) where assigned_at is not null;
create index if not exists idx_leads_unassigned on leads(stage, status) where assigned_to is null;
create index if not exists idx_leads_assigned_stage_status on leads(assigned_to, stage, status) where assigned_to is not null;
create index if not exists idx_leads_assigned_priority on leads(assigned_to, priority) where assigned_to is not null and priority is not null;
create index if not exists idx_leads_assigned_call_status on leads(assigned_to, call_status)
  where assigned_to is not null and call_status is not null and trim(call_status) <> '';
create index if not exists idx_leads_assigned_follow_up on leads(assigned_to, follow_up_at desc)
  where assigned_to is not null and follow_up_at is not null;
create index if not exists idx_leads_follow_up_at on leads(follow_up_at desc) where follow_up_at is not null;
create index if not exists idx_leads_call_status on leads(call_status) where call_status is not null;
create index if not exists idx_leads_missed_candidates
  on leads(assigned_to, assigned_at desc)
  where assigned_to is not null
    and status = 'active'
    and stage in ('new', 'assigned')
    and (call_status is null or trim(call_status) = '')
    and follow_up_at is null;
create index if not exists idx_leads_source on leads(source);
create index if not exists idx_leads_bulk_import on leads(source, assigned_to) where source = 'bulk_import';
create index if not exists idx_leads_external_lead_id on leads(external_lead_id);
create index if not exists idx_leads_external_created_at on leads(external_created_at desc) where external_created_at is not null;
create index if not exists idx_leads_manager_filters on leads(status, stage, assigned_to, source);
create index if not exists idx_leads_priority on leads(priority) where priority is not null;

create index if not exists idx_visit_followups_lead_id on visit_followups(lead_id) where lead_id is not null;
create index if not exists idx_visit_followups_at on visit_followups(follow_up_at desc);

create index if not exists idx_integration_events_source_created on integration_events(source, created_at desc);
create index if not exists idx_integration_events_external_id on integration_events(external_id);
create index if not exists idx_integration_events_housing_checkpoint
  on integration_events(source, status, created_at desc)
  where source = 'Housing.com' and status = 'housing_sync_checkpoint';

-- ---------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (backend uses service role — allow all)
-- ---------------------------------------------------------------------
alter table leads enable row level security;
alter table integration_events enable row level security;

drop policy if exists leads_backend_all on leads;
create policy leads_backend_all on leads for all using (true) with check (true);

drop policy if exists integration_events_backend_all on integration_events;
create policy integration_events_backend_all on integration_events for all using (true) with check (true);

-- ---------------------------------------------------------------------
-- 8. NORMALIZE empty strings → null (accurate Ringing / priority counts)
-- ---------------------------------------------------------------------
update leads set call_status = null where call_status is not null and trim(call_status) = '';
update leads set priority = null where priority is not null and trim(priority) = '';

-- ---------------------------------------------------------------------
-- 9. BACKFILL assigned_at (manager assign + Excel import)
-- ---------------------------------------------------------------------
update leads
set assigned_at = coalesce(assigned_at, updated_at, created_at)
where assigned_to is not null
  and assigned_at is null;

-- Excel / bulk_import: assigned leads should be stage assigned
update leads
set stage = 'assigned', updated_at = now()
where assigned_to is not null
  and status = 'active'
  and stage = 'new'
  and source = 'bulk_import';

-- ---------------------------------------------------------------------
-- 10. BACKFILL Housing lead_date → external_created_at + created_at
-- ---------------------------------------------------------------------
update leads
set external_created_at = case
  when (raw_payload->>'lead_date') ~ '^\d+$' then
    to_timestamp(
      case
        when (raw_payload->>'lead_date')::bigint > 1000000000000
          then (raw_payload->>'lead_date')::bigint / 1000.0
        else (raw_payload->>'lead_date')::bigint
      end
    )
  else external_created_at
end
where source = 'Housing.com'
  and external_created_at is null
  and raw_payload is not null
  and raw_payload->>'lead_date' is not null
  and (raw_payload->>'lead_date') ~ '^\d+$';

update leads
set created_at = external_created_at
where source = 'Housing.com'
  and external_created_at is not null
  and created_at is not null
  and external_created_at < created_at - interval '1 hour';

-- ---------------------------------------------------------------------
-- 11. BACKFILL leads.follow_up_at from visit_followups
-- ---------------------------------------------------------------------
update leads l
set follow_up_at = sub.latest_at,
    updated_at = now()
from (
  select vf.lead_id, max(vf.follow_up_at) as latest_at
  from visit_followups vf
  where vf.lead_id is not null
    and vf.follow_up_at is not null
    and coalesce(vf.status, 'scheduled') in ('scheduled', 'pending', 'open')
  group by vf.lead_id
) sub
where l.lead_id = sub.lead_id
  and (l.follow_up_at is null or l.follow_up_at < sub.latest_at);

update leads
set follow_up_at = null, updated_at = now()
where status = 'negative' and follow_up_at is not null;

-- ---------------------------------------------------------------------
-- 12. BACKFILL last_employee_action_at (Missed Lead feature)
-- ---------------------------------------------------------------------
update leads l
set last_employee_action_at = sub.latest_at,
    updated_at = now()
from (
  select a.lead_id, max(a.created_at) as latest_at
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
  and l.last_employee_action_at is null
  and l.assigned_to is not null
  and sub.latest_at >= coalesce(l.assigned_at, l.created_at);

-- ---------------------------------------------------------------------
-- 13. SYNC employee leads_assigned / leads_closed from real data
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
-- 14. COLUMN COMMENTS
-- ---------------------------------------------------------------------
comment on column leads.assigned_to is 'employee_id — manager assign, bulk assign, or Excel Assign to column';
comment on column leads.assigned_at is 'When lead was assigned to employee (Excel import / manager assign)';
comment on column leads.assigned_by is 'user_id or employee_id of who assigned';
comment on column leads.last_employee_action_at is 'Last employee workflow action — Missed Lead if null 24h after assigned_at';
comment on column leads.follow_up_at is 'Next follow-up datetime — Follow Up dashboard box';
comment on column leads.call_status is 'ringing | call_back | out_of_service | disconnect';
comment on column leads.priority is 'hot | low_budget | not_searching | handoff_booking | handoff_loan | etc.';
comment on column leads.external_created_at is 'Real enquiry date — Housing, Meta, or Excel Lead Date column';
comment on column leads.source is 'bulk_import = Excel/CSV upload';

-- ---------------------------------------------------------------------
-- 15. VERIFY — check output after run
-- ---------------------------------------------------------------------
select 'total_leads' as metric, count(*)::text as value from leads
union all
select 'assigned_leads', count(*)::text from leads where assigned_to is not null
union all
select 'excel_import_assigned', count(*)::text from leads where source = 'bulk_import' and assigned_to is not null
union all
select 'excel_import_unassigned', count(*)::text from leads where source = 'bulk_import' and assigned_to is null
union all
select 'unassigned_queue', count(*)::text from leads
  where assigned_to is null and status <> 'negative' and stage in ('new', 'assigned')
union all
select 'ringing', count(*)::text from leads
  where call_status is not null and trim(call_status) <> '' and status <> 'negative'
union all
select 'follow_ups', count(*)::text from leads where follow_up_at is not null and status <> 'negative'
union all
select 'missed_leads_24h', count(*)::text from leads
  where assigned_to is not null
    and status = 'active'
    and stage in ('new', 'assigned')
    and (call_status is null or trim(call_status) = '')
    and follow_up_at is null
    and assigned_at is not null
    and assigned_at <= now() - interval '24 hours'
    and (last_employee_action_at is null or last_employee_action_at < assigned_at)
union all
select 'housing_leads', count(*)::text from leads where source ilike '%housing%'
union all
select 'meta_leads', count(*)::text from leads where source ilike '%facebook%'
union all
select 'integration_events', count(*)::text from integration_events;

-- Per-employee dashboard (optional — uncomment to verify boxes):
-- select
--   e.name,
--   count(l.lead_id) filter (where l.status = 'active' and l.stage in ('new','assigned') and (l.call_status is null or trim(l.call_status)='') and l.follow_up_at is null) as queue,
--   count(l.lead_id) filter (where l.call_status is not null and trim(l.call_status) <> '') as ringing,
--   count(l.lead_id) filter (where l.follow_up_at is not null and l.status <> 'negative') as follow_ups,
--   count(l.lead_id) filter (
--     where l.assigned_at <= now() - interval '24 hours'
--       and l.status = 'active' and l.stage in ('new','assigned')
--       and (l.call_status is null or trim(l.call_status) = '') and l.follow_up_at is null
--       and (l.last_employee_action_at is null or l.last_employee_action_at < l.assigned_at)
--   ) as missed_leads
-- from employees e
-- left join leads l on l.assigned_to = e.employee_id
-- where coalesce(e.active, true) is not false
-- group by e.employee_id, e.name
-- order by e.name;

-- Excel import per employee (optional):
-- select e.name, count(*) as excel_leads
-- from leads l
-- join employees e on e.employee_id = l.assigned_to
-- where l.source = 'bulk_import'
-- group by e.name
-- order by excel_leads desc;

-- =====================================================================
-- OPTIONAL: Undo auto-assigned Housing/Meta/Excel leads
-- =====================================================================
/*
update leads
set assigned_to = null, assigned_at = null, assigned_by = null,
    last_employee_action_at = null, stage = 'new', updated_at = now()
where source in ('Housing.com', 'Facebook', 'website', 'bulk_import')
  and assigned_to is not null
  and status = 'active'
  and stage in ('new', 'assigned');
*/

-- =====================================================================
-- OPTIONAL: Full clean reset — run supabase/full_reset_clean.sql
-- =====================================================================
