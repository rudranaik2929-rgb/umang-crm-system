-- Assign Leads feature + lead assignment tracking
-- Run in Supabase SQL Editor (safe to re-run).

alter table leads add column if not exists assigned_at timestamptz;
alter table leads add column if not exists assigned_by text;

create index if not exists idx_leads_assigned_at on leads(assigned_at desc) where assigned_at is not null;
create index if not exists idx_leads_unassigned on leads(stage, status) where assigned_to is null;

-- Optional: keep employee counters in sync when leads are assigned (application also updates these).
-- Existing columns: employees.leads_assigned, employees.leads_closed

comment on column leads.assigned_at is 'When a manager assigned this lead to an employee';
comment on column leads.assigned_by is 'user_id or employee_id of manager who assigned';
