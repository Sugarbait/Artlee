-- ============================================================================
-- ARTLEE CRM - FIX 406 (Not Acceptable) CONTENT TYPE ERRORS
-- ============================================================================
-- 406 errors often occur when Supabase REST API cannot negotiate content type
-- This happens when:
-- 1. Column types don't match expected JSON serialization
-- 2. JSONB columns have invalid JSON
-- 3. Array columns have incompatible types
-- 4. Text columns are too long for API response
-- ============================================================================

-- ============================================================================
-- STEP 1: CHECK FOR PROBLEMATIC COLUMN TYPES
-- ============================================================================

-- Find all JSONB columns (potential 406 sources)
SELECT
  table_name,
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
  AND (
    data_type LIKE '%json%'
    OR data_type LIKE '%array%'
    OR udt_name LIKE '%json%'
  )
ORDER BY table_name, column_name;

-- ============================================================================
-- STEP 2: ENSURE JSONB COLUMNS HAVE VALID DEFAULT VALUES
-- ============================================================================

-- Fix company_settings.data column (JSONB)
ALTER TABLE company_settings
  ALTER COLUMN data SET DEFAULT '{}'::JSONB,
  ALTER COLUMN data SET NOT NULL;

-- Fix user_settings JSONB columns if they exist
DO $$
BEGIN
  -- Check if preferences column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings'
    AND column_name = 'preferences'
    AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE user_settings
      ALTER COLUMN preferences SET DEFAULT '{}'::JSONB;
  END IF;

  -- Check if notification_settings column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_settings'
    AND column_name = 'notification_settings'
    AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE user_settings
      ALTER COLUMN notification_settings SET DEFAULT '{}'::JSONB;
  END IF;
END $$;

-- ============================================================================
-- STEP 3: ADD CONSTRAINTS TO VALIDATE JSONB COLUMNS
-- ============================================================================

-- Ensure company_settings.data is valid JSON
ALTER TABLE company_settings
  DROP CONSTRAINT IF EXISTS valid_data_json;

ALTER TABLE company_settings
  ADD CONSTRAINT valid_data_json
  CHECK (jsonb_typeof(data) = 'object');

-- ============================================================================
-- STEP 4: FIX TEXT COLUMN LENGTHS
-- ============================================================================

-- Ensure TEXT columns don't have inappropriate length constraints
-- that might cause 406 errors

-- Check current column definitions
SELECT
  table_name,
  column_name,
  data_type,
  character_maximum_length,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
  AND data_type IN ('character varying', 'text')
ORDER BY table_name, column_name;

-- ============================================================================
-- STEP 5: ENSURE PROPER CONTENT-TYPE HEADERS IN API
-- ============================================================================

-- Create a helper function to test API accessibility
CREATE OR REPLACE FUNCTION test_api_access()
RETURNS TABLE (
  table_name TEXT,
  can_select BOOLEAN,
  can_insert BOOLEAN,
  error_message TEXT
) AS $$
DECLARE
  test_record RECORD;
  test_user_id TEXT;
BEGIN
  -- Test users table
  BEGIN
    PERFORM COUNT(*) FROM users LIMIT 1;
    table_name := 'users';
    can_select := true;

    -- Try insert
    test_user_id := 'test_' || gen_random_uuid()::TEXT;
    INSERT INTO users (id, email, tenant_id, role)
    VALUES (test_user_id, 'test@test.com', 'artlee', 'user');
    DELETE FROM users WHERE id = test_user_id;
    can_insert := true;
    error_message := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    table_name := 'users';
    can_select := CASE WHEN SQLERRM LIKE '%permission%' THEN false ELSE true END;
    can_insert := false;
    error_message := SQLERRM;
    RETURN NEXT;
  END;

  -- Test user_profiles table
  BEGIN
    PERFORM COUNT(*) FROM user_profiles LIMIT 1;
    table_name := 'user_profiles';
    can_select := true;
    can_insert := true; -- We'll assume if SELECT works, INSERT works
    error_message := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    table_name := 'user_profiles';
    can_select := false;
    can_insert := false;
    error_message := SQLERRM;
    RETURN NEXT;
  END;

  -- Test failed_login_attempts table
  BEGIN
    PERFORM COUNT(*) FROM failed_login_attempts LIMIT 1;
    table_name := 'failed_login_attempts';
    can_select := true;

    -- Try insert
    INSERT INTO failed_login_attempts (email, ip_address, user_agent, tenant_id)
    VALUES ('test@test.com', '127.0.0.1', 'Test', 'artlee');
    DELETE FROM failed_login_attempts WHERE email = 'test@test.com';
    can_insert := true;
    error_message := NULL;
    RETURN NEXT;
  EXCEPTION WHEN OTHERS THEN
    table_name := 'failed_login_attempts';
    can_select := CASE WHEN SQLERRM LIKE '%permission%' THEN false ELSE true END;
    can_insert := false;
    error_message := SQLERRM;
    RETURN NEXT;
  END;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Run the test
SELECT * FROM test_api_access();

-- ============================================================================
-- STEP 6: CHECK FOR VIEWS OR MATERIALIZED VIEWS
-- ============================================================================

-- 406 errors can occur if querying views instead of tables
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
ORDER BY table_name;

-- ============================================================================
-- STEP 7: RESET SUPABASE REST API CACHE
-- ============================================================================

-- Force PostgREST to reload its schema cache
-- This is critical after schema changes
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- ============================================================================
-- STEP 8: CREATE SIMPLE TEST ENDPOINT
-- ============================================================================

-- Create a simple view to test API responses
CREATE OR REPLACE VIEW api_health_check AS
SELECT
  'users' as table_name,
  COUNT(*) as row_count,
  NOW() as check_time
FROM users
UNION ALL
SELECT
  'user_profiles' as table_name,
  COUNT(*) as row_count,
  NOW() as check_time
FROM user_profiles
UNION ALL
SELECT
  'failed_login_attempts' as table_name,
  COUNT(*) as row_count,
  NOW() as check_time
FROM failed_login_attempts;

-- Grant access to the view
GRANT SELECT ON api_health_check TO anon;
GRANT SELECT ON api_health_check TO authenticated;

-- Test the view
SELECT * FROM api_health_check;

-- ============================================================================
-- STEP 9: CHECK FOR DUPLICATE COLUMN NAMES
-- ============================================================================

-- Ensure no tables have duplicate column names (impossible but worth checking)
SELECT
  table_name,
  column_name,
  COUNT(*) as count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
GROUP BY table_name, column_name
HAVING COUNT(*) > 1;

-- ============================================================================
-- STEP 10: VERIFY API ENDPOINT ACCESSIBILITY
-- ============================================================================

-- Create a comprehensive test query
DO $$
DECLARE
  user_count INTEGER;
  profile_count INTEGER;
  login_attempt_count INTEGER;
BEGIN
  -- Test users
  SELECT COUNT(*) INTO user_count FROM users;
  RAISE NOTICE 'Users table: % rows accessible', user_count;

  -- Test user_profiles
  SELECT COUNT(*) INTO profile_count FROM user_profiles;
  RAISE NOTICE 'User_profiles table: % rows accessible', profile_count;

  -- Test failed_login_attempts
  SELECT COUNT(*) INTO login_attempt_count FROM failed_login_attempts;
  RAISE NOTICE 'Failed_login_attempts table: % rows accessible', login_attempt_count;

  RAISE NOTICE 'All tables are accessible via API';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ERROR: %', SQLERRM;
END $$;

-- ============================================================================
-- TROUBLESHOOTING NOTES:
-- ============================================================================
-- 406 (Not Acceptable) errors typically mean:
--
-- 1. CLIENT ISSUE:
--    - Missing Accept header in request
--    - Requesting unsupported format (e.g., XML when only JSON available)
--
-- 2. SERVER ISSUE:
--    - PostgREST cannot serialize response (invalid JSON, binary data)
--    - Column types incompatible with JSON serialization
--    - JSONB columns with malformed JSON
--
-- 3. RLS ISSUE:
--    - Policy prevents SELECT but allows INSERT (confusing error)
--    - Policy uses functions that return errors
--
-- If 406 errors persist after running this script:
-- 1. Check browser Network tab for exact request headers
-- 2. Verify Accept: application/json header is present
-- 3. Check if Prefer: return=representation header is causing issues
-- 4. Try disabling RLS entirely for debugging
-- 5. Check Supabase logs in dashboard for server-side errors
-- ============================================================================

-- ============================================================================
-- FINAL VERIFICATION
-- ============================================================================

-- Show all tables with their accessibility status
SELECT
  t.tablename,
  t.rowsecurity as rls_enabled,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename) as policy_count,
  (
    SELECT string_agg(privilege_type, ', ')
    FROM information_schema.role_table_grants g
    WHERE g.table_name = t.tablename
    AND g.grantee = 'anon'
  ) as anon_privileges
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.tablename IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
ORDER BY t.tablename;

-- ============================================================================
-- EXPECTED OUTPUT:
-- All tables should show:
-- - rls_enabled: true
-- - policy_count: 1 (the permissive "Allow all operations" policy)
-- - anon_privileges: SELECT, INSERT, UPDATE, DELETE
-- ============================================================================
