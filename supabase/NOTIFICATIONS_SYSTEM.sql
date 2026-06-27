-- =============================================================================
-- Umang CRM — Production notification system (RUN ONCE in Supabase SQL Editor)
-- Safe to re-run. Creates tables, indexes, realtime, and sample verification queries.
-- =============================================================================

-- 1. Core notifications table (create if missing from older installs)
create table if not exists notifications (
  notification_id text primary key,
  user_id text,
  lead_id text,
  type text not null default 'workflow',
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2. Extended columns (new notification system)
alter table notifications add column if not exists sender_id text;
alter table notifications add column if not exists priority text not null default 'normal';
alter table notifications add column if not exists read_at timestamptz;
alter table notifications add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_notifications_user_created on notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_read on notifications(user_id, is_read);
create index if not exists idx_notifications_type on notifications(type);
create index if not exists idx_notifications_lead on notifications(lead_id);

-- 3. FCM device tokens (web PWA + future native)
create table if not exists fcm_device_tokens (
  token_id text primary key,
  user_id text not null,
  fcm_token text not null,
  platform text not null default 'web',
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create unique index if not exists idx_fcm_token_unique on fcm_device_tokens(fcm_token);
create index if not exists idx_fcm_user_active on fcm_device_tokens(user_id, is_active);

-- 4. Per-user notification preferences
create table if not exists notification_preferences (
  user_id text primary key,
  lead_assigned boolean not null default true,
  lead_updated boolean not null default true,
  comments boolean not null default true,
  housing_leads boolean not null default true,
  facebook_leads boolean not null default true,
  reminders boolean not null default true,
  marketing boolean not null default true,
  system_alerts boolean not null default true,
  push_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- 5. Failed push queue for retry
create table if not exists notification_push_queue (
  queue_id text primary key,
  notification_id text,
  user_id text not null,
  fcm_token text not null,
  payload jsonb not null default '{}'::jsonb,
  attempts int not null default 0,
  last_error text,
  next_retry_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_push_queue_retry on notification_push_queue(next_retry_at, attempts);

-- 6. Realtime — instant in-app updates (needs EXPO_PUBLIC_SUPABASE_* on Vercel)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
exception when others then
  raise notice 'Realtime publication: %', sqlerrm;
end $$;

-- 7. Grants (anon key used for Realtime subscriptions)
grant select on notifications to anon, authenticated;
grant select, insert, update, delete on fcm_device_tokens to anon, authenticated;
grant select, insert, update, delete on notification_preferences to anon, authenticated;

-- =============================================================================
-- SAMPLE DATA (optional — uncomment to test; replace employee_id with yours)
-- =============================================================================
/*
insert into notifications (
  notification_id, user_id, type, title, message, priority, is_read, created_at
) values (
  'ntf_test_' || floor(extract(epoch from now()))::text,
  'emp_YOUR_EMPLOYEE_ID',   -- from: select employee_id, name from employees;
  'lead_assigned',
  '🏠 Test Notification',
  'If you see this in the app, notifications are working.',
  'high',
  false,
  now()
) on conflict (notification_id) do nothing;
*/

-- =============================================================================
-- VERIFICATION QUERIES (run after deploy to check data)
-- =============================================================================

-- All employees (use employee_id as notifications.user_id)
-- select employee_id, name, email, role, user_id from employees where active = true order by name;

-- Recent notifications
-- select notification_id, user_id, type, title, is_read, created_at
-- from notifications order by created_at desc limit 20;

-- Unread count per employee
-- select user_id, count(*) as unread
-- from notifications where is_read = false group by user_id order by unread desc;

-- Registered push tokens
-- select token_id, user_id, platform, is_active, left(fcm_token, 24) as token_prefix, updated_at
-- from fcm_device_tokens order by updated_at desc;

-- User preferences
-- select * from notification_preferences;

-- Failed push retries
-- select queue_id, user_id, attempts, last_error, next_retry_at from notification_push_queue order by created_at desc limit 20;
