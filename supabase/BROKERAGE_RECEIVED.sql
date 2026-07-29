-- =============================================================================
-- Brokerage received amount on bookings
-- Run once in Supabase SQL Editor (safe to re-run).
--
-- Used by Bookings page (Received + Balance next to Brokerage) and Dashboard
-- Total Brokerage Received / Pending breakdown.
-- =============================================================================

alter table bookings
  add column if not exists brokerage_received numeric not null default 0;

-- Backfill: legacy rows marked fully received get full brokerage amount.
update bookings
set brokerage_received = brokerage_amount
where brokerage_received = 0
  and lower(trim(coalesce(brokerage_status, 'pending'))) = 'received'
  and coalesce(brokerage_amount, 0) > 0;

comment on column bookings.brokerage_received is
  'Amount of brokerage actually received for this booking. Balance = brokerage_amount - brokerage_received.';

create index if not exists idx_bookings_brokerage_received
  on bookings (brokerage_received);
