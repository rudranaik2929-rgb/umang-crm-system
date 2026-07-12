-- =====================================================================
-- UMANG CRM — CLIENT HANDOFF CLEAN (run ONCE in Supabase SQL Editor)
-- ---------------------------------------------------------------------
-- KEEPS:
--   customers (clients)
--   employees (team accounts)
--   users, sessions, roles (logins)
--   templates, campaigns (WhatsApp)
--   fcm_device_tokens, notification_preferences
--
-- REMOVES:
--   ALL leads + lead_notes + activities
--   visits + visit_followups
--   bookings + loans
--   notifications + integration_events + notification_push_queue
--
-- Also resets employee lead counters to 0.
-- Does NOT delete clients or employee/login accounts.
-- =====================================================================

do $$
declare
  t text;
  tables_to_clear text[] := array[
    'notification_push_queue',
    'notifications',
    'integration_events',
    'lead_notes',
    'activities',
    'visit_followups',
    'visits',
    'bookings',
    'loans',
    'leads'
  ];
begin
  foreach t in array tables_to_clear loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('truncate table public.%I restart identity cascade;', t);
      raise notice 'cleared: %', t;
    else
      raise notice 'skipped (missing): %', t;
    end if;
  end loop;
end $$;

-- Keep customers; clear links to deleted leads/bookings/loans
update public.customers
set
  lead_id = null,
  booking_id = null,
  loan_id = null,
  updated_at = now()
where lead_id is not null
   or booking_id is not null
   or loan_id is not null;

-- Reset employee counters (accounts stay)
update public.employees
set
  leads_assigned = 0,
  leads_closed = 0,
  performance = 0,
  last_assigned_at = null,
  updated_at = now();

-- =====================================================================
-- VERIFY — pipeline = 0, clients/team kept
-- =====================================================================
select 'leads (want 0)' as item, count(*)::text as value from public.leads
union all select 'bookings (want 0)', count(*)::text from public.bookings
union all select 'loans (want 0)', count(*)::text from public.loans
union all select 'visits (want 0)', count(*)::text from public.visits
union all select 'activities (want 0)', count(*)::text from public.activities
union all select 'notifications (want 0)', count(*)::text from public.notifications
union all select 'customers (KEEP)', count(*)::text from public.customers
union all select 'employees (KEEP)', count(*)::text from public.employees
union all select 'users (KEEP)', count(*)::text from public.users;

-- After this SQL: Redeploy/restart backend OR open Dashboard and tap Refresh
-- (clears RAM cache so Total Leads shows 0, not old numbers).
