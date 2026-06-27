-- ============================================================================
-- CLEAR_DATA.sql
-- Wipes all CRM/transactional data while KEEPING: employees, sessions, users, roles
-- Safe to run multiple times. Only truncates tables that actually exist.
-- ============================================================================

do $$
declare
    t text;
    tables_to_clear text[] := array[
        'leads',
        'lead_notes',
        'activities',
        'visits',
        'visit_followups',
        'bookings',
        'loans',
        'customers',
        'notifications',
        'templates',
        'campaigns',
        'integration_events',
        'fcm_device_tokens',
        'notification_preferences',
        'notification_push_queue'
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

-- ---- Verify (all should be 0) ----
select 'leads' as table, count(*) from leads
union all select 'lead_notes', count(*) from lead_notes
union all select 'activities', count(*) from activities
union all select 'visits', count(*) from visits
union all select 'visit_followups', count(*) from visit_followups
union all select 'bookings', count(*) from bookings
union all select 'loans', count(*) from loans
union all select 'customers', count(*) from customers
union all select 'notifications', count(*) from notifications
union all select 'integration_events', count(*) from integration_events
union all select 'fcm_device_tokens', count(*) from fcm_device_tokens;

-- ---- Confirm kept tables are intact ----
select 'employees(kept)' as table, count(*) from employees
union all select 'sessions(kept)', count(*) from sessions
union all select 'users(kept)', count(*) from users;
