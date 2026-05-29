-- =============================================================================
-- Umang CRM — Supabase UPDATE script (existing database)
-- Run once in: Supabase Dashboard → SQL Editor → Run
-- Safe to re-run: uses IF NOT EXISTS / IF NOT EXISTS columns
-- Full new project: use supabase/schema.sql instead
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. LEADS — Housing.com, Meta (Facebook), broker pool
-- -----------------------------------------------------------------------------
alter table leads add column if not exists external_lead_id text;
alter table leads add column if not exists integration_uuid text;
alter table leads add column if not exists raw_payload jsonb;
alter table leads add column if not exists lead_type text not null default 'standard';
alter table leads add column if not exists brokerage_amount numeric;
alter table leads add column if not exists notes text;
alter table leads add column if not exists source text not null default 'website';
alter table leads add column if not exists assigned_to text;
alter table leads add column if not exists stage text not null default 'new';
alter table leads add column if not exists status text not null default 'active';
alter table leads add column if not exists priority text;
alter table leads add column if not exists starred boolean not null default false;
alter table leads add column if not exists follow_up_at timestamptz;
alter table leads add column if not exists updated_at timestamptz not null default now();

-- Broker pool leads use stage = 'broker' (ensure stage column allows it; no enum change needed)

-- -----------------------------------------------------------------------------
-- 2. BOOKINGS — brokerage amount on assign
-- -----------------------------------------------------------------------------
alter table bookings add column if not exists brokerage_amount numeric not null default 0;

-- -----------------------------------------------------------------------------
-- 3. INTEGRATION EVENTS — Facebook webhooks, Housing sync logs
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4. INDEXES (dashboard, platform filters, integrations)
-- -----------------------------------------------------------------------------
create index if not exists idx_leads_source on leads(source);
create index if not exists idx_leads_external_lead_id on leads(external_lead_id);
create index if not exists idx_leads_phone_source on leads(phone, source);
create index if not exists idx_leads_created_at on leads(created_at desc);
create index if not exists idx_leads_lead_type on leads(lead_type);
create index if not exists idx_leads_stage_broker on leads(stage) where stage = 'broker';
create index if not exists idx_leads_stage_status on leads(stage, status);
create index if not exists idx_leads_assigned_to on leads(assigned_to);
create index if not exists idx_integration_events_source_created on integration_events(source, created_at desc);
create index if not exists idx_integration_events_external_id on integration_events(external_id);

-- -----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (backend must use SUPABASE_SERVICE_ROLE_KEY on Render)
-- -----------------------------------------------------------------------------
alter table leads enable row level security;
alter table integration_events enable row level security;

drop policy if exists leads_backend_all on leads;
create policy leads_backend_all on leads for all using (true) with check (true);

drop policy if exists integration_events_backend_all on integration_events;
create policy integration_events_backend_all on integration_events for all using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 6. OPTIONAL: backfill lead_type for existing rows
-- -----------------------------------------------------------------------------
update leads
set lead_type = 'standard'
where lead_type is null;

update leads
set lead_type = 'brokerage', stage = 'broker'
where lead_type = 'standard'
  and (
    lower(coalesce(source, '')) like '%broker%'
    or lower(coalesce(stage, '')) = 'broker'
  );

-- -----------------------------------------------------------------------------
-- Done. Verify:
-- select count(*) from leads where source ilike '%housing%';
-- select count(*) from leads where source ilike '%facebook%';
-- select count(*) from integration_events where source = 'Facebook';
