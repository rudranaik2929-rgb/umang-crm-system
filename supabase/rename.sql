-- =====================================================================
-- UMANG PROPERTIES CRM — BRAND RENAME (database data)
-- ---------------------------------------------------------------------
-- Old brand : "Umang Hometech LLP"
-- New brand : "Umang Properties CRM"
--
-- WHERE TO RUN: Supabase Dashboard -> SQL Editor -> paste this whole file
--               -> Run. Safe to run more than once (idempotent).
--
-- WHAT THIS DOES:
--   Renames the OLD brand wherever it was stored as *data* in the
--   database (the admin display name, plus any matching employee name,
--   WhatsApp template, campaign name, or past notification text).
--
-- WHAT THIS DOES **NOT** TOUCH (intentional):
--   * loans.bank_name = 'Umang Hometech LLP Loan'  -> left as-is on
--     purpose (it is an internal value and shows as "UMANG LOAN" in the
--     UI, not as the company brand).
--   * Domains (umanghometechllp.in, api./www.), login emails
--     (umang@admin, *@umang.com), UMANGCRM123 token, Firebase project,
--     JWT issuer and localStorage keys -> these are configuration in
--     Vercel/Render/Supabase/Firebase, NOT database rows.
--   * Schema/table/column/function names -> unchanged.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Seeded admin display name (the main one that shows in the app)
-- ---------------------------------------------------------------------
update public.users
set    name = replace(name, 'Umang Hometech LLP', 'Umang Properties CRM')
where  name ilike '%Umang Hometech%';

-- ---------------------------------------------------------------------
-- 2) Employee display names (only rows that still contain the old brand)
-- ---------------------------------------------------------------------
update public.employees
set    name = replace(name, 'Umang Hometech LLP', 'Umang Properties CRM')
where  name ilike '%Umang Hometech%';

-- ---------------------------------------------------------------------
-- 3) WhatsApp templates (name + body)
-- ---------------------------------------------------------------------
update public.templates
set    name = replace(name, 'Umang Hometech LLP', 'Umang Properties CRM')
where  name ilike '%Umang Hometech%';

update public.templates
set    body = replace(body, 'Umang Hometech LLP', 'Umang Properties CRM')
where  body ilike '%Umang Hometech%';

-- ---------------------------------------------------------------------
-- 4) Campaign names
-- ---------------------------------------------------------------------
update public.campaigns
set    name = replace(name, 'Umang Hometech LLP', 'Umang Properties CRM')
where  name ilike '%Umang Hometech%';

-- ---------------------------------------------------------------------
-- 5) Past notifications (title + message)
-- ---------------------------------------------------------------------
update public.notifications
set    title = replace(title, 'Umang Hometech LLP', 'Umang Properties CRM')
where  title ilike '%Umang Hometech%';

update public.notifications
set    message = replace(message, 'Umang Hometech LLP', 'Umang Properties CRM')
where  message ilike '%Umang Hometech%';

-- =====================================================================
-- VERIFY — every query below should return 0 rows after the updates
-- =====================================================================
select 'users'         as table_name, count(*) as remaining from public.users         where name    ilike '%Umang Hometech%'
union all
select 'employees',               count(*)               from public.employees       where name    ilike '%Umang Hometech%'
union all
select 'templates.name',          count(*)               from public.templates       where name    ilike '%Umang Hometech%'
union all
select 'templates.body',          count(*)               from public.templates       where body    ilike '%Umang Hometech%'
union all
select 'campaigns',               count(*)               from public.campaigns       where name    ilike '%Umang Hometech%'
union all
select 'notifications.title',     count(*)               from public.notifications   where title   ilike '%Umang Hometech%'
union all
select 'notifications.message',   count(*)               from public.notifications   where message ilike '%Umang Hometech%';

-- Quick look at the renamed admin row (optional)
select user_id, email, name, role
from   public.users
where  user_id = 'user_admin001'
   or  name ilike '%Umang Properties%';
