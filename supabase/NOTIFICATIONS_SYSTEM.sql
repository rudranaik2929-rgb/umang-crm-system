-- =============================================================================
-- Umang CRM — FINAL notification system (paste this whole file in Supabase SQL Editor)
-- Safe to run many times. It creates tables, fixes data, and removes old spam.
-- After running once, notifications work like this:
--   * Assign 1 lead   -> employee gets ONE message: "Manager assigned 1 lead to you."
--   * Assign 300 leads -> employee gets ONE message: "Manager assigned 300 leads to you."
--   * No per-customer ("Amit assigned to you") messages.
--   * Each message is kept 24 hours, then auto-deleted.
-- =============================================================================

-- 1. Core notifications table -------------------------------------------------
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

-- Extended columns (added safely if missing)
alter table notifications add column if not exists sender_id  text;
alter table notifications add column if not exists priority   text not null default 'normal';
alter table notifications add column if not exists read_at    timestamptz;
alter table notifications add column if not exists metadata   jsonb not null default '{}'::jsonb;
alter table notifications add column if not exists expires_at timestamptz;

create index if not exists idx_notifications_user_created on notifications(user_id, created_at desc);
create index if not exists idx_notifications_user_read    on notifications(user_id, is_read);
create index if not exists idx_notifications_type         on notifications(type);
create index if not exists idx_notifications_expires      on notifications(expires_at);

-- 2. FCM device tokens (mobile / PWA push) ------------------------------------
create table if not exists fcm_device_tokens (
  token_id     text primary key,
  user_id      text not null,
  fcm_token    text not null,
  platform     text not null default 'web',
  user_agent   text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create unique index if not exists idx_fcm_token_unique on fcm_device_tokens(fcm_token);
create index        if not exists idx_fcm_user_active  on fcm_device_tokens(user_id, is_active);

-- 3. Per-user notification preferences (push on/off etc.) ---------------------
create table if not exists notification_preferences (
  user_id        text primary key,
  lead_assigned  boolean not null default true,
  lead_updated   boolean not null default true,
  comments       boolean not null default true,
  housing_leads  boolean not null default true,
  facebook_leads boolean not null default true,
  reminders      boolean not null default true,
  marketing      boolean not null default true,
  system_alerts  boolean not null default true,
  push_enabled   boolean not null default true,
  updated_at     timestamptz not null default now()
);

-- 4. Failed-push retry queue --------------------------------------------------
create table if not exists notification_push_queue (
  queue_id        text primary key,
  notification_id text,
  user_id         text not null,
  fcm_token       text not null,
  payload         jsonb not null default '{}'::jsonb,
  attempts        int not null default 0,
  last_error      text,
  next_retry_at   timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_push_queue_retry on notification_push_queue(next_retry_at, attempts);

-- 5. Realtime (instant in-app updates) ----------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
exception when others then
  raise notice 'Realtime publication note: %', sqlerrm;
end $$;

-- 6. Grants + disable RLS (backend uses service role) -------------------------
grant select on notifications to anon, authenticated;
grant select, insert, update, delete on fcm_device_tokens        to anon, authenticated;
grant select, insert, update, delete on notification_preferences to anon, authenticated;
alter table notifications disable row level security;

-- =============================================================================
-- 7. DATA FIXES (run every time — they are safe / idempotent)
-- =============================================================================

-- 7a. Backfill expiry on any rows missing it (24h lifetime)
update notifications
set expires_at = created_at + interval '24 hours'
where expires_at is null and created_at is not null;

-- 7b. Delete the OLD spam: one message per customer / per lead.
--     We keep only the new summary rows (metadata.assignment_summary = true).
delete from notifications
where coalesce(metadata->>'assignment_summary', 'false') <> 'true'
  and (
        (type in ('lead_assigned', 'workflow') and lead_id is not null and lower(title) like '%assign%')
        or message like '% has been assigned to you.%'
        or message like '% assigned to you.%'
      );

-- 7c. Delete anything already past its 24h expiry (housekeeping)
delete from notifications
where expires_at is not null and expires_at < now();
delete from notifications
where expires_at is null and created_at < now() - interval '24 hours';

-- 7d. Notifications saved under the login user_id -> move to employee_id
update notifications n
set user_id = e.employee_id
from employees e
where n.user_id = e.user_id
  and e.employee_id is not null
  and n.user_id is distinct from e.employee_id;

-- 7e. Repair user <-> employee links so the right person receives notifications
update users u
set employee_id = e.employee_id
from employees e
where (
        lower(u.email) = lower(e.email)
        or u.user_id     = e.user_id
        or u.employee_id = e.user_id
      )
  and e.employee_id is not null
  and u.employee_id is distinct from e.employee_id;

update employees e
set user_id = u.user_id
from users u
where lower(u.email) = lower(e.email)
  and u.user_id is not null
  and (e.user_id is null or e.user_id is distinct from u.user_id);

-- =============================================================================
-- 8. AUTO-DELETE AFTER 24h (optional but recommended)
--    The backend already purges hourly. If pg_cron is available, this makes
--    the database clean itself too. Ignored automatically if pg_cron is off.
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge_expired_notifications',
      '*/30 * * * *',
      $cron$
        delete from notifications
        where (expires_at is not null and expires_at < now())
           or (expires_at is null and created_at < now() - interval '24 hours');
      $cron$
    );
  else
    raise notice 'pg_cron not installed — backend hourly purge will handle cleanup.';
  end if;
exception when others then
  raise notice 'Cron schedule note: %', sqlerrm;
end $$;

-- =============================================================================
-- 9. HANDY CHECK QUERIES (copy/run separately when you want to verify)
-- =============================================================================
-- Who am I? (find your employee_id)
--   select employee_id, name, email, role, user_id from employees order by name;
--
-- Latest notifications (should be ONE row per assign action):
--   select notification_id, user_id, type, title, message,
--          metadata->>'assigned_count' as count, is_read, created_at
--   from notifications order by created_at desc limit 20;
--
-- Registered push devices:
--   select user_id, platform, is_active, left(fcm_token,18) as token, updated_at
--   from fcm_device_tokens order by updated_at desc;
--
-- Push preferences:
--   select * from notification_preferences;
