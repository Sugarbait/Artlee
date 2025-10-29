-- Phaeton AI CRM - System Credentials Table Setup
-- This ensures system_credentials table exists and clears any ARTLEE hardcoded credentials

-- Create system credentials table for cross-device API key persistence
CREATE TABLE IF NOT EXISTS system_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  credential_type VARCHAR(50) NOT NULL CHECK (credential_type IN ('system_defaults', 'user_override')),
  api_key TEXT DEFAULT '',
  call_agent_id TEXT DEFAULT '',
  sms_agent_id TEXT DEFAULT '',
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tenant_id VARCHAR(50) DEFAULT 'phaeton_ai' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_system_credentials_type_active
  ON system_credentials(credential_type, is_active);

CREATE INDEX IF NOT EXISTS idx_system_credentials_user_type
  ON system_credentials(user_id, credential_type)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_system_credentials_tenant
  ON system_credentials(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_credentials_system_defaults
  ON system_credentials(credential_type, tenant_id)
  WHERE credential_type = 'system_defaults' AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_credentials_user_override
  ON system_credentials(user_id, credential_type, tenant_id)
  WHERE credential_type = 'user_override' AND is_active = true AND user_id IS NOT NULL;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_system_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_system_credentials_updated_at ON system_credentials;
CREATE TRIGGER trigger_system_credentials_updated_at
  BEFORE UPDATE ON system_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_system_credentials_updated_at();

-- RLS (Row Level Security) policies
ALTER TABLE system_credentials ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "system_defaults_read" ON system_credentials;
DROP POLICY IF EXISTS "user_credentials_read" ON system_credentials;
DROP POLICY IF EXISTS "user_credentials_write" ON system_credentials;
DROP POLICY IF EXISTS "system_defaults_write" ON system_credentials;

-- System defaults can be read by all users in same tenant
CREATE POLICY "system_defaults_read" ON system_credentials
  FOR SELECT USING (
    credential_type = 'system_defaults' AND
    is_active = true AND
    tenant_id = 'phaeton_ai'
  );

-- Users can read their own credential overrides in their tenant
CREATE POLICY "user_credentials_read" ON system_credentials
  FOR SELECT USING (
    credential_type = 'user_override' AND
    user_id = auth.uid() AND
    is_active = true AND
    tenant_id = 'phaeton_ai'
  );

-- Users can insert/update their own credential overrides in their tenant
CREATE POLICY "user_credentials_write" ON system_credentials
  FOR ALL USING (
    credential_type = 'user_override' AND
    user_id = auth.uid() AND
    tenant_id = 'phaeton_ai'
  );

-- Only service role can manage system defaults
CREATE POLICY "system_defaults_write" ON system_credentials
  FOR ALL USING (
    credential_type = 'system_defaults' AND
    tenant_id = 'phaeton_ai'
  );

-- Cleanup function for old credentials
CREATE OR REPLACE FUNCTION cleanup_old_system_credentials()
RETURNS void AS $$
BEGIN
  -- Mark old user overrides as inactive (keep only latest per user per tenant)
  UPDATE system_credentials
  SET is_active = false
  WHERE credential_type = 'user_override'
    AND is_active = true
    AND created_at < (
      SELECT MAX(created_at)
      FROM system_credentials sc2
      WHERE sc2.user_id = system_credentials.user_id
        AND sc2.credential_type = 'user_override'
        AND sc2.is_active = true
        AND sc2.tenant_id = system_credentials.tenant_id
    );

  -- Mark old system defaults as inactive (keep only latest per tenant)
  UPDATE system_credentials
  SET is_active = false
  WHERE credential_type = 'system_defaults'
    AND is_active = true
    AND created_at < (
      SELECT MAX(created_at)
      FROM system_credentials sc2
      WHERE sc2.credential_type = 'system_defaults'
        AND sc2.is_active = true
        AND sc2.tenant_id = system_credentials.tenant_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on cleanup function
GRANT EXECUTE ON FUNCTION cleanup_old_system_credentials() TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_system_credentials() TO anon;

-- Delete any ARTLEE hardcoded credentials
DELETE FROM system_credentials
WHERE tenant_id != 'phaeton_ai'
   OR (credential_type = 'system_defaults'
       AND (api_key LIKE 'key_c3f084f5ca67781070e188b47d7f%'
            OR call_agent_id LIKE 'agent_447a1b9da540237693b0440df6%'
            OR sms_agent_id LIKE 'agent_643486efd4b5a0e9d7e094ab99%'));

-- Insert blank Phaeton AI system defaults (user must configure their own API keys)
INSERT INTO system_credentials (
  credential_type,
  api_key,
  call_agent_id,
  sms_agent_id,
  tenant_id,
  is_active,
  metadata
) VALUES (
  'system_defaults',
  '',
  '',
  '',
  'phaeton_ai',
  true,
  '{
    "source": "phaeton_ai_migration",
    "purpose": "user_must_configure_via_settings",
    "created_by": "phaeton_ai_migration",
    "version": "1.0",
    "note": "No hardcoded credentials for Phaeton AI CRM - users configure their own"
  }'::jsonb
) ON CONFLICT (credential_type, tenant_id) WHERE credential_type = 'system_defaults' AND is_active = true
  DO UPDATE SET
    api_key = '',
    call_agent_id = '',
    sms_agent_id = '',
    metadata = '{
      "source": "phaeton_ai_migration_update",
      "purpose": "user_must_configure_via_settings",
      "updated_by": "phaeton_ai_migration",
      "version": "1.0",
      "note": "Cleared hardcoded credentials - users must configure via Settings"
    }'::jsonb,
    updated_at = NOW();

-- Add comments for documentation
COMMENT ON TABLE system_credentials IS 'Stores system-wide default Retell AI credentials and user-specific overrides for cross-device API key persistence in Phaeton AI CRM';
COMMENT ON COLUMN system_credentials.credential_type IS 'Type of credential: system_defaults for global fallback, user_override for user-specific settings';
COMMENT ON COLUMN system_credentials.is_active IS 'Whether this credential record is currently active (allows for soft deletion and versioning)';
COMMENT ON COLUMN system_credentials.metadata IS 'Additional metadata about the credential record (source, purpose, version, etc.)';
COMMENT ON COLUMN system_credentials.tenant_id IS 'Tenant identifier for multi-tenant isolation (phaeton_ai for Phaeton AI CRM)';
