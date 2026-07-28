-- Single-device login (session lock / transfer)
-- Run once in Supabase SQL editor.
--
-- Policy: all non-admin CRM roles (telecaller, site_visit, sales_executive,
-- booking, loan, marketing, manager) may hold only one active session.
-- Admins are exempt and may stay logged in on multiple devices.
--
-- On a second login attempt the API returns 409 { requires_shift: true }.
-- Choosing "Shift" stores a new active_session_id and invalidates the old session.

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
