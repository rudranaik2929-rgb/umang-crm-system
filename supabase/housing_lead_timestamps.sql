-- Housing.com: store real lead submission time + prevent duplicate re-imports
-- Run in Supabase SQL Editor (safe to run multiple times).

alter table leads add column if not exists external_created_at timestamptz;

create index if not exists idx_leads_external_created_at
  on leads(external_created_at desc)
  where external_created_at is not null;

create index if not exists idx_integration_events_housing_checkpoint
  on integration_events(source, status, created_at desc)
  where source = 'Housing.com' and status = 'housing_sync_checkpoint';

-- Backfill external_created_at from Housing raw_payload.lead_date (Unix seconds/ms)
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

-- Align created_at with real Housing submission time where missing or wrong
update leads
set created_at = external_created_at
where source = 'Housing.com'
  and external_created_at is not null
  and (created_at is null or created_at > now() + interval '1 day');
