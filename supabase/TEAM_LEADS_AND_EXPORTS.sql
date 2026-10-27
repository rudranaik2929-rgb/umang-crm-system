-- ============================================================================
--  Umang Properties CRM — TEAM LEADS, REGIONS & MONTHLY LEAD EXPORTS
-- ============================================================================
--  Run this in the Supabase SQL Editor (it is also included at the end of
--  SCHEMA_MASTER.sql, so running SCHEMA_MASTER.sql again does the same thing).
--
--  IDEMPOTENT and NON-DESTRUCTIVE: only adds tables/columns/indexes, renames the
--  old "manager" role to "team_lead", and never deletes or rewrites a lead.
--
--  Lead ownership after this migration:
--      Admin pool  ->  Team Lead (leads.team_lead_id)  ->  Employee (leads.assigned_to)
--  Leads that are already assigned to an employee keep working: the backend
--  treats them as belonging to that employee's team lead until stamped.
-- ============================================================================

-- 1. Regions (areas a team lead covers). keywords = comma-separated spellings
--    matched against the free-text lead location (e.g. "nalasopara,nala sopara").
create table if not exists public.regions (
    region_id  text primary key,
    name       text not null,
    keywords   text,
    active     boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

alter table public.regions add column if not exists keywords   text;
alter table public.regions add column if not exists active     boolean default true;
alter table public.regions add column if not exists created_at timestamptz default now();
alter table public.regions add column if not exists updated_at timestamptz default now();

create unique index if not exists regions_name_lower_idx on public.regions (lower(name));

insert into public.regions (region_id, name, keywords) values
    ('reg_virar',       'Virar',       'virar'),
    ('reg_vasai',       'Vasai',       'vasai'),
    ('reg_nallasopara', 'Nallasopara', 'nallasopara,nalasopara,nala sopara,nalla sopara'),
    ('reg_nagpur',      'Nagpur',      'nagpur')
on conflict (region_id) do nothing;

-- 2. Team membership on employees.
--    team_lead_id: the team lead an employee works under.
--    regions:      for team leads, the areas they cover (["*"] = all regions).
alter table public.employees add column if not exists team_lead_id text;
alter table public.employees add column if not exists regions      jsonb default '[]'::jsonb;

create index if not exists employees_team_lead_id_idx on public.employees (team_lead_id);

-- 3. Team ownership on leads.
alter table public.leads add column if not exists team_lead_id          text;
alter table public.leads add column if not exists team_lead_assigned_at timestamptz;
alter table public.leads add column if not exists team_lead_assigned_by text;

create index if not exists leads_team_lead_id_idx on public.leads (team_lead_id);
-- Stable paging: offset pagination ordered by created_at alone can skip rows
-- that share a timestamp (Excel imports stamp midnight). lead_id breaks ties.
create index if not exists leads_created_at_lead_id_idx on public.leads (created_at desc, lead_id desc);

-- 4. Rename the old single "manager" role to "team_lead" (logins + employees).
update public.employees set role = 'team_lead' where lower(role) = 'manager';
update public.users     set role = 'team_lead' where lower(role) = 'manager';
update public.users     set dashboard_type = 'team_lead' where lower(dashboard_type) = 'manager';

-- 5. Monthly lead export archive. Files live in the private Storage bucket
--    "lead-exports" (created automatically by the backend on first export).
create table if not exists public.lead_exports (
    export_id       text primary key,
    month           text not null,           -- YYYY-MM
    scope           text default 'all',      -- 'all' or 'team:<team_lead_id>'
    team_lead_id    text,
    file_name       text,
    file_path       text,                    -- path inside the lead-exports bucket
    row_count       integer default 0,
    stored          boolean default false,   -- false = Storage upload failed (file was still downloaded)
    kind            text default 'manual',   -- manual | auto (month-end archive)
    created_by      text,
    created_by_name text,
    created_at      timestamptz default now()
);

alter table public.lead_exports add column if not exists scope           text default 'all';
alter table public.lead_exports add column if not exists team_lead_id    text;
alter table public.lead_exports add column if not exists file_name       text;
alter table public.lead_exports add column if not exists file_path       text;
alter table public.lead_exports add column if not exists row_count       integer default 0;
alter table public.lead_exports add column if not exists stored          boolean default false;
alter table public.lead_exports add column if not exists kind            text default 'manual';
alter table public.lead_exports add column if not exists created_by      text;
alter table public.lead_exports add column if not exists created_by_name text;
alter table public.lead_exports add column if not exists created_at      timestamptz default now();

create index if not exists lead_exports_month_idx on public.lead_exports (month desc, created_at desc);

-- 6. The backend uses the service-role key (bypasses RLS); keep anon out.
alter table public.regions      enable row level security;
alter table public.lead_exports enable row level security;

-- 7. Verify: open /schema-check on the backend. Expected {"ok": true}.
