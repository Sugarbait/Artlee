// Supabase Edge Function: Generate Monthly Invoices
// Runs on 1st of each month via cron
// Schedule: 0 2 1 * * (2 AM on 1st of month)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.10.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UserSettings {
  user_id: string
  stripe_auto_invoice_enabled: boolean
  stripe_customer_email: string
  stripe_customer_name: string
  stripe_auto_invoice_last_run?: string
}

interface InvoiceResult {
  user_id: string
  success: boolean
  invoice_id?: string
  invoice_url?: string
  error?: string
  retry_count: number
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')

    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable not set')
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-11-20',
      httpClient: Stripe.createFetchHttpClient(),
    })

    console.log('🚀 Starting monthly invoice generation...')

    // Get all users with auto-invoice enabled
    const { data: usersToProcess, error: usersError } = await supabase
      .from('user_settings')
      .select('user_id, stripe_auto_invoice_enabled, stripe_customer_email, stripe_customer_name, stripe_auto_invoice_last_run')
      .eq('stripe_auto_invoice_enabled', true)
      .not('stripe_customer_email', 'is', null)
      .not('stripe_customer_name', 'is', null)

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`)
    }

    if (!usersToProcess || usersToProcess.length === 0) {
      console.log('ℹ️ No users with auto-invoice enabled')
      return new Response(
        JSON.stringify({ message: 'No users to process', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📋 Found ${usersToProcess.length} users to process`)

    const results: InvoiceResult[] = []

    // Calculate previous month
    const now = new Date()
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    const invoiceMonth = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`

    console.log(`📅 Generating invoices for: ${invoiceMonth}`)

    // Process each user
    for (const userSettings of usersToProcess as UserSettings[]) {
      try {
        console.log(`👤 Processing user: ${userSettings.user_id}`)

        // Check if invoice already exists for this month
        const { data: existingInvoice } = await supabase
          .from('invoice_history')
          .select('id')
          .eq('user_id', userSettings.user_id)
          .eq('invoice_month', invoiceMonth)
          .eq('generated_automatically', true)
          .single()

        if (existingInvoice) {
          console.log(`⏭️ Invoice already exists for user ${userSettings.user_id} for ${invoiceMonth}`)
          results.push({
            user_id: userSettings.user_id,
            success: true,
            error: 'Invoice already exists',
            retry_count: 0
          })
          continue
        }

        // Fetch call data for previous month
        const { data: calls } = await supabase
          .from('calls')
          .select('*')
          .gte('start_timestamp', Math.floor(previousMonth.getTime() / 1000))
          .lte('start_timestamp', Math.floor(previousMonthEnd.getTime() / 1000))

        // Fetch SMS data for previous month
        const { data: chats } = await supabase
          .from('chats')
          .select('*')
          .gte('start_timestamp', Math.floor(previousMonth.getTime() / 1000))
          .lte('start_timestamp', Math.floor(previousMonthEnd.getTime() / 1000))

        // Calculate costs (simplified - in production, use actual cost calculation service)
        const callCount = calls?.length || 0
        const callCostCAD = (calls || []).reduce((sum: number, call: any) => {
          const retellCost = (call.call_cost?.combined_cost || 0) / 100 * 1.35 // USD to CAD estimate
          const twilioCost = Math.ceil((call.call_length_seconds || 0) / 60) * 0.022 * 1.35
          return sum + retellCost + twilioCost
        }, 0)

        const smsCount = chats?.length || 0
        const smsSegments = (chats || []).reduce((sum: number, chat: any) => {
          // Simplified segment calculation - actual would use message_with_tool_calls
          return sum + Math.max(Math.ceil((chat.transcript?.length || 0) / 160), 1) + 4 // +4 for initial prompt
        }, 0)
        const smsCostCAD = smsSegments * 0.0083 * 1.35 // USD to CAD estimate

        const totalCostCAD = callCostCAD + smsCostCAD

        if (totalCostCAD <= 0) {
          console.log(`⏭️ No charges for user ${userSettings.user_id} in ${invoiceMonth}`)
          results.push({
            user_id: userSettings.user_id,
            success: true,
            error: 'No charges',
            retry_count: 0
          })
          continue
        }

        // Get or create Stripe customer
        const customersResponse = await stripe.customers.list({
          email: userSettings.stripe_customer_email,
          limit: 1
        })

        let customerId: string
        if (customersResponse.data.length > 0) {
          customerId = customersResponse.data[0].id
        } else {
          const newCustomer = await stripe.customers.create({
            email: userSettings.stripe_customer_email,
            name: userSettings.stripe_customer_name,
            description: 'CareXPS Healthcare CRM Customer (Auto-Invoice)'
          })
          customerId = newCustomer.id
        }

        // Create invoice items
        if (callCount > 0) {
          await stripe.invoiceItems.create({
            customer: customerId,
            amount: Math.round(callCostCAD * 100),
            currency: 'cad',
            description: `Voice Calls (${callCount} calls) - ${previousMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`
          })
        }

        if (smsCount > 0) {
          await stripe.invoiceItems.create({
            customer: customerId,
            amount: Math.round(smsCostCAD * 100),
            currency: 'cad',
            description: `SMS Conversations (${smsCount} chats, ${smsSegments} segments) - ${previousMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`
          })
        }

        // Create and send invoice
        const invoice = await stripe.invoices.create({
          customer: customerId,
          auto_advance: true,
          collection_method: 'send_invoice',
          days_until_due: 7,
          description: `CareXPS Services - ${previousMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}`,
          metadata: {
            service: 'CareXPS Healthcare CRM',
            generated_automatically: 'true',
            user_id: userSettings.user_id,
            invoice_month: invoiceMonth
          }
        })

        await stripe.invoices.finalizeInvoice(invoice.id)
        await stripe.invoices.sendInvoice(invoice.id)

        // Save to invoice_history
        const { error: insertError } = await supabase
          .from('invoice_history')
          .insert({
            user_id: userSettings.user_id,
            invoice_id: invoice.id,
            customer_id: customerId,
            customer_email: userSettings.stripe_customer_email,
            customer_name: userSettings.stripe_customer_name,
            period_start: previousMonth.toISOString().split('T')[0],
            period_end: previousMonthEnd.toISOString().split('T')[0],
            invoice_month: invoiceMonth,
            call_count: callCount,
            call_cost_cad: callCostCAD,
            sms_count: smsCount,
            sms_segments: smsSegments,
            sms_cost_cad: smsCostCAD,
            total_cost_cad: totalCostCAD,
            invoice_status: 'sent',
            invoice_url: invoice.hosted_invoice_url,
            generated_at: new Date().toISOString(),
            sent_at: new Date().toISOString(),
            generated_automatically: true,
            retry_count: 0
          })

        if (insertError) {
          throw new Error(`Failed to save invoice history: ${insertError.message}`)
        }

        // Update user settings with last run time
        await supabase
          .from('user_settings')
          .update({ stripe_auto_invoice_last_run: new Date().toISOString() })
          .eq('user_id', userSettings.user_id)

        // TODO: Send email notification (to be implemented)
        console.log(`✅ Invoice created successfully for user ${userSettings.user_id}: ${invoice.id}`)

        results.push({
          user_id: userSettings.user_id,
          success: true,
          invoice_id: invoice.id,
          invoice_url: invoice.hosted_invoice_url || undefined,
          retry_count: 0
        })

      } catch (error) {
        console.error(`❌ Error processing user ${userSettings.user_id}:`, error)

        // Save failed attempt to invoice_history for retry
        await supabase
          .from('invoice_history')
          .insert({
            user_id: userSettings.user_id,
            invoice_id: `failed_${Date.now()}`,
            customer_id: 'pending',
            customer_email: userSettings.stripe_customer_email,
            customer_name: userSettings.stripe_customer_name,
            period_start: previousMonth.toISOString().split('T')[0],
            period_end: previousMonthEnd.toISOString().split('T')[0],
            invoice_month: invoiceMonth,
            total_cost_cad: 0,
            invoice_status: 'failed',
            generated_automatically: true,
            retry_count: 0,
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })

        results.push({
          user_id: userSettings.user_id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          retry_count: 0
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failureCount = results.filter(r => !r.success).length

    console.log(`✅ Completed: ${successCount} succeeded, ${failureCount} failed`)

    return new Response(
      JSON.stringify({
        message: 'Monthly invoice generation completed',
        processed: results.length,
        succeeded: successCount,
        failed: failureCount,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Fatal error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
