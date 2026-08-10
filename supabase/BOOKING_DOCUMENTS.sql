-- =============================================================================
-- Booking documents — PDF/JPEG upload metadata on bookings
-- Run once in Supabase SQL Editor (safe to re-run).
--
-- 1) Adds bookings.booking_document (jsonb) — metadata column the CRM uses to
--    track each uploaded file.
-- 2) Storage bucket "booking-documents" is created AUTOMATICALLY by the backend
--    on the first upload (no Dashboard step required). If you prefer to create
--    it manually: Dashboard → Storage → New bucket → id: booking-documents,
--    PRIVATE, max size 15 MB, MIME types application/pdf + image/jpeg.
-- =============================================================================

alter table bookings
  add column if not exists booking_document jsonb;

comment on column bookings.booking_document is
  'Uploaded booking document metadata: file_name, content_type, storage_path, uploaded_at, uploaded_by, size_bytes';

-- Optional sanity check: which bookings already have a document uploaded?
-- select booking_id, booking_document->>'file_name' as file from bookings
-- where booking_document is not null limit 10;