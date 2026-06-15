-- =============================================================================
-- Employee Performance + My Dashboard — Follow Up box
-- Run once in Supabase SQL Editor (safe to re-run).
-- No new tables. Ensures follow_up_at on leads is populated and indexed so
-- per-employee Follow Up counts match the app (Dashboard + My Dashboard).
-- =============================================================================

-- 1. Columns used by workflow / follow-up counts
alter table leads add column if not exists priority text;
alter table leads add column if not exists call_status text;
alter table leads add column if not exists assigned_to text;
alter table leads add column if not exists follow_up_at timestamptz;
alter table leads add column if not exists status text default 'active';
alter table leads add column if not exists stage text default 'new';
alter table leads add column if not exists lead_type text;

alter table visit_followups add column if not exists follow_up_at timestamptz;
alter table visit_followups add column if not exists follow_up_date date;
alter table visit_followups add column if not exists follow_up_time time;
alter table visit_followups add column if not exists follow_up_day text;
alter table visit_followups add column if not exists lead_id text;
alter table visit_followups add column if not exists status text default 'scheduled';

-- 2. Indexes — fast per-employee follow-up + ringing counts
create index if not exists idx_leads_assigned_to on leads(assigned_to) where assigned_to is not null;
create index if not exists idx_leads_assigned_follow_up on leads(assigned_to, follow_up_at desc)
  where assigned_to is not null and follow_up_at is not null;
create index if not exists idx_leads_follow_up_at on leads(follow_up_at desc)
  where follow_up_at is not null;
create index if not exists idx_leads_assigned_call_status on leads(assigned_to, call_status)
  where assigned_to is not null and call_status is not null and trim(call_status) <> '';
create index if not exists idx_visit_followups_lead on visit_followups(lead_id) where lead_id is not null;
create index if not exists idx_visit_followups_at on visit_followups(follow_up_at desc);

-- 3. Normalize empty strings (accurate Ringing / priority counts)
update leads set call_status = null where call_status is not null and trim(call_status) = '';
update leads set priority = null where priority is not null and trim(priority) = '';

-- 4. Backfill leads.follow_up_at from latest visit_followups row per lead
update leads l
set follow_up_at = sub.latest_at,
    updated_at = now()
from (
  select vf.lead_id, max(vf.follow_up_at) as latest_at
  from visit_followups vf
  where vf.lead_id is not null
    and vf.follow_up_at is not null
  group by vf.lead_id
) sub
where l.lead_id = sub.lead_id
  and (l.follow_up_at is null or l.follow_up_at < sub.latest_at);

-- 5. Not-interested leads should not show in Follow Up box
update leads
set follow_up_at = null,
    updated_at = now()
where status = 'negative'
  and follow_up_at is not null;

-- 6. Verify counts (team total + sample per employee)
select 'team_follow_ups' as metric, count(*)::text as value
from leads
where follow_up_at is not null and status <> 'negative';

select
  e.employee_id,
  e.name,
  e.role,
  count(l.lead_id) filter (
    where l.follow_up_at is not null and l.status <> 'negative'
  ) as follow_ups,
  count(l.lead_id) filter (
    where l.call_status is not null and trim(l.call_status) <> '' and l.status <> 'negative'
  ) as ringing,
  count(l.lead_id) filter (where l.status <> 'negative' and l.stage <> 'closed') as active_leads
from employees e
left join leads l on l.assigned_to = e.employee_id
where e.active is not false
group by e.employee_id, e.name, e.role
order by follow_ups desc, e.name;
