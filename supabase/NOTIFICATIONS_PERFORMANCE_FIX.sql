-- =====================================================================
-- UMANG CRM — NOTIFICATIONS user_id FIX (run once in Supabase SQL Editor)
-- Fixes slow dashboard: notifications stored with employee NAME instead of employee_id
-- =====================================================================

-- Name → employee_id (e.g. "Manasvi Dhanawade")
update notifications n
set user_id = e.employee_id
from employees e
where n.user_id is not null
  and n.user_id <> e.employee_id
  and lower(trim(n.user_id)) = lower(trim(e.name));

-- employees.user_id → employee_id
update notifications n
set user_id = e.employee_id
from employees e
where n.user_id = e.user_id
  and e.employee_id is not null
  and n.user_id <> e.employee_id;

-- users.user_id → users.employee_id
update notifications n
set user_id = u.employee_id
from users u
where n.user_id = u.user_id
  and u.employee_id is not null
  and n.user_id <> u.employee_id;

-- Verify — names left in user_id should be 0
select user_id, count(*) as cnt
from notifications
where user_id ~ '[A-Za-z ]'
group by user_id
order by cnt desc;
