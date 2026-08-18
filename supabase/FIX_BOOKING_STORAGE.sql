-- =============================================================================
-- FIX: Create booking-documents storage bucket + booking_document column
-- Run this in Supabase SQL Editor to fix the "Could not create the
-- booking-documents storage bucket" error.
-- =============================================================================

-- 0) Diagnostic: check if the bucket already exists
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'booking-documents';

-- 1) Create the storage bucket (idempotent — skips if it already exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-documents',
  'booking-documents',
  false,
  15728640,  -- 15 MB
  ARRAY['application/pdf', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- 2) Verify bucket was created
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'booking-documents';

-- 3) Ensure the booking_document metadata column exists on bookings
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_document jsonb;

COMMENT ON COLUMN bookings.booking_document IS
  'Uploaded booking document metadata: file_name, content_type, storage_path, uploaded_at, uploaded_by, size_bytes';

-- 4) Drop existing policies (clean slate) then recreate
DROP POLICY IF EXISTS "Allow authenticated uploads to booking-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads from booking-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes from booking-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates in booking-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow service_role full access to booking-documents" ON storage.objects;

-- 5) Storage RLS policies — allow service_role full access (for backend API)
CREATE POLICY "Allow service_role full access to booking-documents"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'booking-documents');

-- 6) Allow authenticated users to upload
CREATE POLICY "Allow authenticated uploads to booking-documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'booking-documents');

-- 7) Allow authenticated users to read
CREATE POLICY "Allow authenticated reads from booking-documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'booking-documents');

-- 8) Allow authenticated users to delete
CREATE POLICY "Allow authenticated deletes from booking-documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'booking-documents');

-- 9) Allow authenticated users to update (upsert)
CREATE POLICY "Allow authenticated updates in booking-documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'booking-documents');
