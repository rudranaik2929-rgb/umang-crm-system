-- =============================================================================
-- Umang CRM — Production notification system
-- Run once in Supabase → SQL Editor (safe to re-run)
-- =============================================================================

-- Extend notifications (receiver_id = employee_id in user_id column for backward compat)
alter table notifications add column if not exists sender_id text;
alter table notifications add column if not exists priority text not null default 'normal';
alter table notifications add column if not exists read_at timestamptz;
alter table notifications add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_notifications_user_created on notifications(user_id, created_at desc);
create index if not exists idx_notifications_type on notifications(type);
create index if not exists idx_notifications_lead on notifications(lead_id);

-- FCM device tokens (web PWA + future native)
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

-- Per-user notification preferences
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

-- Failed push queue for retry
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

-- Supabase Realtime — postgres_changes on notifications
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
