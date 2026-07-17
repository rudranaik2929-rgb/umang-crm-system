-- Cold Leads support
-- No new column required: leads.priority already stores 'cold' / 'hot'.
-- Run in Supabase SQL Editor if you want the index + comment (optional, safe).

alter table leads add column if not exists priority text;

comment on column leads.priority is
  'hot | cold | low_budget | not_searching | handoff_booking | handoff_loan | etc. Cold Lead → Follow Up sets priority=cold + stage=positive.';

-- Speed up Cold Leads dashboard / employee filters
create index if not exists idx_leads_priority_cold
  on leads (priority)
  where lower(priority) = 'cold';

create index if not exists idx_leads_stage_priority
  on leads (stage, priority)
  where status = 'active' and stage = 'positive';

-- Normalize empty priority strings
update leads
set priority = null
where priority is not null and trim(priority) = '';

-- Optional sanity check (read-only):
-- select count(*) as cold_leads
-- from leads
-- where status = 'active'
--   and lower(coalesce(priority, '')) = 'cold'
--   and coalesce(stage, '') = 'positive';
