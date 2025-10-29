-- ============================================================================
-- ARTLEE CRM - COMPREHENSIVE DATABASE DIAGNOSTICS
-- ============================================================================
-- Run these queries in Supabase SQL Editor to diagnose issues
-- Copy each section separately and check results
-- ============================================================================

-- ============================================================================
-- SECTION 1: VERIFY ALL TABLES EXIST
-- ============================================================================
-- This should show all ARTLEE tables with their row counts

SELECT
  schemaname,
  tablename,
  (SELECT COUNT(*) FROM pg_class WHERE relname = tablename) as exists,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = tablename) as column_count
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
ORDER BY tablename;

-- ============================================================================
-- SECTION 2: CHECK COLUMN DEFINITIONS FOR CRITICAL TABLES
-- ============================================================================

-- Check users table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- Check user_profiles table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_profiles'
ORDER BY ordinal_position;

-- Check failed_login_attempts table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'failed_login_attempts'
ORDER BY ordinal_position;

-- Check audit_logs table structure
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'audit_logs'
ORDER BY ordinal_position;

-- ============================================================================
-- SECTION 3: CHECK RLS POLICIES
-- ============================================================================

-- List all RLS policies and their definitions
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
ORDER BY tablename, policyname;

-- Check which tables have RLS enabled
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
ORDER BY tablename;

-- ============================================================================
-- SECTION 4: CHECK GRANTS AND PERMISSIONS
-- ============================================================================

-- Check table permissions for anon and authenticated roles
SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type
FROM information_schema.role_table_grants
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
  AND grantee IN ('anon', 'authenticated', 'postgres', 'public')
ORDER BY table_name, grantee, privilege_type;

-- ============================================================================
-- SECTION 5: CHECK FOR FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- List all foreign key constraints that might cause issues
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  tc.constraint_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
ORDER BY tc.table_name, kcu.column_name;

-- ============================================================================
-- SECTION 6: CHECK FOR TRIGGERS
-- ============================================================================

-- List all triggers on ARTLEE tables
SELECT
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
ORDER BY event_object_table, trigger_name;

-- ============================================================================
-- SECTION 7: TEST INSERT PERMISSIONS
-- ============================================================================

-- Test if anon role can insert into failed_login_attempts
-- This will show the ACTUAL error if insert fails
DO $$
BEGIN
  -- Try to insert as anon role would
  BEGIN
    INSERT INTO failed_login_attempts (
      email,
      ip_address,
      user_agent,
      attempted_at,
      tenant_id
    ) VALUES (
      'test@test.com',
      '127.0.0.1',
      'Test User Agent',
      NOW(),
      'artlee'
    );

    -- If successful, delete the test record
    DELETE FROM failed_login_attempts WHERE email = 'test@test.com';
    RAISE NOTICE 'SUCCESS: Can insert into failed_login_attempts';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'ERROR inserting into failed_login_attempts: %', SQLERRM;
  END;
END $$;

-- ============================================================================
-- SECTION 8: CHECK FOR MISSING COLUMNS
-- ============================================================================

-- Verify failed_login_attempts has attempted_at column
SELECT
  CASE
    WHEN COUNT(*) > 0 THEN 'attempted_at column EXISTS'
    ELSE 'attempted_at column MISSING'
  END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'failed_login_attempts'
  AND column_name = 'attempted_at';

-- Verify audit_logs has all required columns
SELECT
  column_name,
  data_type,
  CASE WHEN column_name IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as status
FROM (
  SELECT unnest(ARRAY[
    'id', 'user_id', 'user_name', 'action', 'resource_type',
    'resource_id', 'outcome', 'failure_reason', 'ip_address',
    'user_agent', 'additional_info', 'timestamp', 'tenant_id'
  ]) as required_column
) required
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
  AND c.table_name = 'audit_logs'
  AND c.column_name = required.required_column;

-- ============================================================================
-- SECTION 9: CHECK CURRENT DATA
-- ============================================================================

-- Check if there are any users in the database
SELECT COUNT(*) as user_count FROM users;

-- Check if there are any user_profiles
SELECT COUNT(*) as profile_count FROM user_profiles;

-- Check if there are any user_settings
SELECT COUNT(*) as settings_count FROM user_settings;

-- Check if there are any failed login attempts
SELECT COUNT(*) as failed_login_count FROM failed_login_attempts;

-- ============================================================================
-- SECTION 10: CHECK SUPABASE REALTIME
-- ============================================================================

-- Check if realtime is enabled on tables
SELECT
  schemaname,
  tablename,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE schemaname = 'public'
      AND tablename = pt.tablename
    ) THEN 'ENABLED'
    ELSE 'DISABLED'
  END as realtime_status
FROM pg_tables pt
WHERE schemaname = 'public'
  AND tablename IN (
    'users',
    'user_settings',
    'user_profiles',
    'audit_logs',
    'notes',
    'failed_login_attempts',
    'user_credentials',
    'company_settings'
  )
ORDER BY tablename;

-- ============================================================================
-- EXPECTED RESULTS:
-- ============================================================================
-- Section 1: Should show 8 tables, all with exists=1
-- Section 2: Should show proper column definitions with TEXT user_id (not UUID)
-- Section 3: Should show permissive RLS policies with USING (true)
-- Section 4: Should show SELECT, INSERT, UPDATE, DELETE for anon and authenticated
-- Section 5: Should show minimal foreign keys (or none if TEXT user_id)
-- Section 6: Should show triggers if any exist
-- Section 7: Should show "SUCCESS: Can insert into failed_login_attempts"
-- Section 8: Should show all required columns as "EXISTS"
-- Section 9: Should show 0 for all counts (empty database)
-- Section 10: Should show ENABLED for tables with realtime subscriptions
-- ============================================================================
