-- ============================================================================
-- ARTLEE CRM Quick Schema Fix
-- ============================================================================
-- Copy and paste this ENTIRE script into Supabase SQL Editor and click RUN
-- Database: https://fslniuhyunzlfcbxsiol.supabase.co
-- ============================================================================

-- Add MFA columns to user_settings
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS fresh_mfa_secret TEXT;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS fresh_mfa_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS fresh_mfa_setup_completed BOOLEAN DEFAULT false;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS fresh_mfa_backup_codes TEXT;

-- Add mfa_enabled to users (backwards compatibility)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false;

-- Verify phi_accessed in audit_logs
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS phi_accessed BOOLEAN DEFAULT false;

-- Create user_profiles table
DROP TABLE IF EXISTS public.user_profiles CASCADE;

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  department TEXT,
  phone TEXT,
  bio TEXT,
  location TEXT,
  timezone TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  encrypted_retell_api_key TEXT,
  tenant_id TEXT NOT NULL DEFAULT 'artlee',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Permissive RLS policies (ARTLEE pattern - application-level security)
CREATE POLICY "artlee_user_profiles_select" ON public.user_profiles FOR SELECT USING (true);
CREATE POLICY "artlee_user_profiles_insert" ON public.user_profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "artlee_user_profiles_update" ON public.user_profiles FOR UPDATE USING (true);
CREATE POLICY "artlee_user_profiles_delete" ON public.user_profiles FOR DELETE USING (true);

CREATE INDEX idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX idx_user_profiles_tenant_id ON public.user_profiles(tenant_id);

GRANT ALL ON public.user_profiles TO authenticated;
GRANT ALL ON public.user_profiles TO service_role;
GRANT ALL ON public.user_profiles TO anon;

-- Auto-create profiles for existing users
INSERT INTO public.user_profiles (user_id, display_name, department, tenant_id)
SELECT u.id, COALESCE(u.name, u.email), 'General', u.tenant_id
FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- Verification
SELECT
  'user_settings MFA columns' as check_name,
  COUNT(*) as count,
  '4' as expected
FROM information_schema.columns
WHERE table_name = 'user_settings'
AND column_name IN ('fresh_mfa_secret', 'fresh_mfa_enabled', 'fresh_mfa_setup_completed', 'fresh_mfa_backup_codes')

UNION ALL

SELECT
  'audit_logs phi_accessed column',
  COUNT(*),
  '1'
FROM information_schema.columns
WHERE table_name = 'audit_logs' AND column_name = 'phi_accessed'

UNION ALL

SELECT
  'user_profiles table',
  COUNT(*),
  '1'
FROM information_schema.tables
WHERE table_name = 'user_profiles';

-- ✅ If count = expected for all rows, schema fix successful!
