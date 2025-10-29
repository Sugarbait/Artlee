/**
 * User Registration Component
 * Allows new users to create an account with 'user' role
 * Account requires Super User approval before activation
 */

import React, { useState } from 'react'
import { UserPlusIcon, EyeIcon, EyeOffIcon, AlertCircle, CheckCircle, Check, X } from 'lucide-react'
import { userManagementService } from '@/services/userManagementService'
import { auditLogger, AuditAction, ResourceType, AuditOutcome } from '@/services/auditLogger'
import { generalToast } from '@/services/generalToastService'

interface UserRegistrationProps {
  onCancel: () => void
  onSuccess: () => void
}

export const UserRegistration: React.FC<UserRegistrationProps> = ({ onCancel, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    department: '',
    phone: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [wasFirstUser, setWasFirstUser] = useState(false)

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('Please enter your full name')
      return false
    }

    if (!formData.email.trim() || !formData.email.includes('@')) {
      setError('Please enter a valid email address')
      return false
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long')
      return false
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      console.log('Creating new user registration:', formData.email)

      // Check if this is the first user in the system
      const existingUsersResponse = await userManagementService.loadSystemUsers()
      const isFirstUser = existingUsersResponse.status === 'success' &&
                          (!existingUsersResponse.data || existingUsersResponse.data.length === 0)

      console.log(`🔍 First user check: ${isFirstUser ? 'YES - will be Super User' : 'NO - will be regular User'}`)

      // Prepare user data and credentials for createSystemUser
      const userData = {
        email: formData.email,
        name: formData.name,
        role: (isFirstUser ? 'super_user' : 'user') as 'super_user' | 'user', // First user = super_user, others = user
        isActive: isFirstUser ? true : false, // First user auto-activated, others need approval
        department: formData.department || undefined,
        phone: formData.phone || undefined,
        settings: {} // Empty settings object will be populated with defaults
      }

      const credentials = {
        email: formData.email,
        password: formData.password
      }

      console.log(`✅ Creating user with role: ${userData.role}, isActive: ${userData.isActive}`)

      // Create user with appropriate role and activation status
      const result = await userManagementService.createSystemUser(userData, credentials)

      if (result.status === 'success') {
        // Log registration attempt
        await auditLogger.logPHIAccess(
          AuditAction.CREATE,
          ResourceType.USER,
          result.data?.id || 'unknown',
          AuditOutcome.SUCCESS,
          {
            operation: 'user_registration_submitted',
            email: formData.email,
            accountStatus: isFirstUser ? 'auto_activated_first_user' : 'pending_approval',
            role: isFirstUser ? 'super_user' : 'user'
          }
        )

        setWasFirstUser(isFirstUser)
        setSuccess(true)
        generalToast.success(
          isFirstUser
            ? 'Your account has been created with Super User privileges!'
            : 'Registration submitted successfully. Awaiting Super User approval.',
          'Registration Complete'
        )
      } else {
        const errorMsg = result.error || 'Registration failed. Please try again.'
        setError(errorMsg)
        generalToast.error(errorMsg, 'Registration Failed')

        // Log failed registration
        await auditLogger.logPHIAccess(
          AuditAction.CREATE,
          ResourceType.USER,
          'unknown',
          AuditOutcome.FAILURE,
          {
            operation: 'user_registration_failed',
            email: formData.email,
            failureReason: result.error || 'Unknown error'
          }
        )
      }
    } catch (error) {
      console.error('Registration error:', error)
      const errorMsg = 'An unexpected error occurred. Please try again.'
      setError(errorMsg)
      generalToast.error(errorMsg, 'Registration Error')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full mb-4">
            <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {wasFirstUser ? `Welcome, ${formData.name}!` : 'Registration Submitted!'}
          </h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            {wasFirstUser ? (
              <>
                Congratulations! As the first user in the system, you have been granted Super User privileges.
                Your account is now active and you can log in immediately.
              </>
            ) : (
              <>
                Your account has been created and is pending approval from a Super User administrator.
                You will receive notification once your account is activated.
              </>
            )}
          </p>
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>Email:</strong> {formData.email}
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
              <strong>Role:</strong> {wasFirstUser ? 'Super User' : 'User'}
            </p>
            <p className="text-sm text-blue-800 dark:text-blue-300 mt-1">
              <strong>Status:</strong> {wasFirstUser ? 'Active - Ready to Login' : 'Pending Approval'}
            </p>
          </div>
          <button
            onClick={onSuccess}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Return to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-4xl w-full">
      <div className="text-center mb-4">
        <div className="inline-flex items-center justify-center w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full mb-2">
          <UserPlusIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create New Profile</h2>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
          Submit your information for Super User approval
        </p>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg flex items-center">
          <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 mr-2 flex-shrink-0" />
          <span className="text-xs text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email Address *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john.doe@example.com"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
              >
                {showPassword ? (
                  <EyeOffIcon className="w-4 h-4 text-gray-400" />
                ) : (
                  <EyeIcon className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Confirm Password *
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                placeholder="Re-enter your password"
                className={`w-full px-3 py-2 pr-10 text-sm border rounded-lg focus:outline-none focus:ring-2 dark:bg-gray-700 dark:text-white ${
                  formData.confirmPassword && formData.password
                    ? formData.password === formData.confirmPassword
                      ? 'border-green-500 dark:border-green-500 focus:ring-green-500'
                      : 'border-red-500 dark:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                }`}
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2"
              >
                {showConfirmPassword ? (
                  <EyeOffIcon className="w-4 h-4 text-gray-400" />
                ) : (
                  <EyeIcon className="w-4 h-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Department (Optional)
            </label>
            <input
              type="text"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              placeholder="e.g., Nursing, Radiology"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Phone Number (Optional)
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="(555) 123-4567"
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
            />
          </div>
        </div>

        {formData.confirmPassword && formData.password && (
          <div className={`flex items-center text-xs ${
            formData.password === formData.confirmPassword
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}>
            {formData.password === formData.confirmPassword ? (
              <>
                <Check className="w-3 h-3 mr-1" />
                <span>Passwords match</span>
              </>
            ) : (
              <>
                <X className="w-3 h-3 mr-1" />
                <span>Passwords do not match</span>
              </>
            )}
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-2">
          <p className="text-xs text-blue-800 dark:text-blue-300">
            <strong>Note:</strong> If you are the first user registering, you will automatically receive Super User privileges.
            Otherwise, your account will be created with "User" role and require approval from a Super User administrator.
          </p>
        </div>

        <div className="flex space-x-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 bg-blue-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSubmitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  )
}
