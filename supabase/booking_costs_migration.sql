-- ============================================================================
-- Umang CRM — Booking cost fields + hide auto skeleton rows cleanup
-- Run once in Supabase SQL Editor (safe to re-run).
-- ============================================================================

-- Optional cost breakdown on each booking (all nullable — form submits without them).
alter table bookings add column if not exists flat_cost numeric;
alter table bookings add column if not exists agreement_value numeric;
alter table bookings add column if not exists stamp_duty numeric;
alter table bookings add column if not exists registration_fees numeric;
alter table bookings add column if not exists gst numeric;
alter table bookings add column if not exists society_charges numeric;
alter table bookings add column if not exists brokerage_amount numeric not null default 0;

-- Remove legacy auto-created placeholder bookings (site-visit sync used to insert these).
-- Real bookings created via "+ New Booking" are kept.
delete from bookings
where lower(trim(coalesce(property_name, ''))) = 'selected property'
  and coalesce(booking_amount, 0) = 0
  and coalesce(token_received, 0) = 0
  and flat_cost is null
  and agreement_value is null;
