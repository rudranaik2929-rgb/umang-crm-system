-- =============================================================================
-- Brokerage status on bookings (pending | received)
-- Run once in Supabase SQL Editor (safe to re-run).
--
-- Used by Bookings page (status next to brokerage amount) and Dashboard
-- Total Brokerage Received / Pending breakdown.
-- =============================================================================

alter table bookings
  add column if not exists brokerage_status text not null default 'pending';

-- Normalize any unexpected values to pending/received.
update bookings
set brokerage_status = 'pending'
where brokerage_status is null
   or lower(trim(brokerage_status)) not in ('pending', 'received');

update bookings
set brokerage_status = lower(trim(brokerage_status))
where brokerage_status is distinct from lower(trim(brokerage_status));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_brokerage_status_check'
  ) then
    alter table bookings
      add constraint bookings_brokerage_status_check
      check (brokerage_status in ('pending', 'received'));
  end if;
end $$;

comment on column bookings.brokerage_status is
  'Whether brokerage for this booking is pending or received. Default pending.';

create index if not exists idx_bookings_brokerage_status
  on bookings (brokerage_status);
