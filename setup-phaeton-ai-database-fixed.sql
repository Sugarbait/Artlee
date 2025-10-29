-- Phaeton AI CRM Database Schema Setup (FIXED)
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. CREATE USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    department TEXT,
    phone TEXT,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP WITH TIME ZONE,
    tenant_id TEXT NOT NULL DEFAULT 'phaeton_ai',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add index for tenant filtering
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- ============================================
-- 2. CREATE USER_CREDENTIALS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON public.user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_email ON public.user_credentials(email);

-- ============================================
-- 3. CREATE AUDIT_LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT,
    user_name TEXT,
    user_role TEXT,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    phi_accessed BOOLEAN DEFAULT FALSE,
    source_ip TEXT,
    user_agent TEXT,
    session_id TEXT,
    outcome TEXT,
    failure_reason TEXT,
    additional_info TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tenant_id TEXT NOT NULL DEFAULT 'phaeton_ai'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp);

-- ============================================
-- 4. CREATE USER_SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,
    tenant_id TEXT NOT NULL DEFAULT 'phaeton_ai',
    data JSONB DEFAULT '{}'::jsonb,
    fresh_mfa_secret TEXT,
    fresh_mfa_enabled BOOLEAN DEFAULT FALSE,
    fresh_mfa_setup_completed BOOLEAN DEFAULT FALSE,
    fresh_mfa_backup_codes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON public.user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_tenant_id ON public.user_settings(tenant_id);

-- ============================================
-- 5. CREATE NOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    title TEXT,
    content TEXT,
    tenant_id TEXT NOT NULL DEFAULT 'phaeton_ai',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_tenant_id ON public.notes(tenant_id);

-- ============================================
-- 6. CREATE COMPANY_SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_company_settings_tenant_id ON public.company_settings(tenant_id);

-- ============================================
-- 7. CREATE FAILED_LOGIN_ATTEMPTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    attempt_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address TEXT,
    tenant_id TEXT NOT NULL DEFAULT 'phaeton_ai'
);

CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_email ON public.failed_login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_failed_login_attempts_tenant_id ON public.failed_login_attempts(tenant_id);

-- ============================================
-- 8. INSERT PIERRE USER INTO USERS TABLE
-- ============================================
INSERT INTO public.users (
    id,
    email,
    name,
    role,
    department,
    phone,
    mfa_enabled,
    is_active,
    tenant_id,
    created_at
)
VALUES (
    'ee8f5c7a-06da-45d0-910b-12bc35ae70db'::UUID,
    'pierre@phaetonai.com',
    'Pierre Morenzie',
    'super_user',
    'AI',
    '4165299916',
    FALSE,
    TRUE,
    'phaeton_ai',
    NOW()
)
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    department = EXCLUDED.department,
    phone = EXCLUDED.phone,
    is_active = EXCLUDED.is_active,
    tenant_id = EXCLUDED.tenant_id;

-- ============================================
-- 9. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 10. CREATE RLS POLICIES (DROP EXISTING FIRST)
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users are isolated by tenant" ON public.users;
DROP POLICY IF EXISTS "Audit logs are isolated by tenant" ON public.audit_logs;
DROP POLICY IF EXISTS "User settings are isolated by tenant" ON public.user_settings;
DROP POLICY IF EXISTS "Notes are isolated by tenant" ON public.notes;
DROP POLICY IF EXISTS "Company settings are isolated by tenant" ON public.company_settings;

-- Create new policies
CREATE POLICY "Users are isolated by tenant"
    ON public.users
    FOR ALL
    USING (tenant_id = 'phaeton_ai');

CREATE POLICY "Audit logs are isolated by tenant"
    ON public.audit_logs
    FOR ALL
    USING (tenant_id = 'phaeton_ai');

CREATE POLICY "User settings are isolated by tenant"
    ON public.user_settings
    FOR ALL
    USING (tenant_id = 'phaeton_ai');

CREATE POLICY "Notes are isolated by tenant"
    ON public.notes
    FOR ALL
    USING (tenant_id = 'phaeton_ai');

CREATE POLICY "Company settings are isolated by tenant"
    ON public.company_settings
    FOR ALL
    USING (tenant_id = 'phaeton_ai');

-- ============================================
-- 11. GRANT PERMISSIONS
-- ============================================
GRANT ALL ON public.users TO anon, authenticated, service_role;
GRANT ALL ON public.user_credentials TO anon, authenticated, service_role;
GRANT ALL ON public.audit_logs TO anon, authenticated, service_role;
GRANT ALL ON public.user_settings TO anon, authenticated, service_role;
GRANT ALL ON public.notes TO anon, authenticated, service_role;
GRANT ALL ON public.company_settings TO anon, authenticated, service_role;
GRANT ALL ON public.failed_login_attempts TO anon, authenticated, service_role;
