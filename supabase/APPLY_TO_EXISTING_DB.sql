-- Run this in Supabase → SQL Editor if your database was created before Housing/Meta/Broker updates.
-- Full fresh setup: use supabase/schema.sql instead.

-- Leads: Housing.com + Meta + broker pool columns
alter table leads add column if not exists external_lead_id text;
alter table leads add column if not exists integration_uuid text;
alter table leads add column if not exists raw_payload jsonb;
alter table leads add column if not exists lead_type text not null default 'standard';
alter table leads add column if not exists brokerage_amount numeric;
alter table leads add column if not exists notes text;
alter table leads add column if not exists source text not null default 'website';
alter table leads add column if not exists stage text not null default 'new';
alter table leads add column if not exists status text not null default 'active';
alter table leads add column if not exists updated_at timestamptz not null default now();

-- Bookings: brokerage on assign
alter table bookings add column if not exists brokerage_amount numeric not null default 0;

-- Integration event log (Facebook webhooks, Housing sync, etc.)
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

-- Indexes
create index if not exists idx_leads_source on leads(source);
create index if not exists idx_leads_external_lead_id on leads(external_lead_id);
create index if not exists idx_leads_phone_source on leads(phone, source);
create index if not exists idx_leads_created_at on leads(created_at desc);
create index if not exists idx_leads_lead_type on leads(lead_type);
create index if not exists idx_leads_stage_broker on leads(stage) where stage = 'broker';
create index if not exists idx_integration_events_source_created on integration_events(source, created_at desc);
create index if not exists idx_integration_events_external_id on integration_events(external_id);

-- RLS: backend uses SUPABASE_SERVICE_ROLE_KEY (required for webhooks)
alter table leads enable row level security;
alter table integration_events enable row level security;

drop policy if exists leads_backend_all on leads;
create policy leads_backend_all on leads for all using (true) with check (true);

drop policy if exists integration_events_backend_all on integration_events;
create policy integration_events_backend_all on integration_events for all using (true) with check (true);
