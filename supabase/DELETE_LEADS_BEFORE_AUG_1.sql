-- =====================================================================
-- UMANG CRM — DELETE ALL LEADS BEFORE 1 AUG 2026 (run ONCE in Supabase SQL Editor)
-- ---------------------------------------------------------------------
-- What is deleted:
--   Every lead whose real enquiry date (external_created_at, else created_at)
--   is BEFORE 2026-08-01 00:00 IST, plus its lead_notes, activities, visits,
--   visit_followups, notifications and integration_events rows.
--
-- What is KEPT (only links are detached, details are NOT deleted):
--   bookings    → booking.lead_id set to NULL, all booking fields kept
--   loans       → loan.lead_id set to NULL, all loan fields kept
--   customers   → customer.lead_id set to NULL, all customer fields kept
--   employees / users / sessions / roles / templates / campaigns / etc.
--
-- Extra safety:
--   Facebook/Housing lead ids that are deleted are recorded as "suppressed"
--   in integration_events, so background sync never re-creates them.
--   (The backend also blocks any Facebook/Housing lead dated before 1 Aug.)
-- =====================================================================

-- 1. Snapshot the leads to delete (enquiry date before Aug 1 midnight IST)
create temp table if not exists tmp_leads_to_delete on commit drop as
select lead_id, source, external_lead_id
from public.leads
where coalesce(external_created_at, created_at)
      < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata');

-- 2. Detach child records (delete rows that belong to these leads)
delete from public.lead_notes      where lead_id in (select lead_id from tmp_leads_to_delete);
delete from public.activities      where lead_id in (select lead_id from tmp_leads_to_delete);
delete from public.visit_followups where lead_id in (select lead_id from tmp_leads_to_delete);
delete from public.visits          where lead_id in (select lead_id from tmp_leads_to_delete);
delete from public.notifications   where lead_id in (select lead_id from tmp_leads_to_delete);
delete from public.integration_events where lead_id in (select lead_id from tmp_leads_to_delete);

-- 3. Keep bookings / loans / customers — just clear the link to the deleted lead
update public.bookings  set lead_id = null, updated_at = now() where lead_id in (select lead_id from tmp_leads_to_delete);
update public.loans     set lead_id = null, updated_at = now() where lead_id in (select lead_id from tmp_leads_to_delete);
update public.customers set lead_id = null, updated_at = now() where lead_id in (select lead_id from tmp_leads_to_delete);

-- 4. Suppress deleted portal lead ids so Facebook/Housing sync never re-creates them
insert into public.integration_events (event_id, source, external_id, status, error, raw_payload, created_at)
select
  'evt_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),
  l.source,
  l.external_lead_id,
  'suppressed',
  'deleted_before_aug_1',
  jsonb_build_object('lead_id', l.lead_id, 'reason', 'deleted_before_aug_1'),
  now()
from tmp_leads_to_delete l
where l.source in ('Facebook', 'Housing.com')
  and l.external_lead_id is not null
  and l.external_lead_id <> '';

-- 5. Delete the leads themselves
delete from public.leads where lead_id in (select lead_id from tmp_leads_to_delete);

-- 6. VERIFY — leads before Aug 1 = 0, bookings/loans/customers/team kept
select
  count(*) filter (where coalesce(external_created_at, created_at) < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')) as leads_before_aug_want_0,
  count(*)                                                                                                              as leads_total,
  (select count(*) from public.bookings)  as bookings_kept,
  (select count(*) from public.loans)     as loans_kept,
  (select count(*) from public.customers) as customers_kept,
  (select count(*) from public.employees) as employees_kept
from public.leads;

-- After this SQL: Redeploy/restart backend OR open Dashboard and tap Refresh
-- (clears RAM cache so old leads are not re-shown from memory).