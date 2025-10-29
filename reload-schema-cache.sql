-- Reload PostgREST Schema Cache
-- This forces PostgREST to refresh its schema cache and recognize new columns
-- Run this in Supabase SQL Editor

-- Method 1: Send NOTIFY signal to PostgREST
NOTIFY pgrst, 'reload schema';

-- Method 2: Alternative - Reload config (if Method 1 doesn't work)
-- NOTIFY pgrst, 'reload config';

-- Verify the columns exist
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
    (table_name = 'user_profiles' AND column_name = 'encrypted_agent_config')
    OR (table_name = 'user_settings' AND column_name = 'api_key_updated_at')
  )
ORDER BY table_name, column_name;

-- Expected output:
-- user_profiles | encrypted_agent_config | jsonb | YES
-- user_settings | api_key_updated_at     | timestamp with time zone | YES
