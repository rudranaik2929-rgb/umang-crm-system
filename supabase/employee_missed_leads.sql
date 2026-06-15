-- =====================================================================
-- MISSED LEAD — employee dashboard (24h no response after assignment)
-- Run in Supabase SQL Editor after FINAL_RUN_THIS.sql
-- =====================================================================
-- Logic (app):
--   • Manager assigns lead → assigned_at set, last_employee_action_at cleared
--   • Employee updates status (ringing, visited, not interested, etc.)
--     → last_employee_action_at set → lead leaves Missed Lead box
--   • If still new/assigned with no action 24h after assigned_at → Missed Lead
-- =====================================================================

alter table leads add column if not exists last_employee_action_at timestamptz;

comment on column leads.last_employee_action_at is
  'Last time assigned employee changed workflow (stage/status/call_status/priority/follow-up). Used for Missed Lead (24h rule).';

create index if not exists idx_leads_missed_candidates
  on leads(assigned_to, assigned_at desc)
  where assigned_to is not null
    and status = 'active'
    and stage in ('new', 'assigned')
    and (call_status is null or trim(call_status) = '')
    and follow_up_at is null;

-- Optional: backfill last action from most recent employee activity on each lead
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
  and l.assigned_to is not null;

-- Verify missed-lead candidates per employee (assigned 24h+ ago, no employee action)
-- select
--   assigned_to,
--   count(*) as missed_leads
-- from leads
-- where assigned_to is not null
--   and status = 'active'
--   and stage in ('new', 'assigned')
--   and (call_status is null or trim(call_status) = '')
--   and follow_up_at is null
--   and assigned_at is not null
--   and assigned_at <= now() - interval '24 hours'
--   and (last_employee_action_at is null or last_employee_action_at < assigned_at)
-- group by assigned_to;
