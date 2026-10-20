-- ============================================================================
--  Umang Properties CRM — SCHEMA MASTER (single consolidated schema)
-- ============================================================================
--  Run this ONE file in the Supabase SQL Editor.
--
--  It is IDEMPOTENT: it only creates what is absent and only adds columns that
--  do not already exist. Running it twice is safe. It never drops, never
--  rewrites and never deletes data.
--
--  Why this file exists: the required columns used to be spread over ~40 old
--  .sql files, so a fresh database could be missing columns (assigned_at,
--  last_employee_action_at, site_visitor_id, ...) that the code selects. A
--  missing column makes a screen silently report a wrong count — for example
--  "Total Leads" disagreeing between the Dashboard and Assign Leads.
--
--  Verify the result any time from your browser:
--      https://umang-crm-systemumang-home-tech.onrender.com/schema-check
--  It lists exactly which columns (if any) are still missing.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. LEADS — the pipeline. Every column below is read by the backend.
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
    lead_id                  text primary key,
    name                     text,
    phone                    text,
    email                    text,
    address                  text,
    external_lead_id         text,
    integration_uuid         text, 
    source                   text,
    platform                 text,
    stage                    text default 'new',
    status                   text default 'active',
    lead_type                text,
    priority                 text,
    call_status              text,
    interest_level           text,
    budget                   text,
    location                 text,
    property_type            text,
    notes                    text,
    assigned_to              text,
    assigned_by              text,
    assigned_name            text,
    assigned_at              timestamptz,
    last_employee_action_at  timestamptz,
    site_visitor_id          text,
    site_visit_assigned_by   text,
    site_visit_assigned_at   timestamptz,
    follow_up_at             timestamptz,
    starred                  boolean default false,
    brokerage_amount         numeric,
    external_created_at      timestamptz,
    raw_payload              jsonb,
    created_at               timestamptz default now(),
    updated_at               timestamptz default now()
);

alter table public.leads add column if not exists name                    text;
alter table public.leads add column if not exists phone                   text;
alter table public.leads add column if not exists email                   text;
alter table public.leads add column if not exists address                 text;
alter table public.leads add column if not exists external_lead_id        text;
alter table public.leads add column if not exists integration_uuid        text;
alter table public.leads add column if not exists source                  text;
alter table public.leads add column if not exists platform                text;
alter table public.leads add column if not exists stage                   text default 'new';
alter table public.leads add column if not exists status                  text default 'active';
alter table public.leads add column if not exists lead_type               text;
alter table public.leads add column if not exists priority                text;
alter table public.leads add column if not exists call_status             text;
alter table public.leads add column if not exists interest_level          text;
alter table public.leads add column if not exists budget                  text;
alter table public.leads add column if not exists location                text;
alter table public.leads add column if not exists property_type           text;
alter table public.leads add column if not exists notes                   text;
alter table public.leads add column if not exists assigned_to             text;
alter table public.leads add column if not exists assigned_by             text;
alter table public.leads add column if not exists assigned_name           text;
alter table public.leads add column if not exists assigned_at             timestamptz;
alter table public.leads add column if not exists last_employee_action_at timestamptz;
alter table public.leads add column if not exists site_visitor_id         text;
alter table public.leads add column if not exists site_visit_assigned_by  text;
alter table public.leads add column if not exists site_visit_assigned_at  timestamptz;
alter table public.leads add column if not exists follow_up_at            timestamptz;
alter table public.leads add column if not exists starred                 boolean default false;
alter table public.leads add column if not exists brokerage_amount        numeric;
alter table public.leads add column if not exists external_created_at     timestamptz;
alter table public.leads add column if not exists raw_payload             jsonb;
alter table public.leads add column if not exists created_at              timestamptz default now();
alter table public.leads add column if not exists updated_at              timestamptz default now();

create index if not exists leads_assigned_to_idx      on public.leads (assigned_to);
create index if not exists leads_status_idx           on public.leads (status);
create index if not exists leads_stage_idx            on public.leads (stage);
create index if not exists leads_created_at_idx       on public.leads (created_at desc);
create index if not exists leads_external_lead_id_idx on public.leads (external_lead_id);
create index if not exists leads_follow_up_at_idx     on public.leads (follow_up_at);
create index if not exists leads_phone_idx            on public.leads (phone);

-- ----------------------------------------------------------------------------
-- 2. EMPLOYEES
-- ----------------------------------------------------------------------------
create table if not exists public.employees (
    employee_id      text primary key,
    name             text,
    email            text,
    phone            text,
    role             text default 'telecaller',
    department       text,
    user_id          text,
    active           boolean default true,
    allowed_pages    jsonb,
    dashboard_type   text,
    last_assigned_at timestamptz,
    last_seen_at     timestamptz,
    last_lat         numeric,
    last_lng         numeric,
    created_at       timestamptz default now(),
    updated_at       timestamptz default now()
);

alter table public.employees add column if not exists name             text;
alter table public.employees add column if not exists email            text;
alter table public.employees add column if not exists phone            text;
alter table public.employees add column if not exists role             text default 'telecaller';
alter table public.employees add column if not exists department       text;
alter table public.employees add column if not exists user_id          text;
alter table public.employees add column if not exists active           boolean default true;
alter table public.employees add column if not exists allowed_pages    jsonb;
alter table public.employees add column if not exists dashboard_type   text;
alter table public.employees add column if not exists last_assigned_at timestamptz;
alter table public.employees add column if not exists last_seen_at     timestamptz;
alter table public.employees add column if not exists last_lat         numeric;
alter table public.employees add column if not exists last_lng         numeric;
alter table public.employees add column if not exists created_at       timestamptz default now();
alter table public.employees add column if not exists updated_at       timestamptz default now();

create index if not exists employees_role_idx   on public.employees (role);
create index if not exists employees_active_idx on public.employees (active);
create index if not exists employees_user_id_idx on public.employees (user_id);

-- ----------------------------------------------------------------------------
-- 3. USERS — login + single-device session tracking
-- ----------------------------------------------------------------------------
create table if not exists public.users (
    user_id             text primary key,
    email               text unique,
    password_hash       text,
    role                text default 'telecaller',
    employee_id         text,
    name                text,
    display_name        text,
    allowed_pages       jsonb default '[]'::jsonb,
    active              boolean default true,
    last_login_at       timestamptz,
    last_logout_at      timestamptz,
    active_session_id   text,
    active_login_at     timestamptz,
    active_last_seen_at timestamptz,
    active_device_label text,
    active_ip           text,
    active_user_agent   text,
    session_updated_at  timestamptz,
    created_at          timestamptz default now(),
    updated_at          timestamptz default now()
);

alter table public.users add column if not exists email               text;
alter table public.users add column if not exists password_hash       text;
alter table public.users add column if not exists role                text default 'telecaller';
alter table public.users add column if not exists employee_id         text;
-- `name` is NOT NULL in databases created by the older SQL files, so it must be
-- added with a default (otherwise inserts fail with 23502).
alter table public.users add column if not exists name                text default '';
alter table public.users add column if not exists display_name        text;
alter table public.users add column if not exists allowed_pages       jsonb default '[]'::jsonb;
alter table public.users add column if not exists active              boolean default true;
alter table public.users add column if not exists last_login_at       timestamptz;
alter table public.users add column if not exists last_logout_at      timestamptz;
alter table public.users add column if not exists active_session_id   text;
alter table public.users add column if not exists active_login_at     timestamptz;
alter table public.users add column if not exists active_last_seen_at timestamptz;
alter table public.users add column if not exists active_device_label text;
alter table public.users add column if not exists active_ip           text;
alter table public.users add column if not exists active_user_agent   text;
alter table public.users add column if not exists session_updated_at  timestamptz;
alter table public.users add column if not exists created_at          timestamptz default now();
alter table public.users add column if not exists updated_at          timestamptz default now();

create unique index if not exists users_email_key on public.users (email);

-- ----------------------------------------------------------------------------
-- 4. SESSIONS
-- ----------------------------------------------------------------------------
create table if not exists public.sessions (
    session_token text primary key,
    user_id       text,
    device_label  text,
    created_at    timestamptz default now(),
    expires_at    timestamptz
);

alter table public.sessions add column if not exists user_id      text;
alter table public.sessions add column if not exists device_label text;
alter table public.sessions add column if not exists created_at   timestamptz default now();
alter table public.sessions add column if not exists expires_at   timestamptz;

create index if not exists sessions_user_id_idx    on public.sessions (user_id);
create index if not exists sessions_expires_at_idx on public.sessions (expires_at);

-- ----------------------------------------------------------------------------
-- 5. LEAD NOTES
-- ----------------------------------------------------------------------------
create table if not exists public.lead_notes (
    note_id    text primary key,
    lead_id    text,
    user_id    text,
    text       text,
    created_at timestamptz default now()
);

alter table public.lead_notes add column if not exists lead_id    text;
alter table public.lead_notes add column if not exists user_id    text;
alter table public.lead_notes add column if not exists text       text;
alter table public.lead_notes add column if not exists created_at timestamptz default now();

create index if not exists lead_notes_lead_id_idx on public.lead_notes (lead_id);

-- ----------------------------------------------------------------------------
-- 6. ACTIVITIES
-- ----------------------------------------------------------------------------
create table if not exists public.activities (
    activity_id text primary key,
    user_id     text,
    lead_id     text,
    type        text,
    text        text,
    created_at  timestamptz default now()
);

alter table public.activities add column if not exists user_id    text;
alter table public.activities add column if not exists lead_id    text;
alter table public.activities add column if not exists type       text;
alter table public.activities add column if not exists text       text;
alter table public.activities add column if not exists created_at timestamptz default now();

create index if not exists activities_user_id_idx    on public.activities (user_id);
create index if not exists activities_lead_id_idx    on public.activities (lead_id);
create index if not exists activities_created_at_idx on public.activities (created_at desc);

-- ----------------------------------------------------------------------------
-- 7. BOOKINGS
-- ----------------------------------------------------------------------------
create table if not exists public.bookings (
    booking_id         text primary key,
    lead_id            text,
    lead_name          text,
    customer_name      text,
    phone              text,
    property_name      text,
    status             text default 'pending',
    completed_tasks    jsonb default '[]'::jsonb,
    booking_officer_id text,
    agreement_status   text,
    agreement_value    numeric,
    booking_date       timestamptz,
    booking_document   jsonb,
    documents_status   text,
    brokerage_amount   numeric,
    brokerage_received numeric,
    brokerage_status   text,
    gst                numeric,
    flat_cost          numeric,
    created_at         timestamptz default now(),
    updated_at         timestamptz default now()
);

alter table public.bookings add column if not exists lead_id            text;
alter table public.bookings add column if not exists lead_name          text;
alter table public.bookings add column if not exists customer_name      text;
alter table public.bookings add column if not exists phone              text;
alter table public.bookings add column if not exists property_name      text;
alter table public.bookings add column if not exists status             text default 'pending';
alter table public.bookings add column if not exists completed_tasks    jsonb default '[]'::jsonb;
alter table public.bookings add column if not exists booking_officer_id text;
alter table public.bookings add column if not exists agreement_status   text;
alter table public.bookings add column if not exists agreement_value    numeric;
alter table public.bookings add column if not exists booking_date       timestamptz;
alter table public.bookings add column if not exists booking_document   jsonb;
alter table public.bookings add column if not exists documents_status   text;
alter table public.bookings add column if not exists brokerage_amount   numeric;
alter table public.bookings add column if not exists brokerage_received numeric;
alter table public.bookings add column if not exists brokerage_status   text;
alter table public.bookings add column if not exists gst                numeric;
alter table public.bookings add column if not exists flat_cost          numeric;
alter table public.bookings add column if not exists created_at         timestamptz default now();
alter table public.bookings add column if not exists updated_at         timestamptz default now();

create index if not exists bookings_lead_id_idx            on public.bookings (lead_id);
create index if not exists bookings_booking_officer_id_idx on public.bookings (booking_officer_id);
create index if not exists bookings_status_idx             on public.bookings (status);

-- ----------------------------------------------------------------------------
-- 8. LOANS
-- ----------------------------------------------------------------------------
create table if not exists public.loans (
    loan_id            text primary key,
    lead_id            text,
    booking_id         text,
    bank_name          text,
    amount             numeric,
    emi_eligible       numeric,
    application_status text default 'pending',
    bank_stage         text,
    documents_status   text,
    created_at         timestamptz default now(),
    updated_at         timestamptz default now()
);

alter table public.loans add column if not exists lead_id            text;
alter table public.loans add column if not exists booking_id         text;
alter table public.loans add column if not exists bank_name          text;
alter table public.loans add column if not exists amount             numeric;
alter table public.loans add column if not exists emi_eligible       numeric;
alter table public.loans add column if not exists application_status text default 'pending';
alter table public.loans add column if not exists bank_stage         text;
alter table public.loans add column if not exists documents_status   text;
alter table public.loans add column if not exists created_at         timestamptz default now();
alter table public.loans add column if not exists updated_at         timestamptz default now();

create index if not exists loans_lead_id_idx on public.loans (lead_id);

-- ----------------------------------------------------------------------------
-- 9. VISITS + VISIT FOLLOWUPS
-- ----------------------------------------------------------------------------
create table if not exists public.visits (
    visit_id       text primary key,
    lead_id        text,
    employee_id    text,
    property_name  text,
    scheduled_at   timestamptz,
    status         text default 'scheduled',
    feedback       text,
    created_at     timestamptz default now(),
    updated_at     timestamptz default now()
);

alter table public.visits add column if not exists lead_id       text;
alter table public.visits add column if not exists employee_id   text;
alter table public.visits add column if not exists property_name text;
alter table public.visits add column if not exists scheduled_at  timestamptz;
alter table public.visits add column if not exists status        text default 'scheduled';
alter table public.visits add column if not exists feedback      text;
alter table public.visits add column if not exists created_at    timestamptz default now();
alter table public.visits add column if not exists updated_at    timestamptz default now();

create index if not exists visits_lead_id_idx     on public.visits (lead_id);
create index if not exists visits_employee_id_idx on public.visits (employee_id);

create table if not exists public.visit_followups (
    followup_id   text primary key,
    visit_id      text,
    lead_id       text,
    employee_id   text,
    follow_up_date date,
    follow_up_time time,
    follow_up_day text,
    status        text default 'scheduled',
    notes         text,
    created_at    timestamptz default now(),
    updated_at    timestamptz default now()
);

alter table public.visit_followups add column if not exists visit_id       text;
alter table public.visit_followups add column if not exists lead_id        text;
alter table public.visit_followups add column if not exists employee_id    text;
alter table public.visit_followups add column if not exists follow_up_date date;
alter table public.visit_followups add column if not exists follow_up_time time;
alter table public.visit_followups add column if not exists follow_up_day  text;
alter table public.visit_followups add column if not exists status         text default 'scheduled';
alter table public.visit_followups add column if not exists notes          text;
alter table public.visit_followups add column if not exists created_at     timestamptz default now();
alter table public.visit_followups add column if not exists updated_at     timestamptz default now();

create index if not exists visit_followups_lead_id_idx on public.visit_followups (lead_id);

-- Site-visit assignments (the "Site Visit Assigned" box).
create table if not exists public.site_visit_assignments (
    id            text primary key,
    lead_id       text,
    visitor_id    text,
    assigned_by   text,
    assigned_at   timestamptz default now(),
    status        text default 'assigned',
    notes         text,
    created_at    timestamptz default now()
);

alter table public.site_visit_assignments add column if not exists lead_id     text;
alter table public.site_visit_assignments add column if not exists visitor_id  text;
alter table public.site_visit_assignments add column if not exists assigned_by text;
alter table public.site_visit_assignments add column if not exists assigned_at timestamptz default now();
alter table public.site_visit_assignments add column if not exists status      text default 'assigned';
alter table public.site_visit_assignments add column if not exists notes       text;
alter table public.site_visit_assignments add column if not exists created_at  timestamptz default now();

create index if not exists site_visit_assignments_lead_id_idx on public.site_visit_assignments (lead_id);

-- ----------------------------------------------------------------------------
-- 10. CUSTOMERS + CAMPAIGNS + TEMPLATES
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
    customer_id text primary key,
    lead_id     text,
    name        text,
    phone       text,
    email       text,
    address     text,
    created_at  timestamptz default now(),
    updated_at  timestamptz default now()
);

alter table public.customers add column if not exists lead_id    text;
alter table public.customers add column if not exists name       text;
alter table public.customers add column if not exists phone      text;
alter table public.customers add column if not exists email      text;
alter table public.customers add column if not exists address    text;
alter table public.customers add column if not exists created_at timestamptz default now();
alter table public.customers add column if not exists updated_at timestamptz default now();

create table if not exists public.campaigns (
    campaign_id text primary key,
    name        text,
    platform    text,
    status      text default 'active',
    budget      numeric,
    spend       numeric,
    created_at  timestamptz default now(),
    updated_at  timestamptz default now()
);

alter table public.campaigns add column if not exists name       text;
alter table public.campaigns add column if not exists platform   text;
alter table public.campaigns add column if not exists status     text default 'active';
alter table public.campaigns add column if not exists budget     numeric;
alter table public.campaigns add column if not exists spend      numeric;
alter table public.campaigns add column if not exists created_at timestamptz default now();
alter table public.campaigns add column if not exists updated_at timestamptz default now();

create table if not exists public.templates (
    template_id text primary key,
    name        text,
    channel     text,
    body        text,
    created_at  timestamptz default now()
);

alter table public.templates add column if not exists name       text;
alter table public.templates add column if not exists channel    text;
alter table public.templates add column if not exists body       text;
alter table public.templates add column if not exists created_at timestamptz default now();

-- ----------------------------------------------------------------------------
-- 11. NOTIFICATIONS (system + push)
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
    notification_id text primary key,
    user_id         text,
    title           text,
    body            text,
    type            text,
    link            text,
    is_read         boolean default false,
    created_at      timestamptz default now()
);

alter table public.notifications add column if not exists user_id    text;
alter table public.notifications add column if not exists title      text;
alter table public.notifications add column if not exists body       text;
alter table public.notifications add column if not exists type       text;
alter table public.notifications add column if not exists link       text;
alter table public.notifications add column if not exists is_read    boolean default false;
alter table public.notifications add column if not exists created_at timestamptz default now();

create index if not exists notifications_user_id_idx    on public.notifications (user_id);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);

create table if not exists public.notification_preferences (
    user_id       text primary key,
    push_enabled  boolean default true,
    email_enabled boolean default false,
    muted_types   jsonb default '[]'::jsonb,
    created_at    timestamptz default now(),
    updated_at    timestamptz default now()
);

alter table public.notification_preferences add column if not exists push_enabled  boolean default true;
alter table public.notification_preferences add column if not exists email_enabled boolean default false;
alter table public.notification_preferences add column if not exists muted_types   jsonb default '[]'::jsonb;
alter table public.notification_preferences add column if not exists created_at    timestamptz default now();
alter table public.notification_preferences add column if not exists updated_at    timestamptz default now();

create table if not exists public.fcm_device_tokens (
    id         text primary key,
    user_id    text,
    fcm_token  text,
    platform   text,
    created_at timestamptz default now()
);

alter table public.fcm_device_tokens add column if not exists user_id    text;
alter table public.fcm_device_tokens add column if not exists fcm_token  text;
alter table public.fcm_device_tokens add column if not exists platform   text;
alter table public.fcm_device_tokens add column if not exists created_at timestamptz default now();

create index if not exists fcm_device_tokens_user_id_idx on public.fcm_device_tokens (user_id);

create table if not exists public.notification_push_queue (
    id         text primary key,
    user_id    text,
    token      text,
    title      text,
    body       text,
    status     text default 'pending',
    attempts   int default 0,
    created_at timestamptz default now()
);

alter table public.notification_push_queue add column if not exists user_id    text;
alter table public.notification_push_queue add column if not exists token      text;
alter table public.notification_push_queue add column if not exists title      text;
alter table public.notification_push_queue add column if not exists body       text;
alter table public.notification_push_queue add column if not exists status     text default 'pending';
alter table public.notification_push_queue add column if not exists attempts   int default 0;
alter table public.notification_push_queue add column if not exists created_at timestamptz default now();

-- ----------------------------------------------------------------------------
-- 12. INTEGRATIONS (Housing / Meta sync) + LOGIN AUDIT
-- ----------------------------------------------------------------------------
create table if not exists public.integration_events (
    event_id    text primary key,
    source      text,
    external_id text,
    lead_id     text,
    status      text,
    error       text,
    raw_payload jsonb,
    created_at  timestamptz default now()
);

alter table public.integration_events add column if not exists source      text;
alter table public.integration_events add column if not exists external_id text;
alter table public.integration_events add column if not exists lead_id     text;
alter table public.integration_events add column if not exists status      text;
alter table public.integration_events add column if not exists error       text;
alter table public.integration_events add column if not exists raw_payload jsonb;
alter table public.integration_events add column if not exists created_at  timestamptz default now();

create index if not exists integration_events_created_at_idx on public.integration_events (created_at desc);

create table if not exists public.login_events (
    id            text primary key,
    user_id       text,
    email         text,
    ip            text,
    user_agent    text,
    device_label  text,
    success       boolean default true,
    created_at    timestamptz default now()
);

alter table public.login_events add column if not exists user_id      text;
alter table public.login_events add column if not exists email        text;
alter table public.login_events add column if not exists ip           text;
alter table public.login_events add column if not exists user_agent   text;
alter table public.login_events add column if not exists device_label text;
alter table public.login_events add column if not exists success      boolean default true;
alter table public.login_events add column if not exists created_at   timestamptz default now();

create index if not exists login_events_created_at_idx on public.login_events (created_at desc);

-- ----------------------------------------------------------------------------
-- 13. EMPLOYEE LOCATIONS (field tracking)
-- ----------------------------------------------------------------------------
create table if not exists public.employee_locations (
    employee_id text primary key,
    ok          boolean default false,
    accepted    boolean default false,
    accuracy    numeric,
    reason      text,
    lat         numeric,
    lng         numeric,
    updated_at  timestamptz default now()
);

alter table public.employee_locations add column if not exists ok         boolean default false;
alter table public.employee_locations add column if not exists accepted   boolean default false;
alter table public.employee_locations add column if not exists accuracy   numeric;
alter table public.employee_locations add column if not exists reason     text;
alter table public.employee_locations add column if not exists lat        numeric;
alter table public.employee_locations add column if not exists lng        numeric;
alter table public.employee_locations add column if not exists updated_at timestamptz default now();

create table if not exists public.employee_location_history (
    id          text primary key,
    employee_id text,
    lat         numeric,
    lng         numeric,
    accuracy    numeric,
    captured_at timestamptz default now()
);

alter table public.employee_location_history add column if not exists employee_id text;
alter table public.employee_location_history add column if not exists lat         numeric;
alter table public.employee_location_history add column if not exists lng         numeric;
alter table public.employee_location_history add column if not exists accuracy    numeric;
alter table public.employee_location_history add column if not exists captured_at timestamptz default now();

create index if not exists employee_location_history_employee_id_idx
    on public.employee_location_history (employee_id);

-- ----------------------------------------------------------------------------
-- 14. ROLES (reference table)
-- ----------------------------------------------------------------------------
create table if not exists public.roles (
    role        text primary key,
    label       text,
    description text,
    created_at  timestamptz default now()
);

alter table public.roles add column if not exists label       text;
alter table public.roles add column if not exists description text;
alter table public.roles add column if not exists created_at  timestamptz default now();

-- ----------------------------------------------------------------------------
-- 15. ACCESS
-- ----------------------------------------------------------------------------
-- Repair legacy NOT NULL constraints. Databases created by the older SQL files
-- made several columns NOT NULL with no default, but the backend inserts into
-- those tables without supplying them — which fails with 23502 (the error you
-- saw on `users.name`). Dropping NOT NULL is non-destructive: no row, no value
-- and no constraint that protects real data is changed. It only stops the
-- database rejecting inserts the application legitimately makes.
--
-- Done through a helper so a missing table/column is skipped instead of
-- aborting the whole script (a fresh database will not have all of them yet).
create or replace function public._umang_drop_not_null(p_table text, p_column text)
returns void language plpgsql as $$
begin
    execute format('alter table public.%I alter column %I drop not null', p_table, p_column);
exception
    when undefined_table then null;
    when undefined_column then null;
    when others then null;
end $$;

do $$
declare
    pairs text[][] := array[
        ['users','name'], ['users','email'],
        ['leads','name'], ['leads','phone'],
        ['employees','name'], ['employees','email'], ['employees','role'], ['employees','department'],
        ['activities','type'], ['activities','text'],
        ['lead_notes','lead_id'], ['lead_notes','text'],
        ['visits','visit_id'],
        ['visit_followups','visit_id'], ['visit_followups','follow_up_at'],
        ['visit_followups','follow_up_date'], ['visit_followups','follow_up_day'],
        ['visit_followups','follow_up_time'],
        ['customers','name'], ['campaigns','name'],
        ['templates','name'], ['templates','body'],
        ['roles','name'], ['sessions','user_id'],
        ['notifications','title'], ['notifications','message'],
        ['integration_events','source'], ['integration_events','status'],
        ['fcm_device_tokens','user_id'], ['fcm_device_tokens','fcm_token'],
        ['employee_locations','latitude'], ['employee_locations','longitude'],
        ['employee_location_history','employee_id'],
        ['employee_location_history','latitude'], ['employee_location_history','longitude'],
        ['login_events','event']
    ];
    i int;
begin
    for i in 1 .. array_length(pairs, 1) loop
        perform public._umang_drop_not_null(pairs[i][1], pairs[i][2]);
    end loop;
end $$;

drop function if exists public._umang_drop_not_null(text, text);

-- The backend uses the service-role key, which bypasses RLS. These policies
-- exist so the anon key cannot read lead data if it is ever exposed.
alter table public.leads              enable row level security;
alter table public.employees          enable row level security;
alter table public.users              enable row level security;
alter table public.bookings           enable row level security;
alter table public.loans              enable row level security;
alter table public.activities         enable row level security;
alter table public.notifications      enable row level security;
alter table public.integration_events enable row level security;

-- ----------------------------------------------------------------------------
-- 16. SEED — default admin login (umang@admin / umang@admin)
-- ----------------------------------------------------------------------------
-- Written defensively: the users table may have been created by an older SQL
-- file where `name` / `allowed_pages` are NOT NULL, so every such column is
-- supplied. `on conflict (email) do nothing` means an existing admin is left
-- exactly as it is (your current password keeps working).
insert into public.users (
    user_id, email, password_hash, role, name, display_name, allowed_pages, active
)
values (
    'user_umang_admin',
    'umang@admin',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS9y2QO',
    'admin',
    'Umang Admin',
    'Umang Admin',
    '[]'::jsonb,
    true
)
on conflict (email) do nothing;

-- If `name` already existed as NOT NULL with no default, give it a default so
-- any future insert that omits it still succeeds.
alter table public.users alter column name set default '';

-- ----------------------------------------------------------------------------
-- 17. Self-check
-- ----------------------------------------------------------------------------
-- After running this, open /schema-check on the backend to confirm every
-- column the code needs is present. Expected: {"ok": true}.
