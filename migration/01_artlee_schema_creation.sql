-- ============================================================================
-- ARTLEE CRM - Complete Schema Creation for New Database
-- ============================================================================
-- Purpose: Create all tables, indexes, RLS policies for ARTLEE CRM
-- Target Database: https://fslniuhyunzlfcbxsiol.supabase.co
-- Generated: 2025-10-09
-- ============================================================================

-- ============================================================================
-- STEP 1: CREATE USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_super_user BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  profile_status TEXT DEFAULT 'enabled',
  last_login TIMESTAMPTZ,
  tenant_id TEXT DEFAULT 'artlee' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for users
CREATE POLICY "Users can view all users" ON public.users
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile except role" ON public.users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id AND
    role = (SELECT role FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "Admins can update any user" ON public.users
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND (role = 'super_user' OR is_super_user = true)
    )
  );

CREATE POLICY "System can insert users" ON public.users
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can delete users" ON public.users
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND (role = 'super_user' OR is_super_user = true)
    )
  );

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON public.users(is_active);

-- Add comments for documentation
COMMENT ON TABLE public.users IS 'User accounts for ARTLEE CRM with tenant isolation';
COMMENT ON COLUMN public.users.tenant_id IS 'Tenant isolation: artlee = ARTLEE data (fixed value for this database)';
COMMENT ON COLUMN public.users.role IS 'User role: user or super_user';
COMMENT ON COLUMN public.users.avatar_url IS 'URL to user avatar stored in Supabase Storage';

-- ============================================================================
-- STEP 2: CREATE USER_SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  theme TEXT DEFAULT 'light',
  notifications JSONB DEFAULT '{"calls": true, "sms": true, "system": true}'::jsonb,
  session_timeout INTEGER DEFAULT 15,
  refresh_interval INTEGER DEFAULT 30000,
  retell_config JSONB,
  -- MFA Fields
  fresh_mfa_secret TEXT,
  fresh_mfa_enabled BOOLEAN DEFAULT false,
  fresh_mfa_setup_completed BOOLEAN DEFAULT false,
  fresh_mfa_backup_codes TEXT,
  -- API Credentials
  retell_api_key TEXT,
  call_agent_id TEXT,
  sms_agent_id TEXT,
  -- Tenant isolation
  tenant_id TEXT DEFAULT 'artlee' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on user_settings table
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_settings
CREATE POLICY "Users can view own settings" ON public.user_settings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own settings" ON public.user_settings
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own settings" ON public.user_settings
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "Admins can view all settings" ON public.user_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND (role = 'super_user' OR is_super_user = true)
    )
  );

-- Create indexes for user_settings table
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_tenant_id ON public.user_settings(tenant_id);

-- Add comments for documentation
COMMENT ON TABLE public.user_settings IS 'User preferences and settings for ARTLEE CRM';
COMMENT ON COLUMN public.user_settings.tenant_id IS 'Tenant isolation: artlee = ARTLEE data';
COMMENT ON COLUMN public.user_settings.retell_api_key IS 'Retell AI API key for user-specific integration';
COMMENT ON COLUMN public.user_settings.call_agent_id IS 'Retell AI Call Agent ID for voice call management';
COMMENT ON COLUMN public.user_settings.sms_agent_id IS 'Retell AI SMS Agent ID for SMS/chat management';
COMMENT ON COLUMN public.user_settings.fresh_mfa_secret IS 'TOTP secret for multi-factor authentication';
COMMENT ON COLUMN public.user_settings.fresh_mfa_backup_codes IS 'Encrypted backup codes for MFA recovery';

-- ============================================================================
-- STEP 3: CREATE USER_PROFILES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name TEXT,
  department TEXT,
  phone TEXT,
  bio TEXT,
  location TEXT,
  timezone TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  encrypted_retell_api_key TEXT,
  tenant_id TEXT DEFAULT 'artlee' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on user_profiles table
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for user_profiles
CREATE POLICY "Users can view own profile" ON public.user_profiles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.user_profiles
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Admins can view all profiles" ON public.user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND (role = 'super_user' OR is_super_user = true)
    )
  );

-- Create indexes for user_profiles table
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id ON public.user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_display_name ON public.user_profiles(display_name);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department ON public.user_profiles(department);
CREATE INDEX IF NOT EXISTS idx_user_profiles_tenant_id ON public.user_profiles(tenant_id);

-- Add comments for documentation
COMMENT ON TABLE public.user_profiles IS 'Extended user profile information for ARTLEE CRM';
COMMENT ON COLUMN public.user_profiles.tenant_id IS 'Tenant isolation: artlee = ARTLEE data';
COMMENT ON COLUMN public.user_profiles.display_name IS 'Display name for the user profile';
COMMENT ON COLUMN public.user_profiles.department IS 'User department or team';
COMMENT ON COLUMN public.user_profiles.preferences IS 'JSON object storing user preferences and settings';

-- ============================================================================
-- STEP 4: CREATE AUDIT_LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  phi_accessed BOOLEAN DEFAULT false,
  source_ip TEXT,
  user_agent TEXT,
  session_id TEXT,
  outcome TEXT NOT NULL,
  failure_reason TEXT,
  additional_info JSONB,
  tenant_id TEXT DEFAULT 'artlee' NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on audit_logs table
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for audit_logs
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
  FOR SELECT USING (user_id = auth.uid()::text);

CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id::text = auth.uid()::text
      AND users.role IN ('super_user', 'admin')
    )
  );

CREATE POLICY "System can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (true);

-- Create indexes for audit_logs table
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_outcome ON public.audit_logs(outcome);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);

-- Add comments for documentation
COMMENT ON TABLE public.audit_logs IS 'HIPAA-compliant audit trail for all user actions and system events';
COMMENT ON COLUMN public.audit_logs.tenant_id IS 'Tenant isolation: artlee = ARTLEE data';
COMMENT ON COLUMN public.audit_logs.user_name IS 'User name for login history (stored in plain text - not PHI)';
COMMENT ON COLUMN public.audit_logs.phi_accessed IS 'Boolean flag indicating if PHI was accessed during this action';
COMMENT ON COLUMN public.audit_logs.additional_info IS 'JSON field for storing additional audit context and metadata';
COMMENT ON COLUMN public.audit_logs.failure_reason IS 'Plain text reason for failed operations (not encrypted)';

-- ============================================================================
-- STEP 5: CREATE NOTES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT[],
  is_pinned BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  tenant_id TEXT DEFAULT 'artlee' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  synced_at TIMESTAMPTZ
);

-- Enable RLS on notes table
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for notes
CREATE POLICY "Users can view own notes" ON public.notes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own notes" ON public.notes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notes" ON public.notes
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own notes" ON public.notes
  FOR DELETE USING (user_id = auth.uid());

-- Create indexes for notes table
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON public.notes(created_at);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON public.notes(updated_at);
CREATE INDEX IF NOT EXISTS idx_notes_tenant_id ON public.notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notes_category ON public.notes(category);
CREATE INDEX IF NOT EXISTS idx_notes_tags ON public.notes USING GIN(tags);

-- Add comments for documentation
COMMENT ON TABLE public.notes IS 'Cross-device synchronized notes for ARTLEE CRM';
COMMENT ON COLUMN public.notes.tenant_id IS 'Tenant isolation: artlee = ARTLEE data';
COMMENT ON COLUMN public.notes.tags IS 'Array of tags for note categorization';
COMMENT ON COLUMN public.notes.synced_at IS 'Last synchronization timestamp for cross-device sync';

-- ============================================================================
-- STEP 6: CREATE SYSTEM_CREDENTIALS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.system_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  credential_type TEXT NOT NULL,
  api_key TEXT,
  call_agent_id TEXT,
  sms_agent_id TEXT,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB,
  tenant_id TEXT DEFAULT 'artlee' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, credential_type)
);

-- Enable RLS on system_credentials table
ALTER TABLE public.system_credentials ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for system_credentials
CREATE POLICY "Users can view own credentials" ON public.system_credentials
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own credentials" ON public.system_credentials
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own credentials" ON public.system_credentials
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own credentials" ON public.system_credentials
  FOR DELETE USING (user_id = auth.uid());

-- Create indexes for system_credentials table
CREATE INDEX IF NOT EXISTS idx_system_credentials_user_id ON public.system_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_system_credentials_tenant_id ON public.system_credentials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_credentials_credential_type ON public.system_credentials(credential_type);

-- Add comments for documentation
COMMENT ON TABLE public.system_credentials IS 'API credentials and system integration settings';
COMMENT ON COLUMN public.system_credentials.tenant_id IS 'Tenant isolation: artlee = ARTLEE data';

-- ============================================================================
-- STEP 7: CREATE COMPANY_SETTINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
  id TEXT PRIMARY KEY,
  data JSONB,
  tenant_id TEXT DEFAULT 'artlee' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable RLS on company_settings table
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for company_settings
CREATE POLICY "Anyone can view company settings" ON public.company_settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage company settings" ON public.company_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND (role = 'super_user' OR is_super_user = true)
    )
  );

-- Create indexes for company_settings table
CREATE INDEX IF NOT EXISTS idx_company_settings_id ON public.company_settings(id);
CREATE INDEX IF NOT EXISTS idx_company_settings_tenant_id ON public.company_settings(tenant_id);

-- Add comments for documentation
COMMENT ON TABLE public.company_settings IS 'Company-wide settings including logos and branding';
COMMENT ON COLUMN public.company_settings.tenant_id IS 'Tenant isolation: artlee = ARTLEE data';

-- ============================================================================
-- STEP 8: CREATE USER_MANAGEMENT_VIEW
-- ============================================================================

CREATE OR REPLACE VIEW user_management_view AS
SELECT
  u.*,
  us.fresh_mfa_enabled,
  us.fresh_mfa_setup_completed
FROM public.users u
LEFT JOIN public.user_settings us ON u.id = us.user_id;

-- Grant permissions on the view
GRANT SELECT ON user_management_view TO authenticated, anon, service_role;

-- Add comments for documentation
COMMENT ON VIEW user_management_view IS 'Combined view of users and their settings for profile management';

-- ============================================================================
-- STEP 9: GRANT PERMISSIONS
-- ============================================================================

-- Grant all permissions to authenticated, anon, and service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon, service_role;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated, anon, service_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Summary:
--   ✅ Created users table with tenant isolation
--   ✅ Created user_settings table with MFA and API credentials
--   ✅ Created user_profiles table for extended profile data
--   ✅ Created audit_logs table for HIPAA compliance
--   ✅ Created notes table for cross-device sync
--   ✅ Created system_credentials table for API keys
--   ✅ Created company_settings table for branding
--   ✅ Created user_management_view for simplified queries
--   ✅ Enabled RLS on all tables with comprehensive policies
--   ✅ Created indexes for performance optimization
--   ✅ Granted appropriate permissions
--
-- Next Step: Run data migration script to import ARTLEE data
-- ============================================================================
