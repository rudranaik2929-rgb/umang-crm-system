-- =============================================================================
-- Assign Site Visitor (telecaller → sales executive / site_visit)
-- Run once in Supabase SQL Editor (safe to re-run).
--
-- Design: columns on `leads` (same pattern as assigned_to / assigned_by / assigned_at).
-- Does NOT change primary ownership (`assigned_to`) — exclusive Hot/Cold/etc. boxes stay intact.
-- New additive metric "Site Visit Assigned" counts leads where the employee is either:
--   • site_visitor_id     (assignee — who will visit)
--   • site_visit_assigned_by (assigner — telecaller who assigned)
-- =============================================================================

-- 1. Columns
alter table leads add column if not exists site_visitor_id text;
alter table leads add column if not exists site_visit_assigned_by text;
alter table leads add column if not exists site_visit_assigned_at timestamptz;

comment on column leads.site_visitor_id is
  'Employee (sales_executive / site_visit) assigned to do the site visit. Separate from assigned_to.';
comment on column leads.site_visit_assigned_by is
  'Employee who assigned the site visitor (usually telecaller).';
comment on column leads.site_visit_assigned_at is
  'When the site visitor was assigned.';

-- 2. Indexes for dashboard metric + drill-down
create index if not exists idx_leads_site_visitor_id
  on leads (site_visitor_id)
  where site_visitor_id is not null;

create index if not exists idx_leads_site_visit_assigned_by
  on leads (site_visit_assigned_by)
  where site_visit_assigned_by is not null;

create index if not exists idx_leads_site_visit_assigned_at
  on leads (site_visit_assigned_at desc)
  where site_visit_assigned_at is not null;

-- 3. Normalize empty strings
update leads
set site_visitor_id = null
where site_visitor_id is not null and trim(site_visitor_id) = '';

update leads
set site_visit_assigned_by = null
where site_visit_assigned_by is not null and trim(site_visit_assigned_by) = '';

-- 4. Optional sanity checks (read-only)
-- select count(*) as site_visit_assigned
-- from leads
-- where site_visitor_id is not null;
--
-- select e.employee_id, e.name, e.role,
--   count(l.lead_id) filter (where l.site_visitor_id = e.employee_id) as as_visitor,
--   count(l.lead_id) filter (where l.site_visit_assigned_by = e.employee_id) as as_assigner
-- from employees e
-- left join leads l
--   on l.site_visitor_id = e.employee_id or l.site_visit_assigned_by = e.employee_id
-- where e.active is not false
-- group by e.employee_id, e.name, e.role
-- order by (count(l.lead_id)) desc, e.name;
