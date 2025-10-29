console.log('🚀 Starting Phaeton AI CRM...')

import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

// Basic user setup - preserves existing data to prevent avatar loss
try {
  // Note: No default users - users will be created through Azure AD authentication
  const defaultSettings = {
    theme: 'light',
    mfaEnabled: false,
    refreshInterval: 30000,
    sessionTimeout: 15,
    notifications: { calls: true, sms: true, system: true },
    // Retell credentials will be loaded from retellCredentials.ts
    retellApiKey: '',
    callAgentId: '',
    smsAgentId: ''
  }

  // Phaeton AI: Users will be created through Azure AD authentication
  // No default users are created at startup
  const existingUser = localStorage.getItem('currentUser')
  if (existingUser) {
    try {
      const userData = JSON.parse(existingUser)
      console.log('✅ Existing user found:', userData.email || userData.id)
    } catch (parseError) {
      console.warn('Failed to parse existing user data:', parseError)
    }
  }

  // Phaeton AI: Settings and users are managed through Azure AD authentication
  // No automatic user or settings creation at startup

  console.log('✅ Basic user setup completed')
} catch (error) {
  console.error('❌ Basic setup failed:', error)
}

// Simple loading component
const LoadingApp: React.FC = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
        <span className="text-white text-2xl">🏥</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Phaeton AI CRM</h1>
      <p className="text-gray-600">Loading application...</p>
      <div className="mt-4 text-sm text-gray-500">
        Initializing HIPAA-compliant environment
      </div>
    </div>
  </div>
)

// Main App Component that loads progressively
const MainApp: React.FC = () => {
  const [appLoaded, setAppLoaded] = React.useState(false)
  const [App, setApp] = React.useState<React.ComponentType | null>(null)

  React.useEffect(() => {
    console.log('📱 Loading main App component...')

    // Initialize critical authentication fixes immediately
    Promise.allSettled([
      import('./services/authFlowEnhancer').then(({ authFlowEnhancer }) => {
        authFlowEnhancer.initialize()
        console.log('🔧 Auth flow enhancer started early')
      }).catch(() => console.log('Early auth flow enhancer init failed')),
      import('./utils/azureAuthFix').then(() => {
        console.log('🔧 Azure auth fix started early')
      }).catch(() => console.log('Early Azure auth fix init failed')),
      import('./utils/localhostAuthFix').then(() => {
        console.log('🔧 Localhost auth fix started early')
      }).catch(() => console.log('Early localhost auth fix init failed'))
    ]).then(() => {
      console.log('✅ Critical auth fixes initialized')
    })

    // Load the App component dynamically
    import('./App.tsx')
      .then((module) => {
        console.log('✅ App component loaded successfully')
        setApp(() => module.default)
        setAppLoaded(true)
      })
      .catch((error) => {
        console.error('❌ Failed to load App component:', error)
        // Show error state
        setApp(() => () => (
          <div className="min-h-screen bg-red-50 flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-red-800 mb-2">Loading Error</h1>
              <p className="text-red-600">Failed to load application</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              >
                Retry
              </button>
            </div>
          </div>
        ))
        setAppLoaded(true)
      })
  }, [])

  if (!appLoaded || !App) {
    return <LoadingApp />
  }

  return <App />
}

// Background initialization - runs after app loads
setTimeout(() => {
  console.log('🔧 Starting background initialization...')

  Promise.allSettled([
    // import('./utils/clearCorruptedMfaData').catch(() => console.log('MFA cleanup skipped')), // DISABLED: Was clearing MFA data on every load
    import('./services/globalServiceInitializer').then(({ globalServiceInitializer }) =>
      globalServiceInitializer.initialize()
    ).catch(() => console.log('Global service init skipped')),
    // DISABLED: Bulletproof credential initializer prevents users from saving their own API keys
    // import('./services/bulletproofCredentialInitializer').then(({ bulletproofCredentialInitializer }) =>
    //   bulletproofCredentialInitializer.initialize()
    // ).catch(() => console.log('Bulletproof credentials skipped')),
    // Initialize authentication fixes for login loop issues
    import('./services/authFlowEnhancer').then(({ authFlowEnhancer }) =>
      authFlowEnhancer.initialize()
    ).catch(() => console.log('Auth flow enhancer init skipped')),
    import('./utils/azureAuthFix').then(() =>
      console.log('✅ Azure auth fix initialized')
    ).catch(() => console.log('Azure auth fix init skipped')),
    import('./utils/localhostAuthFix').then(() =>
      console.log('✅ Localhost auth fix initialized')
    ).catch(() => console.log('Localhost auth fix init skipped'))
  ]).then(() => {
    console.log('✅ Background initialization completed')
  })
}, 5000)

// Mount the application
console.log('🚀 Mounting React application...')

const root = document.getElementById('root')
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <MainApp />
    </React.StrictMode>
  )
  console.log('✅ React application mounted successfully')
} else {
  console.error('❌ Root element not found!')
}