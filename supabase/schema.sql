-- Umang Hometech LLP Real Estate CRM Supabase schema
-- Run this file in the Supabase SQL Editor for a fresh setup or migration.
-- Backend table names currently used by FastAPI:
-- users, sessions, employees, leads, activities, visits, bookings, loans,
-- customers, notifications, templates, campaigns.

create extension if not exists pgcrypto;

create table if not exists roles (
  role_id text primary key,
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

insert into roles (role_id, name, description) values
  ('role_admin', 'admin', 'Full system control'),
  ('role_manager', 'manager', 'Lead assignment, reports, team monitoring'),
  ('role_telecaller', 'telecaller', 'Calling, notes, follow-ups, lead status'),
  ('role_site_visit', 'site_visit', 'Site visit scheduling and customer feedback'),
  ('role_booking', 'booking', 'Booking amount, unit, agreement, payment tracking'),
  ('role_loan', 'loan', 'Loan documents, bank process, sanction, disbursal'),
  ('role_marketing', 'marketing', 'Campaigns, sources, negative lead remarketing')
on conflict (role_id) do update
set name = excluded.name,
    description = excluded.description;

create table if not exists users (
  user_id text primary key,
  email text unique not null,
  password_hash text,
  name text not null,
  picture text,
  role text not null default 'telecaller',
  employee_id text,
  -- Per-employee sidebar/service access (source of truth). Empty = fall back to role defaults.
  allowed_pages jsonb not null default '[]'::jsonb,
  -- Which dashboard variant the user lands on (admin | manager | telecaller | ...).
  dashboard_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  session_token text primary key,
  user_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists employees (
  employee_id text primary key,
  name text not null,
  email text unique not null,
  phone text,
  role text not null,
  department text not null,
  user_id text,
  allowed_pages jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  leads_assigned integer not null default 0,
  leads_closed integer not null default 0,
  performance numeric not null default 0,
  last_assigned_at timestamptz,
  last_login timestamptz,
  last_lat numeric,
  last_lng numeric,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists leads (
  lead_id text primary key,
  name text not null,
  phone text not null,
  email text,
  budget text,
  location text,
  property_type text,
  source text not null default 'website',
  assigned_to text,
  stage text not null default 'new',
  status text not null default 'active',
  priority text,
  starred boolean not null default false,
  follow_up_at timestamptz,
  notes text,
  external_lead_id text,
  integration_uuid text,
  raw_payload jsonb,
  lead_type text not null default 'standard',
  brokerage_amount numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_notes (
  note_id text primary key default ('note_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  lead_id text not null,
  user_id text,
  type text not null default 'call_note',
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists activities (
  activity_id text primary key,
  lead_id text,
  user_id text,
  type text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists visits (
  visit_id text primary key,
  lead_id text,
  lead_name text,
  scheduled_at timestamptz,
  assigned_to text,
  assigned_name text,
  property_details text,
  interest_level text,
  status text not null default 'scheduled',
  feedback text,
  interested boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists visit_followups (
  followup_id text primary key,
  visit_id text not null,
  lead_id text,
  lead_name text,
  follow_up_date date not null,
  follow_up_time time not null,
  follow_up_day text not null,
  follow_up_at timestamptz not null,
  status text not null default 'scheduled',
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bookings (
  booking_id text primary key,
  lead_id text,
  lead_name text,
  property_name text,
  unit_number text,
  tower text,
  booking_amount numeric not null default 0,
  brokerage_amount numeric not null default 0,
  token_received numeric not null default 0,
  payment_status text not null default 'pending',
  payment_progress integer not null default 0,
  agreement_status text not null default 'pending',
  completed_tasks jsonb not null default '[]'::jsonb,
  booking_date timestamptz,
  starred boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists loans (
  loan_id text primary key,
  lead_id text,
  lead_name text,
  amount numeric not null default 0,
  bank_name text,
  application_status text not null default 'pending',
  bank_stage text not null default 'documentation',
  documents_status text not null default 'pending',
  pending_documents jsonb not null default '[]'::jsonb,
  emi_eligible numeric,
  progress integer not null default 0,
  starred boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  customer_id text primary key,
  lead_id text unique,
  name text not null,
  phone text,
  email text,
  location text,
  budget text,
  property_type text,
  source text,
  booking_id text,
  loan_id text,
  status text not null default 'converted',
  converted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists templates (
  template_id text primary key,
  name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists campaigns (
  campaign_id text primary key,
  name text not null,
  template_id text,
  audience text not null default 'all',
  scheduled_at timestamptz,
  status text not null default 'draft',
  sent_count integer not null default 0,
  delivered_count integer not null default 0,
  read_count integer not null default 0,
  replied_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists integration_events (
  event_id text primary key,
  source text not null,
  external_id text,
  status text not null,
  lead_id text,
  error text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

-- Migration safety for older project databases.
alter table users add column if not exists picture text;
alter table users add column if not exists updated_at timestamptz not null default now();
alter table users add column if not exists allowed_pages jsonb not null default '[]'::jsonb;
alter table users add column if not exists dashboard_type text;
alter table employees add column if not exists allowed_pages jsonb not null default '[]'::jsonb;
alter table employees add column if not exists user_id text;

alter table employees add column if not exists leads_assigned integer not null default 0;
alter table employees add column if not exists leads_closed integer not null default 0;
alter table employees add column if not exists performance numeric not null default 0;
alter table employees add column if not exists last_assigned_at timestamptz;
alter table employees add column if not exists last_login timestamptz;
alter table employees add column if not exists last_lat numeric;
alter table employees add column if not exists last_lng numeric;
alter table employees add column if not exists last_seen_at timestamptz;
alter table employees add column if not exists updated_at timestamptz not null default now();

alter table leads add column if not exists source text not null default 'website';
alter table leads add column if not exists assigned_to text;
alter table leads add column if not exists stage text not null default 'new';
alter table leads add column if not exists status text not null default 'active';
alter table leads add column if not exists priority text;
alter table leads add column if not exists starred boolean not null default false;
alter table leads add column if not exists follow_up_at timestamptz;
alter table leads add column if not exists notes text;
alter table leads add column if not exists external_lead_id text;
alter table leads add column if not exists integration_uuid text;
alter table leads add column if not exists raw_payload jsonb;
alter table leads add column if not exists lead_type text not null default 'standard';
alter table leads add column if not exists brokerage_amount numeric;
alter table leads add column if not exists updated_at timestamptz not null default now();

alter table bookings add column if not exists brokerage_amount numeric not null default 0;

alter table visits add column if not exists assigned_name text;
alter table visits add column if not exists property_details text;
alter table visits add column if not exists interest_level text;
alter table visits add column if not exists feedback text;
alter table visits add column if not exists interested boolean;
alter table visits add column if not exists updated_at timestamptz not null default now();

alter table visit_followups add column if not exists visit_id text;
alter table visit_followups add column if not exists lead_id text;
alter table visit_followups add column if not exists lead_name text;
alter table visit_followups add column if not exists follow_up_date date;
alter table visit_followups add column if not exists follow_up_time time;
alter table visit_followups add column if not exists follow_up_day text;
alter table visit_followups add column if not exists follow_up_at timestamptz;
alter table visit_followups add column if not exists status text not null default 'scheduled';
alter table visit_followups add column if not exists notes text;
alter table visit_followups add column if not exists created_by text;
alter table visit_followups add column if not exists updated_at timestamptz not null default now();

alter table bookings add column if not exists unit_number text;
alter table bookings add column if not exists tower text;
alter table bookings add column if not exists payment_status text not null default 'pending';
alter table bookings add column if not exists payment_progress integer not null default 0;
alter table bookings add column if not exists agreement_status text not null default 'pending';
alter table bookings add column if not exists completed_tasks jsonb not null default '[]'::jsonb;
alter table bookings add column if not exists booking_date timestamptz;
alter table bookings add column if not exists starred boolean not null default false;
alter table bookings add column if not exists updated_at timestamptz not null default now();

alter table loans add column if not exists documents_status text not null default 'pending';
alter table loans add column if not exists pending_documents jsonb not null default '[]'::jsonb;
alter table loans add column if not exists emi_eligible numeric;
alter table loans add column if not exists progress integer not null default 0;
alter table loans add column if not exists starred boolean not null default false;
alter table loans add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['users', 'employees', 'leads', 'visits', 'visit_followups', 'bookings', 'loans', 'customers', 'templates', 'campaigns']
  loop
    execute format('drop trigger if exists trg_%I_updated_at on %I', table_name, table_name);
    execute format('create trigger trg_%I_updated_at before update on %I for each row execute function set_updated_at()', table_name, table_name);
  end loop;
end $$;

create index if not exists idx_sessions_user on sessions(user_id);
create index if not exists idx_employees_role_active on employees(role, active);
create index if not exists idx_leads_stage_status on leads(stage, status);
create index if not exists idx_leads_assigned_to on leads(assigned_to);
create index if not exists idx_leads_source on leads(source);
create index if not exists idx_leads_external_lead_id on leads(external_lead_id);
create index if not exists idx_leads_phone_source on leads(phone, source);
create index if not exists idx_leads_created_at on leads(created_at desc);
create index if not exists idx_leads_lead_type on leads(lead_type);
create index if not exists idx_leads_stage_broker on leads(stage) where stage = 'broker';
create index if not exists idx_lead_notes_lead_id on lead_notes(lead_id);
create index if not exists idx_activities_lead_id on activities(lead_id);
create index if not exists idx_activities_user_id on activities(user_id);
create index if not exists idx_visits_lead_id on visits(lead_id);
create index if not exists idx_visit_followups_visit_id on visit_followups(visit_id);
create index if not exists idx_visit_followups_lead_id on visit_followups(lead_id);
create index if not exists idx_visit_followups_at on visit_followups(follow_up_at desc);
create index if not exists idx_bookings_lead_id on bookings(lead_id);
create index if not exists idx_loans_lead_id on loans(lead_id);
create index if not exists idx_customers_lead_id on customers(lead_id);
create index if not exists idx_notifications_user_read on notifications(user_id, is_read);
create index if not exists idx_integration_events_source_created on integration_events(source, created_at desc);
create index if not exists idx_integration_events_external_id on integration_events(external_id);

-- Housing / portal integration: backend must use SUPABASE_SERVICE_ROLE_KEY in .env.
-- If you only have the anon key, run the policies below so webhooks can log events and insert leads.

alter table leads enable row level security;
alter table integration_events enable row level security;

drop policy if exists leads_backend_all on leads;
create policy leads_backend_all on leads for all using (true) with check (true);

drop policy if exists integration_events_backend_all on integration_events;
create policy integration_events_backend_all on integration_events for all using (true) with check (true);

-- Compatibility views for the business workflow names.
create or replace view site_visits as
select * from visits;

create or replace view site_visit_followups as
select * from visit_followups;

create or replace view loan_status as
select * from loans;

create or replace view activity_logs as
select * from activities;
