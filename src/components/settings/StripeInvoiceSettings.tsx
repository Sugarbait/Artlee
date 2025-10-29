import React, { useState, useEffect } from 'react'
import { stripeInvoiceService, type InvoiceData } from '@/services/stripeInvoiceService'
import { DateRangePicker, type DateRange, getDateRangeFromSelection } from '@/components/common/DateRangePicker'
import {
  CreditCardIcon,
  MailIcon,
  CalendarIcon,
  DollarSignIcon,
  FileTextIcon,
  SendIcon,
  EyeIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  RefreshCwIcon
} from 'lucide-react'

interface StripeInvoiceSettingsProps {
  user: any
}

export const StripeInvoiceSettings: React.FC<StripeInvoiceSettingsProps> = ({ user }) => {
  const [stripeApiKey, setStripeApiKey] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)
  const [initError, setInitError] = useState('')

  // Customer info - ARTLEE: Hardcoded to always use Artlee Creative
  const [customerEmail] = useState('create@artlee.agency')
  const [customerName] = useState('Artlee Creative')

  // Auto-invoice settings
  const [autoInvoiceEnabled, setAutoInvoiceEnabled] = useState(false)
  const [isSavingAutoInvoice, setIsSavingAutoInvoice] = useState(false)

  // Date range for invoice
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>('lastMonth')
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>()
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>()

  // Invoice preview
  const [invoicePreview, setInvoicePreview] = useState<InvoiceData | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)

  // Invoice generation
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationSuccess, setGenerationSuccess] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [generatedInvoiceUrl, setGeneratedInvoiceUrl] = useState('')

  // Load settings from localStorage and Supabase
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
        if (currentUser.id) {
          // Load from localStorage first
          const settings = JSON.parse(localStorage.getItem(`settings_${currentUser.id}`) || '{}')
          if (settings.stripeSecretKey) {
            setStripeApiKey(settings.stripeSecretKey)
          }

          // Try to load from Supabase for synced settings
          try {
            const { userSettingsService } = await import('@/services/userSettingsService')
            const supabaseSettings = await userSettingsService.getUserSettings(currentUser.id)

            if (supabaseSettings?.stripe_auto_invoice_enabled !== undefined) {
              setAutoInvoiceEnabled(supabaseSettings.stripe_auto_invoice_enabled)
            }
            // ARTLEE: Customer email and name are hardcoded - don't load from settings
          } catch (supabaseError) {
            console.log('Supabase not available, using localStorage fallback')
          }
        }

        // ARTLEE: Customer email and name are hardcoded to Artlee Creative - don't set from user
      } catch (error) {
        console.error('Failed to load Stripe settings:', error)
      }
    }

    loadSettings()
  }, [user])

  // Check if Stripe is already initialized
  useEffect(() => {
    setIsInitialized(stripeInvoiceService.isConfigured())
  }, [])

  // Initialize Stripe
  const handleInitialize = async () => {
    if (!stripeApiKey.trim()) {
      setInitError('Please enter a Stripe API key')
      return
    }

    setInitError('')
    const result = await stripeInvoiceService.initialize(stripeApiKey)

    if (result.success) {
      setIsInitialized(true)

      // Save to localStorage
      try {
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
        if (currentUser.id) {
          const settings = JSON.parse(localStorage.getItem(`settings_${currentUser.id}`) || '{}')
          settings.stripeSecretKey = stripeApiKey
          localStorage.setItem(`settings_${currentUser.id}`, JSON.stringify(settings))
        }
      } catch (error) {
        console.error('Failed to save Stripe settings:', error)
      }
    } else {
      setInitError(result.error || 'Failed to initialize Stripe')
    }
  }

  // Load invoice preview
  const handleLoadPreview = async () => {
    setIsLoadingPreview(true)
    setInvoicePreview(null)

    try {
      const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)
      const preview = await stripeInvoiceService.previewInvoice(start, end)
      setInvoicePreview(preview)
    } catch (error) {
      console.error('Failed to load invoice preview:', error)
      setInitError('Failed to load invoice preview')
    } finally {
      setIsLoadingPreview(false)
    }
  }

  // Generate invoice
  const handleGenerateInvoice = async (sendImmediately: boolean = false) => {
    if (!customerEmail || !customerName) {
      setGenerationError('Please enter customer email and name')
      return
    }

    if (!isInitialized) {
      setGenerationError('Stripe not initialized. Please configure API key first.')
      return
    }

    setIsGenerating(true)
    setGenerationSuccess(false)
    setGenerationError('')
    setGeneratedInvoiceUrl('')

    try {
      const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)

      const result = await stripeInvoiceService.createInvoice({
        customerInfo: {
          email: customerEmail,
          name: customerName,
          description: 'ARTLEE Business Platform CRM Customer'
        },
        dateRange: {
          start,
          end,
          label: invoicePreview?.dateRange.label
        },
        sendImmediately,
        autoFinalize: sendImmediately
      })

      if (result.success) {
        setGenerationSuccess(true)
        setGeneratedInvoiceUrl(result.invoiceUrl || '')

        // Refresh preview to show it's been invoiced
        if (invoicePreview) {
          handleLoadPreview()
        }
      } else {
        setGenerationError(result.error || 'Failed to generate invoice')
      }
    } catch (error) {
      console.error('Failed to generate invoice:', error)
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate invoice')
    } finally {
      setIsGenerating(false)
    }
  }

  // Handle auto-invoice toggle
  const handleAutoInvoiceToggle = async (enabled: boolean) => {
    setIsSavingAutoInvoice(true)
    setAutoInvoiceEnabled(enabled)

    try {
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
      if (!currentUser.id) {
        throw new Error('User not found')
      }

      // Save to Supabase for cross-device sync
      const { userSettingsService } = await import('@/services/userSettingsService')
      await userSettingsService.updateUserSettings(currentUser.id, {
        stripe_auto_invoice_enabled: enabled,
        stripe_customer_email: customerEmail,
        stripe_customer_name: customerName,
        stripe_auto_invoice_last_check: new Date().toISOString()
      })

      // Also save to localStorage as backup
      const settings = JSON.parse(localStorage.getItem(`settings_${currentUser.id}`) || '{}')
      settings.stripeAutoInvoiceEnabled = enabled
      settings.stripeCustomerEmail = customerEmail
      settings.stripeCustomerName = customerName
      localStorage.setItem(`settings_${currentUser.id}`, JSON.stringify(settings))

      console.log(`✅ Auto-invoice ${enabled ? 'enabled' : 'disabled'} successfully`)
    } catch (error) {
      console.error('Failed to save auto-invoice settings:', error)
      setGenerationError('Failed to save auto-invoice settings')
      // Revert toggle on error
      setAutoInvoiceEnabled(!enabled)
    } finally {
      setIsSavingAutoInvoice(false)
    }
  }

  // Generate automatic monthly invoice
  const handleGenerateMonthlyInvoice = async () => {
    if (!customerEmail || !customerName) {
      setGenerationError('Please enter customer email and name')
      return
    }

    if (!isInitialized) {
      setGenerationError('Stripe not initialized. Please configure API key first.')
      return
    }

    setIsGenerating(true)
    setGenerationSuccess(false)
    setGenerationError('')
    setGeneratedInvoiceUrl('')

    try {
      const result = await stripeInvoiceService.generateMonthlyInvoice({
        email: customerEmail,
        name: customerName,
        description: 'ARTLEE Business Platform CRM Customer'
      })

      if (result.success) {
        setGenerationSuccess(true)
        setGeneratedInvoiceUrl(result.invoiceUrl || '')
      } else {
        setGenerationError(result.error || 'Failed to generate monthly invoice')
      }
    } catch (error) {
      console.error('Failed to generate monthly invoice:', error)
      setGenerationError(error instanceof Error ? error.message : 'Failed to generate monthly invoice')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stripe Configuration Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <CreditCardIcon className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Stripe Configuration
          </h3>
        </div>

        {isInitialized ? (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-600 rounded-lg">
            <CheckCircleIcon className="w-5 h-5 text-green-600" />
            <span className="text-sm text-green-800 dark:text-green-200">
              Stripe is configured and ready
            </span>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Stripe Secret API Key
              </label>
              <input
                type="password"
                value={stripeApiKey}
                onChange={(e) => setStripeApiKey(e.target.value)}
                placeholder="sk_test_..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Get your API key from the Stripe Dashboard
              </p>
            </div>

            {initError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-600 rounded-lg">
                <AlertCircleIcon className="w-5 h-5 text-red-600" />
                <span className="text-sm text-red-800 dark:text-red-200">{initError}</span>
              </div>
            )}

            <button
              onClick={handleInitialize}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <CheckCircleIcon className="w-4 h-4" />
              Initialize Stripe
            </button>
          </div>
        )}
      </div>

      {/* Customer Information Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <MailIcon className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Customer Information
          </h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Customer Email
            </label>
            <input
              type="email"
              value={customerEmail}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Customer Name
            </label>
            <input
              type="text"
              value={customerName}
              readOnly
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 cursor-not-allowed"
            />
          </div>
        </div>
      </div>

      {/* Invoice Generation Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileTextIcon className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Generate Invoice
          </h3>
        </div>

        <div className="space-y-4">
          {/* Date Range Picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Billing Period
            </label>
            <DateRangePicker
              selectedRange={selectedDateRange}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
              onRangeChange={(range, customStart, customEnd) => {
                setSelectedDateRange(range)
                setCustomStartDate(customStart)
                setCustomEndDate(customEnd)
                setInvoicePreview(null) // Clear preview when range changes
              }}
            />
          </div>

          {/* Preview Button */}
          <button
            onClick={handleLoadPreview}
            disabled={isLoadingPreview || !isInitialized}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingPreview ? (
              <>
                <RefreshCwIcon className="w-4 h-4 animate-spin" />
                Loading Preview...
              </>
            ) : (
              <>
                <EyeIcon className="w-4 h-4" />
                Preview Invoice
              </>
            )}
          </button>

          {/* Invoice Preview */}
          {invoicePreview && (
            <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                Invoice Preview - {invoicePreview.dateRange.label}
              </h4>

              <div className="space-y-3">
                {/* Call Costs */}
                {invoicePreview.callCosts.items.map((item, index) => (
                  <div key={`call-${index}`} className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{item.description}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      CAD ${item.amount_total.toFixed(2)}
                    </span>
                  </div>
                ))}

                {/* SMS Costs */}
                {invoicePreview.smsCosts.items.map((item, index) => (
                  <div key={`sms-${index}`} className="flex justify-between items-center text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{item.description}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      CAD ${item.amount_total.toFixed(2)}
                    </span>
                  </div>
                ))}

                {/* Total */}
                <div className="pt-3 border-t border-gray-300 dark:border-gray-600 flex justify-between items-center">
                  <span className="font-semibold text-gray-900 dark:text-gray-100">Total</span>
                  <span className="font-bold text-lg text-green-600 dark:text-green-400">
                    CAD ${invoicePreview.combinedTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Generation Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleGenerateInvoice(false)}
              disabled={isGenerating || !isInitialized || !invoicePreview}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <RefreshCwIcon className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileTextIcon className="w-4 h-4" />
                  Create Draft Invoice
                </>
              )}
            </button>

            <button
              onClick={() => handleGenerateInvoice(true)}
              disabled={isGenerating || !isInitialized || !invoicePreview}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <RefreshCwIcon className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <SendIcon className="w-4 h-4" />
                  Generate & Send Invoice
                </>
              )}
            </button>
          </div>

          {/* Success Message */}
          {generationSuccess && (
            <div className="flex flex-col gap-2 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-600 rounded-lg">
              <div className="flex items-center gap-2">
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-800 dark:text-green-200">
                  Invoice generated successfully!
                </span>
              </div>
              {generatedInvoiceUrl && (
                <a
                  href={generatedInvoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  View Invoice
                </a>
              )}
            </div>
          )}

          {/* Error Message */}
          {generationError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-600 rounded-lg">
              <AlertCircleIcon className="w-5 h-5 text-red-600" />
              <span className="text-sm text-red-800 dark:text-red-200">{generationError}</span>
            </div>
          )}
        </div>
      </div>

      {/* Automatic Monthly Invoice Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <CalendarIcon className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Automatic Monthly Invoice
          </h3>
        </div>

        <div className="space-y-6">
          {/* Auto-Invoice Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1">
                Enable Automatic Invoicing
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Automatically generate and send invoices on the 1st of each month for the previous month's services
              </p>
              <div className="mt-2 space-y-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  • Runs via Supabase Cron (hands-off, even when app is closed)
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  • Also triggers when you log in on the 1st (backup)
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  • Retries up to 3 times if generation fails
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  • Email notification sent to you on success/failure
                </p>
              </div>
            </div>
            <div className="ml-4">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoInvoiceEnabled}
                  onChange={(e) => handleAutoInvoiceToggle(e.target.checked)}
                  disabled={isSavingAutoInvoice || !isInitialized || !customerEmail || !customerName}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"></div>
              </label>
            </div>
          </div>

          {/* Requirements Notice */}
          {(!customerEmail || !customerName) && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-600 rounded-lg">
              <AlertCircleIcon className="w-5 h-5 text-yellow-600" />
              <span className="text-sm text-yellow-800 dark:text-yellow-200">
                Please configure customer email and name above to enable automatic invoicing
              </span>
            </div>
          )}

          {/* Manual Generate Button */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Or manually generate an invoice for the previous month
            </p>
            <button
              onClick={handleGenerateMonthlyInvoice}
              disabled={isGenerating || !isInitialized}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <RefreshCwIcon className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <CalendarIcon className="w-4 h-4" />
                  Generate Last Month's Invoice
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default StripeInvoiceSettings
