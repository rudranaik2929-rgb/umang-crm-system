-- =====================================================================
-- Compare Housing.com export vs CRM database (run in Supabase SQL Editor)
-- =====================================================================

-- 1) CRM Housing.com rows received per day (last 10 days)
select date(lead_received_at) as received_day, count(*) as crm_rows
from leads
where source = 'Housing.com'
group by 1
order by 1 desc
limit 10;

-- 2) CRM rows for 07/08/2026 by phone + project + day (composite key)
select phone,
       coalesce(property_project_id, raw_payload->>'project_id') as project_id,
       date(lead_received_at) as day,
       count(*) as rows
from leads
where source = 'Housing.com'
  and lead_received_at >= '2026-08-07' and lead_received_at < '2026-08-08'
group by 1, 2, 3
order by rows desc;

-- 3) TOTAL CRM Housing.com rows for 07/08/2026  (the number to report to client)
select count(*) as final_db_count_07_08
from leads
where source = 'Housing.com'
  and lead_received_at >= '2026-08-07' and lead_received_at < '2026-08-08';

-- =====================================================================
-- Full reconciliation vs the client export.
-- 1) Paste the 33 export rows into the temp table (phone 10-digit, project, date)
-- =====================================================================
drop table if exists housing_export;
create temp table housing_export (
  phone      text,
  project_id text,
  lead_date  date
);
-- insert into housing_export (phone, project_id, lead_date) values
-- ('7977229056', 'PROJECT_A', '2026-08-07'),
-- ('7977229056', 'PROJECT_B', '2026-08-07');
-- ... paste all 33 rows here ...

-- Export rows MISSING from CRM (should return 0 rows after a successful resync)
select e.phone, e.project_id, e.lead_date
from housing_export e
left join leads l
  on l.source = 'Housing.com'
 and l.phone = '91' || e.phone
 and (l.property_project_id = e.project_id or l.raw_payload->>'project_id' = e.project_id)
 and date(l.lead_received_at) = e.lead_date
where l.lead_id is null;

-- CRM rows NOT in the export (over-import / mismatches)
select l.phone,
       coalesce(l.property_project_id, l.raw_payload->>'project_id') as project_id,
       date(l.lead_received_at) as day
from leads l
left join housing_export e
  on l.phone = '91' || e.phone
 and (l.property_project_id = e.project_id or l.raw_payload->>'project_id' = e.project_id)
 and date(l.lead_received_at) = e.lead_date
where l.source = 'Housing.com'
  and date(l.lead_received_at) = date '2026-08-07'
  and e.phone is null;

-- =====================================================================
-- The 4 verification phones: must each produce a SEPARATE lead per project
-- =====================================================================
select phone,
       coalesce(property_project_id, raw_payload->>'project_id') as project_id,
       date(lead_received_at) as day,
       count(*) as leads_per_project
from leads
where source = 'Housing.com'
  and phone in ('917977229056', '917617803752', '918379004050', '919930504887')
group by 1, 2, 3
order by phone, project_id;
