/**
 * Global Service Initializer
 *
 * Ensures all services are initialized with hardwired credentials immediately
 * and provides a global way to access initialized services from any component.
 */

import { retellService } from './retellService'
import { chatService } from './chatService'
import { robustProfileSyncService } from './robustProfileSyncService'
import { avatarStorageService } from './avatarStorageService'

export class GlobalServiceInitializer {
  private static initialized = false
  private static initPromise: Promise<void> | null = null

  /**
   * Initialize all services with hardwired credentials
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('🔧 GLOBAL: Services already initialized')
      return
    }

    if (this.initPromise) {
      console.log('🔧 GLOBAL: Waiting for existing initialization...')
      return this.initPromise
    }

    this.initPromise = this.performInitialization()
    return this.initPromise
  }

  private static async performInitialization(): Promise<void> {
    try {
      console.log('🔧 GLOBAL: Starting service initialization...')

      // Phaeton AI CRM: No hardcoded credentials - load from user configuration
      console.log('🔧 GLOBAL: Phaeton AI - Loading user-configured credentials...')

      // Don't initialize with hardcoded credentials - load from storage instead

      // Load credentials asynchronously if possible
      try {
        await retellService.loadCredentialsAsync()
        console.log('✅ GLOBAL: retellService loaded credentials from storage')
      } catch (error) {
        console.log('⚠️ GLOBAL: retellService using hardwired credentials only')
      }

      // Initialize chatService and sync with retellService
      await chatService.syncWithRetellService()
      console.log('✅ GLOBAL: chatService synced with retellService')

      // Make robustProfileSyncService available globally for testing
      if (typeof window !== 'undefined') {
        (window as any).robustProfileSyncService = robustProfileSyncService
        console.log('✅ GLOBAL: robustProfileSyncService exposed globally')

        // Make avatarStorageService available globally for testing
        (window as any).avatarStorageService = avatarStorageService
        console.log('✅ GLOBAL: avatarStorageService exposed globally')
      }

      this.initialized = true
      console.log('🎉 GLOBAL: All services initialized successfully')

    } catch (error) {
      console.error('❌ GLOBAL: Service initialization failed:', error)
      throw error
    }
  }

  /**
   * Check if services are initialized
   */
  static isInitialized(): boolean {
    return this.initialized
  }

  /**
   * Force re-initialization (useful for troubleshooting)
   */
  static async forceReinitialize(): Promise<void> {
    this.initialized = false
    this.initPromise = null
    return this.initialize()
  }

  /**
   * Get current service status with error handling
   */
  static getStatus() {
    try {
      return {
        initialized: this.initialized,
        retellConfigured: retellService.isConfigured(),
        chatConfigured: chatService.isConfigured(),
        profileSyncAvailable: !!(window as any).robustProfileSyncService,
        avatarStorageAvailable: !!(window as any).avatarStorageService,
        credentials: {
          hasApiKey: !!retellService.getApiKey(),
          hasCallAgent: !!retellService.getCallAgentId(),
          hasSmsAgent: !!retellService.getSmsAgentId()
        }
      }
    } catch (error) {
      console.error('❌ GLOBAL: Error getting service status:', error)
      return {
        initialized: false,
        retellConfigured: false,
        chatConfigured: false,
        credentials: {
          hasApiKey: false,
          hasCallAgent: false,
          hasSmsAgent: false
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}

// Export singleton instance
export const globalServiceInitializer = GlobalServiceInitializer

// Make available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).globalServiceInitializer = GlobalServiceInitializer
}