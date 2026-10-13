-- ============================================================================
-- UMANG CRM — LOGIN MONITORING (single-device metadata + audit log)
-- Run once in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS everywhere).
-- ----------------------------------------------------------------------------
-- Extends the existing single-device lock (SINGLE_DEVICE_LOGIN.sql) with the
-- extra columns the "Who's logged in now" panel needs, and adds a login_events
-- audit table (login / shift / logout / forced_out).
--
-- Privacy: we only store what the browser already sends on a normal request —
-- a device label derived from the User-Agent, the client IP and timestamps.
-- No extra permissions are requested from the user.
-- ============================================================================

-- 1) Active-session metadata on users -----------------------------------------
alter table public.users add column if not exists active_session_id text;
alter table public.users add column if not exists active_device_label text;
alter table public.users add column if not exists session_updated_at timestamptz;
alter table public.users add column if not exists active_login_at timestamptz;
alter table public.users add column if not exists active_last_seen_at timestamptz;
alter table public.users add column if not exists active_ip text;
alter table public.users add column if not exists active_user_agent text;
alter table public.users add column if not exists last_login_at timestamptz;
alter table public.users add column if not exists last_logout_at timestamptz;

create index if not exists idx_users_active_session
  on public.users (active_session_id)
  where active_session_id is not null;

comment on column public.users.active_login_at is
  'When the current active_session_id was issued (login or Shift).';
comment on column public.users.active_last_seen_at is
  'Last request seen from the active session (heartbeat) — powers "online now".';
comment on column public.users.active_ip is
  'Client IP captured at login (best-effort, X-Forwarded-For aware).';
comment on column public.users.active_user_agent is
  'Raw User-Agent captured at login (for support/debugging).';

-- 2) Login event log ----------------------------------------------------------
create table if not exists public.login_events (
  id bigserial primary key,
  user_id text,
  email text,
  employee_id text,
  event text not null,            -- login | shift | logout | forced_out
  device_label text,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_login_events_user_created
  on public.login_events (user_id, created_at desc);
create index if not exists idx_login_events_created
  on public.login_events (created_at desc);

comment on table public.login_events is
  'Append-only audit trail of login / shift / logout / forced-out events.';

-- Verify
select count(*)::text as active_sessions
from public.users
where active_session_id is not null;
select event, count(*) from public.login_events group by event order by 2 desc;
