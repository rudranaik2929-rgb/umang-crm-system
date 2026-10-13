-- Single-device login (session lock / transfer)
-- Run once in Supabase SQL editor.
--
-- Policy: every named CRM role — including admin — may hold only one active
-- session. On a second login the API returns 409 { requires_shift: true }.
-- Choosing "Shift" stores a new active_session_id and invalidates the old
-- session. (Only a blank/unknown role is exempt, defensively.)
--
-- NOTE: the extra login-monitoring columns and the login_events audit table
-- live in supabase/login_monitoring.sql — run that too.

alter table users
  add column if not exists active_session_id text;

alter table users
  add column if not exists active_device_label text;

alter table users
  add column if not exists session_updated_at timestamptz;

create index if not exists idx_users_active_session
  on users (active_session_id)
  where active_session_id is not null;

comment on column users.active_session_id is
  'UUID of the only allowed session for non-admin users; JWT claim sid must match.';
comment on column users.active_device_label is
  'Human-readable label of the device holding the active session (e.g. Mobile · Chrome).';
comment on column users.session_updated_at is
  'When active_session_id was last set (login or Shift).';
