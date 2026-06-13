-- ============================================================================
-- Manager dashboard fix — run once in Supabase SQL Editor
-- Manager gets BOTH: main Dashboard (team) + My Dashboard (personal).
-- Safe to re-run.
-- ============================================================================

-- 1. Set manager role + sidebar (replace email if needed)
update users
set
  role = 'manager',
  dashboard_type = 'manager',
  allowed_pages = '["dashboard","my-dashboard","pipeline","assign-leads","bookings","loans","integrations","broker","employees"]'::jsonb,
  updated_at = now()
where lower(email) = 'rohitsingh241993@gmail.com';

update employees
set
  role = 'manager',
  allowed_pages = '["dashboard","my-dashboard","pipeline","assign-leads","bookings","loans","integrations","broker","employees"]'::jsonb,
  updated_at = now()
where lower(email) = 'rohitsingh241993@gmail.com';

-- 2. Ensure every manager has main Dashboard + My Dashboard in sidebar
update users
set
  allowed_pages = (
    select coalesce(jsonb_agg(distinct to_jsonb(p)), '[]'::jsonb)
    from (
      select 'dashboard' as p
      union select 'my-dashboard'
      union select jsonb_array_elements_text(coalesce(allowed_pages, '[]'::jsonb))
    ) s
    where p <> 'tracking'
  ),
  dashboard_type = 'manager',
  updated_at = now()
where role = 'manager';

update employees
set
  allowed_pages = (
    select coalesce(jsonb_agg(distinct to_jsonb(p)), '[]'::jsonb)
    from (
      select 'dashboard' as p
      union select 'my-dashboard'
      union select jsonb_array_elements_text(coalesce(allowed_pages, '[]'::jsonb))
    ) s
    where p <> 'tracking'
  ),
  updated_at = now()
where role = 'manager';

-- 3. Verify
select email, role, dashboard_type, allowed_pages
from users
where role = 'manager'
order by email;
