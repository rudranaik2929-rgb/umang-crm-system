-- ============================================================================
-- Manager dashboard fix — run once in Supabase SQL Editor
-- Ensures manager logins land on My Dashboard (not owner Dashboard).
-- Safe to re-run.
-- ============================================================================

-- 1. Set manager role + sidebar (replace email if needed)
update users
set
  role = 'manager',
  dashboard_type = 'manager',
  allowed_pages = '["my-dashboard","pipeline","assign-leads","bookings","loans","integrations","broker","employees"]'::jsonb,
  updated_at = now()
where lower(email) = 'rohitsingh241993@gmail.com';

update employees
set
  role = 'manager',
  allowed_pages = '["my-dashboard","pipeline","assign-leads","bookings","loans","integrations","broker","employees"]'::jsonb,
  updated_at = now()
where lower(email) = 'rohitsingh241993@gmail.com';

-- 2. Strip owner Dashboard from every manager account
update users
set
  allowed_pages = (
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    from jsonb_array_elements_text(coalesce(allowed_pages, '[]'::jsonb)) as p
    where p <> 'dashboard'
  ),
  dashboard_type = 'manager',
  updated_at = now()
where role = 'manager';

update employees
set
  allowed_pages = (
    select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    from jsonb_array_elements_text(coalesce(allowed_pages, '[]'::jsonb)) as p
    where p <> 'dashboard'
  ),
  updated_at = now()
where role = 'manager';

-- 3. Verify
select email, role, dashboard_type, allowed_pages
from users
where role = 'manager'
order by email;
