-- =====================================================================
-- UMANG HOMETECH LLP — FINAL FIX ALL (run once in Supabase SQL Editor)
-- ---------------------------------------------------------------------
-- 1. Ensures full schema + indexes (safe to re-run)
-- 2. Backfills assignment + follow-up data so dashboard counts match lists
-- 3. Syncs employee summary columns from real lead data
--
-- If this is a NEW project with no tables yet, run final_schema.sql first,
-- then run this file. On an EXISTING project, you can run ONLY this file.
-- =====================================================================

-- ---------------------------------------------------------------------
-- A. SCHEMA SAFETY (columns + indexes required for correct counts)
-- ---------------------------------------------------------------------
alter table leads add column if not exists assigned_to text;
alter table leads add column if not exists assigned_at timestamptz;
alter table leads add column if not exists assigned_by text;
alter table leads add column if not exists follow_up_at timestamptz;
alter table leads add column if not exists call_status text;
alter table leads add column if not exists stage text not null default 'new';
alter table leads add column if not exists status text not null default 'active';

alter table visit_followups add column if not exists lead_id text;
alter table visit_followups add column if not exists follow_up_at timestamptz;
alter table visit_followups add column if not exists status text not null default 'scheduled';
alter table visit_followups alter column visit_id drop not null;

alter table employees add column if not exists leads_assigned integer not null default 0;
alter table employees add column if not exists leads_closed integer not null default 0;

create index if not exists idx_leads_assigned_to on leads(assigned_to);
create index if not exists idx_leads_assigned_at on leads(assigned_at desc) where assigned_at is not null;
create index if not exists idx_leads_follow_up_at on leads(follow_up_at desc) where follow_up_at is not null;
create index if not exists idx_leads_unassigned on leads(stage, status) where assigned_to is null;
create index if not exists idx_leads_assigned_stage_status on leads(assigned_to, stage, status);
create index if not exists idx_leads_assigned_follow_up on leads(assigned_to, follow_up_at desc) where follow_up_at is not null;
create index if not exists idx_visit_followups_lead_id on visit_followups(lead_id);
create index if not exists idx_visit_followups_at on visit_followups(follow_up_at desc);

-- ---------------------------------------------------------------------
-- B. BACKFILL assigned_at (when lead has assignee but no timestamp)
-- ---------------------------------------------------------------------
update leads
set assigned_at = coalesce(assigned_at, updated_at, created_at)
where assigned_to is not null
  and assigned_at is null;

-- ---------------------------------------------------------------------
-- C. BACKFILL leads.follow_up_at from latest visit_followups row
--     (fixes telecaller follow-up count vs dashboard mismatch)
-- ---------------------------------------------------------------------
update leads l
set follow_up_at = sub.latest_at,
    updated_at = now()
from (
  select
    vf.lead_id,
    max(vf.follow_up_at) as latest_at
  from visit_followups vf
  where vf.lead_id is not null
    and vf.follow_up_at is not null
    and coalesce(vf.status, 'scheduled') in ('scheduled', 'pending', 'open')
  group by vf.lead_id
) sub
where l.lead_id = sub.lead_id
  and (l.follow_up_at is null or l.follow_up_at < sub.latest_at);

-- Clear follow_up_at on not-interested leads (matches app filter)
update leads
set follow_up_at = null,
    updated_at = now()
where status = 'negative'
  and follow_up_at is not null;

-- ---------------------------------------------------------------------
-- D. SYNC employee summary columns from real assigned leads
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
where not exists (
  select 1 from leads l where l.assigned_to = e.employee_id
);

-- ---------------------------------------------------------------------
-- E. OPTIONAL: normalize manual_entry source label → website/manual
--     (app displays as "Database" — no DB rename required)
-- ---------------------------------------------------------------------
-- update leads set source = 'manual_entry' where source in ('Manual Entry', 'manual entry');

-- ---------------------------------------------------------------------
-- F. VERIFICATION QUERIES (run manually after migration — read-only)
-- ---------------------------------------------------------------------
-- Total assigned per employee (should match Assign Leads → Assigned):
--   select assigned_to, count(*) from leads where assigned_to is not null group by assigned_to order by count(*) desc;
--
-- Telecaller queue (new + assigned, active only — should match Queue count):
--   select assigned_to, count(*) from leads
--   where assigned_to is not null and status = 'active' and stage in ('new','assigned')
--   group by assigned_to;
--
-- Follow-ups per employee (should match Follow Ups tab):
--   select assigned_to, count(*) from leads
--   where assigned_to is not null and follow_up_at is not null and status <> 'negative'
--   group by assigned_to;
--
-- Company-wide follow-ups (should match owner Dashboard Follow Ups box):
--   select count(*) from leads where follow_up_at is not null and status <> 'negative';
