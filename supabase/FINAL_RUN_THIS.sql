-- =====================================================================
-- UMANG HOMETECH LLP CRM — FINAL SUPABASE SQL (run once in SQL Editor)
-- =====================================================================
-- Safe to re-run (idempotent). Covers everything in current production app:
--   • Housing / Meta integrations
--   • Auto-assign + bulk assign (assigned_at, assigned_by)
--   • Employee performance boxes (Active, Hot, Visited, etc.)
--   • Follow-ups, call status, round-robin indexes
--   • Data backfills so dashboard counts match lists
--
-- ORDER:
--   1. Run THIS file on your Supabase project
--   2. Deploy latest backend (Render) + frontend (Vercel)
--   3. Optional fresh start: run full_reset_clean.sql (separate file)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LEADS — columns required by app
-- ---------------------------------------------------------------------
alter table leads add column if not exists assigned_to text;
alter table leads add column if not exists assigned_at timestamptz;
alter table leads add column if not exists assigned_by text;
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

-- ---------------------------------------------------------------------
-- 2. EMPLOYEES — round-robin + dashboard counters
-- ---------------------------------------------------------------------
alter table employees add column if not exists last_assigned_at timestamptz;
alter table employees add column if not exists leads_assigned integer not null default 0;
alter table employees add column if not exists leads_closed integer not null default 0;
alter table employees add column if not exists performance integer not null default 0;

-- ---------------------------------------------------------------------
-- 3. VISIT FOLLOW-UPS
-- ---------------------------------------------------------------------
alter table visit_followups add column if not exists lead_id text;
alter table visit_followups add column if not exists follow_up_at timestamptz;
alter table visit_followups add column if not exists status text not null default 'scheduled';

-- ---------------------------------------------------------------------
-- 4. BOOKINGS
-- ---------------------------------------------------------------------
alter table bookings add column if not exists brokerage_amount numeric not null default 0;

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
-- 6. INDEXES — fast dashboard, assign queue, integrations
-- ---------------------------------------------------------------------
create index if not exists idx_leads_assigned_to on leads(assigned_to) where assigned_to is not null;
create index if not exists idx_leads_assigned_at on leads(assigned_at desc) where assigned_at is not null;
create index if not exists idx_leads_unassigned on leads(stage, status) where assigned_to is null;
create index if not exists idx_leads_assigned_stage_status on leads(assigned_to, stage, status) where assigned_to is not null;
create index if not exists idx_leads_assigned_priority on leads(assigned_to, priority) where assigned_to is not null and priority is not null;
create index if not exists idx_leads_assigned_call_status on leads(assigned_to, call_status) where assigned_to is not null and call_status is not null;
create index if not exists idx_leads_assigned_follow_up on leads(assigned_to, follow_up_at desc) where follow_up_at is not null;
create index if not exists idx_leads_follow_up_at on leads(follow_up_at desc) where follow_up_at is not null;
create index if not exists idx_leads_call_status on leads(call_status) where call_status is not null;
create index if not exists idx_leads_source on leads(source);
create index if not exists idx_leads_external_lead_id on leads(external_lead_id);
create index if not exists idx_leads_external_created_at on leads(external_created_at desc) where external_created_at is not null;
create index if not exists idx_visit_followups_lead_id on visit_followups(lead_id);
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
-- 9. BACKFILL assigned_at (auto-assign + manager assign timestamps)
-- ---------------------------------------------------------------------
update leads
set assigned_at = coalesce(assigned_at, updated_at, created_at)
where assigned_to is not null
  and assigned_at is null;

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
-- 12. SYNC employee leads_assigned / leads_closed from real data
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
-- 13. COMMENTS
-- ---------------------------------------------------------------------
comment on column leads.assigned_at is 'When lead was assigned (auto round-robin or manager bulk assign)';
comment on column leads.assigned_by is 'user_id or employee_id of manager who assigned';
comment on column leads.external_created_at is 'Real submission time from Housing lead_date or Meta created_time';

-- ---------------------------------------------------------------------
-- 14. VERIFY (read-only — check output after run)
-- ---------------------------------------------------------------------
select 'total_leads' as metric, count(*)::text as value from leads
union all
select 'assigned_leads', count(*)::text from leads where assigned_to is not null
union all
select 'unassigned_queue', count(*)::text from leads
  where assigned_to is null and status <> 'negative' and stage in ('new', 'assigned')
union all
select 'housing_leads', count(*)::text from leads where source ilike '%housing%'
union all
select 'meta_leads', count(*)::text from leads where source ilike '%facebook%'
union all
select 'follow_ups', count(*)::text from leads where follow_up_at is not null and status <> 'negative'
union all
select 'integration_events', count(*)::text from integration_events;

-- Per-employee workflow boxes (should match Dashboard Employee Performance):
-- select
--   assigned_to,
--   count(*) filter (where status <> 'negative' and stage <> 'closed') as active,
--   count(*) filter (where lower(priority) = 'hot' and status <> 'negative') as hot,
--   count(*) filter (where status <> 'negative' and stage in ('site_visit', 'positive')) as visited,
--   count(*) filter (where status = 'negative') as not_interested,
--   count(*) filter (where stage in ('booking', 'loan', 'registration')) as booking_done,
--   count(*) filter (where lower(priority) = 'low_budget') as low_budget,
--   count(*) filter (where call_status is not null and trim(call_status) <> '') as ringing
-- from leads where assigned_to is not null group by assigned_to;

-- =====================================================================
-- OPTIONAL: Full clean reset (assignments, loans, bookings → 0)
-- Run supabase/full_reset_clean.sql separately when you want fresh numbers.
-- =====================================================================
