-- =============================================================================
-- Booking documents — PDF/JPEG upload metadata on bookings
-- Run once in Supabase SQL Editor (safe to re-run).
--
-- Stores file metadata in bookings.booking_document (jsonb).
-- Actual files live in Supabase Storage bucket: booking-documents
-- =============================================================================

alter table bookings
  add column if not exists booking_document jsonb;

comment on column bookings.booking_document is
  'Uploaded booking document metadata: file_name, content_type, storage_path, uploaded_at, uploaded_by, size_bytes';

-- ---------------------------------------------------------------------------
-- Supabase Storage setup (Dashboard → Storage → New bucket)
-- ---------------------------------------------------------------------------
-- 1. Create bucket id: booking-documents
-- 2. Set bucket to PRIVATE (recommended — backend serves preview via service role)
-- 3. Allowed MIME types (optional policy): application/pdf, image/jpeg
-- 4. Max file size: 15 MB (matches backend BOOKING_DOCUMENT_MAX_BYTES)
--
-- No public RLS policies required — the CRM backend uploads/downloads using
-- SUPABASE_SERVICE_ROLE_KEY. Do NOT expose the service role key to the browser.
--
-- Optional: verify column exists
-- select booking_id, booking_document from bookings limit 5;
