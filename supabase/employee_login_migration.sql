-- ============================================================================
-- Umang CRM — Employee login columns (run once in Supabase SQL Editor)
-- ----------------------------------------------------------------------------
-- Fixes "Invalid email or password" after manager creates an employee.
-- Adds every column the backend needs to store login email, password hash,
-- sidebar permissions, and the link between employees ↔ users.
-- Safe to run multiple times (uses IF NOT EXISTS).
-- ============================================================================

-- users: login + permissions
alter table users add column if not exists password_hash text;
-- Legacy column (some older DBs only had "password"); backend writes both.
alter table users add column if not exists password text;
alter table users add column if not exists employee_id text;
alter table users add column if not exists allowed_pages jsonb not null default '[]'::jsonb;
alter table users add column if not exists dashboard_type text;
alter table users add column if not exists picture text;
alter table users add column if not exists updated_at timestamptz not null default now();

-- employees: link back to login + cached permissions
alter table employees add column if not exists user_id text;
alter table employees add column if not exists allowed_pages jsonb not null default '[]'::jsonb;
alter table employees add column if not exists updated_at timestamptz not null default now();

-- Fast case-insensitive email lookup (optional but recommended)
create unique index if not exists users_email_lower_idx on users (lower(email));
create unique index if not exists employees_email_lower_idx on employees (lower(email));

-- Normalize existing emails to lowercase so login always matches
update users set email = lower(trim(email)) where email <> lower(trim(email));
update employees set email = lower(trim(email)) where email <> lower(trim(email));

-- Keep legacy password column in sync with password_hash
update users set password = password_hash
where password_hash is not null and (password is null or password <> password_hash);

-- Employees created before login support have user_id but no users row.
-- After running this migration, open Employees → Edit → set a new password to
-- recreate the login, OR delete and re-add the employee.
