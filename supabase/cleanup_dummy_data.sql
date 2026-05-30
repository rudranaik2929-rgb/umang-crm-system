-- ============================================================================
-- Umang Hometech CRM - Remove all dummy / demo data
-- ----------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL Editor.
-- It deletes all demo workflow records (bookings, visits, loans, customers,
-- notifications) and every demo lead, while PRESERVING real leads that came
-- from the Housing.com API or from Meta (Facebook/Instagram) Lead Ads.
--
-- "Real" leads kept:
--   * source contains 'housing'  (Housing.com API leads), OR
--   * source is Facebook/Meta/Instagram AND has a genuine external_lead_id
--     (not a Meta test id) AND has a phone or email.
-- Everything else is treated as demo/seed data and removed.
--
-- Wrapped in a transaction: if anything fails, nothing is deleted.
-- Review the SELECT at the bottom first if you want to preview what stays.
-- ============================================================================

begin;

-- 1. All current workflow records are demo/test data -> clear them.
delete from bookings;
delete from visit_followups;
delete from visits;
delete from loans;
delete from customers;
delete from notifications;

-- 2. Real integration leads to keep.
create temporary table _keep_leads on commit drop as
select lead_id
from leads
where lower(coalesce(source, '')) like '%housing%'
   or (
        (
          lower(coalesce(source, '')) like '%facebook%'
          or lower(coalesce(source, '')) like '%meta%'
          or lower(coalesce(source, '')) like '%instagram%'
        )
        and coalesce(external_lead_id, '') not in ('', '444444444444', '0', 'test')
        and (coalesce(phone, '') <> '' or coalesce(email, '') <> '')
      );

-- 3. Remove activity history + notes for demo leads, then the demo leads.
delete from activities
where lead_id is not null
  and lead_id not in (select lead_id from _keep_leads);

delete from lead_notes
where lead_id not in (select lead_id from _keep_leads);

delete from leads
where lead_id not in (select lead_id from _keep_leads);

-- 4. De-duplicate the remaining real leads. Duplicates arise from re-delivered
--    Meta webhook events or the same person enquiring twice. Keep the EARLIEST
--    row for each external_lead_id / phone, delete the rest.
delete from leads a
using leads b
where a.ctid <> b.ctid
  and (
        a.created_at > b.created_at
        or (a.created_at = b.created_at and a.lead_id > b.lead_id)
      )
  and (
        (coalesce(a.external_lead_id, '') <> '' and a.external_lead_id = b.external_lead_id)
        or (coalesce(a.phone, '') <> '' and a.phone = b.phone)
      );

commit;

-- Preview what remains (run separately after commit if desired):
-- select source, count(*) from leads group by source order by count(*) desc;
