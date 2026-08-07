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
--    (robust: tries multiple field spellings Housing sends in the API/webhook payload)
update leads
set property_project_id = coalesce(
        nullif(raw_payload->>'property_project_id', ''),
        nullif(raw_payload->>'project_id', ''),
        nullif(raw_payload->>'project', ''),
        nullif(raw_payload->>'project_id_number', '')
    ),
    project_name = coalesce(
        nullif(raw_payload->>'project_name', ''),
        nullif(raw_payload->>'projectname', ''),
        nullif(raw_payload->>'property_name', ''),
        nullif(raw_payload->>'project', '')
    ),
    service_type = coalesce(
        nullif(raw_payload->>'service_type', ''),
        nullif(raw_payload->>'service_type_name', ''),
        nullif(raw_payload->>'service', ''),
        nullif(raw_payload->>'enquiry_type', '')
    ),
    locality = coalesce(
        nullif(raw_payload->>'locality_name', ''),
        nullif(raw_payload->>'locality', ''),
        nullif(raw_payload->>'project_locality', '')
    ),
    city = coalesce(
        nullif(raw_payload->>'city_name', ''),
        nullif(raw_payload->>'city', '')
    ),
    price_range = coalesce(
        nullif(raw_payload->>'price_range', ''),
        nullif(raw_payload->>'budget_range', ''),
        nullif(raw_payload->>'price', ''),
        nullif(raw_payload->>'price_budget', ''),
        nullif(raw_payload->>'budget', '')
    ),
    lead_received_at = coalesce(
        -- epoch milliseconds
        case when raw_payload->>'lead_date' ~ '^\d{13}$'
            then to_timestamp((raw_payload->>'lead_date')::numeric / 1000.0)
            when raw_payload->>'created_time' ~ '^\d{13}$'
            then to_timestamp((raw_payload->>'created_time')::numeric / 1000.0)
            when raw_payload->>'submitted_at' ~ '^\d{13}$'
            then to_timestamp((raw_payload->>'submitted_at')::numeric / 1000.0)
        end,
        -- epoch seconds
        case when raw_payload->>'lead_date' ~ '^\d{10}$'
            then to_timestamp((raw_payload->>'lead_date')::numeric)
            when raw_payload->>'created_time' ~ '^\d{10}$'
            then to_timestamp((raw_payload->>'created_time')::numeric)
        end,
        -- ISO timestamps
        case when raw_payload->>'lead_date' ~ '^\d{4}-\d{2}-\d{2}'
            then (raw_payload->>'lead_date')::timestamptz
            when raw_payload->>'created_time' ~ '^\d{4}-\d{2}-\d{2}'
            then (raw_payload->>'created_time')::timestamptz
        end,
        lead_received_at
    )
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

-- =====================================================================
-- 5) SHOW PREVIOUSLY STORED HOUSING LEADS AGAIN
--    The app hides every lead whose enquiry date is before
--    INTEGRATION_LEAD_START (default 2026-08-01). If you set it to
--    2026-08-07 to stop old imports, previously stored Housing rows
--    (Aug 1-6) are hidden from every list/dashboard.
--    Run ONLY if you want old stored Housing rows visible again:
-- =====================================================================
-- update leads set external_created_at = created_at where source = 'Housing.com' and external_created_at is null;
-- (No data change needed here — just set the backend env var below)
--   Render env:  INTEGRATION_LEAD_START=2026-08-01T00:00:00+05:30   then Redeploy.
--   (or remove INTEGRATION_LEAD_START entirely — the code default is 2026-08-01)
