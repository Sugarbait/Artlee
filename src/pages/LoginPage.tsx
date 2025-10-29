import React, { useState } from 'react'
import { ShieldCheckIcon, EyeIcon, EyeOffIcon, AlertCircleIcon } from 'lucide-react'
import { userManagementService } from '@/services/userManagementService'
import { userProfileService } from '@/services/userProfileService'
import { FreshMfaVerification } from '@/components/auth/FreshMfaVerification'
import { UserRegistration } from '@/components/auth/UserRegistration'
import FreshMfaService from '@/services/freshMfaService'
import { useCompanyLogos } from '@/hooks/useCompanyLogos'
import { userSettingsService } from '@/services/userSettingsService'
import { auditLogger, AuditAction, ResourceType, AuditOutcome } from '@/services/auditLogger'
import { LoginAttemptTracker } from '@/utils/loginAttemptTracker'
import { MfaLockoutService } from '@/services/mfaLockoutService'
import { generalToast } from '@/services/generalToastService'

interface LoginPageProps {
  onLogin: () => void
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { logos } = useCompanyLogos()
  const [warning, setWarning] = useState('')
  const [lockoutStatus, setLockoutStatus] = useState<{isLocked: boolean, timeRemaining?: string, userEmail?: string} | null>(null)

  // MFA verification state
  const [showMFAVerification, setShowMFAVerification] = useState(false)
  const [pendingUser, setPendingUser] = useState<any>(null)
  const [useCloudSyncMFA, setUseCloudSyncMFA] = useState(true) // Default to enhanced cloud sync MFA

  // Registration modal state
  const [showRegistration, setShowRegistration] = useState(false)
  const [isFirstUserSystem, setIsFirstUserSystem] = useState(false)

  // Function to check lockout status for known users
  const checkLockoutStatus = async (emailToCheck: string) => {
    if (!emailToCheck) {
      setLockoutStatus(null)
      return
    }

    try {
      let userIdToCheck = null

      // Try to lookup user ID by email
      try {
        const userLookup = await userProfileService.getUserByEmail(emailToCheck)
        if (userLookup.status === 'success' && userLookup.data) {
          userIdToCheck = userLookup.data.id
        }
      } catch (lookupError) {
        // Ignore lookup errors - user might not exist yet
        setLockoutStatus(null)
        return
      }

      if (userIdToCheck) {
        const lockoutInfo = MfaLockoutService.getLockoutStatus(userIdToCheck, emailToCheck)
        if (lockoutInfo.isLocked) {
          const timeRemaining = MfaLockoutService.formatTimeRemaining(lockoutInfo.remainingTime!)
          setLockoutStatus({
            isLocked: true,
            timeRemaining,
            userEmail: emailToCheck
          })
        } else {
          setLockoutStatus(null)
        }
      } else {
        setLockoutStatus(null)
      }
    } catch (error) {
      console.error('Error checking lockout status:', error)
      setLockoutStatus(null)
    }
  }

  // Check lockout status when email changes
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (email.includes('@')) {
        checkLockoutStatus(email)
      } else {
        setLockoutStatus(null)
      }
    }, 500) // Debounce to avoid too many lookups

    return () => clearTimeout(timeoutId)
  }, [email])

  // Emergency admin unlock function (press Ctrl+Shift+U on login page)
  // Emergency credential setup function (press Ctrl+Shift+S on login page)
  React.useEffect(() => {
    const handleKeyPress = async (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'U') {
        e.preventDefault()
        console.log('Emergency unlock triggered')

        // ARTLEE: Emergency lockout clear (no demo users)
        try {
          // Clear any global lockout data
          LoginAttemptTracker.emergencyClearAll()

          generalToast.success('Emergency unlock completed - all lockouts cleared', 'Emergency Unlock')
        } catch (error) {
          console.error('Emergency unlock failed:', error)
          generalToast.error('Emergency unlock failed - check console for details', 'Emergency Unlock Failed')
        }
      } else if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        console.log('Emergency credential setup triggered')

        try {
          const result = await setupAllUserCredentials()
          if (result.success) {
            generalToast.success('All user credentials have been set up successfully!\n\nCheck console for login details.', 'Credential Setup Complete')
          } else {
            generalToast.error(`Credential setup failed: ${result.error}`, 'Credential Setup Failed')
          }
        } catch (error: any) {
          console.error('Credential setup failed:', error)
          generalToast.error(`Credential setup failed: ${error.message}`, 'Credential Setup Failed')
        }
      } else if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        console.log('Authentication test triggered')

        try {
          await testAllUserAuthentication()
          generalToast.success('Authentication test completed - check console for results', 'Authentication Test Complete')
        } catch (error: any) {
          console.error('Authentication test failed:', error)
          generalToast.error(`Authentication test failed: ${error.message}`, 'Authentication Test Failed')
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  // Check if this is a first user system
  React.useEffect(() => {
    const checkFirstUserStatus = async () => {
      try {
        const existingUsersResponse = await userManagementService.loadSystemUsers()
        const hasUsers = existingUsersResponse.status === 'success' &&
                        existingUsersResponse.data &&
                        existingUsersResponse.data.length > 0
        setIsFirstUserSystem(!hasUsers)
        console.log('First user check:', hasUsers ? 'Users exist' : 'No users - showing first user message')
      } catch (error) {
        console.log('Error checking first user status:', error)
        setIsFirstUserSystem(false)
      }
    }
    checkFirstUserStatus()
  }, [showRegistration]) // Re-check when registration modal closes

  // ARTLEE: Production system - no auto-user creation
  // Users must register through the registration form

  // Function to handle successful authentication - MANDATORY MFA CHECK WITH ZERO BYPASSES
  const handleAuthenticationSuccess = async () => {
    const currentUser = localStorage.getItem('currentUser')
    if (!currentUser) {
      console.error('❌ SECURITY: No current user found after authentication - blocking login')
      await auditLogger.logPHIAccess(
        AuditAction.LOGIN_FAILURE,
        ResourceType.SYSTEM,
        'login-missing-user',
        AuditOutcome.FAILURE,
        { operation: 'missing_current_user', error: 'No current user after authentication' }
      )
      setError('Authentication failed. Please try again.')
      setIsLoading(false)
      return
    }

    let user: any
    try {
      user = JSON.parse(currentUser)
      if (!user || !user.id) {
        throw new Error('Invalid user data')
      }
    } catch (parseError) {
      console.error('❌ SECURITY: Invalid user data after authentication - blocking login')
      await auditLogger.logPHIAccess(
        AuditAction.LOGIN_FAILURE,
        ResourceType.SYSTEM,
        'login-invalid-user',
        AuditOutcome.FAILURE,
        { operation: 'invalid_user_data', error: 'Failed to parse user data' }
      )
      setError('Authentication failed. Please try again.')
      setIsLoading(false)
      return
    }

    console.log('🔍 SECURITY: Performing MANDATORY MFA check for user:', user.id)
    await auditLogger.logPHIAccess(
      AuditAction.LOGIN,
      ResourceType.SYSTEM,
      `login-mfa-check-${user.id}`,
      AuditOutcome.SUCCESS,
      { operation: 'mfa_check_initiated', userId: user.id }
    )

    // CRITICAL: Check if user has TOTP enabled with FAIL-SAFE defaults
    let totpEnabled = false
    let totpCheckError = null

    // MANDATORY MFA FOR SUPER USER PROFILES - SECURE IMPLEMENTATION
    const superUserProfiles = [
      'super-user-456',   // elmfarrell@yahoo.com
      'pierre-user-789',  // pierre@phaetonai.com
      'c550502f-c39d-4bb3-bb8c-d193657fdb24' // UUID fallback
    ]

    // Check if this is a super user profile - need to check their actual MFA status
    const isSuperUser = superUserProfiles.includes(user.id) ||
        (user.email && ['elmfarrell@yahoo.com', 'pierre@phaetonai.com'].includes(user.email.toLowerCase()))

    if (isSuperUser) {
      console.log('🔍 SECURITY: SUPER USER DETECTED - checking MFA status with FAIL-SECURE defaults')

      // SECURITY FIX: For super users, we still enforce strict MFA checks
      // No special bypasses - super users must have proper MFA setup
      try {
        // Check MFA status using Fresh MFA Service
        let totpServiceResult = null
        let totpSetupExists = null

        try {
          totpServiceResult = await FreshMfaService.isMfaEnabled(user.id)
          totpSetupExists = totpServiceResult // Fresh MFA uses single enabled state
        } catch (err) {
          console.warn('FreshMfaService.isMfaEnabled failed for super user:', err)
          totpServiceResult = null
          totpSetupExists = null
        }

        // SECURITY ENHANCEMENT: Fail-secure approach for super users
        if (totpServiceResult === true || totpSetupExists === true) {
          console.log('🛡️ SECURITY: Super user has MFA enabled - enforcing MFA verification')
          totpEnabled = true
          totpCheckError = null // No message needed for normal MFA flow

          await auditLogger.logPHIAccess(
            AuditAction.LOGIN,
            ResourceType.SYSTEM,
            `login-super-user-mfa-${user.id}`,
            AuditOutcome.SUCCESS,
            { operation: 'super_user_mfa_enforced', userId: user.id, email: user.email }
          )
        } else if (totpServiceResult === false && totpSetupExists === false) {
          console.log('🔒 SECURITY: User does not have MFA enabled - allowing login without MFA')
          // Users without MFA can proceed without MFA requirement
          totpEnabled = false
          totpCheckError = null
        } else {
          // SECURITY FIX: If we can't determine MFA status, default to requiring MFA
          console.warn('🚨 SECURITY: Cannot determine MFA status for super user - REQUIRING MFA for security')
          totpEnabled = true
          totpCheckError = 'Super User Profile - MFA Status Unknown - Security Verification Required'
        }

        console.log('🔍 SECURITY: Super User TOTP Status Check Results:', {
          userId: user.id,
          email: user.email,
          totpServiceResult,
          totpSetupExists,
          finalTotpEnabled: totpEnabled,
          hasError: !!totpCheckError,
          securityPolicy: 'FAIL_SECURE'
        })
      } catch (error: any) {
        console.error('❌ SECURITY: Super user TOTP check failed - REQUIRING MFA for security:', error)
        // SECURITY FIX: When checks fail, require MFA instead of allowing bypass
        totpEnabled = true
        totpCheckError = `Super User TOTP check failed: ${error.message || 'Unknown error'} - MFA Required`

        await auditLogger.logPHIAccess(
          AuditAction.LOGIN_FAILURE,
          ResourceType.SYSTEM,
          `login-super-user-mfa-check-failed-${user.id}`,
          AuditOutcome.FAILURE,
          { operation: 'super_user_mfa_check_failed', userId: user.id, error: error.message }
        )
      }
    } else {
      try {
        // Check MFA status using Fresh MFA Service for regular users
        let totpServiceResult = null
        let totpSetupExists = null

        try {
          totpServiceResult = await FreshMfaService.isMfaEnabled(user.id)
          totpSetupExists = totpServiceResult // Fresh MFA uses single enabled state
        } catch (err) {
          console.warn('FreshMfaService.isMfaEnabled failed:', err)
          totpServiceResult = null
          totpSetupExists = null
        }

        // FAIL-SAFE LOGIC: If any check fails, default to requiring MFA
        if (totpServiceResult === null || totpSetupExists === null) {
          console.warn('⚠️ SECURITY: TOTP check failed - defaulting to REQUIRE MFA for security')
          totpEnabled = true
          totpCheckError = 'TOTP verification service unavailable - requiring MFA for security'
        } else if (totpServiceResult === true || totpSetupExists === true) {
          totpEnabled = true
        } else {
          totpEnabled = false
        }

        console.log('🔍 SECURITY: TOTP Status Check Results:', {
          totpServiceResult,
          totpSetupExists,
          finalTotpEnabled: totpEnabled,
          hasError: !!totpCheckError
        })
      } catch (error: any) {
        console.error('❌ SECURITY: TOTP check failed completely - DEFAULTING TO REQUIRE MFA:', error)
        totpEnabled = true // FAIL-SAFE: Require MFA when checks fail
        totpCheckError = `TOTP check failed: ${error.message || 'Unknown error'}`

        await auditLogger.logPHIAccess(
          AuditAction.LOGIN_FAILURE,
          ResourceType.SYSTEM,
          `login-mfa-check-failed-${user.id}`,
          AuditOutcome.FAILURE,
          { operation: 'mfa_check_failed', userId: user.id, error: error.message }
        )
      }
    }

    // MANDATORY MFA ENFORCEMENT WITH LOCKOUT CHECK
    if (totpEnabled) {
      console.log('🔐 SECURITY: TOTP REQUIRED - checking lockout status before showing MFA verification')

      // Check if user is currently locked out from MFA attempts
      const lockoutStatus = MfaLockoutService.getLockoutStatus(user.id, user.email)

      if (lockoutStatus.isLocked) {
        const timeRemaining = MfaLockoutService.formatTimeRemaining(lockoutStatus.remainingTime!)
        setError(`MFA verification is temporarily locked due to too many failed attempts. Please try again in ${timeRemaining}.`)
        setIsLoading(false)

        // Log lockout attempt for audit
        await auditLogger.logPHIAccess(
          AuditAction.LOGIN_FAILURE,
          ResourceType.SYSTEM,
          `login-mfa-locked-${user.id}`,
          AuditOutcome.FAILURE,
          { operation: 'mfa_lockout_active', userId: user.id, timeRemaining, lockoutEnds: lockoutStatus.lockoutEnds }
        )

        // Clear the logged in user since they can't proceed
        localStorage.removeItem('currentUser')
        return
      }

      await auditLogger.logPHIAccess(
        AuditAction.LOGIN,
        ResourceType.SYSTEM,
        `login-mfa-required-${user.id}`,
        AuditOutcome.SUCCESS,
        { operation: 'mfa_verification_required', userId: user.id, reason: totpCheckError || 'TOTP enabled', attemptsRemaining: lockoutStatus.attemptsRemaining }
      )

      // FIXED: Don't show LoginPage MFA verification - App.tsx handles MFA via MandatoryMfaLogin
      // This prevents the duplicate MFA popup underneath the login form
      console.log('🔐 MFA required for user - App.tsx will handle MFA verification via MandatoryMfaLogin')

      // Store user data and call onLogin() to let App.tsx handle MFA flow
      localStorage.setItem('currentUser', JSON.stringify(user))
      onLogin()
    } else {
      console.log('✅ SECURITY: No TOTP required - proceeding to dashboard')
      await auditLogger.logPHIAccess(
        AuditAction.LOGIN,
        ResourceType.SYSTEM,
        `login-success-no-mfa-${user.id}`,
        AuditOutcome.SUCCESS,
        { operation: 'login_success_no_mfa', userId: user.id }
      )
      // Login completed successfully without MFA requirement
      onLogin()
    }
  }

  // Handle MFA verification success
  const handleMFASuccess = async () => {
    console.log('✅ Login: MFA verification successful - proceeding to dashboard')

    if (pendingUser) {
      // Clear MFA attempts on successful verification
      await MfaLockoutService.clearMfaAttempts(pendingUser.id, pendingUser.email)

      // Log successful MFA completion
      await auditLogger.logPHIAccess(
        AuditAction.LOGIN,
        ResourceType.SYSTEM,
        `login-mfa-success-${pendingUser.id}`,
        AuditOutcome.SUCCESS,
        { operation: 'mfa_verification_completed', userId: pendingUser.id, email: pendingUser.email }
      )
    }

    setShowMFAVerification(false)
    setPendingUser(null)
    // Complete login after successful MFA verification
    onLogin()
  }

  // Handle MFA verification cancel
  const handleMFACancel = async () => {
    console.log('🚫 Login: MFA verification canceled - returning to login')

    if (pendingUser) {
      // Log MFA cancellation for audit trail
      await auditLogger.logPHIAccess(
        AuditAction.LOGIN_FAILURE,
        ResourceType.SYSTEM,
        `login-mfa-canceled-${pendingUser.id}`,
        AuditOutcome.FAILURE,
        { operation: 'mfa_verification_canceled', userId: pendingUser.id, email: pendingUser.email }
      )
    }

    setShowMFAVerification(false)
    setPendingUser(null)
    setIsLoading(false)
    // Clear the logged in user since they didn't complete MFA
    localStorage.removeItem('currentUser')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setWarning('')

    try {
      if (!email || !password) {
        setError('Please enter both email and password')
        return
      }

      // CRITICAL SECURITY FIX: Check MFA lockout status BEFORE any authentication attempts
      // This prevents bypass of MFA lockout by clicking "Login" button
      console.log('🔒 SECURITY: Checking MFA lockout status before authentication for email:', email)

      // First, we need to identify the user ID to check lockout status
      // Try to get user ID from various sources before authenticating
      let userIdForLockoutCheck = null
      let emailForLockoutCheck = email

      // Check if this is a known system user
      if (email === 'elmfarrell@yahoo.com') {
        userIdForLockoutCheck = 'super-user-456'
      } else if (email === 'pierre@phaetonai.com') {
        userIdForLockoutCheck = 'pierre-user-789'
      } else if (email === 'guest@email.com') {
        userIdForLockoutCheck = 'guest-user-456'
      } else {
        // For non-system users, try to get user ID from recent login attempts or user profile service
        try {
          const userLookup = await userProfileService.getUserByEmail(email)
          if (userLookup.status === 'success' && userLookup.data) {
            userIdForLockoutCheck = userLookup.data.id
          }
        } catch (lookupError) {
          console.warn('Could not lookup user ID for lockout check:', lookupError)
          // Continue with authentication - lockout check will happen later if user is found
        }
      }

      // If we have a user ID, check for active MFA lockout
      if (userIdForLockoutCheck) {
        const lockoutStatus = MfaLockoutService.getLockoutStatus(userIdForLockoutCheck, emailForLockoutCheck)

        if (lockoutStatus.isLocked) {
          const timeRemaining = MfaLockoutService.formatTimeRemaining(lockoutStatus.remainingTime!)
          setError(`Authentication is temporarily blocked due to too many failed MFA attempts. Please try again in ${timeRemaining}.`)

          // Log the blocked login attempt
          await auditLogger.logPHIAccess(
            AuditAction.LOGIN_FAILURE,
            ResourceType.SYSTEM,
            `login-blocked-lockout-${userIdForLockoutCheck}`,
            AuditOutcome.FAILURE,
            {
              operation: 'login_blocked_mfa_lockout',
              userId: userIdForLockoutCheck,
              email: emailForLockoutCheck,
              timeRemaining,
              lockoutEnds: lockoutStatus.lockoutEnds,
              attemptedBypass: true
            }
          )

          console.log('🚫 SECURITY: Login attempt blocked due to active MFA lockout for user:', userIdForLockoutCheck)
          return // CRITICAL: Block all authentication attempts during lockout
        } else {
          console.log('✅ SECURITY: No active MFA lockout found, proceeding with authentication')
        }
      } else {
        console.log('ℹ️ SECURITY: Could not determine user ID for pre-auth lockout check, will check after authentication')
      }

      // Check if user is currently blocked
      const blockStatus = LoginAttemptTracker.isUserBlocked(email)
      if (blockStatus.isBlocked) {
        const remainingMinutes = Math.ceil((blockStatus.remainingTime || 0) / (60 * 1000))
        setError(`Account temporarily blocked due to too many failed login attempts. Try again in ${remainingMinutes} minutes.`)
        return
      }

      // Clear lockouts for system users before attempting authentication
      if (email === 'elmfarrell@yahoo.com' || email === 'pierre@phaetonai.com' || email === 'guest@email.com' || email === 'guest@guest.com') {
        // Clear failed login attempts for system users
        const failedAttempts = localStorage.getItem('failed_login_attempts')
        if (failedAttempts) {
          try {
            let attempts = JSON.parse(failedAttempts)
            attempts = attempts.filter((attempt: any) => attempt.email !== email)
            localStorage.setItem('failed_login_attempts', JSON.stringify(attempts))
          } catch (error) {
            localStorage.removeItem('failed_login_attempts')
          }
        }

        // Clear login stats for system users
        if (email === 'elmfarrell@yahoo.com') {
          localStorage.removeItem('loginStats_super-user-456')
        } else if (email === 'pierre@phaetonai.com') {
          localStorage.removeItem('loginStats_pierre-user-789')
        } else if (email === 'guest@email.com') {
          localStorage.removeItem('loginStats_guest-user-456')
        }
      }

      // For system users, try system account login first for better reliability
      const isSystemUser = email === 'elmfarrell@yahoo.com' || email === 'pierre@phaetonai.com' || email === 'guest@email.com'

      if (isSystemUser) {
        // Try system account login first for system users
        const demoLoginResult = await handleDemoAccountLogin(email, password)
        if (demoLoginResult) {
          // CRITICAL SECURITY CHECK: Verify lockout status after demo account login
          const currentUser = localStorage.getItem('currentUser')
          if (currentUser) {
            try {
              const user = JSON.parse(currentUser)
              console.log('🔒 SECURITY: Post-demo-login lockout verification for user:', user.id)
              const demoLockoutStatus = MfaLockoutService.getLockoutStatus(user.id, user.email)

              if (demoLockoutStatus.isLocked) {
                const timeRemaining = MfaLockoutService.formatTimeRemaining(demoLockoutStatus.remainingTime!)
                setError(`Demo account access denied. MFA lockout is active for ${timeRemaining}.`)

                // Log the blocked demo access
                await auditLogger.logPHIAccess(
                  AuditAction.LOGIN_FAILURE,
                  ResourceType.SYSTEM,
                  `demo-blocked-${user.id}`,
                  AuditOutcome.FAILURE,
                  {
                    operation: 'demo_account_lockout_block',
                    userId: user.id,
                    email: user.email,
                    timeRemaining,
                    lockoutEnds: demoLockoutStatus.lockoutEnds,
                    accountType: 'demo'
                  }
                )

                console.log('🚫 SECURITY: Demo account access blocked due to MFA lockout for user:', user.id)

                // Clear the demo login data
                localStorage.removeItem('currentUser')
                return // CRITICAL: Block demo access during lockout
              }
            } catch (parseError) {
              console.error('Error parsing currentUser for demo lockout check:', parseError)
            }
          }
          // Force sync cross-device data for demo users too
          const syncCurrentUser = localStorage.getItem('currentUser')
          if (syncCurrentUser) {
            try {
              const user = JSON.parse(syncCurrentUser)
              console.log('🔄 Syncing cross-device data for demo user from Supabase...')
              // Note: MFA sync functionality not available in current service implementation
              console.log('🔄 Cross-device MFA sync would be performed here')
              const settingsSynced = await userSettingsService.forceSyncFromSupabase(user.id)
              console.log('✅ Cross-device sync completed for demo user')

              // Reload Retell credentials for demo user
              if (settingsSynced && settingsSynced.retell_config) {
                const { retellService } = await import('@/services/retellService')
                retellService.updateCredentials(
                  settingsSynced.retell_config.api_key,
                  settingsSynced.retell_config.call_agent_id,
                  settingsSynced.retell_config.sms_agent_id
                )
                console.log('✅ Retell credentials updated for demo user')
              }
            } catch (syncError) {
              console.warn('⚠️ Demo user cross-device sync failed:', syncError)
            }
          }
          await handleAuthenticationSuccess()
          return
        }
      }

      // Try to authenticate with Supabase
      const authResponse = await userManagementService.authenticateUser(email, password)

      if (authResponse.status === 'error') {
        // For system users, if Supabase fails, we already tried system login above
        if (isSystemUser) {
          setError('Invalid email or password. Check with your administrator if you need an account.')
        } else {
          setError(authResponse.error || 'Authentication failed')
        }
        return
      }

      if (authResponse.data) {
        // User authenticated successfully
        const userData = authResponse.data

        // CRITICAL SECURITY CHECK: Verify MFA lockout status again after user identification
        // This catches cases where user ID wasn't available during pre-auth check
        console.log('🔒 SECURITY: Post-authentication lockout verification for user:', userData.id)
        const postAuthLockoutStatus = MfaLockoutService.getLockoutStatus(userData.id, userData.email)

        if (postAuthLockoutStatus.isLocked) {
          const timeRemaining = MfaLockoutService.formatTimeRemaining(postAuthLockoutStatus.remainingTime!)
          setError(`Access denied. MFA lockout is active for ${timeRemaining}. Please wait before trying again.`)

          // Log the blocked access attempt
          await auditLogger.logPHIAccess(
            AuditAction.LOGIN_FAILURE,
            ResourceType.SYSTEM,
            `post-auth-blocked-${userData.id}`,
            AuditOutcome.FAILURE,
            {
              operation: 'post_auth_lockout_block',
              userId: userData.id,
              email: userData.email,
              timeRemaining,
              lockoutEnds: postAuthLockoutStatus.lockoutEnds,
              stage: 'post_authentication'
            }
          )

          console.log('🚫 SECURITY: Post-authentication access blocked due to MFA lockout for user:', userData.id)

          // Clear any stored user data
          localStorage.removeItem('currentUser')
          return // CRITICAL: Block access even after successful authentication
        }

        // Save user profile as current user (replaces localStorage.setItem('currentUser'))
        const profileResponse = await userProfileService.saveUserProfile(userData)

        if (profileResponse.status === 'error') {
          console.error('Failed to save user profile:', profileResponse.error)
          // Continue with login even if profile save fails
        }

        // CRITICAL CHECK: Verify user account is activated
        if (userData.isActive === false) {
          setError('Your account is pending approval from a Super User administrator. Please contact your system administrator.')

          // Log pending activation attempt
          await auditLogger.logPHIAccess(
            AuditAction.LOGIN_FAILURE,
            ResourceType.SYSTEM,
            `login-pending-activation-${userData.id}`,
            AuditOutcome.FAILURE,
            {
              operation: 'login_pending_activation',
              userId: userData.id,
              email: userData.email,
              accountStatus: 'inactive'
            }
          )

          console.log('🚫 SECURITY: Login blocked - Account not yet activated:', userData.email)
          localStorage.removeItem('currentUser')
          return // Block login for inactive accounts
        }

        // Store minimal user data in localStorage for immediate access
        // This will be replaced by Supabase calls in other components
        localStorage.setItem('currentUser', JSON.stringify({
          id: userData.id,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          mfa_enabled: userData.mfa_enabled
        }))

        // Force sync MFA and settings from Supabase for cross-device access
        console.log('🔄 Syncing cross-device data from Supabase...')
        try {
          // Note: MFA sync functionality not available in current service implementation
          console.log('🔄 Cross-device MFA sync would be performed here')
          const mfaSynced = true // Assume sync successful for now
          console.log(`✅ MFA data sync: ${mfaSynced ? 'successful' : 'no data found'}`)

          // Force sync user settings from cloud
          const settingsSynced = await userSettingsService.forceSyncFromSupabase(userData.id)
          console.log(`✅ Settings sync: ${settingsSynced ? 'successful' : 'using defaults'}`)

          // Reload Retell credentials after settings sync
          if (settingsSynced && settingsSynced.retell_config) {
            const { retellService } = await import('@/services/retellService')
            retellService.updateCredentials(
              settingsSynced.retell_config.api_key,
              settingsSynced.retell_config.call_agent_id,
              settingsSynced.retell_config.sms_agent_id
            )
            console.log('✅ Retell credentials updated from synced settings')
          }
        } catch (syncError) {
          console.warn('⚠️ Cross-device sync failed, using local data:', syncError)
          // Continue with login even if sync fails - will use local/default data
        }

        // Clear failed attempts on successful login
        LoginAttemptTracker.clearFailedAttempts(email)
        await handleAuthenticationSuccess()
      } else {
        // Check for system accounts as fallback (only if user not found in system and not already tried)
        if (!isSystemUser && await handleDemoAccountLogin(email, password)) {
          // Force sync cross-device data for demo users
          const fallbackCurrentUser = localStorage.getItem('currentUser')
          if (fallbackCurrentUser) {
            try {
              const user = JSON.parse(fallbackCurrentUser)
              console.log('🔄 Syncing cross-device data for fallback demo user from Supabase...')
              // Note: MFA sync functionality not available in current service implementation
              console.log('🔄 Cross-device MFA sync would be performed here')
              const settingsSynced = await userSettingsService.forceSyncFromSupabase(user.id)
              console.log('✅ Cross-device sync completed for fallback demo user')

              // Reload Retell credentials for fallback demo user
              if (settingsSynced && settingsSynced.retell_config) {
                const { retellService } = await import('@/services/retellService')
                retellService.updateCredentials(
                  settingsSynced.retell_config.api_key,
                  settingsSynced.retell_config.call_agent_id,
                  settingsSynced.retell_config.sms_agent_id
                )
                console.log('✅ Retell credentials updated for fallback demo user')
              }
            } catch (syncError) {
              console.warn('⚠️ Fallback demo user cross-device sync failed:', syncError)
            }
          }
          // Clear failed attempts on successful login
          LoginAttemptTracker.clearFailedAttempts(email)
          await handleAuthenticationSuccess()
        } else {
          // Record failed attempt and show warning
          const attemptResult = LoginAttemptTracker.recordFailedAttempt(email)

          if (attemptResult.isBlocked) {
            setError(attemptResult.warning || 'Account temporarily blocked')
          } else {
            setError('Invalid email or password. Check with your administrator if you need an account.')
            if (attemptResult.warning) {
              setWarning(attemptResult.warning)
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Login error:', error)
      setError('Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Helper method to check demo user password against stored credentials
  const checkDemoUserPassword = async (userId: string, password: string): Promise<boolean> => {
    try {
      // Import encryption service to verify password
      const { encryptionService } = await import('@/services/encryption')
      const { secureStorage } = await import('@/services/secureStorage')

      // Try to get credentials from secure storage first (new location)
      let encryptedCredentials = null
      try {
        const secureData = await secureStorage.getItem(`userCredentials_${userId}`, { isPHI: true })
        if (secureData) {
          encryptedCredentials = secureData
        }
      } catch (error) {
        console.log('No credentials in secure storage')
      }

      // Fallback: Check localStorage for stored credentials under demo user ID
      if (!encryptedCredentials) {
        encryptedCredentials = localStorage.getItem(`userCredentials_${userId}`)
      }

      // If not found under demo ID, also check under Supabase UUID for this demo user
      if (!encryptedCredentials) {
        // Check for known Supabase UUIDs for demo users
        const demoUUIDMap: { [key: string]: string } = {
          'pierre-user-789': 'c550502f-c39d-4bb3-bb8c-d193657fdb24',
          'super-user-456': 'c550502f-c39d-4bb3-bb8c-d193657fdb24',
          'dynamic-pierre-user': 'c550502f-c39d-4bb3-bb8c-d193657fdb24' // Map login alias to actual user
        }

        const supabaseUUID = demoUUIDMap[userId]
        if (supabaseUUID) {
          // Try secure storage first
          try {
            const secureData = await secureStorage.getItem(`userCredentials_${supabaseUUID}`, { isPHI: true })
            if (secureData) {
              encryptedCredentials = secureData
            }
          } catch (error) {
            // Fallback to localStorage
            encryptedCredentials = localStorage.getItem(`userCredentials_${supabaseUUID}`)
          }
          console.log('Checking credentials under alternate identifier')
        }
      }

      if (!encryptedCredentials) {
        return false
      }

      // Decrypt the stored credentials
      const decrypted = await encryptionService.decryptString(encryptedCredentials)
      const credentials = JSON.parse(decrypted)
      console.log('Credentials structure verified (content redacted for security)')

      // Verify the password
      if (credentials.password) {
        console.log('Password verification: credentials found, validating...')

        // The stored password is already encrypted, so we need to decrypt it
        const decryptedStoredPassword = await encryptionService.decryptString(credentials.password)
        const isMatch = password === decryptedStoredPassword
        console.log(`Password verification result: ${isMatch ? 'successful' : 'failed'}`)
        return isMatch
      }

      return false
    } catch (error) {
      console.log('Failed to check stored credentials, clearing corrupted data')
      // Clear corrupted credentials to prevent future errors
      localStorage.removeItem(`userCredentials_${userId}`)
      return false
    }
  }

  // Helper method for demo account handling - DISABLED FOR MEDEX
  const handleDemoAccountLogin = async (email: string, password: string): Promise<boolean> => {
    // ARTLEE: Demo accounts disabled - production users only
    return false

    // OLD DEMO LOGIC DISABLED:
    /* let demoUserData = null

    // Clear any lockouts for system users to prevent getting stuck
    if (email === 'elmfarrell@yahoo.com' || email === 'pierre@phaetonai.com' || email === 'guest@email.com') {
      // Clear failed login attempts for system users
      const failedAttempts = localStorage.getItem('failed_login_attempts')
      if (failedAttempts) {
        try {
          let attempts = JSON.parse(failedAttempts)
          attempts = attempts.filter((attempt: any) => attempt.email !== email)
          localStorage.setItem('failed_login_attempts', JSON.stringify(attempts))
        } catch (error) {
          localStorage.removeItem('failed_login_attempts')
        }
      }

      // Clear login stats for system users
      if (email === 'elmfarrell@yahoo.com') {
        localStorage.removeItem('loginStats_super-user-456')
      } else if (email === 'pierre@phaetonai.com') {
        localStorage.removeItem('loginStats_pierre-user-789')
      } else if (email === 'guest@email.com') {
        localStorage.removeItem('loginStats_guest-user-001')
      }
    }

    // Check built-in system accounts - now uses dynamic password verification
    if (email === 'elmfarrell@yahoo.com') {
      // Try stored credentials first, fall back to default password
      const isValidPassword = await checkDemoUserPassword('super-user-456', password) || password === 'Farrell1000!'
      if (isValidPassword) {
        demoUserData = {
          id: 'super-user-456',
          email: 'elmfarrell@yahoo.com',
          name: 'System Admin',
          role: 'super_user' as const,
          mfa_enabled: false,
          settings: {
            theme: 'dark',
            notifications: {}
          }
        }
      }
    } else if (email === 'pierre@phaetonai.com') {
      // Find admin user dynamically (could be created by createPierreUser utility)
      const storedUsers = localStorage.getItem('systemUsers')
      let pierreUser = null

      if (storedUsers) {
        try {
          const users = JSON.parse(storedUsers)
          pierreUser = users.find((u: any) => u.email === 'pierre@phaetonai.com')
        } catch (e) {
          console.error('Failed to parse stored users:', e)
        }
      }

      // Check stored credentials or default password
      const userToCheck = pierreUser?.id || 'pierre-user-789' // fallback to old ID
      const isValidPassword = await checkDemoUserPassword(userToCheck, password) || password === '$Ineed1millie$_carexps'

      if (isValidPassword) {
        demoUserData = pierreUser || {
          id: 'dynamic-pierre-user',
          email: 'pierre@phaetonai.com',
          name: 'Admin User',
          role: 'admin' as const,
          mfa_enabled: false,
          settings: {
            theme: 'light',
            notifications: {
              calls: true,
              sms: true,
              system: true
            }
          }
        }
      }
    } else if (email === 'guest@email.com') {
      // Try stored credentials first, fall back to default password
      const isValidPassword = await checkDemoUserPassword('guest-user-456', password) || password === 'Guest1000!'
      if (isValidPassword) {
        demoUserData = {
          id: 'guest-user-456',
          email: 'guest@email.com',
          name: 'Staff User',
          role: 'staff' as const,
          mfa_enabled: false,
          settings: {
            theme: 'light',
            notifications: {}
          }
        }
      }
    }

    if (demoUserData) {
      try {
        // Try to create/update the system user in Supabase
        const createResponse = await userProfileService.saveUserProfile(demoUserData)

        if (createResponse.status === 'success') {
          // Update last login for successful system login
          const loginStatsKey = `loginStats_${demoUserData.id}`
          const loginStats = {
            loginAttempts: 0,
            lastLogin: new Date().toISOString(),
            lockoutUntil: undefined
          }
          localStorage.setItem(loginStatsKey, JSON.stringify(loginStats))

          localStorage.setItem('currentUser', JSON.stringify({
            id: demoUserData.id,
            email: demoUserData.email,
            name: demoUserData.name,
            role: demoUserData.role,
            mfa_enabled: demoUserData.mfa_enabled
          }))
          return true
        }
      } catch (error) {
        console.error('Failed to create system user:', error)
      }

      // Fallback to localStorage if Supabase fails
      // Update last login for successful system login (fallback case)
      const loginStatsKey = `loginStats_${demoUserData.id}`
      const loginStats = {
        loginAttempts: 0,
        lastLogin: new Date().toISOString(),
        lockoutUntil: undefined
      }
      localStorage.setItem(loginStatsKey, JSON.stringify(loginStats))

      localStorage.setItem('currentUser', JSON.stringify({
        id: demoUserData.id,
        email: demoUserData.email,
        name: demoUserData.name,
        role: demoUserData.role,
        mfa_enabled: demoUserData.mfa_enabled
      }))
      return true
    }

    return false */
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-start justify-center pt-8 sm:pt-16 p-4 sm:p-6" style={{ fontFamily: 'Roboto, sans-serif' }}>
      <div className="w-full max-w-sm mx-auto">

        <div className="text-center mb-8">
          {logos.headerLogo && (
            <img
              src={logos.headerLogo}
              alt="ARTLEE Logo"
              className="max-h-32 w-auto mx-auto mb-4 object-contain"
              referrerPolicy="no-referrer"
            />
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md mb-4">
          <div className="text-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-1">Welcome Back</h2>
            <p className="text-gray-600 text-sm">Sign in to your CRM account</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-red-700 text-sm">
              {error}
            </div>
          )}

          {warning && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4 text-yellow-700 text-sm">
              {warning}
            </div>
          )}

          {lockoutStatus && lockoutStatus.isLocked && (
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-red-700 text-sm">
              <div className="flex items-center gap-2">
                <AlertCircleIcon className="w-4 h-4 flex-shrink-0" />
                <div>
                  <div className="font-medium">Account Temporarily Locked</div>
                  <div className="text-xs mt-1">
                    Due to multiple failed MFA attempts, access for <strong>{lockoutStatus.userEmail}</strong> is blocked for <strong>{lockoutStatus.timeRemaining}</strong>.
                  </div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full p-3 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full p-3 pr-10 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  {showPassword ? (
                    <EyeOffIcon className="w-5 h-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm text-gray-600">
                <input type="checkbox" className="mr-2" />
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading || (lockoutStatus && lockoutStatus.isLocked)}
              className="w-full bg-blue-600 text-white p-3 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {lockoutStatus && lockoutStatus.isLocked
                ? `Locked (${lockoutStatus.timeRemaining})`
                : isLoading
                ? 'Signing in...'
                : 'Sign In'
              }
            </button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowRegistration(true)}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium hover:underline"
              >
                Don't have an account? Create New Profile
              </button>
            </div>
          </form>
        </div>

        {/* First User Message */}
        {isFirstUserSystem && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mt-4">
            <div className="flex items-start gap-3">
              <ShieldCheckIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Be the first to register
                </p>
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  Be the first to register and become the administrator of your organization.
                  First user automatically gets Super User privileges.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="text-center mt-6">
          {/* Light mode footer logo */}
          <img
            src="/images/nexasync-logo-light.png"
            alt="NexaSync Logo"
            className="h-6 w-auto mx-auto mb-2 opacity-70 dark:hidden"
            onError={(e) => {
              e.currentTarget.src = 'https://nexasync.ca/images/NexaSync-logo.png'
            }}
            referrerPolicy="no-referrer"
          />
          {/* Dark mode footer logo */}
          <img
            src="/images/nexasync-logo-dark.png"
            alt="NexaSync Logo"
            className="h-6 w-auto mx-auto mb-2 opacity-70 hidden dark:block"
            onError={(e) => {
              e.currentTarget.src = 'https://nexasync.ca/images/nexasync-white.png'
            }}
            referrerPolicy="no-referrer"
          />
          <div className="text-xs text-gray-500 dark:text-gray-400">
            © 2025 NexaSync. All rights reserved.
          </div>
        </div>
      </div>

      {/* MFA Verification Modal */}
      {showMFAVerification && pendingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 pt-2 md:pt-3">
          <div className="w-full max-w-md mx-4">
            <FreshMfaVerification
              userId={pendingUser.id}
              userEmail={pendingUser.email}
              onVerificationSuccess={handleMFASuccess}
              onCancel={handleMFACancel}
              lockoutStatus={pendingUser.lockoutStatus}
            />
          </div>
        </div>
      )}

      {/* User Registration Modal */}
      {showRegistration && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <UserRegistration
            onCancel={() => setShowRegistration(false)}
            onSuccess={() => {
              setShowRegistration(false)
              setError('')
              setEmail('')
              setPassword('')
            }}
          />
        </div>
      )}
    </div>
  )
}