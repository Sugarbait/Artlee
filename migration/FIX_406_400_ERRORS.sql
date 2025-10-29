-- ============================================================================
-- ARTLEE CRM - FIX 406/400 ERRORS
-- ============================================================================
-- This script fixes common causes of 406 (Not Acceptable) and 400 (Bad Request)
-- errors in Supabase database operations
-- ============================================================================

-- ============================================================================
-- STEP 1: DISABLE RLS ON ALL TABLES (TEMPORARILY)
-- ============================================================================
-- This helps identify if RLS policies are causing 406 errors

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE failed_login_attempts DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials DISABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 2: DROP ALL EXISTING RLS POLICIES
-- ============================================================================
-- Remove potentially problematic policies

-- Drop users policies
DROP POLICY IF EXISTS "Users are viewable by authenticated users" ON users;
DROP POLICY IF EXISTS "Users can insert their own record" ON users;
DROP POLICY IF EXISTS "Users can update their own record" ON users;
DROP POLICY IF EXISTS "Allow all access to users" ON users;
DROP POLICY IF EXISTS "Enable read access for all users" ON users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON users;
DROP POLICY IF EXISTS "Enable update for users based on id" ON users;

-- Drop user_settings policies
DROP POLICY IF EXISTS "Users can view their own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert their own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update their own settings" ON user_settings;
DROP POLICY IF EXISTS "Allow all access to user_settings" ON user_settings;

-- Drop user_profiles policies
DROP POLICY IF EXISTS "Users can view their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON user_profiles;
DROP POLICY IF EXISTS "Allow all access to user_profiles" ON user_profiles;

-- Drop audit_logs policies
DROP POLICY IF EXISTS "Audit logs are viewable by all" ON audit_logs;
DROP POLICY IF EXISTS "Audit logs can be inserted by all" ON audit_logs;
DROP POLICY IF EXISTS "Allow all access to audit_logs" ON audit_logs;

-- Drop notes policies
DROP POLICY IF EXISTS "Users can view their own notes" ON notes;
DROP POLICY IF EXISTS "Users can insert their own notes" ON notes;
DROP POLICY IF EXISTS "Users can update their own notes" ON notes;
DROP POLICY IF EXISTS "Users can delete their own notes" ON notes;
DROP POLICY IF EXISTS "Allow all access to notes" ON notes;

-- Drop failed_login_attempts policies
DROP POLICY IF EXISTS "Failed login attempts are viewable by all" ON failed_login_attempts;
DROP POLICY IF EXISTS "Failed login attempts can be inserted by all" ON failed_login_attempts;
DROP POLICY IF EXISTS "Allow all access to failed_login_attempts" ON failed_login_attempts;

-- Drop user_credentials policies
DROP POLICY IF EXISTS "Users can view their own credentials" ON user_credentials;
DROP POLICY IF EXISTS "Users can insert their own credentials" ON user_credentials;
DROP POLICY IF EXISTS "Users can update their own credentials" ON user_credentials;
DROP POLICY IF EXISTS "Allow all access to user_credentials" ON user_credentials;

-- Drop company_settings policies
DROP POLICY IF EXISTS "Company settings are viewable by all" ON company_settings;
DROP POLICY IF EXISTS "Company settings can be updated by all" ON company_settings;
DROP POLICY IF EXISTS "Allow all access to company_settings" ON company_settings;

-- ============================================================================
-- STEP 3: GRANT FULL PERMISSIONS TO ANON AND AUTHENTICATED ROLES
-- ============================================================================
-- Ensure both roles have all necessary permissions

-- Grant on users
GRANT ALL ON users TO anon;
GRANT ALL ON users TO authenticated;
GRANT ALL ON users TO postgres;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO authenticated;

-- Grant on user_settings
GRANT ALL ON user_settings TO anon;
GRANT ALL ON user_settings TO authenticated;
GRANT ALL ON user_settings TO postgres;

-- Grant on user_profiles
GRANT ALL ON user_profiles TO anon;
GRANT ALL ON user_profiles TO authenticated;
GRANT ALL ON user_profiles TO postgres;

-- Grant on audit_logs
GRANT ALL ON audit_logs TO anon;
GRANT ALL ON audit_logs TO authenticated;
GRANT ALL ON audit_logs TO postgres;
GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE audit_logs_id_seq TO authenticated;

-- Grant on notes
GRANT ALL ON notes TO anon;
GRANT ALL ON notes TO authenticated;
GRANT ALL ON notes TO postgres;

-- Grant on failed_login_attempts
GRANT ALL ON failed_login_attempts TO anon;
GRANT ALL ON failed_login_attempts TO authenticated;
GRANT ALL ON failed_login_attempts TO postgres;
GRANT USAGE, SELECT ON SEQUENCE failed_login_attempts_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE failed_login_attempts_id_seq TO authenticated;

-- Grant on user_credentials
GRANT ALL ON user_credentials TO anon;
GRANT ALL ON user_credentials TO authenticated;
GRANT ALL ON user_credentials TO postgres;

-- Grant on company_settings
GRANT ALL ON company_settings TO anon;
GRANT ALL ON company_settings TO authenticated;
GRANT ALL ON company_settings TO postgres;

-- ============================================================================
-- STEP 4: CREATE SIMPLE PERMISSIVE RLS POLICIES
-- ============================================================================
-- Re-enable RLS with ultra-permissive policies for testing

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for users
CREATE POLICY "Allow all operations on users" ON users
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create permissive policies for user_settings
CREATE POLICY "Allow all operations on user_settings" ON user_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create permissive policies for user_profiles
CREATE POLICY "Allow all operations on user_profiles" ON user_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create permissive policies for audit_logs
CREATE POLICY "Allow all operations on audit_logs" ON audit_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create permissive policies for notes
CREATE POLICY "Allow all operations on notes" ON notes
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create permissive policies for failed_login_attempts
CREATE POLICY "Allow all operations on failed_login_attempts" ON failed_login_attempts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create permissive policies for user_credentials
CREATE POLICY "Allow all operations on user_credentials" ON user_credentials
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create permissive policies for company_settings
CREATE POLICY "Allow all operations on company_settings" ON company_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- STEP 5: VERIFY COLUMN DEFAULTS AND CONSTRAINTS
-- ============================================================================

-- Ensure failed_login_attempts has proper defaults
ALTER TABLE failed_login_attempts
  ALTER COLUMN attempted_at SET DEFAULT NOW();

-- Ensure audit_logs has proper defaults
ALTER TABLE audit_logs
  ALTER COLUMN timestamp SET DEFAULT NOW();

-- Ensure users has proper defaults
ALTER TABLE users
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN role SET DEFAULT 'user',
  ALTER COLUMN tenant_id SET DEFAULT 'artlee';

-- ============================================================================
-- STEP 6: ADD MISSING INDEXES FOR PERFORMANCE
-- ============================================================================

-- Index on users for common queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email_tenant ON users(email, tenant_id);

-- Index on user_profiles
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_id ON user_profiles(tenant_id);

-- Index on user_settings
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_tenant_id ON user_settings(tenant_id);

-- Index on audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

-- Index on failed_login_attempts
CREATE INDEX IF NOT EXISTS idx_failed_login_email ON failed_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_failed_login_tenant_id ON failed_login_attempts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempted_at ON failed_login_attempts(attempted_at);

-- ============================================================================
-- STEP 7: REFRESH SCHEMA CACHE
-- ============================================================================

-- Force PostgreSQL to reload schema information
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- STEP 8: TEST BASIC OPERATIONS
-- ============================================================================

-- Test SELECT on users (should return 0 rows but no error)
DO $$
DECLARE
  test_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO test_count FROM users;
  RAISE NOTICE 'Users table accessible: % rows', test_count;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ERROR accessing users table: %', SQLERRM;
END $$;

-- Test INSERT into failed_login_attempts
DO $$
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
  DELETE FROM failed_login_attempts WHERE email = 'test@test.com';
  RAISE NOTICE 'failed_login_attempts table is writable';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ERROR writing to failed_login_attempts: %', SQLERRM;
END $$;

-- Test INSERT into users
DO $$
DECLARE
  test_user_id TEXT;
BEGIN
  test_user_id := 'test_' || gen_random_uuid()::TEXT;

  INSERT INTO users (
    id,
    email,
    name,
    tenant_id,
    role,
    is_active
  ) VALUES (
    test_user_id,
    'test@test.com',
    'Test User',
    'artlee',
    'user',
    true
  );

  DELETE FROM users WHERE id = test_user_id;
  RAISE NOTICE 'users table is writable';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'ERROR writing to users: %', SQLERRM;
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Show final RLS status
SELECT
  tablename,
  rowsecurity as rls_enabled
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

-- Show final permissions
SELECT
  grantee,
  table_name,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) as privileges
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
  AND grantee IN ('anon', 'authenticated')
GROUP BY grantee, table_name
ORDER BY table_name, grantee;

-- ============================================================================
-- NEXT STEPS:
-- ============================================================================
-- 1. Run this script in Supabase SQL Editor
-- 2. Check all NOTICE messages for any errors
-- 3. If all tests pass, try the ARTLEE application login
-- 4. If login still fails, check browser console for specific error messages
-- 5. Run DIAGNOSTIC_QUERIES.sql to get detailed schema information
-- ============================================================================
