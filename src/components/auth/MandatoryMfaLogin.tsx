/**
 * Mandatory MFA Login Component
 *
 * This component enforces MFA verification immediately after Azure AD authentication
 * for users who have MFA enabled. It creates an intermediate authentication state
 * where the user is Azure AD authenticated but not fully logged in until MFA is verified.
 */

import React, { useState, useEffect } from 'react'
import { Shield, AlertTriangle, Loader2, Settings } from 'lucide-react'
import FreshMfaService from '@/services/freshMfaService'
import { FreshMfaVerification } from './FreshMfaVerification'
import { FreshMfaSetup } from './FreshMfaSetup'
import { auditLogger, AuditAction, AuditOutcome } from '@/services/auditLogger'
import { MfaLockoutService } from '@/services/mfaLockoutService'

interface MandatoryMfaLoginProps {
  user: {
    id: string
    email: string
    name?: string
    mfaCheckFailed?: boolean
  }
  onMfaVerified: () => void
  onMfaCancel: () => void
}

interface MfaCheckState {
  isLoading: boolean
  mfaRequired: boolean
  error: string | null
}

export const MandatoryMfaLogin: React.FC<MandatoryMfaLoginProps> = ({
  user,
  onMfaVerified,
  onMfaCancel
}) => {
  const [mfaCheckState, setMfaCheckState] = useState<MfaCheckState>({
    isLoading: true,
    mfaRequired: false,
    error: null
  })
  const [needsSetup, setNeedsSetup] = useState(false)
  const [showSetup, setShowSetup] = useState(false)

  useEffect(() => {
    checkMfaRequirement()
  }, [user.id])

  /**
   * Check if the user has MFA enabled and requires verification
   */
  const checkMfaRequirement = async () => {
    try {
      console.log('🔐 MandatoryMfaLogin: Checking MFA requirement for user:', user.id)

      // Check if user has MFA enabled using Fresh MFA Service
      let mfaEnabled = false
      let mfaCheckFailed = false

      try {
        mfaEnabled = await FreshMfaService.isMfaEnabled(user.id)
        console.log('✅ MFA status check successful:', mfaEnabled)
      } catch (mfaServiceError) {
        console.error('❌ MFA service error:', mfaServiceError)
        mfaCheckFailed = true

        // Check if this user was passed with mfaCheckFailed flag from App.tsx
        if (user.mfaCheckFailed) {
          console.log('🔐 MFA check failed but user marked for MFA enforcement')
          mfaEnabled = true
          setNeedsSetup(true) // User may need to set up MFA first
        } else {
          // FAIL-SECURE: Known MFA users should still be protected
          const requiresMfaProfiles = ['super-user-456', 'pierre-user-789', 'dynamic-pierre-user']
          const requiresMfaEmails = ['elmfarrell@yahoo.com', 'pierre@phaetonai.com']

          if (requiresMfaProfiles.includes(user.id) ||
              (user.email && requiresMfaEmails.includes(user.email.toLowerCase()))) {
            console.log('🔐 FAIL-SECURE: Known MFA user, enforcing despite check failure')
            mfaEnabled = true
            setNeedsSetup(true)
          }
        }
      }

      console.log('🔐 MFA Status Check:', {
        userId: user.id,
        email: user.email,
        mfaEnabled,
        mfaCheckFailed,
        needsSetup
      })

      setMfaCheckState({
        isLoading: false,
        mfaRequired: mfaEnabled,
        error: mfaCheckFailed ? 'MFA system temporarily unavailable - security verification required' : null
      })

      // Log the authentication event
      await auditLogger.logAuthenticationEvent(
        mfaEnabled ? AuditAction.LOGIN : AuditAction.LOGIN,
        user.id,
        AuditOutcome.SUCCESS,
        JSON.stringify({
          mfaRequired: mfaEnabled,
          mfaCheckFailed,
          needsSetup,
          authenticationMethod: 'mandatory_mfa_check'
        })
      )

      // If MFA is not required, immediately complete authentication
      if (!mfaEnabled) {
        console.log('✅ MFA not required for user - completing authentication')
        onMfaVerified()
      }

    } catch (error) {
      console.error('❌ Error checking MFA requirement:', error)

      setMfaCheckState({
        isLoading: false,
        mfaRequired: false,
        error: 'Failed to check security requirements. Please try again.'
      })

      // Log the error
      await auditLogger.logAuthenticationEvent(
        AuditAction.LOGIN,
        user.id,
        AuditOutcome.FAILURE,
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Unknown error',
          step: 'mfa_requirement_check'
        })
      )
    }
  }

  /**
   * Handle successful MFA verification
   */
  const handleMfaSuccess = async () => {
    try {
      console.log('✅ MandatoryMfaLogin: MFA verification successful for user:', user.id)

      // SECURITY FIX: Clear MFA lockout attempts on successful verification
      await MfaLockoutService.clearMfaAttempts(user.id, user.email)

      // Store MFA verification timestamp for session management
      const mfaTimestamp = Date.now().toString()
      localStorage.setItem('freshMfaVerified', mfaTimestamp)

      // Log successful MFA verification
      await auditLogger.logAuthenticationEvent(
        AuditAction.LOGIN,
        user.id,
        AuditOutcome.SUCCESS,
        JSON.stringify({
          verificationTimestamp: mfaTimestamp,
          authenticationMethod: 'totp'
        })
      )

      // Complete the authentication process
      onMfaVerified()

    } catch (error) {
      console.error('❌ Error completing MFA verification:', error)
    }
  }

  /**
   * Handle MFA verification failure or cancellation
   */
  const handleMfaCancel = async () => {
    try {
      console.log('❌ MandatoryMfaLogin: MFA verification cancelled for user:', user.id)

      // Log cancelled MFA attempt
      await auditLogger.logAuthenticationEvent(
        AuditAction.LOGOUT,
        user.id,
        AuditOutcome.SUCCESS,
        JSON.stringify({
          reason: 'mfa_cancelled',
          authenticationStep: 'mfa_verification'
        })
      )

    } catch (error) {
      console.error('❌ Error logging MFA cancellation:', error)
    } finally {
      onMfaCancel()
    }
  }

  /**
   * Handle MFA setup completion
   */
  const handleSetupComplete = async () => {
    console.log('✅ MandatoryMfaLogin: MFA setup completed for user:', user.id)
    setShowSetup(false)
    setNeedsSetup(false)

    // Recheck MFA requirement after setup
    await checkMfaRequirement()
  }

  // Loading state - checking MFA requirement
  if (mfaCheckState.isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-start justify-center pt-8 sm:pt-16 p-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sm:p-8">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
              <Loader2 className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-spin" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Checking Security Requirements
            </h2>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Verifying authentication requirements for <strong className="break-all">{user.email}</strong>
            </p>
            <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              HIPAA-compliant security verification in progress...
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (mfaCheckState.error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-start justify-center pt-8 sm:pt-16 p-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sm:p-8">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Authentication Error
            </h2>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-6">
              {mfaCheckState.error}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={checkMfaRequirement}
                className="flex-1 px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={handleMfaCancel}
                className="flex-1 px-4 py-3 sm:py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Show MFA Setup if needed
  if (showSetup) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="mx-auto h-16 w-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <Settings className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Setup Multi-Factor Authentication
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Your account requires MFA setup for enhanced security
            </p>
          </div>

          <FreshMfaSetup
            userId={user.id}
            userEmail={user.email}
            autoGenerate={true}
            onSetupComplete={handleSetupComplete}
            onCancel={handleMfaCancel}
          />
        </div>
      </div>
    )
  }

  // MFA Required - Show verification interface
  if (mfaCheckState.mfaRequired) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-start justify-center pt-8 sm:pt-16 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-4 sm:mb-6">
            {needsSetup && (
              <div className="mt-4">
                <button
                  onClick={() => setShowSetup(true)}
                  className="px-4 py-3 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  Setup MFA First
                </button>
              </div>
            )}
          </div>

          <FreshMfaVerification
            userId={user.id}
            userEmail={user.email}
            onVerificationSuccess={handleMfaSuccess}
            onCancel={handleMfaCancel}
            showCancel={true}
          />
        </div>
      </div>
    )
  }

  // Fallback - should not reach here if logic is correct
  return null
}