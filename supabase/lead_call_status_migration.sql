-- ============================================================================
-- Umang CRM — Lead call / ringing status
-- Run once in Supabase SQL Editor (safe to re-run).
-- Stores telecaller outcome: ringing, out_of_service, call_back, disconnect.
-- ============================================================================

alter table leads add column if not exists call_status text;

-- Optional: index for filtering telecaller queue by call status
create index if not exists leads_call_status_idx on leads (call_status) where call_status is not null;
