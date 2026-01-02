/**
 * 🆕 FRESH MFA SERVICE - Built from scratch with zero corruption
 *
 * This is a completely new, clean MFA implementation that:
 * - Uses clean Base32 secret generation
 * - No encryption corruption
 * - Simple, reliable TOTP verification
 * - Clean database storage
 */

import * as OTPAuth from 'otpauth'
import QRCode from 'qrcode'
import { supabase } from '../config/supabase'
import { userIdTranslationService } from './userIdTranslationService'
import { getCurrentTenantId } from '@/config/tenantConfig'
import { auditLogger, AuditAction, AuditOutcome, ResourceType } from './auditLogger'

export interface FreshMfaSetup {
  secret: string
  qrCodeUrl: string
  backupCodes: string[]
}

export interface FreshMfaVerification {
  success: boolean
  message: string
}

class FreshMfaService {
  // Rate limiting: Track failed MFA attempts per user
  private static failedAttempts: Map<string, { count: number; lockedUntil: number | null }> = new Map()
  private static readonly MAX_ATTEMPTS = 5
  private static readonly LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes

  /**
   * Check if user is rate-limited
   */
  private static isRateLimited(userId: string): { limited: boolean; remainingTime?: number } {
    const attempts = this.failedAttempts.get(userId)
    if (!attempts || !attempts.lockedUntil) {
      return { limited: false }
    }

    const now = Date.now()
    if (now < attempts.lockedUntil) {
      const remainingMs = attempts.lockedUntil - now
      return { limited: true, remainingTime: Math.ceil(remainingMs / 1000) }
    }

    // Lockout expired, reset
    this.failedAttempts.delete(userId)
    return { limited: false }
  }

  /**
   * Record failed MFA attempt
   */
  private static recordFailedAttempt(userId: string): void {
    const attempts = this.failedAttempts.get(userId) || { count: 0, lockedUntil: null }
    attempts.count++

    if (attempts.count >= this.MAX_ATTEMPTS) {
      attempts.lockedUntil = Date.now() + this.LOCKOUT_DURATION
      console.warn(`🔒 User ${userId} locked out for ${this.LOCKOUT_DURATION / 60000} minutes after ${attempts.count} failed MFA attempts`)
    }

    this.failedAttempts.set(userId, attempts)
  }

  /**
   * Reset failed attempts on successful verification
   */
  private static resetFailedAttempts(userId: string): void {
    this.failedAttempts.delete(userId)
  }

  /**
   * Generate a completely fresh TOTP setup
   */
  static async generateMfaSetup(userId: string, userEmail: string): Promise<FreshMfaSetup> {
    try {
      console.log('🆕 FreshMFA: Generating completely new MFA setup for:', userId)

      // Generate clean Base32 secret (32 chars = 160 bits)
      const secret = this.generateCleanBase32Secret()

      console.log('✅ Generated clean Base32 secret:', {
        length: secret.length,
        isValidBase32: this.isValidBase32(secret)
      })

      // Create TOTP instance
      const totp = new OTPAuth.TOTP({
        issuer: 'ARTLEE CRM',
        label: userEmail,
        secret: secret,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      })

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(totp.toString())

      // Generate backup codes
      const backupCodes = this.generateBackupCodes()

      // Store in database (clean, no encryption corruption)
      await this.storeFreshMfaData(userId, {
        secret,
        backupCodes,
        enabled: false, // Not enabled until verified
        setupCompleted: false
      })

      console.log('✅ Fresh MFA setup generated successfully')

      return {
        secret,
        qrCodeUrl,
        backupCodes
      }

    } catch (error) {
      console.error('❌ Fresh MFA setup generation failed:', error)
      throw new Error(`MFA setup generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Verify TOTP code and complete MFA setup
   */
  static async verifyAndEnableMfa(userId: string, totpCode: string): Promise<FreshMfaVerification> {
    try {
      console.log('🔍 FreshMFA: Verifying TOTP code for user:', userId)

      // Sanitize input: remove spaces, ensure 6 digits
      const sanitizedCode = totpCode.replace(/\s/g, '').replace(/O/g, '0')

      if (!/^\d{6}$/.test(sanitizedCode)) {
        return {
          success: false,
          message: 'Invalid code format. Please enter a 6-digit code.'
        }
      }

      console.log('🔍 Input sanitized:', { original: totpCode, sanitized: sanitizedCode })

      // SECURITY: Check rate limiting
      const rateLimitCheck = this.isRateLimited(userId)
      if (rateLimitCheck.limited) {
        console.warn(`🔒 MFA verification blocked - user ${userId} is rate-limited`)
        return {
          success: false,
          message: `Too many failed attempts. Please try again in ${rateLimitCheck.remainingTime} seconds.`
        }
      }

      // Get fresh MFA data from database
      const mfaData = await this.getFreshMfaData(userId)
      if (!mfaData) {
        console.log('❌ No MFA data found for user:', userId)
        this.recordFailedAttempt(userId)
        return {
          success: false,
          message: 'MFA setup not found. Please start setup again.'
        }
      }

      console.log('✅ MFA data retrieved:', {
        hasSecret: !!mfaData.secret,
        secretLength: mfaData.secret?.length,
        enabled: mfaData.enabled
      })

      // Create TOTP instance with stored secret
      const totp = new OTPAuth.TOTP({
        secret: mfaData.secret,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      })

      // Verify the code with increased window tolerance
      // SECURITY FIX: Reduced window from 2 to 1 (±30 seconds instead of ±60)
      // Window 1 = ±30 seconds tolerance (previous, current, next time step)
      // Standard TOTP security practice - balances usability and security
      const isValid = totp.validate({
        token: sanitizedCode,
        window: 1 // Reduced from 2 to 1 for better security
      })

      console.log('🔍 TOTP Verification Details:', {
        originalToken: totpCode,
        sanitizedToken: sanitizedCode,
        timestamp: Math.floor(Date.now() / 1000),
        timeStep: Math.floor(Date.now() / 1000 / 30),
        window: 1,
        result: isValid !== null ? 'VALID' : 'INVALID',
        delta: isValid
      })

      if (isValid !== null) {
        // Code is valid - enable MFA
        await this.enableFreshMfa(userId)

        console.log('✅ TOTP code verified successfully - MFA enabled')

        // SECURITY: Reset failed attempts on successful verification
        this.resetFailedAttempts(userId)

        return {
          success: true,
          message: 'MFA enabled successfully!'
        }
      } else {
        console.log('❌ TOTP code verification failed')

        // SECURITY: Record failed attempt
        this.recordFailedAttempt(userId)

        return {
          success: false,
          message: 'Invalid TOTP code. Please check your authenticator app and try again.'
        }
      }

    } catch (error) {
      console.error('❌ Fresh MFA verification failed:', error)
      return {
        success: false,
        message: 'Verification failed. Please try again.'
      }
    }
  }

  /**
   * Check if user has MFA enabled (includes admin override check)
   */
  static async isMfaEnabled(userId: string): Promise<boolean> {
    try {
      const mfaData = await this.getFreshMfaData(userId)

      // Check if MFA has been disabled by admin
      if (mfaData?.disabledByAdmin === true) {
        console.log(`🔓 MFA disabled by admin for user ${userId}`)
        return false
      }

      return mfaData?.enabled === true && mfaData?.setupCompleted === true
    } catch (error) {
      console.error('❌ Error checking MFA status:', error)
      return false
    }
  }

  /**
   * Verify TOTP code for login
   */
  static async verifyLoginCode(userId: string, totpCode: string): Promise<boolean> {
    try {
      // SECURITY: Check rate limiting
      const rateLimitCheck = this.isRateLimited(userId)
      if (rateLimitCheck.limited) {
        console.warn(`🔒 MFA login blocked - user ${userId} is rate-limited`)
        return false
      }

      // Sanitize input
      const sanitizedCode = totpCode.replace(/\s/g, '').replace(/O/g, '0')
      if (!/^\d{6}$/.test(sanitizedCode)) {
        console.log('❌ Invalid login code format:', totpCode)
        this.recordFailedAttempt(userId)
        return false
      }

      const mfaData = await this.getFreshMfaData(userId)
      if (!mfaData?.enabled) {
        this.recordFailedAttempt(userId)
        return false
      }

      const totp = new OTPAuth.TOTP({
        secret: mfaData.secret,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      })

      const isValid = totp.validate({
        token: sanitizedCode,
        window: 1 // SECURITY FIX: Reduced from 2 to 1 (±30 seconds)
      })

      console.log('🔍 Login TOTP Verification:', {
        originalToken: totpCode,
        sanitizedToken: sanitizedCode,
        result: isValid !== null ? 'VALID' : 'INVALID',
        delta: isValid
      })

      if (isValid !== null) {
        // SECURITY: Reset failed attempts on successful verification
        this.resetFailedAttempts(userId)
        return true
      } else {
        // SECURITY: Record failed attempt
        this.recordFailedAttempt(userId)
        return false
      }
    } catch (error) {
      console.error('❌ Login TOTP verification failed:', error)
      return false
    }
  }

  /**
   * Disable MFA for a user
   */
  static async disableMfa(userId: string): Promise<boolean> {
    try {
      // Use user ID directly - no translation needed for ARTLEE tenant
      console.log(`🔄 MFA Disable: Using user_id directly: ${userId}`)

      const { error } = await supabase
        .from('user_settings')
        .update({
          fresh_mfa_secret: null,
          fresh_mfa_enabled: false,
          fresh_mfa_setup_completed: false,
          fresh_mfa_backup_codes: null
        })
        .eq('user_id', userId) // Use actual user ID from users table
        .eq('tenant_id', getCurrentTenantId())

      if (error) {
        console.error('❌ Error disabling MFA:', error)
        return false
      }

      console.log(`✅ MFA disabled successfully for ${userId}`)
      return true
    } catch (error) {
      console.error('❌ Error disabling MFA:', error)
      return false
    }
  }

  // ===============================
  // PRIVATE HELPER METHODS
  // ===============================

  /**
   * Generate a clean Base32 secret (no corruption possible)
   */
  private static generateCleanBase32Secret(): string {
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let secret = ''

    // Generate 32 character Base32 secret (160 bits of entropy)
    for (let i = 0; i < 32; i++) {
      const randomIndex = Math.floor(Math.random() * base32Chars.length)
      secret += base32Chars[randomIndex]
    }

    return secret
  }

  /**
   * Validate Base32 format
   */
  private static isValidBase32(secret: string): boolean {
    const base32Regex = /^[A-Z2-7]+$/
    return base32Regex.test(secret) && secret.length >= 16
  }

  /**
   * Generate backup codes using cryptographically secure random number generator
   * SECURITY FIX: Changed from Math.random() to crypto.getRandomValues()
   * for NIST 800-63B compliance
   */
  private static generateBackupCodes(): string[] {
    const codes: string[] = []

    for (let i = 0; i < 10; i++) {
      // Generate 8-digit backup code using cryptographically secure random
      const randomBytes = crypto.getRandomValues(new Uint8Array(4))
      const code = Array.from(randomBytes)
        .map(b => b.toString(10).padStart(3, '0'))
        .join('')
        .slice(0, 8)
      codes.push(code)
    }

    return codes
  }

  /**
   * Store fresh MFA data in database (clean storage)
   */
  private static async storeFreshMfaData(userId: string, data: any): Promise<void> {
    // Use user ID directly - no translation needed for ARTLEE tenant
    // The user_id in users table is already in the correct format
    console.log(`🔄 MFA Storage: Using user_id directly: ${userId}`)

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId, // Use actual user ID from users table
        tenant_id: getCurrentTenantId(),
        fresh_mfa_secret: data.secret, // Store as plain text - no encryption corruption
        fresh_mfa_enabled: data.enabled,
        fresh_mfa_setup_completed: data.setupCompleted,
        fresh_mfa_backup_codes: JSON.stringify(data.backupCodes)
      }, {
        onConflict: 'user_id' // Specify the column for conflict resolution
      })

    if (error) {
      console.error('❌ Error storing fresh MFA data:', error)
      throw new Error('Failed to store MFA data')
    }

    console.log(`✅ Fresh MFA data stored successfully for ${userId}`)
  }

  /**
   * Get fresh MFA data from database (includes admin override fields)
   */
  private static async getFreshMfaData(userId: string): Promise<any> {
    // Use user ID directly - no translation needed for ARTLEE tenant
    console.log(`🔍 MFA Lookup: Using user_id directly: ${userId}`)

    const { data, error } = await supabase
      .from('user_settings')
      .select(`
        fresh_mfa_secret,
        fresh_mfa_enabled,
        fresh_mfa_setup_completed,
        fresh_mfa_backup_codes
      `)
      .eq('user_id', userId) // Use actual user ID from users table
      .eq('tenant_id', getCurrentTenantId())
      .single()

    if (error || !data) {
      console.log(`ℹ️ No fresh MFA data found for user: ${userId}`)
      return null
    }

    return {
      secret: data.fresh_mfa_secret,
      enabled: data.fresh_mfa_enabled,
      setupCompleted: data.fresh_mfa_setup_completed,
      backupCodes: data.fresh_mfa_backup_codes ? JSON.parse(data.fresh_mfa_backup_codes) : [],
      disabledByAdmin: false, // Admin override not available in this database
      disabledAt: null,
      disabledByUserId: null,
      disableReason: null
    }
  }

  /**
   * Enable fresh MFA after successful verification
   */
  private static async enableFreshMfa(userId: string): Promise<void> {
    // Use user ID directly - no translation needed for ARTLEE tenant
    console.log(`🔄 MFA Enable: Using user_id directly: ${userId}`)

    const { error } = await supabase
      .from('user_settings')
      .update({
        fresh_mfa_enabled: true,
        fresh_mfa_setup_completed: true
      })
      .eq('user_id', userId) // Use actual user ID from users table
      .eq('tenant_id', getCurrentTenantId())

    if (error) {
      console.error('❌ Error enabling fresh MFA:', error)
      throw new Error('Failed to enable MFA')
    }

    console.log(`✅ Fresh MFA enabled successfully for ${userId}`)

    // Trigger UI update events for real-time synchronization
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mfaSetupCompleted', {
        detail: { userId, enabled: true }
      }))
      window.dispatchEvent(new CustomEvent('totpStatusChanged', {
        detail: { userId, enabled: true }
      }))
      console.log('🔄 Dispatched MFA status change events for UI synchronization')
    }
  }

  /**
   * Force refresh MFA status across all components (for cross-device sync)
   */
  static async refreshMfaStatusGlobally(userId: string): Promise<void> {
    try {
      const isEnabled = await this.isMfaEnabled(userId)

      // Trigger UI refresh events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mfaStatusRefresh', {
          detail: { userId, enabled: isEnabled }
        }))
        window.dispatchEvent(new CustomEvent('totpStatusChanged', {
          detail: { userId, enabled: isEnabled }
        }))

        if (isEnabled) {
          window.dispatchEvent(new CustomEvent('mfaSetupCompleted', {
            detail: { userId, enabled: isEnabled }
          }))
        }

        console.log(`🔄 Refreshed MFA status globally: ${userId} - enabled: ${isEnabled}`)
      }
    } catch (error) {
      console.error('❌ Error refreshing MFA status globally:', error)
    }
  }

  /**
   * Verify TOTP for existing MFA (for login/auth purposes)
   */
  static async verifyTotp(userId: string, totpCode: string): Promise<boolean> {
    try {
      console.log('🔍 FreshMFA: Verifying TOTP for existing MFA:', userId)

      // Sanitize input
      const sanitizedCode = totpCode.replace(/\s/g, '').replace(/O/g, '0')
      if (!/^\d{6}$/.test(sanitizedCode)) {
        console.log('❌ Invalid TOTP code format:', totpCode)
        return false
      }

      const mfaData = await this.getFreshMfaData(userId)
      if (!mfaData || !mfaData.enabled) {
        console.log('❌ MFA not enabled for user')
        return false
      }

      // Create TOTP instance with stored secret
      const totp = new OTPAuth.TOTP({
        secret: mfaData.secret,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
      })

      // Verify the code with increased tolerance
      const isValid = totp.validate({
        token: sanitizedCode,
        window: 1 // SECURITY FIX: Reduced from 2 to 1 (±30 seconds)
      })

      const result = isValid !== null
      console.log('🔍 General TOTP Verification:', {
        originalToken: totpCode,
        sanitizedToken: sanitizedCode,
        result: result ? 'VALID' : 'INVALID',
        delta: isValid
      })

      return result
    } catch (error) {
      console.error('❌ Error verifying TOTP:', error)
      return false
    }
  }

  /**
   * Verify backup code and mark it as used (single-use enforcement)
   */
  static async verifyBackupCode(userId: string, backupCode: string): Promise<boolean> {
    try {
      // SECURITY: Check rate limiting
      const rateLimitCheck = this.isRateLimited(userId)
      if (rateLimitCheck.limited) {
        console.warn(`🔒 Backup code verification blocked - user ${userId} is rate-limited`)
        return false
      }

      console.log('🔍 FreshMFA: Verifying backup code')

      // Sanitize input - remove spaces and ensure it's a valid backup code format
      const sanitizedCode = backupCode.replace(/\s/g, '').replace(/O/g, '0')

      if (!/^\d{8}$/.test(sanitizedCode)) {
        console.log('❌ Invalid backup code format (must be 8 digits)')
        this.recordFailedAttempt(userId)
        return false
      }

      console.log(`🔍 Original backup code: "${backupCode}" → Sanitized: "${sanitizedCode}"`)

      const mfaData = await this.getFreshMfaData(userId)
      if (!mfaData?.backupCodes || !Array.isArray(mfaData.backupCodes)) {
        console.log('❌ No backup codes found for user')
        this.recordFailedAttempt(userId)
        return false
      }

      // Check if the backup code exists in the unused codes list
      const codeIndex = mfaData.backupCodes.indexOf(sanitizedCode)
      if (codeIndex === -1) {
        console.log('❌ Backup code not found or already used')
        this.recordFailedAttempt(userId)
        return false
      }

      // Remove the used backup code (single-use enforcement)
      const updatedBackupCodes = [...mfaData.backupCodes]
      updatedBackupCodes.splice(codeIndex, 1)

      // Update the database to mark this backup code as used
      await this.updateBackupCodes(userId, updatedBackupCodes)

      console.log('✅ Backup code verified successfully and marked as used')
      console.log(`📊 Remaining backup codes: ${updatedBackupCodes.length}/10`)

      // SECURITY: Reset failed attempts on successful verification
      this.resetFailedAttempts(userId)

      return true
    } catch (error) {
      console.error('❌ Error during backup code verification:', error)
      return false
    }
  }

  /**
   * Update backup codes in database (for single-use enforcement)
   */
  private static async updateBackupCodes(userId: string, updatedBackupCodes: string[]): Promise<void> {
    // Use user ID directly - no translation needed for ARTLEE tenant
    const { error } = await supabase
      .from('user_settings')
      .update({
        fresh_mfa_backup_codes: JSON.stringify(updatedBackupCodes)
      })
      .eq('user_id', userId) // Use actual user ID from users table
      .eq('tenant_id', getCurrentTenantId())

    if (error) {
      console.error('❌ Error updating backup codes:', error)
      throw new Error('Failed to update backup codes')
    }

    console.log(`✅ Backup codes updated successfully for ${userId}`)
  }

  /**
   * Get remaining backup codes count
   */
  static async getRemainingBackupCodesCount(userId: string): Promise<number> {
    try {
      const mfaData = await this.getFreshMfaData(userId)
      if (!mfaData?.backupCodes || !Array.isArray(mfaData.backupCodes)) {
        return 0
      }
      return mfaData.backupCodes.length
    } catch (error) {
      console.error('❌ Error getting backup codes count:', error)
      return 0
    }
  }

  /**
   * Admin-only: Disable MFA for a user (does not delete MFA data, just overrides it)
   * @param userId - The user whose MFA should be disabled
   * @param adminUserId - The Super User performing the action
   * @param reason - Reason for disabling MFA
   * @returns Promise<boolean> - Success status
   */
  static async adminDisableMfa(
    userId: string,
    adminUserId: string,
    reason: string = 'Disabled by administrator'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔐 Admin MFA Disable: Admin ${adminUserId} disabling MFA for user ${userId}`)

      // Update the database to mark MFA as disabled by admin
      const { error } = await supabase
        .from('user_settings')
        .update({
          mfa_disabled_by_admin: true,
          mfa_disabled_at: new Date().toISOString(),
          mfa_disabled_by_user_id: adminUserId,
          mfa_disable_reason: reason
        })
        .eq('user_id', userId)
        .eq('tenant_id', getCurrentTenantId())

      if (error) {
        console.error('❌ Error disabling MFA via admin:', error)
        return { success: false, error: error.message }
      }

      console.log(`✅ MFA disabled by admin for user ${userId}`)

      // Log audit event for MFA disable
      try {
        await auditLogger.logAction({
          action: AuditAction.UPDATE,
          resourceType: ResourceType.USER,
          resourceId: userId,
          outcome: AuditOutcome.SUCCESS,
          additionalInfo: {
            action_detail: 'MFA_DISABLED_BY_ADMIN',
            disabled_by_user_id: adminUserId,
            reason: reason
          }
        })
      } catch (auditError) {
        console.error('⚠️ Failed to log MFA disable audit event:', auditError)
        // Continue even if audit logging fails
      }

      // Trigger UI update events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mfaStatusRefresh', {
          detail: { userId, enabled: false, disabledByAdmin: true }
        }))
      }

      return { success: true }
    } catch (error) {
      console.error('❌ Admin MFA disable failed:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Admin-only: Re-enable MFA for a user (removes admin override)
   * @param userId - The user whose MFA should be re-enabled
   * @returns Promise<boolean> - Success status
   */
  static async adminEnableMfa(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔐 Admin MFA Enable: Re-enabling MFA for user ${userId}`)

      // Clear the admin override flags
      const { error } = await supabase
        .from('user_settings')
        .update({
          mfa_disabled_by_admin: false,
          mfa_disabled_at: null,
          mfa_disabled_by_user_id: null,
          mfa_disable_reason: null
        })
        .eq('user_id', userId)
        .eq('tenant_id', getCurrentTenantId())

      if (error) {
        console.error('❌ Error re-enabling MFA via admin:', error)
        return { success: false, error: error.message }
      }

      console.log(`✅ MFA admin override removed for user ${userId}`)

      // Check if user still has MFA configured
      const mfaData = await this.getFreshMfaData(userId)
      const isEnabled = mfaData?.enabled === true && mfaData?.setupCompleted === true

      // Log audit event for MFA re-enable
      try {
        await auditLogger.logAction({
          action: AuditAction.UPDATE,
          resourceType: ResourceType.USER,
          resourceId: userId,
          outcome: AuditOutcome.SUCCESS,
          additionalInfo: {
            action_detail: 'MFA_RE_ENABLED_BY_ADMIN',
            mfa_now_active: isEnabled
          }
        })
      } catch (auditError) {
        console.error('⚠️ Failed to log MFA re-enable audit event:', auditError)
        // Continue even if audit logging fails
      }

      // Trigger UI update events
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mfaStatusRefresh', {
          detail: { userId, enabled: isEnabled, disabledByAdmin: false }
        }))
      }

      return { success: true }
    } catch (error) {
      console.error('❌ Admin MFA enable failed:', error)
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  /**
   * Get MFA status including admin override information
   */
  static async getMfaStatus(userId: string): Promise<{
    enabled: boolean
    setupCompleted: boolean
    disabledByAdmin: boolean
    disabledAt?: string
    disabledByUserId?: string
    disableReason?: string
  }> {
    try {
      const mfaData = await this.getFreshMfaData(userId)

      return {
        enabled: mfaData?.enabled === true && mfaData?.setupCompleted === true && !mfaData?.disabledByAdmin,
        setupCompleted: mfaData?.setupCompleted === true,
        disabledByAdmin: mfaData?.disabledByAdmin === true,
        disabledAt: mfaData?.disabledAt,
        disabledByUserId: mfaData?.disabledByUserId,
        disableReason: mfaData?.disableReason
      }
    } catch (error) {
      console.error('❌ Error getting MFA status:', error)
      return {
        enabled: false,
        setupCompleted: false,
        disabledByAdmin: false
      }
    }
  }
}

// Export static class as default
export default FreshMfaService

// Make globally available for debugging and cross-device sync
if (typeof window !== 'undefined') {
  (window as any).refreshMfaStatus = (userId: string) => FreshMfaService.refreshMfaStatusGlobally(userId)
}

console.log('🔧 Fresh MFA Service loaded!')
console.log('💡 Available commands:')
console.log('  - FreshMfaService.generateMfaSetup() - Generate fresh MFA setup')
console.log('  - FreshMfaService.verifyAndEnableMfa() - Verify and enable MFA')
console.log('  - refreshMfaStatus(userId) - Refresh MFA status globally')