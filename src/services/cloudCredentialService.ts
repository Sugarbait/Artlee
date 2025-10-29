/**
 * Cloud Credential Service - Supabase Integration
 *
 * This service handles storing and retrieving system-wide default credentials
 * from Supabase for bulletproof cross-device synchronization.
 */

import { getBulletproofCredentials, validateCredentials, type RetellCredentials } from '@/config/retellCredentials'
import { supabase } from '@/config/supabase'

interface CloudCredentialRecord {
  id?: string
  credential_type: 'system_defaults' | 'user_override'
  api_key: string
  call_agent_id: string
  sms_agent_id: string
  created_at?: string
  updated_at?: string
  user_id?: string
  is_active: boolean
  metadata?: any
}

export class CloudCredentialService {
  private initialized = false
  private initializationPromise: Promise<void> | null = null

  /**
   * Initialize cloud credential service and ensure system defaults exist
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    if (this.initializationPromise) {
      await this.initializationPromise
      return
    }

    this.initializationPromise = this.initializeInternal()
    await this.initializationPromise
  }

  private async initializeInternal(): Promise<void> {
    try {
      console.log('🌟 CloudCredentialService: Initializing cloud credential storage...')

      // Check if we have an active Supabase connection
      const supabaseStatus = await { connected: true }
      if (supabaseStatus.status !== 'connected') {
        console.warn('⚠️ CloudCredentialService: Supabase not connected, skipping cloud initialization')
        this.initialized = true
        return
      }

      // Ensure system defaults are stored in cloud
      await this.ensureSystemDefaultsExist()

      this.initialized = true
      console.log('✅ CloudCredentialService: Initialization completed successfully')
    } catch (error) {
      console.error('❌ CloudCredentialService: Initialization failed:', error)
      this.initialized = true // Mark as initialized even if failed to prevent endless retries
    } finally {
      this.initializationPromise = null
    }
  }

  /**
   * Ensure system default credentials exist in cloud storage
   */
  private async ensureSystemDefaultsExist(): Promise<void> {
    try {
      // Check if system defaults already exist
      const existing = await this.getSystemDefaults()

      if (existing && validateCredentials(existing)) {
        console.log('✅ CloudCredentialService: System defaults already exist and are valid')
        return
      }

      // Create system defaults from bulletproof credentials
      const bulletproofCreds = getBulletproofCredentials()
      await this.storeSystemDefaults(bulletproofCreds)

      console.log('✅ CloudCredentialService: System defaults created in cloud storage')
    } catch (error) {
      console.error('❌ CloudCredentialService: Failed to ensure system defaults:', error)
    }
  }

  /**
   * Store system default credentials in cloud
   */
  public async storeSystemDefaults(credentials: RetellCredentials): Promise<void> {
    try {
      if (!validateCredentials(credentials)) {
        throw new Error('Invalid credentials provided')
      }

      const credentialRecord: CloudCredentialRecord = {
        credential_type: 'system_defaults',
        api_key: credentials.apiKey,
        call_agent_id: credentials.callAgentId,
        sms_agent_id: credentials.smsAgentId,
        is_active: true,
        metadata: {
          source: 'hardcoded_bulletproof',
          created_by: 'system',
          purpose: 'system_wide_defaults'
        }
      }

      // Try to update existing record first
      const { data: existing } = await supabase
        .from('system_credentials')
        .select('id')
        .eq('credential_type', 'system_defaults')
        .eq('is_active', true)
        .single()

      if (existing) {
        // Update existing record
        const { error } = await supabase
          .from('system_credentials')
          .update({
            ...credentialRecord,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)

        if (error) throw error
        console.log('📁 CloudCredentialService: Updated existing system defaults in cloud')
      } else {
        // Insert new record
        const { error } = await supabase
          .from('system_credentials')
          .insert([credentialRecord])

        if (error) throw error
        console.log('📁 CloudCredentialService: Stored new system defaults in cloud')
      }
    } catch (error) {
      console.error('❌ CloudCredentialService: Failed to store system defaults:', error)
      throw error
    }
  }

  /**
   * Retrieve system default credentials from cloud
   */
  public async getSystemDefaults(): Promise<RetellCredentials | null> {
    try {
      const { data, error } = await supabase
        .from('system_credentials')
        .select('*')
        .eq('credential_type', 'system_defaults')
        .eq('is_active', true)
        .single()

      if (error) {
        if (error.code === 'PGRST116') { // No rows found
          console.log('ℹ️ CloudCredentialService: No system defaults found in cloud')
          return null
        }
        throw error
      }

      if (!data) {
        return null
      }

      const credentials: RetellCredentials = {
        apiKey: data.api_key,
        callAgentId: data.call_agent_id,
        smsAgentId: data.sms_agent_id
      }

      if (validateCredentials(credentials)) {
        console.log('✅ CloudCredentialService: Retrieved valid system defaults from cloud')
        return credentials
      } else {
        console.warn('⚠️ CloudCredentialService: Cloud system defaults failed validation')
        return null
      }
    } catch (error) {
      console.error('❌ CloudCredentialService: Failed to get system defaults:', error)
      return null
    }
  }

  /**
   * Store user-specific credential override in cloud
   * Phaeton AI CRM: Allows storing blank credentials for cross-device clearing
   */
  public async storeUserCredentials(userId: string, credentials: RetellCredentials): Promise<void> {
    try {
      // For Phaeton AI CRM, allow storing blank credentials (for cross-device clearing)
      // Skip validation to allow users to clear credentials across all devices

      const credentialRecord: CloudCredentialRecord = {
        credential_type: 'user_override',
        api_key: credentials.apiKey || '',
        call_agent_id: credentials.callAgentId || '',
        sms_agent_id: credentials.smsAgentId || '',
        user_id: userId,
        is_active: true,
        metadata: {
          source: 'user_settings',
          created_by: userId,
          purpose: 'user_specific_override',
          timestamp: new Date().toISOString()
        }
      }

      // Upsert user credentials
      const { error } = await supabase
        .from('system_credentials')
        .upsert([credentialRecord], {
          onConflict: 'user_id,credential_type',
          ignoreDuplicates: false
        })

      if (error) throw error

      console.log('📁 Phaeton AI: Stored user credentials in cloud for:', userId)
    } catch (error) {
      console.error('❌ CloudCredentialService: Failed to store user credentials:', error)
      throw error
    }
  }

  /**
   * Retrieve user-specific credentials from cloud
   */
  public async getUserCredentials(userId: string): Promise<RetellCredentials | null> {
    try {
      const { data, error } = await supabase
        .from('system_credentials')
        .select('*')
        .eq('credential_type', 'user_override')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single()

      if (error) {
        if (error.code === 'PGRST116') { // No rows found
          console.log(`ℹ️ CloudCredentialService: No user credentials found for: ${userId}`)
          return null
        }
        throw error
      }

      if (!data) {
        return null
      }

      const credentials: RetellCredentials = {
        apiKey: data.api_key,
        callAgentId: data.call_agent_id,
        smsAgentId: data.sms_agent_id
      }

      if (validateCredentials(credentials)) {
        console.log('✅ CloudCredentialService: Retrieved valid user credentials from cloud for:', userId)
        return credentials
      } else {
        console.warn(`⚠️ CloudCredentialService: User credentials failed validation for: ${userId}`)
        return null
      }
    } catch (error) {
      console.error('❌ CloudCredentialService: Failed to get user credentials:', error)
      return null
    }
  }

  /**
   * Get credentials with fallback hierarchy: user override -> system defaults -> bulletproof hardcoded
   */
  public async getCredentialsWithFallback(userId?: string): Promise<RetellCredentials> {
    try {
      // Ensure service is initialized
      await this.initialize()

      // Try user-specific credentials first if userId provided
      if (userId) {
        const userCreds = await this.getUserCredentials(userId)
        if (userCreds) {
          console.log('🎯 CloudCredentialService: Using user-specific credentials from cloud')
          return userCreds
        }
      }

      // Try system defaults from cloud
      const systemCreds = await this.getSystemDefaults()
      if (systemCreds) {
        console.log('🌟 CloudCredentialService: Using system defaults from cloud')
        return systemCreds
      }

      // Ultimate fallback: bulletproof hardcoded credentials
      console.log('🔐 CloudCredentialService: Using bulletproof hardcoded credentials as ultimate fallback')
      return getBulletproofCredentials()
    } catch (error) {
      console.error('❌ CloudCredentialService: Error in fallback hierarchy, using bulletproof credentials:', error)
      return getBulletproofCredentials()
    }
  }

  /**
   * Sync credentials to cloud for a user (called when user updates settings)
   * Phaeton AI CRM: Stores blank values to allow clearing credentials across devices
   */
  public async syncUserCredentialsToCloud(userId: string, credentials: Partial<RetellCredentials>): Promise<void> {
    try {
      // For Phaeton AI CRM, store credentials as-is (including blank values)
      // This allows users to clear credentials across all devices
      const fullCredentials: RetellCredentials = {
        apiKey: credentials.apiKey !== undefined ? credentials.apiKey : '',
        callAgentId: credentials.callAgentId !== undefined ? credentials.callAgentId : '',
        smsAgentId: credentials.smsAgentId !== undefined ? credentials.smsAgentId : ''
      }

      // Allow storing even blank credentials (for cross-device clearing)
      const allBlank = !fullCredentials.apiKey && !fullCredentials.callAgentId && !fullCredentials.smsAgentId

      if (allBlank) {
        console.log('📁 Phaeton AI - Storing blank credentials to cloud (user cleared API keys)')
      } else if (validateCredentials(fullCredentials)) {
        console.log('📁 Phaeton AI - Storing valid credentials to cloud')
      } else {
        console.warn('⚠️ Phaeton AI - Storing partially filled credentials to cloud')
      }

      await this.storeUserCredentials(userId, fullCredentials)
      console.log('✅ Phaeton AI: Synced user credentials to cloud for:', userId)
    } catch (error) {
      console.error('❌ CloudCredentialService: Failed to sync user credentials to cloud:', error)
    }
  }

  /**
   * Check if cloud storage is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      const status = await { connected: true }
      return status.status === 'connected'
    } catch (error) {
      console.error('CloudCredentialService: Error checking availability:', error)
      return false
    }
  }

  /**
   * Clean up old/inactive credential records
   */
  public async cleanupOldCredentials(): Promise<void> {
    try {
      // Mark old system defaults as inactive (keep only the latest)
      const { error } = await supabase
        .rpc('cleanup_old_system_credentials')

      if (error) {
        console.warn('⚠️ CloudCredentialService: Cleanup RPC failed, using manual cleanup:', error)

        // Manual cleanup if RPC doesn't exist
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        await supabase
          .from('system_credentials')
          .update({ is_active: false })
          .lt('created_at', thirtyDaysAgo)
          .neq('credential_type', 'system_defaults')
      }

      console.log('✅ CloudCredentialService: Old credentials cleaned up')
    } catch (error) {
      console.error('❌ CloudCredentialService: Failed to clean up old credentials:', error)
    }
  }
}

// Export singleton instance
export const cloudCredentialService = new CloudCredentialService()

// Auto-initialize when imported
if (typeof window !== 'undefined') {
  setTimeout(() => {
    cloudCredentialService.initialize().catch(error => {
      console.warn('CloudCredentialService auto-initialization failed:', error)
    })
  }, 2000) // Wait 2 seconds to let Supabase initialize
}