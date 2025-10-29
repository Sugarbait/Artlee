/**
 * Retell AI API Credentials Configuration
 *
 * For Phaeton AI CRM, no credentials are hardcoded.
 * Users must configure their own API keys via Settings > API Configuration.
 *
 * This file provides the structure and validation utilities only.
 */

export interface RetellCredentials {
  apiKey: string
  callAgentId: string
  smsAgentId: string
}

/**
 * Phaeton AI CRM - User Configuration Required
 *
 * No hardcoded credentials for Phaeton AI CRM.
 * Users configure their own Retell AI credentials via Settings > API Configuration.
 *
 * Credentials are stored in:
 * - localStorage (primary)
 * - Supabase database (cloud sync)
 *
 * Required credential format:
 * 1. API Key (format: key_xxxxxxxxxxxxxxxxxxxxx)
 * 2. Call Agent ID (format: agent_xxxxxxxxxxxxxxxxxxxxx)
 * 3. SMS Agent ID (format: agent_xxxxxxxxxxxxxxxxxxxxx - optional)
 */
/**
 * Phaeton AI CRM - Production Credentials
 * Last Updated: 2025-10-10
 *
 * IMPORTANT: No hardcoded credentials for Phaeton AI CRM - users configure their own
 */
export const HARDCODED_RETELL_CREDENTIALS: RetellCredentials = {
  // Retell AI API Key - User must configure via Settings
  apiKey: '',

  // Call Agent ID for voice interactions - User must configure via Settings
  callAgentId: '',

  // SMS/Chat Agent ID for text-based interactions - User must configure via Settings
  smsAgentId: ''
}

/**
 * Credential validation utility
 * Note: SMS Agent ID is optional - can be empty string if SMS functionality is not configured
 * Note: All credentials are optional for Phaeton AI CRM (user must configure)
 */
export function validateCredentials(credentials: Partial<RetellCredentials>): boolean {
  // For Phaeton AI CRM, allow empty credentials (user will configure their own)
  if (!credentials.apiKey && !credentials.callAgentId && !credentials.smsAgentId) {
    return true // All empty is valid - waiting for user configuration
  }

  const hasValidApiKey = !!(credentials.apiKey && credentials.apiKey.startsWith('key_'))
  const hasValidCallAgent = !!(credentials.callAgentId && credentials.callAgentId.startsWith('agent_'))
  const hasValidSmsAgent = !credentials.smsAgentId || credentials.smsAgentId.startsWith('agent_')

  return hasValidApiKey && hasValidCallAgent && hasValidSmsAgent
}

/**
 * Get bulletproof credentials with validation
 * Note: For Phaeton AI CRM, returns empty credentials (user must configure)
 */
export function getBulletproofCredentials(): RetellCredentials {
  // For Phaeton AI CRM, return empty credentials - user will configure their own
  const credentials = { ...HARDCODED_RETELL_CREDENTIALS }

  console.log('🔐 Phaeton AI: No hardcoded credentials - user must configure via Settings')
  // Security: Do not log API keys or Agent IDs

  return credentials
}

/**
 * Backup credential storage keys for multi-layer persistence
 */
export const CREDENTIAL_STORAGE_KEYS = {
  // Primary storage locations
  LOCALSTORAGE_PREFIX: 'settings_',
  SESSION_BACKUP_KEY: 'retell_credentials_backup',
  MEMORY_BACKUP_KEY: '__retellCredentialsBackup',

  // Cloud storage keys
  SUPABASE_SYSTEM_DEFAULTS: 'system_retell_defaults',
  SUPABASE_USER_SETTINGS: 'user_settings',

  // Emergency recovery keys
  EMERGENCY_RECOVERY_KEY: '__emergencyRetellCredentials',
  FALLBACK_CONFIG_KEY: '__fallbackRetellConfig'
} as const

/**
 * Store credentials in multiple locations for maximum persistence
 */
export function storeCredentialsEverywhere(credentials: RetellCredentials): void {
  try {
    // CRITICAL FIX: Don't store credentials if user just logged out
    if (typeof localStorage !== 'undefined') {
      const justLoggedOut = localStorage.getItem('justLoggedOut')
      if (justLoggedOut === 'true') {
        console.log('🛑 User just logged out - not storing credentials anywhere')
        return
      }
    }

    // Store in sessionStorage
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(CREDENTIAL_STORAGE_KEYS.SESSION_BACKUP_KEY, JSON.stringify({
        ...credentials,
        timestamp: Date.now(),
        source: 'hardcoded_persistence'
      }))
    }

    // Store in memory backup
    if (typeof window !== 'undefined') {
      (window as any)[CREDENTIAL_STORAGE_KEYS.MEMORY_BACKUP_KEY] = {
        ...credentials,
        timestamp: Date.now(),
        source: 'hardcoded_persistence'
      }
    }

    // Store in emergency recovery
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CREDENTIAL_STORAGE_KEYS.EMERGENCY_RECOVERY_KEY, JSON.stringify({
        ...credentials,
        timestamp: Date.now(),
        source: 'hardcoded_persistence'
      }))
    }

    console.log('✅ Credentials stored in all persistence layers')
  } catch (error) {
    console.warn('⚠️ Error storing credentials in some locations:', error)
  }
}

/**
 * Initialize hardcoded credential persistence on module load
 */
export function initializeCredentialPersistence(): void {
  // CRITICAL FIX: Don't initialize credentials if user just logged out
  if (typeof localStorage !== 'undefined') {
    const justLoggedOut = localStorage.getItem('justLoggedOut')
    if (justLoggedOut === 'true') {
      console.log('🛑 User just logged out - not initializing credential persistence')
      return
    }
  }

  const credentials = getBulletproofCredentials()
  storeCredentialsEverywhere(credentials)

  console.log('🚀 Hardcoded credential persistence initialized')
}

// Auto-initialization DISABLED - User-entered credentials take priority
// The hardcoded credentials above serve only as documentation/reference
// Users must configure their own credentials via Settings > API Configuration
/*
if (typeof window !== 'undefined') {
  // Initialize after a short delay to ensure all systems are ready
  setTimeout(() => {
    try {
      initializeCredentialPersistence()
    } catch (error) {
      console.error('❌ Failed to auto-initialize credential persistence:', error)
    }
  }, 100)
}
*/