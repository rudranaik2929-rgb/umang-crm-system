-- =============================================================================
-- Housing.com lead phone backfill
-- Run once in Supabase SQL Editor (safe to re-run).
--
-- Problem: Housing.com's pull API masks the customer's phone/email
-- (lead_phone = null), so those leads were stored with an EMPTY phone column
-- and show "—" in the Total Leads popup / call buttons.
--
-- This script recovers the real number from raw_payload (webhook / CSV / newer
-- poll payloads carry it under many spellings) and writes it into leads.phone
-- in the standard CRM format 91XXXXXXXXXX.
--
-- Masked-looking values (********, xxxx, 0000000000, 1111111111, ...) are
-- skipped, so no placeholder ever overwrites a real number.
-- =============================================================================

with candidates as (
    select
        lead_id,
        coalesce(
            nullif(regexp_replace(coalesce(raw_payload->>'lead_phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'mobile', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'mobile_number', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'phone_number', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'contact_number', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'customer_phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'contact_phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'enquirer_phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'caller_phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'requester_phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'mobile_no', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->>'whatsapp', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->'contact'->>'phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->'contact'->>'mobile', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->'customer'->>'phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->'customer'->>'mobile', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->'user'->>'phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->'user'->>'mobile', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->'contact_details'->>'phone', ''), '\D', '', 'g'), ''),
            nullif(regexp_replace(coalesce(raw_payload->'customer_details'->>'phone', ''), '\D', '', 'g'), '')
        ) as digits
    from leads
    where source ilike '%housing%'
      and coalesce(phone, '') = ''
      and raw_payload is not null
),
normalized as (
    select
        lead_id,
        case
            when digits ~ '^[0-9]{10}$'            then '91' || digits
            when digits ~ '^0[0-9]{10}$'           then '91' || substring(digits from 2)
            when digits ~ '^91[0-9]{10}$'          then digits
            when digits ~ '^[0-9]{12,13}$'
                 and digits ~ '^91'
                 then left(digits, 12)
        end as final_phone
    from candidates
    -- reject masked/placeholder values (all-same digits like 0000000000)
    where digits !~ '^(\d)\1+$'
)
update leads l
set phone = n.final_phone,
    updated_at = now()
from normalized n
where l.lead_id = n.lead_id
  and n.final_phone is not null;

-- ---------------------------------------------------------------------------
-- Sanity check: how many Housing leads are still phone-less after the backfill
-- ---------------------------------------------------------------------------
select
    count(*)                              as total_housing,
    count(*) filter (where coalesce(phone, '') <> '') as with_phone,
    count(*) filter (where coalesce(phone, '') = '')  as still_no_phone
from leads
where source ilike '%housing%';