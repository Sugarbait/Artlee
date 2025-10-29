-- ============================================================================
-- ARTLEE CRM - Audit Logs Table Column Fix
-- ============================================================================
-- Adds missing columns to audit_logs table that ARTLEE application expects
-- Database: https://fslniuhyunzlfcbxsiol.supabase.co
-- ============================================================================

-- Add missing columns to audit_logs table
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_type TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_role TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS phi_accessed BOOLEAN DEFAULT false;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS source_ip TEXT;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON public.audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON public.audit_logs(resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_session_id ON public.audit_logs(session_id);

-- Add comments
COMMENT ON COLUMN public.audit_logs.resource_type IS 'Type of resource being accessed (e.g., USER, PATIENT, CALL)';
COMMENT ON COLUMN public.audit_logs.resource_id IS 'ID of the specific resource being accessed';
COMMENT ON COLUMN public.audit_logs.user_role IS 'Role of user performing the action';
COMMENT ON COLUMN public.audit_logs.session_id IS 'Session identifier for tracking user sessions';
COMMENT ON COLUMN public.audit_logs.phi_accessed IS 'HIPAA flag - indicates if PHI was accessed';
COMMENT ON COLUMN public.audit_logs.source_ip IS 'IP address of the client (duplicate of ip_address for compatibility)';
COMMENT ON COLUMN public.audit_logs.timestamp IS 'Timestamp of the audit event (duplicate of created_at for compatibility)';

-- ============================================================================
-- Fix failed_login_attempts table
-- ============================================================================
-- Add attempted_at column (application expects this instead of created_at)
ALTER TABLE public.failed_login_attempts ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ DEFAULT NOW();

-- Create index for attempted_at
CREATE INDEX IF NOT EXISTS idx_failed_login_attempted_at ON public.failed_login_attempts(attempted_at);

-- Add comment
COMMENT ON COLUMN public.failed_login_attempts.attempted_at IS 'Timestamp of failed login attempt (duplicate of created_at for compatibility)';

-- ============================================================================
-- Verification queries
-- ============================================================================

-- Check audit_logs columns
SELECT
  'audit_logs missing columns' as check_name,
  COUNT(*) as count,
  '7' as expected
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'audit_logs'
AND column_name IN ('resource_type', 'resource_id', 'user_role', 'session_id', 'phi_accessed', 'source_ip', 'timestamp')

UNION ALL

-- Check failed_login_attempts columns
SELECT
  'failed_login_attempts attempted_at column',
  COUNT(*),
  '1'
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'failed_login_attempts'
AND column_name = 'attempted_at';

-- ✅ If all counts match expected, schema fix successful!
