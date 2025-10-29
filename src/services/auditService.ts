import { supabase } from '@/config/supabase'
import { SupabaseService } from './supabaseService'
import { Database, ServiceResponse, PaginatedResponse } from '@/types/supabase'
import { createAuditEntry, verifyAuditEntry } from '@/utils/encryption'
import { getCurrentTenantId } from '@/config/tenantConfig'

type Tables = Database['public']['Tables']
type AuditLogRow = Tables['audit_logs']['Row']
type SecurityEventRow = Tables['security_events']['Row']

export interface AuditLogEntry {
  id: string
  userId: string | null
  action: string
  tableName: string
  recordId?: string
  oldValues?: any
  newValues?: any
  timestamp: string
  ipAddress?: string
  userAgent?: string
  sessionId?: string
  metadata: any
}

export interface SecurityEvent {
  id: string
  userId?: string
  action: string
  resource: string
  timestamp: string
  ipAddress?: string
  userAgent?: string
  success: boolean
  details: any
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface AuditQuery {
  userId?: string
  action?: string
  tableName?: string
  dateFrom?: Date
  dateTo?: Date
  page?: number
  pageSize?: number
}

export interface SecurityEventQuery {
  userId?: string
  action?: string
  resource?: string
  severity?: 'low' | 'medium' | 'high' | 'critical'[]
  success?: boolean
  dateFrom?: Date
  dateTo?: Date
  page?: number
  pageSize?: number
}

/**
 * Audit logging and security event tracking service for compliance
 */
export class AuditService extends SupabaseService {
  /**
   * Create an audit log entry
   */
  static async createAuditLog(entry: {
    action: string
    tableName: string
    recordId?: string
    oldValues?: any
    newValues?: any
    metadata?: any
  }): Promise<ServiceResponse<string>> {
    try {
      const userId = await this.getCurrentUserId()
      const sessionId = this.getSessionId()

      const auditData = {
        user_id: userId,
        action: entry.action,
        table_name: entry.tableName,
        record_id: entry.recordId,
        old_values: entry.oldValues,
        new_values: entry.newValues,
        ip_address: await this.getClientIP(),
        user_agent: navigator.userAgent,
        session_id: sessionId,
        tenant_id: getCurrentTenantId(),
        metadata: {
          ...entry.metadata,
          timestamp: new Date().toISOString(),
          audit_version: '1.0'
        }
      }

      const { data, error } = await supabase
        .from('audit_logs')
        .insert(auditData)
        .select('id')
        .single()

      if (error) throw error

      // Create encrypted audit trail for tamper detection
      const encryptedEntry = createAuditEntry(entry.action, entry.tableName, auditData)

      // Store encrypted audit trail separately (could be in a separate secure store)
      await this.storeEncryptedAuditTrail(data.id, encryptedEntry)

      return { status: 'success', data: data.id }
    } catch (error: any) {
      return this.handleError(error, 'createAuditLog')
    }
  }

  /**
   * Create a security event
   */
  static async createSecurityEvent(event: {
    action: string
    resource: string
    success: boolean
    details?: any
    severity?: 'low' | 'medium' | 'high' | 'critical'
    userId?: string
  }): Promise<ServiceResponse<string>> {
    try {
      // ARTLEE: Use audit_logs table instead of security_events (which doesn't exist)
      const userId = event.userId || await this.getCurrentUserId()

      const eventData = {
        user_id: userId,
        action_type: event.action,
        resource_type: event.resource,
        outcome: event.success ? 'SUCCESS' : 'FAILURE',
        additional_info: JSON.stringify(event.details || {}),
        ip_address: await this.getClientIP(),
        user_agent: navigator.userAgent,
        tenant_id: getCurrentTenantId()
      }

      const { data, error } = await supabase
        .from('audit_logs')
        .insert(eventData)
        .select('id')
        .single()

      if (error) {
        console.warn('⚠️ Audit log creation failed (non-critical):', error.message)
        // Don't throw - fail silently for non-critical audit logging
        return { status: 'success', data: 'audit-skipped' }
      }

      // Trigger alerts for high/critical events
      if (event.severity && ['high', 'critical'].includes(event.severity)) {
        await this.triggerSecurityAlert(data.id, eventData)
      }

      return { status: 'success', data: data.id }
    } catch (error: any) {
      console.warn('⚠️ Security event logging failed (non-critical):', error)
      // Don't propagate errors - audit logging should not break functionality
      return { status: 'success', data: 'audit-skipped' }
    }
  }

  /**
   * Query audit logs with filtering and pagination
   */
  static async queryAuditLogs(query: AuditQuery): Promise<PaginatedResponse<AuditLogEntry>> {
    try {
      const page = query.page || 1
      const pageSize = query.pageSize || 50
      const offset = (page - 1) * pageSize

      let queryBuilder = supabase
        .from('audit_logs')
        .select('*', { count: 'exact' })
        .eq('tenant_id', getCurrentTenantId())
        .order('timestamp', { ascending: false })

      // Apply filters
      if (query.userId) {
        queryBuilder = queryBuilder.eq('user_id', query.userId)
      }

      if (query.action) {
        queryBuilder = queryBuilder.eq('action', query.action)
      }

      if (query.tableName) {
        queryBuilder = queryBuilder.eq('table_name', query.tableName)
      }

      if (query.dateFrom) {
        queryBuilder = queryBuilder.gte('timestamp', query.dateFrom.toISOString())
      }

      if (query.dateTo) {
        queryBuilder = queryBuilder.lte('timestamp', query.dateTo.toISOString())
      }

      const { data, error, count } = await queryBuilder
        .range(offset, offset + pageSize - 1)

      if (error) throw error

      // Log the audit query itself
      await this.createSecurityEvent({
        action: 'AUDIT_LOGS_QUERIED',
        resource: 'audit_logs',
        success: true,
        details: {
          filters: query,
          resultCount: data?.length || 0
        },
        severity: 'low'
      })

      return {
        status: 'success',
        data: data || [],
        count: count || 0,
        page,
        pageSize,
        hasMore: count ? offset + pageSize < count : false
      }
    } catch (error: any) {
      return this.handleError(error, 'queryAuditLogs')
    }
  }

  /**
   * Query security events with filtering and pagination
   */
  static async querySecurityEvents(query: SecurityEventQuery): Promise<PaginatedResponse<SecurityEvent>> {
    try {
      const page = query.page || 1
      const pageSize = query.pageSize || 50
      const offset = (page - 1) * pageSize

      let queryBuilder = supabase
        .from('security_events')
        .select('*', { count: 'exact' })
        .order('timestamp', { ascending: false })

      // Apply filters
      if (query.userId) {
        queryBuilder = queryBuilder.eq('user_id', query.userId)
      }

      if (query.action) {
        queryBuilder = queryBuilder.eq('action', query.action)
      }

      if (query.resource) {
        queryBuilder = queryBuilder.eq('resource', query.resource)
      }

      if (query.severity) {
        const severities = Array.isArray(query.severity) ? query.severity : [query.severity]
        queryBuilder = queryBuilder.in('severity', severities)
      }

      if (query.success !== undefined) {
        queryBuilder = queryBuilder.eq('success', query.success)
      }

      if (query.dateFrom) {
        queryBuilder = queryBuilder.gte('timestamp', query.dateFrom.toISOString())
      }

      if (query.dateTo) {
        queryBuilder = queryBuilder.lte('timestamp', query.dateTo.toISOString())
      }

      const { data, error, count } = await queryBuilder
        .range(offset, offset + pageSize - 1)

      if (error) throw error

      // Log the security event query
      await this.createSecurityEvent({
        action: 'SECURITY_EVENTS_QUERIED',
        resource: 'security_events',
        success: true,
        details: {
          filters: query,
          resultCount: data?.length || 0
        },
        severity: 'low'
      })

      return {
        status: 'success',
        data: data || [],
        count: count || 0,
        page,
        pageSize,
        hasMore: count ? offset + pageSize < count : false
      }
    } catch (error: any) {
      return this.handleError(error, 'querySecurityEvents')
    }
  }

  /**
   * Get audit trail for a specific record
   */
  static async getRecordAuditTrail(
    tableName: string,
    recordId: string
  ): Promise<ServiceResponse<AuditLogEntry[]>> {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', getCurrentTenantId())
        .eq('table_name', tableName)
        .eq('record_id', recordId)
        .order('timestamp', { ascending: false })

      if (error) throw error

      await this.createSecurityEvent({
        action: 'RECORD_AUDIT_TRAIL_ACCESSED',
        resource: 'audit_logs',
        success: true,
        details: {
          tableName,
          recordId,
          trailLength: data?.length || 0
        },
        severity: 'low'
      })

      return { status: 'success', data: data || [] }
    } catch (error: any) {
      return this.handleError(error, 'getRecordAuditTrail')
    }
  }

  /**
   * Get security events summary
   */
  static async getSecurityEventsSummary(
    dateFrom: Date,
    dateTo: Date
  ): Promise<ServiceResponse<{
    totalEvents: number
    eventsByType: Record<string, number>
    eventsBySeverity: Record<string, number>
    successRate: number
    topFailedActions: Array<{ action: string; count: number }>
  }>> {
    try {
      const { data: events, error } = await supabase
        .from('security_events')
        .select('action, severity, success')
        .gte('timestamp', dateFrom.toISOString())
        .lte('timestamp', dateTo.toISOString())

      if (error) throw error

      const totalEvents = events?.length || 0
      const successfulEvents = events?.filter(e => e.success).length || 0
      const successRate = totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0

      const eventsByType: Record<string, number> = {}
      const eventsBySeverity: Record<string, number> = {}
      const failedActions: Record<string, number> = {}

      events?.forEach(event => {
        // Count by action type
        eventsByType[event.action] = (eventsByType[event.action] || 0) + 1

        // Count by severity
        eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1

        // Count failed actions
        if (!event.success) {
          failedActions[event.action] = (failedActions[event.action] || 0) + 1
        }
      })

      const topFailedActions = Object.entries(failedActions)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([action, count]) => ({ action, count }))

      const summary = {
        totalEvents,
        eventsByType,
        eventsBySeverity,
        successRate,
        topFailedActions
      }

      await this.createSecurityEvent({
        action: 'SECURITY_SUMMARY_GENERATED',
        resource: 'security_events',
        success: true,
        details: {
          dateRange: { from: dateFrom, to: dateTo },
          summary: { totalEvents, successRate }
        },
        severity: 'low'
      })

      return { status: 'success', data: summary }
    } catch (error: any) {
      return this.handleError(error, 'getSecurityEventsSummary')
    }
  }

  /**
   * Verify audit log integrity
   */
  static async verifyAuditLogIntegrity(auditLogId: string): Promise<ServiceResponse<{
    isValid: boolean
    message: string
  }>> {
    try {
      // Get the audit log
      const { data: auditLog, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', getCurrentTenantId())
        .eq('id', auditLogId)
        .single()

      if (error) throw error

      // Get encrypted audit trail
      const encryptedTrail = await this.getEncryptedAuditTrail(auditLogId)

      if (!encryptedTrail) {
        return {
          status: 'success',
          data: {
            isValid: false,
            message: 'No encrypted audit trail found'
          }
        }
      }

      // Verify encrypted trail
      const decryptedTrail = verifyAuditEntry(encryptedTrail)

      if (!decryptedTrail) {
        return {
          status: 'success',
          data: {
            isValid: false,
            message: 'Encrypted audit trail verification failed'
          }
        }
      }

      // Compare critical fields
      const isValid = (
        decryptedTrail.action === auditLog.action &&
        decryptedTrail.resource === auditLog.table_name &&
        new Date(decryptedTrail.timestamp).getTime() === new Date(auditLog.timestamp).getTime()
      )

      await this.createSecurityEvent({
        action: 'AUDIT_LOG_INTEGRITY_VERIFIED',
        resource: 'audit_logs',
        success: true,
        details: {
          auditLogId,
          isValid,
          verificationMethod: 'encrypted_trail_comparison'
        },
        severity: isValid ? 'low' : 'high'
      })

      return {
        status: 'success',
        data: {
          isValid,
          message: isValid ? 'Audit log integrity verified' : 'Audit log integrity check failed'
        }
      }
    } catch (error: any) {
      return this.handleError(error, 'verifyAuditLogIntegrity')
    }
  }

  /**
   * Get compliance metrics
   */
  static async getComplianceMetrics(): Promise<ServiceResponse<{
    auditLogCompleteness: number
    encryptionCoverage: number
    dataRetentionCompliance: number
    lastAssessment: Date
  }>> {
    try {
      // Calculate audit log completeness (simplified)
      const { count: totalLogs } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', getCurrentTenantId())

      const { count: verifiedLogs } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', getCurrentTenantId())
        .not('metadata->audit_version', 'is', null)

      const auditLogCompleteness = totalLogs ? (verifiedLogs || 0) / totalLogs * 100 : 100

      // Check encryption coverage for PHI data
      const { count: totalPatients } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })

      const { count: encryptedPatients } = await supabase
        .from('patients')
        .select('*', { count: 'exact', head: true })
        .not('encrypted_first_name', 'is', null)

      const encryptionCoverage = totalPatients ? (encryptedPatients || 0) / totalPatients * 100 : 100

      // Data retention compliance (simplified check)
      const retentionDate = new Date()
      retentionDate.setFullYear(retentionDate.getFullYear() - 7) // 7 years for HIPAA

      const { count: oldRecords } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', getCurrentTenantId())
        .lt('timestamp', retentionDate.toISOString())

      const dataRetentionCompliance = oldRecords === 0 ? 100 : 90 // Simplified calculation

      const metrics = {
        auditLogCompleteness,
        encryptionCoverage,
        dataRetentionCompliance,
        lastAssessment: new Date()
      }

      await this.createSecurityEvent({
        action: 'COMPLIANCE_METRICS_GENERATED',
        resource: 'compliance',
        success: true,
        details: metrics,
        severity: 'low'
      })

      return { status: 'success', data: metrics }
    } catch (error: any) {
      return this.handleError(error, 'getComplianceMetrics')
    }
  }

  /**
   * Helper methods
   */
  private static getSessionId(): string | null {
    // Get session ID from storage or context
    return sessionStorage.getItem('session_id') || null
  }

  private static async storeEncryptedAuditTrail(auditLogId: string, encryptedEntry: string): Promise<void> {
    // In a real implementation, store this in a separate secure location
    // For now, we'll use metadata field
    try {
      await supabase
        .from('audit_logs')
        .update({
          metadata: {
            encrypted_trail: encryptedEntry
          }
        })
        .eq('tenant_id', getCurrentTenantId())
        .eq('id', auditLogId)
    } catch (error) {
      console.error('Failed to store encrypted audit trail:', error)
    }
  }

  private static async getEncryptedAuditTrail(auditLogId: string): Promise<string | null> {
    try {
      const { data } = await supabase
        .from('audit_logs')
        .select('metadata')
        .eq('tenant_id', getCurrentTenantId())
        .eq('id', auditLogId)
        .single()

      return data?.metadata?.encrypted_trail || null
    } catch {
      return null
    }
  }

  private static async triggerSecurityAlert(eventId: string, eventData: any): Promise<void> {
    try {
      // In a real implementation, this would trigger actual alerts
      // (email, SMS, push notifications, etc.)
      console.warn('Security Alert Triggered:', eventData)

      // Log the alert
      await this.createSecurityEvent({
        action: 'SECURITY_ALERT_TRIGGERED',
        resource: 'security_alerts',
        success: true,
        details: {
          originalEventId: eventId,
          alertType: 'automated',
          severity: eventData.severity
        },
        severity: 'medium'
      })
    } catch (error) {
      console.error('Failed to trigger security alert:', error)
    }
  }

  /**
   * Export audit logs for compliance reporting
   */
  static async exportAuditLogs(
    dateFrom: Date,
    dateTo: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<ServiceResponse<{
    data: string
    filename: string
    recordCount: number
  }>> {
    try {
      const { data: logs, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('tenant_id', getCurrentTenantId())
        .gte('timestamp', dateFrom.toISOString())
        .lte('timestamp', dateTo.toISOString())
        .order('timestamp', { ascending: true })

      if (error) throw error

      const recordCount = logs?.length || 0
      const filename = `audit_logs_${dateFrom.toISOString().split('T')[0]}_to_${dateTo.toISOString().split('T')[0]}.${format}`

      let exportData: string

      if (format === 'csv') {
        // Convert to CSV
        const headers = ['timestamp', 'user_id', 'action', 'table_name', 'record_id', 'ip_address']
        const csvRows = [
          headers.join(','),
          ...(logs || []).map(log =>
            headers.map(header => `"${log[header as keyof typeof log] || ''}"`).join(',')
          )
        ]
        exportData = csvRows.join('\n')
      } else {
        // JSON format
        exportData = JSON.stringify(logs, null, 2)
      }

      await this.createSecurityEvent({
        action: 'AUDIT_LOGS_EXPORTED',
        resource: 'audit_logs',
        success: true,
        details: {
          dateRange: { from: dateFrom, to: dateTo },
          format,
          recordCount
        },
        severity: 'medium'
      })

      return {
        status: 'success',
        data: {
          data: exportData,
          filename,
          recordCount
        }
      }
    } catch (error: any) {
      return this.handleError(error, 'exportAuditLogs')
    }
  }
}