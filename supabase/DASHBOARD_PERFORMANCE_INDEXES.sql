-- =====================================================================
-- UMANG CRM — DASHBOARD PERFORMANCE INDEXES (run once in Supabase)
-- Safe to re-run. Complements FINAL_RUN_THIS.sql.
-- =====================================================================

create index if not exists idx_leads_stage on leads(stage);
create index if not exists idx_leads_status on leads(status);
create index if not exists idx_leads_assigned_to on leads(assigned_to) where assigned_to is not null;
create index if not exists idx_leads_source on leads(source);
create index if not exists idx_leads_created_at on leads(created_at desc);
create index if not exists idx_leads_follow_up_at on leads(follow_up_at desc) where follow_up_at is not null;
create index if not exists idx_leads_assigned_stage_status on leads(assigned_to, stage, status) where assigned_to is not null;
create index if not exists idx_activities_lead_created on activities(lead_id, created_at desc) where lead_id is not null;
create index if not exists idx_activities_user_created on activities(user_id, created_at desc) where user_id is not null;
create index if not exists idx_bookings_created_at on bookings(created_at desc);
create index if not exists idx_visit_followups_at on visit_followups(follow_up_at desc) where follow_up_at is not null;

-- Notifications (fixes slow bell / unread count)
create index if not exists idx_notifications_user_read on notifications(user_id, is_read, created_at desc);

select 'indexes_ready' as status;
