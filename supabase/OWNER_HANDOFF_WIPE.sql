-- =====================================================================
-- UMANG CRM — OWNER HANDOFF WIPE
-- ---------------------------------------------------------------------
-- Run in Supabase SQL Editor BEFORE shipping a clean CRM to the owner.
-- Safe to re-run. Does NOT drop tables, columns, indexes, or views.
--
-- KEEP (accounts + product essentials):
--   roles                  — role catalog (admin, manager, telecaller, …)
--   users                  — ALL login accounts (admin/owner + employees)
--   employees              — team roster, roles, allowed_pages, passwords link
--   sessions               — active logins (optional; left intact)
--   templates              — WhatsApp / message templates (setup)
--   fcm_device_tokens      — push tokens so notifications still work
--   notification_preferences — per-user notification settings
--   Schema / indexes / RLS — untouched
--   Integration secrets    — live in env vars, not DB (untouched)
--
-- DELETE (all operational / transactional data):
--   leads, lead_notes, activities
--   visits, visit_followups
--   bookings, loans, customers
--   notifications, notification_push_queue
--   integration_events     — Meta / Housing webhook & sync history
--   campaigns              — campaign send history (templates kept)
--   employee_locations     — transient GPS pings
--
-- Also resets employee lead counters / GPS cache columns to zero/null.
--
-- After running: redeploy/restart backend OR hit Dashboard → Refresh
-- so in-memory caches show zeros. New Meta/Housing webhooks will create
-- fresh leads; historical sync should stay off if you want an empty CRM.
-- =====================================================================

do $$
declare
  t text;
  -- Child / independent tables first; CASCADE covers any real FKs.
  -- Each truncate is guarded: missing tables are skipped (safe re-run).
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
    'customers',
    'campaigns',
    'employee_locations',
    'leads'
  ];
begin
  foreach t in array tables_to_clear loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = t
    ) then
      execute format('truncate table public.%I restart identity cascade;', t);
      raise notice 'cleared: %', t;
    else
      raise notice 'skipped (missing): %', t;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Reset employee operational counters + cached GPS (accounts stay)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'employees'
  ) then
    update public.employees
    set
      leads_assigned = 0,
      leads_closed = 0,
      performance = 0,
      last_assigned_at = null,
      last_lat = null,
      last_lng = null,
      last_seen_at = null,
      updated_at = now();
    raise notice 'employee counters + GPS cache reset';
  end if;
end $$;

-- =====================================================================
-- VERIFY — deleted tables want 0; kept tables should still have rows
-- =====================================================================
select item, value
from (
  select 1 as ord, 'leads (want 0)' as item,
    (select count(*)::text from public.leads) as value
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='leads')
  union all
  select 2, 'lead_notes (want 0)',
    (select count(*)::text from public.lead_notes)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='lead_notes')
  union all
  select 3, 'activities (want 0)',
    (select count(*)::text from public.activities)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='activities')
  union all
  select 4, 'visits (want 0)',
    (select count(*)::text from public.visits)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='visits')
  union all
  select 5, 'visit_followups (want 0)',
    (select count(*)::text from public.visit_followups)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='visit_followups')
  union all
  select 6, 'bookings (want 0)',
    (select count(*)::text from public.bookings)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='bookings')
  union all
  select 7, 'loans (want 0)',
    (select count(*)::text from public.loans)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='loans')
  union all
  select 8, 'customers (want 0)',
    (select count(*)::text from public.customers)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='customers')
  union all
  select 9, 'notifications (want 0)',
    (select count(*)::text from public.notifications)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='notifications')
  union all
  select 10, 'integration_events (want 0)',
    (select count(*)::text from public.integration_events)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='integration_events')
  union all
  select 11, 'campaigns (want 0)',
    (select count(*)::text from public.campaigns)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='campaigns')
  union all
  select 12, 'employee_locations (want 0)',
    (select count(*)::text from public.employee_locations)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='employee_locations')
  union all
  select 13, 'employees (KEEP)',
    (select count(*)::text from public.employees)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='employees')
  union all
  select 14, 'users (KEEP)',
    (select count(*)::text from public.users)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='users')
  union all
  select 15, 'roles (KEEP)',
    (select count(*)::text from public.roles)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='roles')
  union all
  select 16, 'templates (KEEP)',
    (select count(*)::text from public.templates)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='templates')
  union all
  select 17, 'sessions (KEEP)',
    (select count(*)::text from public.sessions)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='sessions')
  union all
  select 18, 'emp leads_assigned sum (want 0)',
    (select coalesce(sum(leads_assigned), 0)::text from public.employees)
  where exists (select 1 from information_schema.tables where table_schema='public' and table_name='employees')
) v
order by ord;
