-- =====================================================================
-- BOOKING PIPELINE — 6 task boxes (Login → Amt Received)
-- Run in Supabase SQL Editor on existing DB
-- =====================================================================

-- 1) Booking officer (which booking employee owns the record)
alter table bookings add column if not exists booking_officer_id text;
create index if not exists idx_bookings_officer on bookings(booking_officer_id);
create index if not exists idx_bookings_status on bookings(status);

-- 2) Ensure completed_tasks column exists (6-step pipeline tracking)
alter table bookings add column if not exists completed_tasks jsonb not null default '[]'::jsonb;

-- 3) Backfill officer on existing rows (first active booking employee)
update bookings b
set booking_officer_id = e.employee_id,
    updated_at = now()
from (
  select employee_id
  from employees
  where lower(role) = 'booking' and coalesce(active, true) = true
  order by created_at asc nulls last
  limit 1
) e
where b.booking_officer_id is null
  and lower(coalesce(b.status, 'active')) not in ('cancellation', 'cancelled');

-- 4) Normalize status strings for pipeline counts (optional cleanup)
update bookings
set status = 'login file', updated_at = now()
where lower(status) = 'login_file';

update bookings
set status = 'bill submitted', updated_at = now()
where lower(status) = 'bill_submitted';

update bookings
set status = 'amount received', updated_at = now()
where lower(status) in ('amount_received', 'amt received', 'amt rec');

-- 5) Verification — expect 6 task keys with counts
select
  count(*) filter (where completed_tasks ? 'login_file' or lower(status) = 'login file') as login_file,
  count(*) filter (where completed_tasks ? 'sanctioned' or lower(status) = 'sanctioned') as sanctioned,
  count(*) filter (where completed_tasks ? 'registration' or lower(status) = 'registration') as registration,
  count(*) filter (where completed_tasks ? 'disbursement' or lower(status) = 'disbursement') as disbursement,
  count(*) filter (where completed_tasks ? 'bill_submitted' or lower(status) = 'bill submitted') as bill_submitted,
  count(*) filter (where completed_tasks ? 'amount_received' or lower(status) = 'amount received') as amount_received,
  count(*) as total_active_bookings
from bookings
where lower(coalesce(status, 'active')) not in ('cancellation', 'cancelled');
