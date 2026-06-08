-- =====================================================================
-- UMANG CRM — FULL CLEAN START FRESH (run ONCE in Supabase SQL Editor)
-- ---------------------------------------------------------------------
-- Clears ALL dashboard numbers to 0:
--   loans, bookings, follow-ups, assignments, employee stats, activities
-- Keeps: employee accounts, users, Housing/Meta lead records (unassigned)
-- After run: assign leads fresh from Assign Leads page.
-- =====================================================================

begin;

-- 1. Remove all workflow / pipeline records (loans box, bookings, follow-ups → 0)
delete from notifications;
delete from customers;
delete from lead_notes;
delete from visit_followups;
delete from visits;
delete from bookings;
delete from loans;
delete from activities;

-- 2. Reset every pipeline lead to brand-new unassigned state
update leads
set
  assigned_to = null,
  assigned_at = null,
  assigned_by = null,
  follow_up_at = null,
  stage = 'new',
  status = 'active',
  priority = null,
  call_status = null,
  updated_at = now()
where coalesce(stage, 'new') <> 'broker'
  and coalesce(lead_type, 'standard') <> 'brokerage';

-- 3. Reset employee assignment counters (employee performance → 0)
update employees
set
  leads_assigned = 0,
  leads_closed = 0,
  performance = 0,
  updated_at = now();

commit;

-- =====================================================================
-- VERIFY — all should be 0 except total_leads (unassigned Housing/Meta)
-- =====================================================================
select count(*) as total_leads from leads;
select count(*) as assigned_leads from leads where assigned_to is not null;
select count(*) as follow_ups from leads where follow_up_at is not null;
select count(*) as loans from loans;
select count(*) as bookings from bookings;
select count(*) as activities from activities;
select sum(leads_assigned) as emp_assigned_sum from employees;

-- =====================================================================
-- OPTIONAL: delete ALL leads too (uncomment only if you want zero leads)
-- =====================================================================
/*
begin;
delete from notifications;
delete from customers;
delete from lead_notes;
delete from visit_followups;
delete from visits;
delete from bookings;
delete from loans;
delete from activities;
delete from leads;
update employees set leads_assigned = 0, leads_closed = 0, performance = 0, updated_at = now();
commit;
*/
