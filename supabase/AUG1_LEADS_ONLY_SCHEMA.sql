-- =====================================================================
-- UMANG CRM — AUG 1 LEADS ONLY SCHEMA
-- ---------------------------------------------------------------------
-- WHAT THIS DOES (safe to run even if you already ran the delete script):
--   1. Deletes EVERY lead whose real enquiry date (external_created_at,
--      else created_at) is BEFORE 2026-08-01 00:00 IST.
--      Bookings, loans and customers are KEPT (only lead links detached).
--      Facebook/Housing portal ids are suppressed so sync never re-creates.
--   2. Adds a hard DATABASE TRIGGER that REJECTS any new insert whose
--      enquiry date is before 1 Aug 2026 — applies to every path:
--      Facebook webhook, Meta Graph resync, Housing webhook/poll,
--      Excel/CSV import, manual add. Old leads can NEVER come back.
--   3. Adds the index needed to make the date filter fast.
--
-- HOW TO RUN:
--   Open a FRESH tab in Supabase SQL Editor, paste this WHOLE file,
--   click Run. Do NOT paste it below other queries in an existing tab.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. DELETE child records of old leads
-- ---------------------------------------------------------------------
delete from public.lead_notes
where lead_id in (
  select lead_id from public.leads
  where coalesce(external_created_at, created_at)
        < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')
);

delete from public.activities
where lead_id in (
  select lead_id from public.leads
  where coalesce(external_created_at, created_at)
        < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')
);

delete from public.visit_followups
where lead_id in (
  select lead_id from public.leads
  where coalesce(external_created_at, created_at)
        < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')
);

delete from public.visits
where lead_id in (
  select lead_id from public.leads
  where coalesce(external_created_at, created_at)
        < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')
);

delete from public.notifications
where lead_id in (
  select lead_id from public.leads
  where coalesce(external_created_at, created_at)
        < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')
);

delete from public.integration_events
where lead_id in (
  select lead_id from public.leads
  where coalesce(external_created_at, created_at)
        < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')
);

-- ---------------------------------------------------------------------
-- 2. KEEP bookings / loans / customers — just clear the lead link
-- ---------------------------------------------------------------------
update public.bookings
set lead_id = null, updated_at = now()
where lead_id in (
  select lead_id from public.leads
  where coalesce(external_created_at, created_at)
        < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')
);

update public.loans
set lead_id = null, updated_at = now()
where lead_id in (
  select lead_id from public.leads
  where coalesce(external_created_at, created_at)
        < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')
);

update public.customers
set lead_id = null, updated_at = now()
where lead_id in (
  select lead_id from public.leads
  where coalesce(external_created_at, created_at)
        < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')
);

-- ---------------------------------------------------------------------
-- 3. Suppress deleted portal ids so Facebook/Housing sync never re-creates
--    (idempotent: won't insert a duplicate for an already-suppressed id)
-- ---------------------------------------------------------------------
insert into public.integration_events (event_id, source, external_id, status, error, raw_payload, created_at)
select
  'evt_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),
  l.source,
  l.external_lead_id,
  'suppressed',
  'deleted_before_aug_1',
  jsonb_build_object('lead_id', l.lead_id, 'reason', 'deleted_before_aug_1'),
  now()
from public.leads l
where coalesce(l.external_created_at, l.created_at)
      < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')
  and l.source in ('Facebook', 'Housing.com')
  and l.external_lead_id is not null
  and l.external_lead_id <> ''
  and not exists (
    select 1 from public.integration_events e
    where e.source = l.source
      and e.external_id = l.external_lead_id
      and e.status = 'suppressed'
  );

-- ---------------------------------------------------------------------
-- 4. DELETE the old leads themselves
-- ---------------------------------------------------------------------
delete from public.leads
where coalesce(external_created_at, created_at)
      < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata');

-- ---------------------------------------------------------------------
-- 5. HARD GATE: reject any insert dated before 1 Aug 2026
--    (blocked forever at the database level — no path can bypass it)
-- ---------------------------------------------------------------------
create or replace function public.reject_pre_aug1_lead_insert()
returns trigger
language plpgsql
as 'begin
  if coalesce(new.external_created_at, new.created_at)
     < (''2026-08-01 00:00:00'' at time zone ''Asia/Kolkata'') then
    raise exception ''lead rejected: enquiry date % is before 1 Aug 2026 (lead_id=%)'',
      coalesce(new.external_created_at, new.created_at), new.lead_id;
  end if;
  return new;
end;';

drop trigger if exists trg_reject_pre_aug1_lead_insert on public.leads;
create trigger trg_reject_pre_aug1_lead_insert
  before insert on public.leads
  for each row execute function public.reject_pre_aug1_lead_insert();

-- ---------------------------------------------------------------------
-- 6. INDEX for fast Aug-1+ filtering
-- ---------------------------------------------------------------------
create index if not exists idx_leads_external_created_at
  on public.leads (external_created_at desc)
  where external_created_at is not null;

-- ---------------------------------------------------------------------
-- 7. VERIFY — old leads = 0, bookings/loans/customers/team kept
-- ---------------------------------------------------------------------
select
  (select count(*) from public.leads
   where coalesce(external_created_at, created_at)
         < ('2026-08-01 00:00:00' AT TIME ZONE 'Asia/Kolkata')) as old_leads_want_0,
  (select count(*) from public.leads) as leads_total_aug1_onwards,
  (select count(*) from public.bookings)  as bookings_kept,
  (select count(*) from public.loans)     as loans_kept,
  (select count(*) from public.customers) as customers_kept,
  (select count(*) from public.employees) as employees_kept;

commit;

-- =====================================================================
-- AFTER THIS SQL (IMPORTANT):
--   Backend RAM cache may still show old leads. Run once:
--     POST /api/admin/flush-caches  (as admin/manager)
--   OR simply restart the backend. Then open the Dashboard.
-- =====================================================================
