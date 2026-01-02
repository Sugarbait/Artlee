-- Migration: Add MFA Admin Override Fields
-- Date: 2025-11-04
-- Description: Add fields to allow Super Users to disable MFA for other users
-- Authorization: Owner-approved modification to MFA system

-- Add new columns to user_settings table
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS mfa_disabled_by_admin BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS mfa_disabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS mfa_disabled_by_user_id TEXT,
ADD COLUMN IF NOT EXISTS mfa_disable_reason TEXT;

-- Add comments for documentation
COMMENT ON COLUMN user_settings.mfa_disabled_by_admin IS 'Whether MFA has been disabled by a Super User administrator';
COMMENT ON COLUMN user_settings.mfa_disabled_at IS 'Timestamp when MFA was disabled by admin';
COMMENT ON COLUMN user_settings.mfa_disabled_by_user_id IS 'User ID of the Super User who disabled MFA';
COMMENT ON COLUMN user_settings.mfa_disable_reason IS 'Reason provided for disabling MFA';

-- Create index for performance when checking MFA override status
CREATE INDEX IF NOT EXISTS idx_user_settings_mfa_disabled
ON user_settings(user_id, tenant_id, mfa_disabled_by_admin)
WHERE mfa_disabled_by_admin = TRUE;

-- Migration complete
-- This migration adds the necessary fields for Super Users to disable MFA for other users
-- while maintaining a full audit trail of who disabled it, when, and why.
