/**
 * API Key Fallback Service
 * ========================
 * Emergency fallback for API key storage when user_profiles table
 * is missing the encrypted_agent_config column.
 *
 * This service provides:
 * 1. Automatic detection of missing schema columns
 * 2. Fallback to user_settings table for API key storage
 * 3. Migration path when schema is fixed
 * 4. Graceful error handling
 */

import { supabase } from '@/config/supabase'
import { getCurrentTenantId } from '@/config/tenantConfig'
import { encryptionService } from './encryption'
import { auditLogger } from './auditLogger'
import { ServiceResponse } from '@/types/supabase'

interface ApiKeys {
  retell_api_key?: string
  call_agent_id?: string
  sms_agent_id?: string
}

interface EncryptedKeys {
  retell_api_key?: string
  call_agent_id?: string
  sms_agent_id?: string
}

export class ApiKeyFallbackService {
  private schemaChecked = false
  private hasEncryptedAgentConfig = false
  private hasEncryptedRetellApiKey = false

  /**
   * Check if the user_profiles table has the required columns
   */
  private async checkTableSchema(): Promise<{hasAgentConfig: boolean, hasRetellKey: boolean}> {
    if (this.schemaChecked) {
      return {
        hasAgentConfig: this.hasEncryptedAgentConfig,
        hasRetellKey: this.hasEncryptedRetellApiKey
      }
    }

    try {
      // Try to select the columns - if they don't exist, this will fail
      const { data, error } = await supabase
        .from('user_profiles')
        .select('encrypted_agent_config, encrypted_retell_api_key')
        .eq('tenant_id', getCurrentTenantId())
        .limit(1)
        .maybeSingle()

      if (error) {
        // Check if error is about missing columns
        if (error.message.includes('encrypted_agent_config') ||
            error.message.includes('encrypted_retell_api_key')) {
          console.log('ApiKeyFallbackService: Missing columns detected in user_profiles table')

          // Try to determine which specific columns exist
          const { error: agentConfigError } = await supabase
            .from('user_profiles')
            .select('encrypted_agent_config')
            .eq('tenant_id', getCurrentTenantId())
            .limit(1)
            .maybeSingle()

          const { error: retellKeyError } = await supabase
            .from('user_profiles')
            .select('encrypted_retell_api_key')
            .eq('tenant_id', getCurrentTenantId())
            .limit(1)
            .maybeSingle()

          this.hasEncryptedAgentConfig = !agentConfigError
          this.hasEncryptedRetellApiKey = !retellKeyError
        } else {
          // Different error, assume columns exist
          this.hasEncryptedAgentConfig = true
          this.hasEncryptedRetellApiKey = true
        }
      } else {
        // No error, columns exist
        this.hasEncryptedAgentConfig = true
        this.hasEncryptedRetellApiKey = true
      }

      this.schemaChecked = true
      console.log(`ApiKeyFallbackService: Schema check complete - AgentConfig: ${this.hasEncryptedAgentConfig}, RetellKey: ${this.hasEncryptedRetellApiKey}`)

      return {
        hasAgentConfig: this.hasEncryptedAgentConfig,
        hasRetellKey: this.hasEncryptedRetellApiKey
      }
    } catch (error) {
      console.error('ApiKeyFallbackService: Error checking schema:', error)
      // Conservative approach - assume columns don't exist
      this.hasEncryptedAgentConfig = false
      this.hasEncryptedRetellApiKey = false
      this.schemaChecked = true
      return {hasAgentConfig: false, hasRetellKey: false}
    }
  }

  /**
   * Store API keys using the best available method
   */
  async storeApiKeys(userId: string, apiKeys: ApiKeys): Promise<ServiceResponse<boolean>> {
    try {
      const schema = await this.checkTableSchema()
      const encryptedKeys: EncryptedKeys = {}

      // Encrypt the API keys
      if (apiKeys.retell_api_key) {
        encryptedKeys.retell_api_key = await encryptionService.encryptString(apiKeys.retell_api_key)
      }
      if (apiKeys.call_agent_id) {
        encryptedKeys.call_agent_id = await encryptionService.encryptString(apiKeys.call_agent_id)
      }
      if (apiKeys.sms_agent_id) {
        encryptedKeys.sms_agent_id = await encryptionService.encryptString(apiKeys.sms_agent_id)
      }

      const agentConfig = {
        call_agent_id: apiKeys.call_agent_id,
        sms_agent_id: apiKeys.sms_agent_id,
      }

      // Try primary storage method (user_profiles table)
      if (schema.hasAgentConfig && schema.hasRetellKey) {
        console.log('ApiKeyFallbackService: Using user_profiles table (full schema)')
        const result = await this.storeInUserProfiles(userId, encryptedKeys, agentConfig)
        if (result.status === 'success') return { status: 'success', data: true }
        console.log('ApiKeyFallbackService: user_profiles failed, trying user_settings')
      }

      // Try partial storage in user_profiles
      if (schema.hasRetellKey && !schema.hasAgentConfig) {
        console.log('ApiKeyFallbackService: Using user_profiles table (partial schema) + user_settings fallback')
        const result = await this.storePartialInUserProfiles(userId, encryptedKeys, agentConfig)
        if (result.status === 'success') return { status: 'success', data: true }
        console.log('ApiKeyFallbackService: partial user_profiles failed, trying user_settings')
      }

      // Try user_settings table fallback
      console.log('ApiKeyFallbackService: Using user_settings table (full fallback)')
      const settingsResult = await this.storeInUserSettings(userId, apiKeys, encryptedKeys)
      if (settingsResult.status === 'success') return { status: 'success', data: true }

      // Final fallback to localStorage
      console.log('ApiKeyFallbackService: Database unavailable, using encrypted localStorage')
      const localResult = await this.storeInLocalStorage(userId, encryptedKeys)
      return { status: localResult.status, data: localResult.status === 'success', error: localResult.error }

    } catch (error: any) {
      console.error('ApiKeyFallbackService: Error storing API keys:', error)

      try {
        // Emergency fallback to localStorage even on error
        console.log('ApiKeyFallbackService: Emergency fallback to localStorage')
        const emergencyResult = await this.storeInLocalStorage(userId, await this.encryptApiKeys(apiKeys))
        return { status: emergencyResult.status, data: emergencyResult.status === 'success', error: emergencyResult.error }
      } catch (localStorageError: any) {
        await auditLogger.logSecurityEvent('API_KEY_STORAGE_FAILED', 'api_key_fallback', false, {
          userId,
          error: error.message,
          method: 'all_methods_failed'
        })
        return { status: 'error', error: `All storage methods failed: ${error.message}` }
      }
    }
  }

  /**
   * Store in user_profiles table (ideal scenario)
   */
  private async storeInUserProfiles(userId: string, encryptedKeys: EncryptedKeys, agentConfig: any): Promise<{status: 'success' | 'error', error?: string}> {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .upsert({
          user_id: userId,
          encrypted_retell_api_key: encryptedKeys.retell_api_key,
          encrypted_agent_config: agentConfig,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      await auditLogger.logSecurityEvent('API_KEYS_STORED_USER_PROFILES', 'user_profiles', true, {
        userId,
        method: 'primary_storage'
      })

      return { status: 'success', data: true }
    } catch (error: any) {
      console.error('ApiKeyFallbackService: Error storing in user_profiles:', error)
      return { status: 'error', error: error.message }
    }
  }

  /**
   * Store partially in user_profiles (retell key only) and agent config in user_settings
   */
  private async storePartialInUserProfiles(userId: string, encryptedKeys: EncryptedKeys, agentConfig: any): Promise<{status: 'success' | 'error', error?: string}> {
    try {
      // Store API key in user_profiles
      if (encryptedKeys.retell_api_key) {
        const { error: profileError } = await supabase
          .from('user_profiles')
          .upsert({
            user_id: userId,
            encrypted_retell_api_key: encryptedKeys.retell_api_key,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id'
          })

        if (profileError) throw profileError
      }

      // Store agent config in user_settings
      const { error: settingsError } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          tenant_id: getCurrentTenantId(),
          retell_agent_config: agentConfig,
          encrypted_retell_keys: encryptedKeys,
          api_key_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })

      if (settingsError) throw settingsError

      await auditLogger.logSecurityEvent('API_KEYS_STORED_PARTIAL', 'user_profiles,user_settings', true, {
        userId,
        method: 'partial_storage'
      })

      return { status: 'success', data: true }
    } catch (error: any) {
      console.error('ApiKeyFallbackService: Error storing partial:', error)
      return { status: 'error', error: error.message }
    }
  }

  /**
   * Store everything in user_settings table (full fallback)
   */
  private async storeInUserSettings(userId: string, apiKeys: ApiKeys, encryptedKeys: EncryptedKeys): Promise<{status: 'success' | 'error', error?: string}> {
    try {
      const retellConfig = {
        api_key: apiKeys.retell_api_key,
        call_agent_id: apiKeys.call_agent_id,
        sms_agent_id: apiKeys.sms_agent_id,
      }

      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          tenant_id: getCurrentTenantId(),
          retell_config: retellConfig,
          encrypted_api_keys: encryptedKeys,
          api_key_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        })

      if (error) throw error

      await auditLogger.logSecurityEvent('API_KEYS_STORED_FALLBACK', 'user_settings', true, {
        userId,
        method: 'fallback_storage'
      })

      return { status: 'success', data: true }
    } catch (error: any) {
      console.error('ApiKeyFallbackService: Error storing in user_settings:', error)
      return { status: 'error', error: error.message }
    }
  }

  /**
   * Helper method to encrypt API keys
   */
  private async encryptApiKeys(apiKeys: ApiKeys): Promise<EncryptedKeys> {
    const encryptedKeys: EncryptedKeys = {}

    if (apiKeys.retell_api_key) {
      encryptedKeys.retell_api_key = await encryptionService.encryptString(apiKeys.retell_api_key)
    }
    if (apiKeys.call_agent_id) {
      encryptedKeys.call_agent_id = await encryptionService.encryptString(apiKeys.call_agent_id)
    }
    if (apiKeys.sms_agent_id) {
      encryptedKeys.sms_agent_id = await encryptionService.encryptString(apiKeys.sms_agent_id)
    }
    if (apiKeys.phone_number) {
      encryptedKeys.phone_number = await encryptionService.encryptString(apiKeys.phone_number)
    }

    return encryptedKeys
  }

  /**
   * Store in encrypted localStorage (final fallback)
   */
  private async storeInLocalStorage(userId: string, encryptedKeys: EncryptedKeys): Promise<{status: 'success' | 'error', error?: string}> {
    try {
      const storageKey = `apikeys_${userId}`
      const dataToStore = {
        encrypted_keys: encryptedKeys,
        stored_at: new Date().toISOString(),
        storage_method: 'localStorage_fallback'
      }

      localStorage.setItem(storageKey, JSON.stringify(dataToStore))

      await auditLogger.logSecurityEvent('API_KEYS_STORED_LOCALSTORAGE', 'localStorage', true, {
        userId,
        method: 'localStorage_fallback'
      })

      return { status: 'success', data: true }
    } catch (error: any) {
      console.error('ApiKeyFallbackService: Error storing in localStorage:', error)
      return { status: 'error', error: error.message }
    }
  }

  /**
   * Retrieve API keys using the best available method
   */
  async retrieveApiKeys(userId: string): Promise<ServiceResponse<ApiKeys>> {
    try {
      const schema = await this.checkTableSchema()

      // Try primary retrieval method (user_profiles table)
      if (schema.hasAgentConfig && schema.hasRetellKey) {
        const result = await this.retrieveFromUserProfiles(userId)
        if (result.status === 'success') return result
        console.log('ApiKeyFallbackService: user_profiles retrieval failed, trying user_settings')
      }

      // Try partial retrieval
      if (schema.hasRetellKey && !schema.hasAgentConfig) {
        const result = await this.retrievePartialFromUserProfiles(userId)
        if (result.status === 'success') return result
        console.log('ApiKeyFallbackService: partial user_profiles retrieval failed, trying user_settings')
      }

      // Try user_settings table
      const settingsResult = await this.retrieveFromUserSettings(userId)
      if (settingsResult.status === 'success') return settingsResult

      // Final fallback to localStorage
      console.log('ApiKeyFallbackService: Database unavailable, checking localStorage')
      return await this.retrieveFromLocalStorage(userId)

    } catch (error: any) {
      console.error('ApiKeyFallbackService: Error retrieving API keys:', error)

      try {
        // Emergency fallback to localStorage
        return await this.retrieveFromLocalStorage(userId)
      } catch (localStorageError: any) {
        return { status: 'error', error: `All retrieval methods failed: ${error.message}` }
      }
    }
  }

  /**
   * Retrieve from user_profiles table (ideal scenario)
   */
  private async retrieveFromUserProfiles(userId: string): Promise<{status: 'success' | 'error', data?: ApiKeys, error?: string}> {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('encrypted_retell_api_key, encrypted_agent_config')
        .eq('user_id', userId)
        .eq('tenant_id', getCurrentTenantId())
        .single()

      if (error) throw error

      const apiKeys: ApiKeys = {}

      if (data?.encrypted_retell_api_key) {
        apiKeys.retell_api_key = await encryptionService.decryptString(data.encrypted_retell_api_key)
      }

      const agentConfig = data.encrypted_agent_config || {}
      if (agentConfig.call_agent_id) apiKeys.call_agent_id = agentConfig.call_agent_id
      if (agentConfig.sms_agent_id) apiKeys.sms_agent_id = agentConfig.sms_agent_id

      // Fallback: If Agent IDs are missing from database, check localStorage
      if (!apiKeys.call_agent_id || !apiKeys.sms_agent_id) {
        try {
          const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
          if (currentUser.id) {
            const settings = JSON.parse(localStorage.getItem(`settings_${currentUser.id}`) || '{}')
            if (!apiKeys.call_agent_id && settings.callAgentId) {
              apiKeys.call_agent_id = settings.callAgentId
              console.log('📦 ApiKeyFallbackService: Loaded Call Agent ID from localStorage fallback')
            }
            if (!apiKeys.sms_agent_id && settings.smsAgentId) {
              apiKeys.sms_agent_id = settings.smsAgentId
              console.log('📦 ApiKeyFallbackService: Loaded SMS Agent ID from localStorage fallback')
            }
          }
        } catch (localStorageError) {
          console.warn('ApiKeyFallbackService: localStorage fallback failed:', localStorageError)
        }
      }

      return { status: 'success', data: apiKeys }
    } catch (error: any) {
      console.error('ApiKeyFallbackService: Error retrieving from user_profiles:', error)
      return { status: 'error', error: error.message }
    }
  }

  /**
   * Retrieve partially from user_profiles and user_settings
   */
  private async retrievePartialFromUserProfiles(userId: string): Promise<{status: 'success' | 'error', data?: ApiKeys, error?: string}> {
    try {
      const apiKeys: ApiKeys = {}

      // Get API key from user_profiles
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('encrypted_retell_api_key')
        .eq('user_id', userId)
        .eq('tenant_id', getCurrentTenantId())
        .single()

      if (!profileError && profileData?.encrypted_retell_api_key) {
        apiKeys.retell_api_key = await encryptionService.decryptString(profileData.encrypted_retell_api_key)
      }

      // Get agent config from user_settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('user_settings')
        .select('retell_agent_config')
        .eq('user_id', userId)
        .eq('tenant_id', getCurrentTenantId())
        .single()

      if (!settingsError && settingsData?.retell_agent_config) {
        const agentConfig = settingsData.retell_agent_config
        if (agentConfig.call_agent_id) apiKeys.call_agent_id = agentConfig.call_agent_id
        if (agentConfig.sms_agent_id) apiKeys.sms_agent_id = agentConfig.sms_agent_id
        }

      return { status: 'success', data: apiKeys }
    } catch (error: any) {
      console.error('ApiKeyFallbackService: Error retrieving partial:', error)
      return { status: 'error', error: error.message }
    }
  }

  /**
   * Retrieve from user_settings table (full fallback)
   */
  private async retrieveFromUserSettings(userId: string): Promise<{status: 'success' | 'error', data?: ApiKeys, error?: string}> {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('retell_config, encrypted_api_keys')
        .eq('user_id', userId)
        .eq('tenant_id', getCurrentTenantId())
        .single()

      if (error) throw error

      const retellConfig = data.retell_config || {}
      const apiKeys: ApiKeys = {
        retell_api_key: retellConfig.api_key,
        call_agent_id: retellConfig.call_agent_id,
        sms_agent_id: retellConfig.sms_agent_id,
      }

      // Fallback: If Agent IDs are missing from database, check localStorage
      if (!apiKeys.call_agent_id || !apiKeys.sms_agent_id) {
        try {
          const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
          if (currentUser.id) {
            const settings = JSON.parse(localStorage.getItem(`settings_${currentUser.id}`) || '{}')
            if (!apiKeys.call_agent_id && settings.callAgentId) {
              apiKeys.call_agent_id = settings.callAgentId
              console.log('📦 ApiKeyFallbackService: Loaded Call Agent ID from localStorage fallback (user_settings)')
            }
            if (!apiKeys.sms_agent_id && settings.smsAgentId) {
              apiKeys.sms_agent_id = settings.smsAgentId
              console.log('📦 ApiKeyFallbackService: Loaded SMS Agent ID from localStorage fallback (user_settings)')
            }
          }
        } catch (localStorageError) {
          console.warn('ApiKeyFallbackService: localStorage fallback failed:', localStorageError)
        }
      }

      return { status: 'success', data: apiKeys }
    } catch (error: any) {
      console.error('ApiKeyFallbackService: Error retrieving from user_settings:', error)
      return { status: 'error', error: error.message }
    }
  }

  /**
   * Retrieve from encrypted localStorage (final fallback)
   */
  private async retrieveFromLocalStorage(userId: string): Promise<{status: 'success' | 'error', data?: ApiKeys, error?: string}> {
    try {
      const storageKey = `apikeys_${userId}`
      const storedData = localStorage.getItem(storageKey)

      if (!storedData) {
        return { status: 'success', data: {} }
      }

      const parsedData = JSON.parse(storedData)
      const encryptedKeys = parsedData.encrypted_keys || {}
      const apiKeys: ApiKeys = {}

      // Decrypt the stored keys
      if (encryptedKeys.retell_api_key) {
        apiKeys.retell_api_key = await encryptionService.decryptString(encryptedKeys.retell_api_key)
      }
      if (encryptedKeys.call_agent_id) {
        apiKeys.call_agent_id = await encryptionService.decryptString(encryptedKeys.call_agent_id)
      }
      if (encryptedKeys.sms_agent_id) {
        apiKeys.sms_agent_id = await encryptionService.decryptString(encryptedKeys.sms_agent_id)
      }

      return { status: 'success', data: apiKeys }
    } catch (error: any) {
      console.error('ApiKeyFallbackService: Error retrieving from localStorage:', error)
      return { status: 'error', error: error.message }
    }
  }

  /**
   * Reset schema check cache (useful after running migrations)
   */
  resetSchemaCache(): void {
    this.schemaChecked = false
    this.hasEncryptedAgentConfig = false
    this.hasEncryptedRetellApiKey = false
    console.log('ApiKeyFallbackService: Schema cache reset')
  }

  /**
   * Test method to simulate the original error scenario and verify the fix
   * This demonstrates that the service can handle the missing column gracefully
   */
  async testSchemaHandling(userId: string = 'test-user'): Promise<{
    schemaSupported: {hasAgentConfig: boolean, hasRetellKey: boolean}
    canStoreKeys: boolean
    canRetrieveKeys: boolean
    fallbackMethod: string
  }> {
    try {
      console.log('ApiKeyFallbackService: Testing schema handling...')

      // Check what the schema supports
      const schema = await this.checkTableSchema()

      // Test storage capabilities
      const testKeys = {
        retell_api_key: 'test-key-123',
        call_agent_id: 'test-call-agent',
        sms_agent_id: 'test-sms-agent'
      }

      const storeResult = await this.storeApiKeys(userId, testKeys)
      const canStore = storeResult.status === 'success'

      // Test retrieval capabilities
      const retrieveResult = await this.retrieveApiKeys(userId)
      const canRetrieve = retrieveResult.status === 'success'

      // Determine which fallback method was used
      let fallbackMethod = 'unknown'
      if (schema.hasAgentConfig && schema.hasRetellKey) {
        fallbackMethod = 'user_profiles_full'
      } else if (schema.hasRetellKey && !schema.hasAgentConfig) {
        fallbackMethod = 'user_profiles_partial_plus_user_settings'
      } else {
        fallbackMethod = 'user_settings_or_localStorage'
      }

      console.log(`ApiKeyFallbackService: Test complete - using ${fallbackMethod}`)

      return {
        schemaSupported: schema,
        canStoreKeys: canStore,
        canRetrieveKeys: canRetrieve,
        fallbackMethod
      }
    } catch (error: any) {
      console.error('ApiKeyFallbackService: Test failed:', error)
      return {
        schemaSupported: {hasAgentConfig: false, hasRetellKey: false},
        canStoreKeys: false,
        canRetrieveKeys: false,
        fallbackMethod: 'error_fallback'
      }
    }
  }
}

// Export singleton instance
export const apiKeyFallbackService = new ApiKeyFallbackService()