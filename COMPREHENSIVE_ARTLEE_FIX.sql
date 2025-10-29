-- ============================================================================
-- COMPREHENSIVE ARTLEE DATABASE FIX
-- ============================================================================
-- Based on working MedEx schema, adapted for ARTLEE
-- Database: https://fslniuhyunzlfcbxsiol.supabase.co
-- ============================================================================

-- ============================================================================
-- 1. CREATE MISSING company_settings TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.company_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    value TEXT,
    data JSONB DEFAULT '{}'::jsonb,
    category TEXT DEFAULT 'general',
    description TEXT,
    is_encrypted BOOLEAN DEFAULT false,
    tenant_id TEXT DEFAULT 'artlee' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, tenant_id)
);

ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT 'artlee' NOT NULL;

-- Enable RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Create permissive policies
DROP POLICY IF EXISTS "artlee_company_settings_select" ON public.company_settings;
CREATE POLICY "artlee_company_settings_select" ON public.company_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "artlee_company_settings_insert" ON public.company_settings;
CREATE POLICY "artlee_company_settings_insert" ON public.company_settings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "artlee_company_settings_update" ON public.company_settings;
CREATE POLICY "artlee_company_settings_update" ON public.company_settings FOR UPDATE USING (true);

DROP POLICY IF EXISTS "artlee_company_settings_delete" ON public.company_settings;
CREATE POLICY "artlee_company_settings_delete" ON public.company_settings FOR DELETE USING (true);

-- Grant permissions
GRANT ALL ON public.company_settings TO authenticated, service_role, anon;

-- Create index
CREATE INDEX IF NOT EXISTS idx_company_settings_tenant_id ON public.company_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_company_settings_data ON public.company_settings USING GIN (data);

-- ============================================================================
-- 2. FIX NOTES TABLE STRUCTURE
-- ============================================================================

-- Drop and recreate notes table with correct MedEx-style structure
DROP TABLE IF EXISTS public.notes CASCADE;

CREATE TABLE public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT,
    tags TEXT[],
    is_pinned BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    tenant_id TEXT DEFAULT 'artlee' NOT NULL
);

-- Enable RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- Create permissive policies
DROP POLICY IF EXISTS "artlee_notes_select" ON public.notes;
CREATE POLICY "artlee_notes_select" ON public.notes FOR SELECT USING (true);

DROP POLICY IF EXISTS "artlee_notes_insert" ON public.notes;
CREATE POLICY "artlee_notes_insert" ON public.notes FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "artlee_notes_update" ON public.notes;
CREATE POLICY "artlee_notes_update" ON public.notes FOR UPDATE USING (true);

DROP POLICY IF EXISTS "artlee_notes_delete" ON public.notes;
CREATE POLICY "artlee_notes_delete" ON public.notes FOR DELETE USING (true);

-- Grant permissions
GRANT ALL ON public.notes TO authenticated, service_role, anon;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON public.notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_tenant_id ON public.notes(tenant_id);

-- ============================================================================
-- 3. INSERT INITIAL COMPANY SETTINGS
-- ============================================================================

INSERT INTO public.company_settings (name, value, data, category, description, tenant_id)
VALUES
    ('app_name', 'ARTLEE Business CRM', '{"version": "1.0.0", "environment": "production"}', 'general', 'Application name and metadata', 'artlee'),
    ('mfa_required', 'false', '{"grace_period_days": 30, "enforcement_level": "optional"}', 'security', 'MFA enforcement settings', 'artlee'),
    ('session_timeout', '900', '{"warning_seconds": 60, "extend_on_activity": true}', 'security', 'Session timeout in seconds', 'artlee'),
    ('audit_retention_days', '2555', '{"auto_cleanup": true, "compression": "gzip"}', 'compliance', 'Audit log retention period (7 years for HIPAA)', 'artlee')
ON CONFLICT (name, tenant_id) DO UPDATE SET
    value = EXCLUDED.value,
    data = EXCLUDED.data,
    updated_at = NOW();

-- ============================================================================
-- 4. VERIFICATION
-- ============================================================================

-- Verify company_settings table
SELECT
    'company_settings table' as check_name,
    COUNT(*) as count,
    '1' as expected
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'company_settings'

UNION ALL

-- Verify company_settings.data column
SELECT
    'company_settings.data column',
    COUNT(*),
    '1'
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'company_settings'
AND column_name = 'data'

UNION ALL

-- Verify notes table
SELECT
    'notes table',
    COUNT(*),
    '1'
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name = 'notes'

UNION ALL

-- Verify notes has tenant_id
SELECT
    'notes.tenant_id column',
    COUNT(*),
    '1'
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'notes'
AND column_name = 'tenant_id';

-- ✅ All counts should equal expected values!
