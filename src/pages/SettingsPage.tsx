import React, { useState, useEffect } from 'react'
import {
  SettingsIcon,
  UserIcon,
  ShieldIcon,
  BellIcon,
  PaletteIcon,
  MonitorIcon,
  SmartphoneIcon,
  SunIcon,
  MoonIcon,
  SaveIcon,
  CheckIcon,
  CameraIcon,
  UploadIcon,
  FileTextIcon,
  DownloadIcon,
  QrCodeIcon,
  AlertTriangleIcon,
  KeyIcon,
  LinkIcon,
  UsersIcon,
  DollarSignIcon,
  CreditCardIcon
} from 'lucide-react'
import FreshMfaService from '@/services/freshMfaService'
import { FreshMfaSettings } from '@/components/settings/FreshMfaSettings'
import { auditLogger } from '@/services/auditLogger'
import { retellService } from '@/services'
import { userProfileService } from '@/services/userProfileService'
import { userSettingsService } from '@/services/userSettingsService'
import { UserSettings } from '@/types/supabase'
import { avatarStorageService } from '@/services/avatarStorageService'
import { SimpleUserManager } from '@/components/settings/SimpleUserManager'
import { EnhancedProfileSettings } from '@/components/settings/EnhancedProfileSettings'
import { EnhancedApiKeyManager } from '@/components/settings/EnhancedApiKeyManager'
import { ApiKeyErrorBoundary } from '@/components/common/ApiKeyErrorBoundary'
import { ThemeManager } from '@/utils/themeManager'
import { SiteHelpChatbot } from '@/components/common/SiteHelpChatbot'
import { toastNotificationService, ToastNotificationPreferences } from '@/services/toastNotificationService'
import { logoService, CompanyLogos } from '@/services/logoService'
import { EmailNotificationSettings } from '@/components/settings/EmailNotificationSettings'
import { generalToast } from '@/services/generalToastService'
import InvoiceHistorySettings from '@/components/settings/InvoiceHistorySettings'
// Removed old TOTP hook - using fresh MFA service directly

interface User {
  id: string
  email: string
  name: string
  role: string
  mfa_enabled?: boolean
  avatar?: string
}

interface LocalUserSettings {
  theme?: string
  mfaEnabled?: boolean
  refreshInterval?: number
  sessionTimeout?: number // in minutes
  notifications?: {
    calls?: boolean
    sms?: boolean
    system?: boolean
  }
  retellApiKey?: string
  callAgentId?: string
  smsAgentId?: string
}

interface SettingsPageProps {
  user: User
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ user }) => {
  const [activeTab, setActiveTab] = useState('profile')
  const [isLoading, setIsLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isChatbotVisible, setIsChatbotVisible] = useState(false)
  const [userSettings, setUserSettings] = useState<LocalUserSettings>({
    // Don't set default theme - let it load from storage
    mfaEnabled: true, // SECURITY POLICY: MFA is mandatory, never false
    refreshInterval: 30000 // Default to 30 seconds
  })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [isLoadingAudit, setIsLoadingAudit] = useState(false)
  const [fullName, setFullName] = useState(user?.name || '')
  const [isEditingName, setIsEditingName] = useState(false)
  const [isSavingName, setIsSavingName] = useState(false)
  const [toastPreferences, setToastPreferences] = useState<ToastNotificationPreferences>(
    toastNotificationService.getPreferences()
  )
  const [companyLogos, setCompanyLogos] = useState<CompanyLogos>({})
  const [logoUploadStatus, setLogoUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')

  // Fresh MFA status state
  const [freshMfaEnabled, setFreshMfaEnabled] = useState(false)


  const tabs = [
    { id: 'profile', name: 'Profile', icon: UserIcon },
    { id: 'security', name: 'Security', icon: ShieldIcon },
    { id: 'appearance', name: 'Appearance', icon: PaletteIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    ...(user?.role === 'super_user' ? [
      { id: 'api', name: 'API Configuration', icon: KeyIcon },
      { id: 'audit', name: 'Audit Logs', icon: FileTextIcon },
      { id: 'users', name: 'User Management', icon: UsersIcon },
      { id: 'branding', name: 'Company Branding', icon: PaletteIcon },
      { id: 'invoices', name: 'Invoice History', icon: DollarSignIcon },
      { id: 'subscription', name: 'Manage Subscription', icon: CreditCardIcon },
    ] : [])
  ]

  // Listen for API configuration ready event from AuthContext
  useEffect(() => {
    const handleApiConfigurationReady = (event: CustomEvent) => {
      console.log('📡 SettingsPage: API configuration ready event received:', event.detail)

      // Force reload settings from localStorage to get the latest API config
      try {
        const savedSettings = localStorage.getItem(`settings_${user.id}`)
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings)
          if (parsedSettings.retellApiKey || parsedSettings.callAgentId || parsedSettings.smsAgentId) {
            console.log('🔄 SettingsPage: Updating API configuration from localStorage')
            setUserSettings(prev => ({
              ...prev,
              retellApiKey: parsedSettings.retellApiKey,
              callAgentId: parsedSettings.callAgentId,
              smsAgentId: parsedSettings.smsAgentId
            }))
          }
        }
      } catch (error) {
        console.warn('Failed to load API config from localStorage:', error)
      }
    }

    window.addEventListener('apiConfigurationReady', handleApiConfigurationReady as EventListener)
    return () => {
      window.removeEventListener('apiConfigurationReady', handleApiConfigurationReady as EventListener)
    }
  }, [user.id])

  // Load settings using robust service on component mount
  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true)
      try {
        // Load user settings with automatic fallback
        console.log('Loading settings with userSettingsService...')
        const settings = await userSettingsService.getUserSettings(user.id)

        if (settings && typeof settings === 'object') {
          console.log('✅ Settings loaded successfully')

          // Check actual MFA status from service
          let actualMFAEnabled = false
          try {
            actualMFAEnabled = await FreshMfaService.hasMFAEnabled(user.id)
            console.log('Actual MFA status from service:', actualMFAEnabled)
          } catch (error) {
            console.warn('Failed to get MFA status from service:', error)
            actualMFAEnabled = user?.mfa_enabled || false
          }

          const loadedSettings = {
            theme: settings.theme || 'light',
            mfaEnabled: actualMFAEnabled,
            refreshInterval: 30000,
            sessionTimeout: settings.security_preferences?.session_timeout || 15,
            notifications: {
              calls: settings.notifications?.call_alerts ?? true,
              sms: settings.notifications?.sms_alerts ?? true,
              system: settings.notifications?.security_alerts ?? true
            },
            retellApiKey: settings.retell_config?.api_key,
            callAgentId: settings.retell_config?.call_agent_id,
            smsAgentId: settings.retell_config?.sms_agent_id
          }
          setUserSettings(loadedSettings)
          // setSyncStatus('loaded')

          // Also save to localStorage for immediate access
          localStorage.setItem(`settings_${user.id}`, JSON.stringify(loadedSettings))

          // Update retell service with loaded credentials using bulletproof system
          if (loadedSettings.retellApiKey || loadedSettings.callAgentId || loadedSettings.smsAgentId) {
            console.log('Initializing retell service with saved credentials')
            retellService.updateCredentials(
              loadedSettings.retellApiKey,
              loadedSettings.callAgentId,
              loadedSettings.smsAgentId
            )
            // Ensure credentials are fully loaded
            retellService.ensureCredentialsLoaded().catch(error => {
              console.warn('Failed to ensure credentials during initialization:', error)
            })
          }

          console.log('Settings loaded and applied successfully')
        } else {
          console.warn('No settings returned from service - using default settings')

          // Try to load from localStorage first
          const localSettings = localStorage.getItem(`settings_${user.id}`)
          if (localSettings) {
            try {
              const parsedLocal = JSON.parse(localSettings)
              console.log('✅ Loaded settings from localStorage fallback')
              setUserSettings(parsedLocal)
              setErrorMessage('Settings loaded from local storage (offline mode)')
              return
            } catch (error) {
              console.warn('Failed to parse localStorage settings:', error)
            }
          }

          // Last resort: use default settings
          console.log('Using default settings as final fallback')
          setErrorMessage('Using default settings - connection may be limited')
          const defaultSettings = {
            theme: 'light',
            mfaEnabled: true, // SECURITY POLICY: MFA is always mandatory
            refreshInterval: 30000,
            sessionTimeout: 15,
            notifications: {
              calls: true,
              sms: true,
              system: true
            }
          }
          setUserSettings(defaultSettings)
          // Save default settings to localStorage
          localStorage.setItem(`settings_${user.id}`, JSON.stringify(defaultSettings))
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        console.log(`Settings loading failed: ${errorMessage}. Attempting localStorage fallback...`)

        // Try localStorage fallback even in error case
        try {
          const localSettings = localStorage.getItem(`settings_${user.id}`)
          if (localSettings) {
            const parsedLocal = JSON.parse(localSettings)
            console.log('✅ Settings recovered from localStorage after error')
            setUserSettings(parsedLocal)
            setErrorMessage(`Settings loaded from cache (service error: ${errorMessage})`)
          } else {
            throw new Error('No localStorage fallback available')
          }
        } catch (fallbackError) {
          console.log('localStorage fallback also failed, using defaults')
          setErrorMessage(`Service error - using defaults: ${errorMessage}`)

          // Final fallback: use default settings
          const errorDefaultSettings = {
            theme: 'light',
            mfaEnabled: true, // SECURITY POLICY: MFA is always mandatory
            refreshInterval: 30000,
            sessionTimeout: 15,
            notifications: {
              calls: true,
              sms: true,
              system: true
            }
          }
          setUserSettings(errorDefaultSettings)
          // Save default settings to localStorage for future fallback
          localStorage.setItem(`settings_${user.id}`, JSON.stringify(errorDefaultSettings))
        }
      } finally {
        setIsLoading(false)

        // Auto-dismiss error message after 10 seconds if it's just an informational message
        if (errorMessage && (errorMessage.includes('cache') || errorMessage.includes('offline mode'))) {
          setTimeout(() => {
            setErrorMessage(null)
          }, 10000)
        }
      }
    }

    loadSettings()

    // Load company logos
    logoService.getLogos().then(logos => {
      setCompanyLogos(logos)
    }).catch(error => {
      console.error('Failed to load company logos:', error)
    })

    // Real-time subscription removed - not available in current userSettingsService


    // Initialize avatar preview from user data if available
    const initializeAvatar = async () => {
      try {
        // Load current avatar
        const avatarUrl = await avatarStorageService.getAvatarUrl(user.id)

        if (avatarUrl && !avatarPreview) {
          setAvatarPreview(avatarUrl)
        }
      } catch (error) {
        console.warn('Failed to initialize avatar:', error)
        // Fallback to user prop avatar
        if (user?.avatar && !avatarPreview) {
          setAvatarPreview(user.avatar)
        }
      }
    }

    initializeAvatar()

    // No cleanup needed - subscription was removed
  }, [user.id, user?.mfa_enabled, user?.avatar])

  const updateSettings = async (newSettings: Partial<LocalUserSettings>) => {
    setSaveStatus('saving')
    setIsLoading(true)
    setErrorMessage(null)

    try {
      const updatedSettings = { ...userSettings, ...newSettings }
      setUserSettings(updatedSettings)

      // Prepare settings for Supabase with proper structure
      const settingsForSupabase: Partial<UserSettings> = {
        theme: updatedSettings.theme as 'light' | 'dark' | 'auto',
        notifications: {
          email: updatedSettings.notifications?.calls ?? true,
          sms: updatedSettings.notifications?.sms ?? true,
          push: true,
          in_app: true,
          call_alerts: updatedSettings.notifications?.calls ?? true,
          sms_alerts: updatedSettings.notifications?.sms ?? true,
          security_alerts: updatedSettings.notifications?.system ?? true
        },
        security_preferences: {
          session_timeout: updatedSettings.sessionTimeout || 15,
          require_mfa: true, // SECURITY POLICY: MFA is always mandatory, never false
          password_expiry_reminder: true,
          login_notifications: true
        }
      }

      // Only include retell_config if we have actual values
      if (updatedSettings.retellApiKey || updatedSettings.callAgentId || updatedSettings.smsAgentId) {
        settingsForSupabase.retell_config = {
          api_key: updatedSettings.retellApiKey,
          call_agent_id: updatedSettings.callAgentId,
          sms_agent_id: updatedSettings.smsAgentId
        }
      }

      // Use robust settings service
      const updatedSettingsFromService = await userSettingsService.updateUserSettings(
        user.id,
        settingsForSupabase
      )

      if (updatedSettingsFromService) {
        console.log('✅ Settings updated successfully')
        setSaveStatus('saved')

        // Save to localStorage for immediate access
        localStorage.setItem(`settings_${user.id}`, JSON.stringify(updatedSettings))
        console.log('💾 Session timeout saved to localStorage:', updatedSettings.sessionTimeout, 'minutes')

        setTimeout(() => setSaveStatus('idle'), 2000)

        // Update retell service if API settings changed using bulletproof system
        if (newSettings.retellApiKey || newSettings.callAgentId || newSettings.smsAgentId) {
          retellService.updateCredentials(
            updatedSettings.retellApiKey,
            updatedSettings.callAgentId,
            updatedSettings.smsAgentId
          )

          // Ensure credentials are fully loaded and persisted
          await retellService.ensureCredentialsLoaded().catch(error => {
            console.warn('Failed to ensure credentials after update:', error)
          })
        }
      } else {
        console.error('❌ Failed to update settings: No data returned from service')
        setSaveStatus('error')
        setErrorMessage('Failed to update settings: Service returned no data')

        setTimeout(() => setSaveStatus('idle'), 3000)
        setTimeout(() => setErrorMessage(null), 5000)
      }
    } catch (error) {
      console.error('❌ Settings update failed:', error)
      setSaveStatus('error')
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setErrorMessage(`Settings update failed: ${errorMessage}`)

      // Try to save to localStorage as backup even if service fails
      try {
        localStorage.setItem(`settings_${user.id}`, JSON.stringify(updatedSettings))
        console.log('💾 Settings saved to localStorage as backup despite service error')
        setErrorMessage(`Settings saved locally (service error: ${errorMessage})`)
      } catch (storageError) {
        console.error('Failed to save to localStorage backup:', storageError)
        setErrorMessage(`Complete save failure: ${errorMessage}`)
      }

      setTimeout(() => setSaveStatus('idle'), 3000)
      setTimeout(() => setErrorMessage(null), 5000)
    } finally {
      setIsLoading(false)
    }
  }

  const handleThemeChange = async (theme: string) => {
    // Apply theme immediately using ThemeManager
    ThemeManager.setTheme(theme as 'light' | 'dark' | 'auto')

    // Save to settings
    await updateSettings({ theme })
  }

  const handleMFAToggle = async (enabled: boolean) => {
    // Update local settings state immediately for UI feedback
    setUserSettings(prev => ({ ...prev, mfaEnabled: enabled }))

    try {
      console.log('🔒 TOTP toggle called:', {
        enabled: enabled ? 'enabling' : 'disabling',
        userId: user.id,
        userEmail: user.email || user.user_metadata?.email,
        showMFASetup: 'handled_by_fresh_mfa_settings'
      })

      if (enabled) {
        console.log('🔍 Checking if TOTP is already enabled...')
        const hasSetup = await FreshMfaService.isMfaEnabled(user.id)
        console.log('🔍 TOTP check result:', hasSetup)

        if (!hasSetup) {
          console.log('🚀 No TOTP setup exists - handled by FreshMfaSettings component')
          return
        } else {
          console.log('✅ TOTP already enabled for user')
        }
      } else {
        console.log('🔒 Attempting to disable TOTP...')
        // Allow TOTP to be disabled
        const disabled = await FreshMfaService.disableMfa(user.id)
        console.log('🔒 TOTP disable result:', disabled)
        if (!disabled) {
          console.error('❌ Failed to disable TOTP')
          // Revert local state since disable failed
          setUserSettings(prev => ({ ...prev, mfaEnabled: true }))
          setErrorMessage('Failed to disable TOTP. Please try again.')
          return
        }
        console.log('✅ TOTP disabled for user')

        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('totpStatusChanged', {
          detail: { userId: user.id, isEnabled: false }
        }))
      }
    } catch (error) {
      console.error('❌ TOTP toggle error:', error)
      // Revert local state since operation failed
      setUserSettings(prev => ({ ...prev, mfaEnabled: !enabled }))
      setErrorMessage('Failed to update TOTP settings. Please try again.')
      return
    }

    setSaveStatus('saving')
    setIsLoading(true)

    try {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Update user data in localStorage
      const userData = { ...user, mfa_enabled: enabled }
      localStorage.setItem('currentUser', JSON.stringify(userData))

      // Update users list if exists
      const storedUsers = localStorage.getItem('systemUsers')
      if (storedUsers) {
        try {
          const users = JSON.parse(storedUsers)
          const updatedUsers = users.map((u: any) =>
            u.id === user.id ? { ...u, mfa_enabled: enabled } : u
          )
          localStorage.setItem('systemUsers', JSON.stringify(updatedUsers))
        } catch (error) {
          console.error('Failed to update users list:', error)
        }
      }

      // Update local settings state immediately for UI toggle
      setUserSettings(prev => ({ ...prev, mfaEnabled: enabled }))

      // Save to localStorage
      const updatedSettings = { ...userSettings, mfaEnabled: enabled }
      localStorage.setItem(`settings_${user.id}`, JSON.stringify(updatedSettings))

      // Force another state update to ensure toggle reflects the change
      setTimeout(() => {
        setUserSettings(prev => ({ ...prev, mfaEnabled: enabled }))
      }, 100)

      // Dispatch events to trigger TOTP status hook refresh (fixes toggle visual state)
      window.dispatchEvent(new CustomEvent('totpStatusChanged'))
      window.dispatchEvent(new CustomEvent('userSettingsUpdated'))

      console.log(`MFA toggle updated: ${enabled ? 'ENABLED' : 'DISABLED'}. Toggle should now be ${enabled ? 'green' : 'gray'}.`)

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)

      // No longer auto-refresh - allow user to manually refresh if needed
      console.log('✅ MFA toggle completed successfully without page refresh')
    } catch (error) {
      console.error('Failed to update MFA setting:', error)
      setSaveStatus('idle')
    } finally {
      setIsLoading(false)
    }
  }

  // Fresh MFA setup completion is handled by FreshMfaSetup component itself


  const handleSessionTimeoutChange = async (timeout: number) => {
    console.log('🔄 SettingsPage: Updating session timeout to:', timeout, 'minutes')

    await updateSettings({ sessionTimeout: timeout })

    // Add a small delay to ensure localStorage is updated
    setTimeout(() => {
      console.log('🔄 SettingsPage: Dispatching userSettingsUpdated event')
      // Dispatch custom event to notify App.tsx of session timeout change
      window.dispatchEvent(new CustomEvent('userSettingsUpdated', {
        detail: { sessionTimeout: timeout }
      }))
    }, 50)
  }


  const loadAuditLogs = async () => {
    setIsLoadingAudit(true)
    try {
      const auditReport = await auditLogger.getAuditLogs({
        limit: 50,
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
      })
      setAuditLogs(auditReport.entries)
    } catch (error) {
      console.error('Failed to load audit logs:', error)
    } finally {
      setIsLoadingAudit(false)
    }
  }

  const downloadAuditLogs = async () => {
    try {
      const auditData = await auditLogger.exportAuditLogs({
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        limit: 1000
      }, 'json')

      const blob = new Blob([auditData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download audit logs:', error)
      generalToast.error('Failed to download audit logs. Please try again.', 'Download Failed')
    }
  }

  // Load audit logs when audit tab is accessed (Super Users only)
  useEffect(() => {
    if (activeTab === 'audit' && user?.role === 'super_user') {
      loadAuditLogs()
    }
  }, [activeTab, user?.role])

  // Apply theme when settings are initially loaded (once)
  // Theme is handled by ThemeManager initialization and navigation logic in App.tsx
  // Removed problematic useEffect that was resetting theme on mount

  const handleNotificationChange = async (type: string, enabled: boolean) => {
    const updatedNotifications = {
      ...userSettings?.notifications,
      [type]: enabled
    }
    await updateSettings({ notifications: updatedNotifications })
  }

  const handleToastPreferenceChange = async (key: keyof ToastNotificationPreferences, value: any) => {
    const newPreferences = { ...toastPreferences, [key]: value }
    setToastPreferences(newPreferences)
    await toastNotificationService.updatePreferences(user.id, { [key]: value })
  }

  const handleDoNotDisturbChange = async (key: keyof ToastNotificationPreferences['doNotDisturb'], value: any) => {
    const newDndSettings = { ...toastPreferences.doNotDisturb, [key]: value }
    const newPreferences = { ...toastPreferences, doNotDisturb: newDndSettings }
    setToastPreferences(newPreferences)
    await toastNotificationService.updatePreferences(user.id, { doNotDisturb: newDndSettings })
  }

  // Test function to trigger demo toast notifications
  const handleTestToastNotification = (type: 'call' | 'sms') => {
    console.log('🧪 Triggering test toast notification:', type)

    // Use the toast service's public test method
    toastNotificationService.triggerTestNotification(type)
  }

  // Helper function to test Supabase connectivity
  const testSupabaseConnection = async () => {
    try {
      console.log('Testing Supabase connection...')
      const testSettings = await userSettingsService.getUserSettings(user.id)

      if (testSettings) {
        console.log('✅ Supabase connection successful')
        return true
      } else {
        console.error('❌ Supabase connection failed: No settings returned')
        setErrorMessage('Database connection failed: No data returned')
        return false
      }
    } catch (error) {
      console.error('❌ Supabase connection error:', error)
      setErrorMessage(`Database connection error: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        generalToast.warning('File size must be less than 5MB', 'File Too Large')
        return
      }

      if (!file.type.startsWith('image/')) {
        generalToast.warning('Please select an image file', 'Invalid File Type')
        return
      }

      setAvatarFile(file)

      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleAvatarUpload = async () => {
    if (!avatarFile || !avatarPreview) {
      console.warn('Avatar upload called but no file or preview available')
      return
    }

    setSaveStatus('saving')
    setIsLoading(true)

    try {
      console.log('Uploading avatar for user:', user.id)
      console.log('Avatar preview type:', typeof avatarPreview)
      console.log('Avatar file type:', avatarFile.type, 'Size:', avatarFile.size)

      // Use the file directly instead of the preview for better reliability
      const result = await avatarStorageService.uploadAvatar(user.id, avatarFile)

      if (result.status === 'error') {
        throw new Error(result.error)
      }

      console.log('Avatar uploaded successfully:', result.data)

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)

      // Update avatar preview with the new URL
      if (result.data) {
        setAvatarPreview(result.data)
        console.log('Avatar preview updated to:', result.data)
      }

      // Reset file input now that upload is complete
      setAvatarFile(null)

      console.log('Avatar upload completed successfully')

      // Trigger custom events to notify other components
      window.dispatchEvent(new Event('userDataUpdated'))
      window.dispatchEvent(new CustomEvent('avatarUpdated', {
        detail: { userId: user.id, avatarUrl: result.data }
      }))

    } catch (error) {
      console.error('Failed to upload avatar:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Avatar upload error details:', errorMessage)
      generalToast.error(`Failed to upload avatar: ${errorMessage}`, 'Upload Failed')
    } finally {
      setIsLoading(false)
    }
  }

  const removeAvatar = async () => {
    setSaveStatus('saving')
    setIsLoading(true)

    try {
      console.log('Removing avatar')

      // Use the robust avatar storage service
      const result = await avatarStorageService.removeAvatar(user.id)

      if (result.status === 'error') {
        throw new Error(result.error)
      }

      console.log('Avatar removed successfully')

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      setAvatarPreview(null)

      console.log('Avatar removal completed successfully')

      // Trigger custom event to notify App.tsx of user data change
      window.dispatchEvent(new Event('userDataUpdated'))

    } catch (error) {
      console.error('Failed to remove avatar:', error)
      setSaveStatus('idle')
      generalToast.error(`Failed to remove avatar: ${error instanceof Error ? error.message : 'Unknown error'}`, 'Removal Failed')
    } finally {
      setIsLoading(false)
    }
  }

  const saveFullName = async () => {
    if (!fullName.trim()) {
      generalToast.warning('Please enter a valid name', 'Invalid Name')
      return
    }

    setIsSavingName(true)
    setSaveStatus('saving')

    try {
      console.log('Saving full name update for user:', user.id, 'New name:', fullName.trim())

      // Update user profile with the new name
      const result = await userProfileService.updateUserProfile(user.id, {
        name: fullName.trim()
      })

      if (result.status === 'error') {
        throw new Error(result.error || 'Failed to update profile')
      }

      console.log('Profile service update successful')

      // Update localStorage currentUser
      const currentUser = localStorage.getItem('currentUser')
      if (currentUser) {
        try {
          const userData = JSON.parse(currentUser)
          if (userData.id === user.id) {
            userData.name = fullName.trim()
            userData.updated_at = new Date().toISOString()
            localStorage.setItem('currentUser', JSON.stringify(userData))
            console.log('Updated currentUser with new name')
          }
        } catch (parseError) {
          console.warn('Failed to update currentUser:', parseError)
        }
      }

      // Update systemUsers in localStorage
      const systemUsers = localStorage.getItem('systemUsers')
      if (systemUsers) {
        try {
          const users = JSON.parse(systemUsers)
          const userIndex = users.findIndex((u: any) => u.id === user.id)
          if (userIndex >= 0) {
            users[userIndex].name = fullName.trim()
            users[userIndex].updated_at = new Date().toISOString()
            localStorage.setItem('systemUsers', JSON.stringify(users))
            console.log('Updated systemUsers with new name')
          }
        } catch (parseError) {
          console.warn('Failed to update systemUsers:', parseError)
        }
      }

      // Update individual user profile storage
      const userProfile = localStorage.getItem(`userProfile_${user.id}`)
      if (userProfile) {
        try {
          const profile = JSON.parse(userProfile)
          profile.name = fullName.trim()
          profile.updated_at = new Date().toISOString()
          localStorage.setItem(`userProfile_${user.id}`, JSON.stringify(profile))
          console.log('Updated individual user profile with new name')
        } catch (parseError) {
          console.warn('Failed to update user profile:', parseError)
        }
      }

      console.log('Full name updated successfully across all storage locations')
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
      setIsEditingName(false)

      // Trigger multiple custom events to ensure all components are notified
      window.dispatchEvent(new Event('userDataUpdated'))
      window.dispatchEvent(new CustomEvent('userProfileUpdated', {
        detail: { userId: user.id, name: fullName.trim() }
      }))
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'currentUser',
        newValue: JSON.stringify({...user, name: fullName.trim(), updated_at: new Date().toISOString()}),
        storageArea: localStorage
      }))

      // Show success message briefly
      setTimeout(() => {
        console.log('Name change completed successfully')
      }, 100)

    } catch (error) {
      console.error('Failed to save full name:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 3000)

      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Name save error details:', errorMessage)
      generalToast.error(`Failed to save name: ${errorMessage}`, 'Save Failed')
    } finally {
      setIsSavingName(false)
    }
  }

  const cancelEditName = () => {
    setFullName(user?.name || '')
    setIsEditingName(false)
  }

  // Logo upload handlers
  const handleLogoUpload = async (file: File, type: 'header' | 'favicon') => {
    if (!file) return

    setLogoUploadStatus('uploading')

    try {
      // Upload the logo
      const url = await logoService.uploadLogoWithFallback(file, type)

      if (!url) {
        throw new Error('Failed to upload logo')
      }

      // Update logos configuration
      const updatedLogos = { ...companyLogos }

      switch (type) {
        case 'header':
          updatedLogos.headerLogo = url
          break
        case 'favicon':
          updatedLogos.favicon = url
          break
      }

      // Save to service
      const saved = await logoService.saveLogos(updatedLogos)

      if (saved) {
        setCompanyLogos(updatedLogos)
        setLogoUploadStatus('success')

        // Dispatch custom event to update logo across all components without page reload
        window.dispatchEvent(new Event('logoUpdated'))

        generalToast.success('Logo uploaded successfully', 'Upload Complete')
      } else {
        throw new Error('Failed to save logo configuration')
      }
    } catch (error) {
      console.error('Logo upload failed:', error)
      setLogoUploadStatus('error')
      generalToast.error(`Failed to upload logo: ${error instanceof Error ? error.message : 'Unknown error'}`, 'Upload Failed')
    } finally {
      setTimeout(() => setLogoUploadStatus('idle'), 3000)
    }
  }

  const handleLogoDelete = async (type: 'header' | 'favicon') => {
    console.log(`🗑️ SettingsPage: Delete ${type} logo button clicked`)

    try {
      console.log(`📡 SettingsPage: Calling logoService.deleteLogo('${type}')`)
      const deleted = await logoService.deleteLogo(type)
      console.log(`📊 SettingsPage: Delete result:`, deleted)

      if (deleted) {
        console.log(`🔄 SettingsPage: Clearing cache and fetching fresh logos`)

        // Force cache clear before fetching
        logoService.clearCache()

        // Get fresh logos from Supabase
        const updatedLogos = await logoService.getLogos()
        console.log(`📦 SettingsPage: Updated logos received:`, {
          headerLogo: updatedLogos.headerLogo ? `${updatedLogos.headerLogo.substring(0, 50)}...` : 'EMPTY',
          favicon: updatedLogos.favicon ? `${updatedLogos.favicon.substring(0, 50)}...` : 'EMPTY'
        })

        // Update state
        setCompanyLogos(updatedLogos)
        console.log(`✅ SettingsPage: State updated with new logos`)

        // Dispatch custom event to update logo across all components without page reload
        window.dispatchEvent(new Event('logoUpdated'))
        console.log(`📢 SettingsPage: logoUpdated event dispatched`)

        generalToast.success(`${type === 'header' ? 'Header logo' : 'Favicon'} removed successfully`, 'Removal Complete')
      } else {
        console.error(`❌ SettingsPage: Delete failed - service returned false`)
        generalToast.error('Failed to delete logo', 'Deletion Failed')
      }
    } catch (error) {
      console.error('❌ SettingsPage: Delete error:', error)
      generalToast.error(`Failed to delete logo: ${error instanceof Error ? error.message : 'Unknown error'}`, 'Deletion Failed')
    }
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600" />
            Settings
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-300 mt-1">
            Manage your account preferences and security settings
          </p>
        </div>

        {/* Save Status Indicator */}
        <div className="flex flex-col items-start sm:items-end gap-2">
          {saveStatus !== 'idle' && (
            <div className="flex items-center gap-2">
              {saveStatus === 'saving' ? (
                <>
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">Saving...</span>
                </>
              ) : saveStatus === 'saved' ? (
                <>
                  <CheckIcon className="w-4 h-4 text-green-600" />
                  <span className="text-xs sm:text-sm text-green-600">Saved</span>
                </>
              ) : saveStatus === 'error' ? (
                <>
                  <AlertTriangleIcon className="w-4 h-4 text-red-600" />
                  <span className="text-xs sm:text-sm text-red-600">Error</span>
                </>
              ) : null}
            </div>
          )}

        </div>
      </div>

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3 sm:p-4 flex items-start gap-3">
          <AlertTriangleIcon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div className="flex-1">
            <h4 className="text-xs sm:text-sm font-medium text-red-800 dark:text-red-200">
              Settings Error
            </h4>
            <p className="text-xs sm:text-sm mt-1 text-red-700 dark:text-red-300">
              {errorMessage}
            </p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="p-1 hover:opacity-75 text-red-600 dark:text-red-400 min-h-[44px] min-w-[44px] flex items-center justify-center sm:min-h-auto sm:min-w-auto"
          >
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Settings Navigation */}
        <div className="lg:col-span-1">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-0">
            <nav className="space-y-0 sm:space-y-1">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 text-left transition-colors first:rounded-t-lg last:rounded-b-lg min-h-[44px] ${
                      activeTab === tab.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-r-2 border-blue-500 dark:border-blue-400'
                        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100">{tab.name}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        </div>

        {/* Settings Content */}
        <div className="lg:col-span-3">
          {/* Profile Settings */}
          {activeTab === 'profile' && (
            <EnhancedProfileSettings user={user} />
          )}

          {/* API Configuration - Super User Only */}
          {activeTab === 'api' && user?.role === 'super_user' && (
            <ApiKeyErrorBoundary>
              <EnhancedApiKeyManager user={user} />
            </ApiKeyErrorBoundary>
          )}
          {activeTab === 'api' && user?.role !== 'super_user' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">Access Denied</h3>
              </div>
              <p className="text-red-800 dark:text-red-200">
                Only Super Users can access API Configuration. Please contact your system administrator.
              </p>
            </div>
          )}

          {/* Security Settings */}
          {activeTab === 'security' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Security Settings
              </h2>

              <div className="space-y-4 sm:space-y-6">
                {/* Enhanced MFA Settings */}
                <FreshMfaSettings
                  userId={user.id}
                  userEmail={user.email || user.user_metadata?.email || 'user@medex.com'}
                  onSetupMfa={() => {
                    // FreshMfaSettings handles MFA setup internally via modal
                    console.log('🔒 MFA setup requested via FreshMfaSettings modal')
                  }}
                />

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100">Session Timeout</h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                      Automatically log out after inactivity (required)
                    </p>
                  </div>
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <select
                      value={userSettings?.sessionTimeout || 15}
                      onChange={(e) => handleSessionTimeoutChange(Number(e.target.value))}
                      className="w-full sm:w-auto px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    >
                      <option value={5}>5 minutes</option>
                      <option value={10}>10 minutes</option>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">Active</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100">Data Encryption</h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                      All data is encrypted with AES-256 encryption
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-600">Active</span>
                  </div>
                </div>
              </div>
            </div>
          )}



          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Notification Preferences
              </h2>

              <div className="space-y-4 sm:space-y-6">
                {/* Email Notifications - Now Active */}
                <EmailNotificationSettings user={user} />

                {/* Toast Notifications Section */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Toast Notifications</h3>

                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100">Real-time Toasts</h4>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                          Show popup notifications for new calls and SMS messages
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={toastPreferences.enabled}
                          onChange={(e) => handleToastPreferenceChange('enabled', e.target.checked)}
                          disabled={isLoading}
                          className="sr-only peer"
                        />
                        <div className={`w-11 h-6 ${toastPreferences.enabled ? 'bg-green-600' : 'bg-gray-200'} peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${toastPreferences.enabled ? 'after:translate-x-full after:border-white' : ''} dark:border-gray-600`}></div>
                      </label>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100">Sound Effects</h4>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                          Play gentle sound with toast notifications
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={toastPreferences.soundEnabled && toastPreferences.enabled}
                          onChange={(e) => handleToastPreferenceChange('soundEnabled', e.target.checked)}
                          disabled={isLoading || !toastPreferences.enabled}
                          className="sr-only peer"
                        />
                        <div className={`w-11 h-6 ${toastPreferences.soundEnabled && toastPreferences.enabled ? 'bg-green-600' : 'bg-gray-200'} ${!toastPreferences.enabled ? 'opacity-50' : ''} peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${toastPreferences.soundEnabled && toastPreferences.enabled ? 'after:translate-x-full after:border-white' : ''} dark:border-gray-600`}></div>
                      </label>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <h4 className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100">Do Not Disturb</h4>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                          Silence notifications during specific hours
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={toastPreferences.doNotDisturb.enabled && toastPreferences.enabled}
                          onChange={(e) => handleDoNotDisturbChange('enabled', e.target.checked)}
                          disabled={isLoading || !toastPreferences.enabled}
                          className="sr-only peer"
                        />
                        <div className={`w-11 h-6 ${toastPreferences.doNotDisturb.enabled && toastPreferences.enabled ? 'bg-green-600' : 'bg-gray-200'} ${!toastPreferences.enabled ? 'opacity-50' : ''} peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${toastPreferences.doNotDisturb.enabled && toastPreferences.enabled ? 'after:translate-x-full after:border-white' : ''} dark:border-gray-600`}></div>
                      </label>
                    </div>

                    {toastPreferences.doNotDisturb.enabled && toastPreferences.enabled && (
                      <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 sm:p-4 space-y-3">
                        <h5 className="text-xs sm:text-sm font-medium text-gray-900 dark:text-gray-100">Quiet Hours</h5>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Start Time
                            </label>
                            <input
                              type="time"
                              value={toastPreferences.doNotDisturb.startTime}
                              onChange={(e) => handleDoNotDisturbChange('startTime', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-h-[44px]"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                              End Time
                            </label>
                            <input
                              type="time"
                              value={toastPreferences.doNotDisturb.endTime}
                              onChange={(e) => handleDoNotDisturbChange('endTime', e.target.value)}
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 min-h-[44px]"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Notifications will be silenced between these hours (overnight periods supported)
                        </p>
                      </div>
                    )}

                    {/* Test Buttons Section */}
                    <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 sm:p-4 border border-blue-200 dark:border-blue-800">
                      <h4 className="text-sm sm:text-base font-medium text-blue-900 dark:text-blue-100 mb-3">Test Toast Notifications</h4>
                      <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-300 mb-4">
                        Click the buttons below to see what the toast notifications look like
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => handleTestToastNotification('call')}
                          disabled={!toastPreferences.enabled}
                          className="w-full sm:w-auto px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px] text-sm"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                          </svg>
                          Test Call Toast
                        </button>
                        <button
                          onClick={() => handleTestToastNotification('sms')}
                          disabled={!toastPreferences.enabled}
                          className="w-full sm:w-auto px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-h-[44px] text-sm"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                          </svg>
                          Test SMS Toast
                        </button>
                      </div>
                      {!toastPreferences.enabled && (
                        <p className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 mt-2">
                          Enable "Real-time Toasts" above to test notifications
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Appearance */}
          {activeTab === 'appearance' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Appearance Settings
              </h2>

              <div className="space-y-4 sm:space-y-6">
                <div>
                  <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100 mb-3">Theme</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      onClick={() => handleThemeChange('light')}
                      disabled={isLoading}
                      className={`flex flex-col items-center gap-2 p-3 sm:p-4 border-2 rounded-lg transition-colors min-h-[44px] ${
                        userSettings?.theme === 'light'
                          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <SunIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                      <span className="text-xs sm:text-sm font-medium">Light</span>
                    </button>

                    <button
                      onClick={() => handleThemeChange('dark')}
                      disabled={isLoading}
                      className={`flex flex-col items-center gap-2 p-3 sm:p-4 border-2 rounded-lg transition-colors min-h-[44px] ${
                        userSettings?.theme === 'dark'
                          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <MoonIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                      <span className="text-xs sm:text-sm font-medium">Dark</span>
                    </button>

                    <button
                      onClick={() => handleThemeChange('auto')}
                      disabled={isLoading}
                      className={`flex flex-col items-center gap-2 p-3 sm:p-4 border-2 rounded-lg transition-colors min-h-[44px] ${
                        userSettings?.theme === 'auto'
                          ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <MonitorIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                      <span className="text-xs sm:text-sm font-medium">Auto</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 text-xs sm:text-sm text-green-600">
                    <SmartphoneIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span>Settings automatically sync to the cloud</span>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    • Automatic sync when online
                    • Offline mode with sync when connected
                    • Conflict resolution for concurrent changes
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* User Management - Super Users Only */}
          {activeTab === 'users' && user?.role === 'super_user' && (
            <SimpleUserManager user={user} />
          )}

          {/* Company Branding - Super Users Only */}
          {activeTab === 'branding' && user?.role === 'super_user' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Company Branding
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-4">
                As a super user, you can customize the company logos. Changes will be visible to all users across all profiles.
              </p>

              <div className="space-y-4 sm:space-y-6">
                {/* Header Logo */}
                <div className="border-b border-gray-200 dark:border-gray-700 pb-4 sm:pb-6">
                  <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100 mb-4">Header Logo</h3>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {companyLogos.headerLogo && companyLogos.headerLogo.trim() !== '' && (
                      <img
                        src={companyLogos.headerLogo}
                        alt="Header Logo"
                        className="h-12 w-auto object-contain border border-gray-300 dark:border-gray-600 rounded p-2"
                      />
                    )}
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <label className="w-full sm:w-auto px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer text-center min-h-[44px] flex items-center justify-center text-sm">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleLogoUpload(file, 'header')
                          }}
                          className="hidden"
                        />
                        Upload Logo
                      </label>
                      {companyLogos.headerLogo && companyLogos.headerLogo.trim() !== '' && (
                        <button
                          onClick={() => handleLogoDelete('header')}
                          className="w-full sm:w-auto px-4 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 min-h-[44px] flex items-center justify-center text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>


                {/* Favicon */}
                <div className="pb-4 sm:pb-6">
                  <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100 mb-4">Favicon</h3>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                    {companyLogos.favicon && companyLogos.favicon.trim() !== '' && companyLogos.favicon !== '/favicon.png' && (
                      <img
                        src={companyLogos.favicon}
                        alt="Favicon"
                        className="h-8 w-8 object-contain border border-gray-300 dark:border-gray-600 rounded p-1"
                      />
                    )}
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <label className="w-full sm:w-auto px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer text-center min-h-[44px] flex items-center justify-center text-sm">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleLogoUpload(file, 'favicon')
                          }}
                          className="hidden"
                        />
                        Upload Favicon
                      </label>
                      {companyLogos.favicon && companyLogos.favicon.trim() !== '' && companyLogos.favicon !== '/favicon.png' && (
                        <button
                          onClick={() => handleLogoDelete('favicon')}
                          className="w-full sm:w-auto px-4 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 min-h-[44px] flex items-center justify-center text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-2">
                    Recommended size: 32x32 or 64x64 pixels
                  </p>
                </div>

                {/* Upload Status */}
                {logoUploadStatus !== 'idle' && (
                  <div className={`p-3 sm:p-4 rounded-lg text-sm ${
                    logoUploadStatus === 'uploading' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' :
                    logoUploadStatus === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400' :
                    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                  }`}>
                    {logoUploadStatus === 'uploading' && 'Uploading logo...'}
                    {logoUploadStatus === 'success' && 'Logo uploaded successfully!'}
                    {logoUploadStatus === 'error' && 'Failed to upload logo. Please try again.'}
                  </div>
                )}

                {/* Info */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 sm:p-4 rounded-lg">
                  <h4 className="text-sm sm:text-base font-medium text-blue-900 dark:text-blue-100 mb-2">
                    About Company Branding (Super User Only)
                  </h4>
                  <div className="text-xs sm:text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <p>• Only super users can upload or modify company logos</p>
                    <p>• Logos are visible to ALL users across ALL profiles</p>
                    <p>• Changes are synchronized across all devices instantly</p>
                    <p>• Logos update automatically without page reload</p>
                    <p>• Footer logos are permanent and cannot be changed</p>
                    <p>• Supported formats: PNG, JPG, SVG (Max: 5MB)</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Invoice History - Super User Only */}
          {activeTab === 'invoices' && user?.role === 'super_user' && (
            <InvoiceHistorySettings />
          )}

          {/* Manage Subscription - Super Users Only */}
          {activeTab === 'subscription' && user?.role === 'super_user' && (
            <div className="space-y-6">
              {/* Header */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Manage Subscription</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  View and manage your Stripe billing and subscription details
                </p>
              </div>

              {/* Subscription Card */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <CreditCardIcon className="w-8 h-8 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                      Stripe Customer Portal
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                      Access your Stripe billing portal to view invoices, update payment methods, and manage your subscription.
                    </p>
                    <a
                      href="https://billing.stripe.com/p/login/8x2eVe0fp1lpg7v5Cl9AA00"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm hover:shadow-md"
                    >
                      <CreditCardIcon className="w-5 h-5" />
                      Open Billing Portal
                      <LinkIcon className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                {/* Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <div className="text-xs text-blue-700 dark:text-blue-300 font-semibold mb-1">
                      What You Can Do
                    </div>
                    <ul className="text-sm text-blue-900 dark:text-blue-100 space-y-1">
                      <li className="flex items-start gap-2">
                        <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>View all invoices</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>Download receipts</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>Update payment method</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                    <div className="text-xs text-purple-700 dark:text-purple-300 font-semibold mb-1">
                      Subscription Details
                    </div>
                    <ul className="text-sm text-purple-900 dark:text-purple-100 space-y-1">
                      <li className="flex items-start gap-2">
                        <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>View current plan</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>Update subscription</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>Cancel anytime</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                    <div className="text-xs text-green-700 dark:text-green-300 font-semibold mb-1">
                      Secure & Private
                    </div>
                    <ul className="text-sm text-green-900 dark:text-green-100 space-y-1">
                      <li className="flex items-start gap-2">
                        <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>256-bit SSL encryption</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>PCI compliant</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>Powered by Stripe</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Help Text */}
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <strong>Note:</strong> The Stripe Customer Portal is a secure way to manage your billing information.
                  All payment processing is handled by Stripe, our trusted payment provider. Your payment information is never stored on our servers.
                </p>
              </div>
            </div>
          )}

          {/* Audit Logs - Super User Only */}
          {activeTab === 'audit' && user?.role === 'super_user' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Audit Logs
                </h2>
                <button
                  onClick={downloadAuditLogs}
                  disabled={isLoadingAudit}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 min-h-[44px] text-sm"
                >
                  <DownloadIcon className="w-4 h-4" />
                  Download Logs
                </button>
              </div>

              <div className="mb-4">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                  Complete audit trail of all system access and PHI data operations.
                  Required for compliance and security monitoring.
                </p>
              </div>

              {isLoadingAudit ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span className="ml-2 text-gray-600 dark:text-gray-300">Loading audit logs...</span>
                </div>
              ) : auditLogs.length > 0 ? (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-900 dark:text-gray-100">Timestamp</th>
                          <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-900 dark:text-gray-100">User</th>
                          <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-900 dark:text-gray-100">Action</th>
                          <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-900 dark:text-gray-100">Resource</th>
                          <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-900 dark:text-gray-100">PHI</th>
                          <th className="text-left py-2 px-2 sm:px-3 font-medium text-gray-900 dark:text-gray-100">Outcome</th>
                        </tr>
                      </thead>
                      <tbody>
                        {auditLogs.slice(0, 20).map((log, index) => (
                          <tr key={index} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="py-2 px-2 sm:px-3 text-gray-900 dark:text-gray-100">
                              {new Date(log.timestamp).toLocaleString()}
                            </td>
                            <td className="py-2 px-2 sm:px-3 text-gray-900 dark:text-gray-100">
                              {log.user_name}
                            </td>
                            <td className="py-2 px-2 sm:px-3">
                              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                                {log.action}
                              </span>
                            </td>
                            <td className="py-2 px-2 sm:px-3 text-gray-900 dark:text-gray-100">
                              {log.resource_type}
                            </td>
                            <td className="py-2 px-2 sm:px-3">
                              {log.phi_accessed ? (
                                <span className="flex items-center gap-1 text-orange-600">
                                  <AlertTriangleIcon className="w-3 h-3" />
                                  Yes
                                </span>
                              ) : (
                                <span className="text-gray-500 dark:text-gray-400">No</span>
                              )}
                            </td>
                            <td className="py-2 px-2 sm:px-3">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                log.outcome === 'SUCCESS'
                                  ? 'bg-green-100 text-green-800'
                                  : log.outcome === 'FAILURE'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {log.outcome}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {auditLogs.length > 20 && (
                    <div className="text-center py-4 border-t border-gray-200 dark:border-gray-700">
                      <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                        Showing first 20 entries. Download complete logs for full history.
                      </p>
                    </div>
                  )}

                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 sm:p-4">
                    <h4 className="text-sm sm:text-base font-medium text-blue-900 dark:text-blue-100 mb-2">Audit Log Information</h4>
                    <ul className="text-xs sm:text-sm text-blue-800 dark:text-blue-300 space-y-1">
                      <li>• All PHI access is logged and encrypted</li>
                      <li>• Logs are retained for 6+ years per requirements</li>
                      <li>• Failed access attempts are automatically flagged</li>
                      <li>• Regular compliance reports are generated</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileTextIcon className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">No audit logs available</p>
                  <p className="text-xs sm:text-sm text-gray-400 dark:text-gray-500 mt-1">
                    Audit logging will begin when users start accessing the system
                  </p>
                </div>
              )}
            </div>
          )}
          {activeTab === 'audit' && user?.role !== 'super_user' && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-2">
                <AlertTriangleIcon className="w-6 h-6 text-red-600 dark:text-red-400" />
                <h3 className="text-lg font-semibold text-red-900 dark:text-red-100">Access Denied</h3>
              </div>
              <p className="text-red-800 dark:text-red-200">
                Only Super Users can access Audit Logs. Please contact your system administrator.
              </p>
            </div>
          )}


        </div>
      </div>



      {/* Site Help Chatbot */}
      <SiteHelpChatbot
        isVisible={isChatbotVisible}
        onToggle={() => setIsChatbotVisible(!isChatbotVisible)}
      />
    </div>
  )
}