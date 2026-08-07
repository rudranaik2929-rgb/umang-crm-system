-- =====================================================================
-- Housing.com pipeline fix — run in Supabase SQL Editor (BEFORE deploying
-- the new backend code that writes these columns).
-- =====================================================================

-- 1) Add missing columns to leads (idempotent)
alter table leads add column if not exists property_project_id text;
alter table leads add column if not exists project_name       text;
alter table leads add column if not exists service_type       text;
alter table leads add column if not exists locality           text;
alter table leads add column if not exists city               text;
alter table leads add column if not exists price_range        text;
alter table leads add column if not exists lead_received_at   timestamptz;
-- external_lead_id already exists on leads.

-- 2) Indexes for the composite dedupe lookup (phone + project + lead_date)
create index if not exists idx_leads_housing_composite
  on leads (source, phone, property_project_id, lead_received_at);
create index if not exists idx_leads_housing_lead_received_at
  on leads (source, lead_received_at);

-- 3) Backfill new columns from raw_payload for existing Housing.com leads
update leads
set property_project_id = nullif(raw_payload->>'project_id', ''),
    project_name       = nullif(raw_payload->>'project_name', ''),
    service_type       = nullif(raw_payload->>'service_type', ''),
    locality           = nullif(raw_payload->>'locality', ''),
    city               = nullif(raw_payload->>'city', ''),
    price_range        = nullif(raw_payload->>'price_range', ''),
    lead_received_at   = case
        when raw_payload->>'lead_date' ~ '^\d{10,13}$'
            then to_timestamp((raw_payload->>'lead_date')::numeric / 1000.0)
        when raw_payload->>'lead_date' ~ '^\d{4}-\d{2}-\d{2}'
            then (raw_payload->>'lead_date')::timestamptz
        else lead_received_at
    end
where source = 'Housing.com'
  and raw_payload is not null;

-- 4) Sanity check after running the above
select
  count(*)                                                    as housing_rows,
  count(property_project_id)                                  as with_project_id,
  count(project_name)                                         as with_project_name,
  count(service_type)                                         as with_service_type,
  count(lead_received_at)                                     as with_lead_received_at
from leads
where source = 'Housing.com';
