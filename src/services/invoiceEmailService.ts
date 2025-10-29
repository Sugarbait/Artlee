/**
 * Invoice Email Service
 * Sends invoice notification emails via Resend API using Supabase Edge Function
 */

import { supabase } from '@/config/supabase'

export interface InvoiceEmailData {
  to_email: string
  to_name: string
  invoice_id: string
  date_range: string
  total_amount: string
  total_calls: number
  call_cost: string
  total_chats: number
  sms_cost: string
  invoice_url: string
  pdf_download_link: string
  pdf_expiry_days: number
}

class InvoiceEmailService {
  private isInitialized = true // Always ready with Supabase Edge Function

  /**
   * Send invoice email via Resend API
   */
  async sendInvoiceEmail(data: InvoiceEmailData): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('📧 Sending invoice email via Resend to:', data.to_email)

      // Call Supabase Edge Function for invoice emails
      const { data: result, error } = await supabase.functions.invoke('send-invoice-email', {
        body: data
      })

      if (error) {
        console.error('❌ Supabase function error:', error)
        return {
          success: false,
          error: error.message || 'Failed to send email via Supabase function'
        }
      }

      if (!result?.success) {
        console.error('❌ Email sending failed:', result?.error)
        return {
          success: false,
          error: result?.error || 'Email sending failed'
        }
      }

      console.log('✅ Invoice email sent successfully via Resend')
      return { success: true }

    } catch (error) {
      console.error('❌ Failed to send invoice email:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email'
      }
    }
  }

  /**
   * Check if service is available
   */
  isAvailable(): boolean {
    return this.isInitialized
  }
}

// Export singleton instance
export const invoiceEmailService = new InvoiceEmailService()

export default invoiceEmailService
