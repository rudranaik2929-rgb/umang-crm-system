-- Run in Supabase SQL Editor after schema.sql (or if Housing webhooks fail with RLS errors).
-- Ensures leads + integration_events accept inserts from the CRM backend.

alter table leads add column if not exists external_lead_id text;
alter table leads add column if not exists integration_uuid text;
alter table leads add column if not exists raw_payload jsonb;
alter table leads add column if not exists lead_type text not null default 'standard';
alter table leads add column if not exists brokerage_amount numeric;
alter table bookings add column if not exists brokerage_amount numeric not null default 0;

alter table leads enable row level security;
alter table integration_events enable row level security;

drop policy if exists leads_backend_all on leads;
create policy leads_backend_all on leads for all using (true) with check (true);

drop policy if exists integration_events_backend_all on integration_events;
create policy integration_events_backend_all on integration_events for all using (true) with check (true);

create index if not exists idx_leads_source on leads(source);
create index if not exists idx_leads_external_lead_id on leads(external_lead_id);
