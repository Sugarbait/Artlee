-- ARTLEE CRM - Drop Old Incorrect Schema
-- Run this FIRST to clean up the incorrect schema before running artlee-setup-new-database.sql

-- Drop all existing policies first
DROP POLICY IF EXISTS "Users can view all users" ON users;
DROP POLICY IF EXISTS "Users can update own profile except role" ON users;
DROP POLICY IF EXISTS "Admins can update any user" ON users;
DROP POLICY IF EXISTS "System can insert users" ON users;
DROP POLICY IF EXISTS "Admins can delete users" ON users;
DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
DROP POLICY IF EXISTS "Users can delete own settings" ON user_settings;
DROP POLICY IF EXISTS "Admins can view all settings" ON user_settings;
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Admins can view all audit logs" ON audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Users can view own notes" ON notes;
DROP POLICY IF EXISTS "Users can insert own notes" ON notes;
DROP POLICY IF EXISTS "Users can update own notes" ON notes;
DROP POLICY IF EXISTS "Users can delete own notes" ON notes;
DROP POLICY IF EXISTS "Users can view own credentials" ON system_credentials;
DROP POLICY IF EXISTS "Users can insert own credentials" ON system_credentials;
DROP POLICY IF EXISTS "Users can update own credentials" ON system_credentials;
DROP POLICY IF EXISTS "Users can delete own credentials" ON system_credentials;
DROP POLICY IF EXISTS "Anyone can view company settings" ON company_settings;
DROP POLICY IF EXISTS "Admins can manage company settings" ON company_settings;

-- Drop views
DROP VIEW IF EXISTS user_management_view;

-- Drop tables in correct order (respect foreign keys)
DROP TABLE IF EXISTS company_settings CASCADE;
DROP TABLE IF EXISTS system_credentials CASCADE;
DROP TABLE IF EXISTS notes CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS user_settings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS failed_login_attempts CASCADE;
DROP TABLE IF EXISTS user_credentials CASCADE;

-- ✅ Old schema dropped successfully
-- Now run: artlee-setup-new-database.sql
