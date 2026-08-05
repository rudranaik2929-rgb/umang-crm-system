-- =====================================================================
-- UMANG CRM — BOOKINGS BROKERAGE DASHBOARD FIX (run ONCE in Supabase SQL Editor)
-- ---------------------------------------------------------------------
-- WHY THIS EXISTS:
--   The Dashboard reads brokerage_amount, brokerage_received AND
--   brokerage_status from bookings. Older migration files only added
--   brokerage_amount — if brokerage_received / brokerage_status are
--   missing, the dashboard's bookings SELECT fails entirely and the
--   dashboard shows revenue ₹0 and wrong booking counts.
--
--   This script is idempotent (safe to re-run):
--     1. Adds brokerage_amount, brokerage_received, brokerage_status
--     2. Backfills any NULL brokerage fields
--     3. Adds the pending/received check constraint + indexes
-- =====================================================================

-- 1. BROKERAGE AMOUNT (total brokerage agreed for this booking)
alter table bookings
  add column if not exists brokerage_amount numeric not null default 0;

-- 2. BROKERAGE RECEIVED (amount actually collected)
alter table bookings
  add column if not exists brokerage_received numeric not null default 0;

-- 3. BROKERAGE STATUS (pending | received)
alter table bookings
  add column if not exists brokerage_status text not null default 'pending';

-- 4. Backfill NULLs (fresh columns may have nulls on old rows)
update bookings set brokerage_amount   = 0      where brokerage_amount   is null;
update bookings set brokerage_received = 0      where brokerage_received is null;
update bookings set brokerage_status   = 'pending' where brokerage_status is null
  or lower(trim(brokerage_status)) not in ('pending', 'received');

-- 5. Enforce pending/received only
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_brokerage_status_check'
  ) then
    alter table bookings add constraint bookings_brokerage_status_check
      check (brokerage_status in ('pending', 'received'));
  end if;
end $$;

-- 6. Indexes for the dashboard revenue queries
create index if not exists idx_bookings_brokerage_amount
  on bookings (brokerage_amount);
create index if not exists idx_bookings_brokerage_received
  on bookings (brokerage_received);
create index if not exists idx_bookings_brokerage_status
  on bookings (brokerage_status);

-- 7. VERIFY — all three columns now exist
select
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'bookings'
  and column_name in ('brokerage_amount', 'brokerage_received', 'brokerage_status')
order by column_name;

-- =====================================================================
-- AFTER THIS SQL: just refresh the Dashboard (cache clears itself on
-- booking saves). No backend redeploy needed for this fix.
-- =====================================================================
