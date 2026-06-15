-- Employee Performance workflow boxes (Hot, Visited, Not Interested, Booking Done, Low Budget, Follow Up, Ringing)
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- Ensure lead fields used for per-employee counts exist
alter table leads add column if not exists priority text;
alter table leads add column if not exists call_status text;
alter table leads add column if not exists assigned_to text;
alter table leads add column if not exists follow_up_at timestamptz;

-- Indexes for fast employee-wise dashboard counts
create index if not exists idx_leads_assigned_to on leads(assigned_to) where assigned_to is not null;
create index if not exists idx_leads_assigned_stage_status on leads(assigned_to, stage, status) where assigned_to is not null;
create index if not exists idx_leads_assigned_priority on leads(assigned_to, priority) where assigned_to is not null and priority is not null;
create index if not exists idx_leads_assigned_call_status on leads(assigned_to, call_status) where assigned_to is not null and call_status is not null;
create index if not exists idx_leads_assigned_follow_up on leads(assigned_to, follow_up_at desc) where assigned_to is not null and follow_up_at is not null;
create index if not exists idx_leads_follow_up_at on leads(follow_up_at desc) where follow_up_at is not null;

-- Optional: normalize empty strings to null so Ringing count is accurate
update leads set call_status = null where call_status is not null and trim(call_status) = '';
update leads set priority = null where priority is not null and trim(priority) = '';

-- Verify per-employee breakdown (replace employee id as needed)
-- select
--   assigned_to,
--   count(*) filter (where status <> 'negative' and stage <> 'closed') as active,
--   count(*) filter (where lower(priority) = 'hot' and status <> 'negative') as hot,
--   count(*) filter (where status <> 'negative' and stage in ('site_visit', 'positive')) as visited,
--   count(*) filter (where status = 'negative') as not_interested,
--   count(*) filter (where stage in ('booking', 'loan', 'registration')) as booking_done,
--   count(*) filter (where lower(priority) = 'low_budget') as low_budget,
--   count(*) filter (where call_status is not null and trim(call_status) <> '') as ringing
-- from leads
-- where assigned_to is not null
-- group by assigned_to;
