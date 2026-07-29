-- =============================================================================
-- Brokerage received amount on bookings
-- Run once in Supabase SQL Editor (safe to re-run).
--
-- Used by Bookings page (Received + Balance next to Brokerage) and Dashboard
-- Total Brokerage Received / Pending breakdown.
-- =============================================================================

alter table bookings
  add column if not exists brokerage_received numeric not null default 0;

-- Backfill: set received = 0 for all existing rows (no legacy status column).
-- You can manually update individual rows in Supabase if needed.
update bookings
set brokerage_received = 0
where brokerage_received = 0;

comment on column bookings.brokerage_received is
  'Amount of brokerage actually received for this booking. Balance = brokerage_amount - brokerage_received.';

create index if not exists idx_bookings_brokerage_received
  on bookings (brokerage_received);
