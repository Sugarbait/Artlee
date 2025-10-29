/**
 * Bulletproof API Key Persistence Test
 *
 * This test validates that API keys persist across all navigation scenarios
 * and provides debugging information for the bulletproof system.
 */

import { retellService } from '@/services/retellService'

export class BulletproofApiKeyTest {
  private testResults: Array<{
    test: string
    status: 'pass' | 'fail'
    message: string
    timestamp: number
  }> = []

  private addResult(test: string, status: 'pass' | 'fail', message: string) {
    this.testResults.push({
      test,
      status,
      message,
      timestamp: Date.now()
    })

    const icon = status === 'pass' ? '✅' : '❌'
    console.log(`${icon} ${test}: ${message}`)
  }

  /**
   * Test basic API key loading
   */
  async testBasicLoading(): Promise<boolean> {
    try {
      await retellService.ensureCredentialsLoaded()

      if (retellService.isConfigured()) {
        this.addResult('Basic Loading', 'pass', 'API keys loaded successfully')
        return true
      } else {
        this.addResult('Basic Loading', 'fail', 'API keys not configured after loading')
        return false
      }
    } catch (error) {
      this.addResult('Basic Loading', 'fail', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Test credentials persistence through simulated navigation
   */
  async testNavigationPersistence(): Promise<boolean> {
    try {
      // Ensure keys are loaded
      await retellService.ensureCredentialsLoaded()
      const initialState = retellService.isConfigured()

      if (!initialState) {
        this.addResult('Navigation Persistence', 'fail', 'Initial state not configured')
        return false
      }

      // Simulate navigation clearing (what used to happen)
      // Clear the service instance variables to simulate the bug
      const service = retellService as any
      const originalApiKey = service.apiKey
      const originalCallAgentId = service.callAgentId
      const originalSmsAgentId = service.smsAgentId

      // Temporarily clear instance variables
      service.apiKey = ''
      service.callAgentId = ''
      service.smsAgentId = ''

      // Test if the bulletproof system can recover
      const recovered = await retellService.ensureCredentialsLoaded()
      const recoveredState = retellService.isConfigured()

      if (recoveredState) {
        this.addResult('Navigation Persistence', 'pass', 'API keys recovered after simulated clearing')
        return true
      } else {
        // Restore original values for continued testing
        service.apiKey = originalApiKey
        service.callAgentId = originalCallAgentId
        service.smsAgentId = originalSmsAgentId

        this.addResult('Navigation Persistence', 'fail', 'API keys could not be recovered')
        return false
      }
    } catch (error) {
      this.addResult('Navigation Persistence', 'fail', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Test multiple storage location fallbacks
   */
  async testFallbackMechanisms(): Promise<boolean> {
    try {
      const service = retellService as any

      // Test that credentials can be loaded from different sources
      const credentialsFromCurrentUser = service.loadFromCurrentUser()
      const credentialsFromScan = service.scanAllUserSettings()
      const credentialsFromSession = service.loadFromSessionStorage()
      const credentialsFromMemory = service.loadFromMemoryBackup()

      const sources = [
        { name: 'currentUser', creds: credentialsFromCurrentUser },
        { name: 'scanAllUsers', creds: credentialsFromScan },
        { name: 'sessionStorage', creds: credentialsFromSession },
        { name: 'memoryBackup', creds: credentialsFromMemory }
      ]

      const availableSources = sources.filter(source => source.creds.apiKey).map(s => s.name)

      if (availableSources.length > 0) {
        this.addResult('Fallback Mechanisms', 'pass', `API keys available from: ${availableSources.join(', ')}`)
        return true
      } else {
        this.addResult('Fallback Mechanisms', 'fail', 'No fallback sources have API keys')
        return false
      }
    } catch (error) {
      this.addResult('Fallback Mechanisms', 'fail', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Test update and persistence cycle
   */
  async testUpdatePersistence(): Promise<boolean> {
    try {
      const testApiKey = 'test_key_' + Date.now()
      const testCallAgent = 'test_call_agent_' + Date.now()
      const testSmsAgent = 'test_sms_agent_' + Date.now()

      // Update credentials
      retellService.updateCredentials(testApiKey, testCallAgent, testSmsAgent)

      // Ensure they're loaded
      await retellService.ensureCredentialsLoaded()

      // Check if they're configured
      if (retellService.isConfigured()) {
        this.addResult('Update Persistence', 'pass', 'Updated credentials persisted successfully')
        return true
      } else {
        this.addResult('Update Persistence', 'fail', 'Updated credentials not persisted')
        return false
      }
    } catch (error) {
      this.addResult('Update Persistence', 'fail', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('🧪 Starting Bulletproof API Key Test Suite...')

    const tests = [
      () => this.testBasicLoading(),
      () => this.testNavigationPersistence(),
      () => this.testFallbackMechanisms(),
      () => this.testUpdatePersistence()
    ]

    const results = []
    for (const test of tests) {
      const result = await test()
      results.push(result)
    }

    const passed = results.filter(r => r).length
    const total = results.length

    console.log(`\n📊 Test Results: ${passed}/${total} tests passed`)

    if (passed === total) {
      console.log('🎉 All tests passed! Bulletproof API key system is working correctly.')
    } else {
      console.log('⚠️ Some tests failed. Check the results above for details.')
    }

    // Return detailed results
    return this.testResults
  }

  /**
   * Get test results
   */
  getResults() {
    return this.testResults
  }

  /**
   * Diagnostic information about current system state
   */
  async getDiagnostics(): Promise<any> {
    const service = retellService as any

    return {
      isConfigured: retellService.isConfigured(),
      isInitialized: service.isInitialized,
      hasLoadingPromise: !!service.loadingPromise,
      currentCredentials: {
        hasApiKey: !!service.apiKey,
        hasCallAgentId: !!service.callAgentId,
        hasSmsAgentId: !!service.smsAgentId,
        apiKeyPrefix: service.apiKey ? service.apiKey.substring(0, 15) + '...' : 'none'
      },
      storageInfo: {
        localStorage: {
          currentUser: !!localStorage.getItem('currentUser'),
          settingsKeys: Object.keys(localStorage).filter(k => k.startsWith('settings_')).length
        },
        sessionStorage: {
          hasBackup: !!sessionStorage.getItem('retell_credentials_backup')
        },
        memory: {
          hasBackup: !!(window as any).__retellCredentialsBackup
        }
      },
      timestamp: new Date().toISOString()
    }
  }
}

// Export test instance and make it available globally for console testing
export const bulletproofApiKeyTest = new BulletproofApiKeyTest()

// Make available globally for console access
if (typeof window !== 'undefined') {
  ;(window as any).bulletproofApiKeyTest = bulletproofApiKeyTest
}

// Auto-run test in development mode DISABLED to prevent test credentials
// Test credentials were being generated automatically and persisting to localStorage
// To manually run tests, use: window.bulletproofApiKeyTest.runAllTests()
/*
if (import.meta.env.DEV) {
  setTimeout(async () => {
    console.log('🔧 Development mode: Running bulletproof API key test...')
    await bulletproofApiKeyTest.runAllTests()

    console.log('\n🔍 Current system diagnostics:')
    const diagnostics = await bulletproofApiKeyTest.getDiagnostics()
    console.table(diagnostics)

    console.log('\n💡 To manually run tests, use: window.bulletproofApiKeyTest.runAllTests()')
  }, 3000) // Wait 3 seconds after app initialization
}
*/