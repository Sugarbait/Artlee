-- ============================================================================
-- ARTLEE CRM - Clear All Users and Related Data
-- ============================================================================
-- This script removes all users and their associated data
-- Database: https://fslniuhyunzlfcbxsiol.supabase.co
-- ⚠️ WARNING: This will delete ALL user data. Use with caution!
-- ============================================================================

-- Delete all data from user-related tables (in order to respect foreign keys)
DELETE FROM public.user_profiles;
DELETE FROM public.audit_logs;
DELETE FROM public.failed_login_attempts;
DELETE FROM public.notes;
DELETE FROM public.user_credentials;
DELETE FROM public.user_settings;
DELETE FROM public.users;

-- Verification: Check that all tables are empty
SELECT 'users' as table_name, COUNT(*) as remaining_records FROM public.users
UNION ALL
SELECT 'user_settings', COUNT(*) FROM public.user_settings
UNION ALL
SELECT 'user_profiles', COUNT(*) FROM public.user_profiles
UNION ALL
SELECT 'user_credentials', COUNT(*) FROM public.user_credentials
UNION ALL
SELECT 'notes', COUNT(*) FROM public.notes
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM public.audit_logs
UNION ALL
SELECT 'failed_login_attempts', COUNT(*) FROM public.failed_login_attempts;

-- ✅ All counts should be 0 for a fresh start!
