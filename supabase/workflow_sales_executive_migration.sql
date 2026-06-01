-- ============================================================================
-- Umang CRM — Sales Executive workflow (replaces Site Visits in navigation)
-- Run once in Supabase SQL Editor. Safe to re-run.
-- ============================================================================

-- Optional: map legacy site_visit role employees to sales_executive label in app only.
-- DB role key can stay site_visit; new employees may use sales_executive.

-- Ensure follow-up table exists (from main schema)
create table if not exists visit_followups (
  followup_id text primary key,
  visit_id text,
  lead_id text,
  lead_name text,
  follow_up_date text,
  follow_up_time text,
  follow_up_day text,
  follow_up_at timestamptz,
  status text not null default 'scheduled',
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists visit_followups_lead_id_idx on visit_followups (lead_id);
create index if not exists visit_followups_follow_up_at_idx on visit_followups (follow_up_at desc);

-- Grant managers visibility: no schema change required; API returns employee_name on follow-ups.
