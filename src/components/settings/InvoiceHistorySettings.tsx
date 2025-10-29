import React, { useState, useEffect } from 'react'
import { FileText, ExternalLink, Download, Trash2, Calendar, DollarSign, RefreshCw, CloudDownload, CheckCircle, XCircle, Clock, XIcon } from 'lucide-react'
import { invoiceHistoryService, InvoiceHistoryRecord } from '@/services/invoiceHistoryService'
import { stripeInvoiceService } from '@/services/stripeInvoiceService'
import { InvoiceDetailModal } from '@/components/common/InvoiceDetailModal'

interface InvoiceRecord extends InvoiceHistoryRecord {
  invoiceId?: string
  timestamp?: string
  amount?: string
  generatedBy?: string
  dateRange?: string
}

const InvoiceHistorySettings: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  // HARDCODED: Only show invoices for create@artlee.agency
  const [customerEmailFilter] = useState<string>('create@artlee.agency')

  // Load invoice history from Supabase
  useEffect(() => {
    loadInvoiceHistory()
  }, [])

  // Auto-dismiss toast after 5 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null)
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [toast])

  const loadInvoiceHistory = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await invoiceHistoryService.getInvoices()

      if (result.success && result.data) {
        // Map database records to component format
        const mappedInvoices = result.data.map(invoice => ({
          ...invoice,
          invoiceId: invoice.invoice_id,
          timestamp: invoice.generated_at || invoice.created_at || new Date().toISOString(),
          amount: invoice.amount || `CAD $${invoice.total_cost_cad?.toFixed(2) || '0.00'}`,
          generatedBy: invoice.generated_by || 'Unknown',
          dateRange: invoice.date_range || invoice.invoice_month || 'N/A',
          email: invoice.customer_email,
          customerName: invoice.customer_name
        }))

        // Sort by timestamp descending (newest first)
        const sortedInvoices = mappedInvoices.sort((a, b) => {
          const dateA = new Date(a.timestamp).getTime()
          const dateB = new Date(b.timestamp).getTime()
          return dateB - dateA // Descending order (newest first)
        })

        setInvoices(sortedInvoices)
        console.log(`✅ Loaded ${sortedInvoices.length} invoices from Supabase (sorted newest first)`)
      } else {
        // Don't show error for authentication issues (normal during logout)
        if (result.error && !result.error.includes('authenticated')) {
          setError(result.error)
        }
        setInvoices([])
      }
    } catch (error) {
      console.error('Failed to load invoice history:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      // Don't show error for authentication issues
      if (!errorMessage.includes('authenticated')) {
        setError(errorMessage)
      }
      setInvoices([])
    } finally {
      setLoading(false)
    }
  }

  const deleteInvoice = async (id: string) => {
    if (!confirm('Are you sure you want to delete this invoice record? This will remove it from Supabase (and all devices), but not from Stripe.')) {
      return
    }

    try {
      const result = await invoiceHistoryService.deleteInvoice(id)

      if (result.success) {
        // Remove from local state
        const updatedHistory = invoices.filter(inv => inv.id !== id && inv.invoice_id !== id)
        setInvoices(updatedHistory)
        setSelectedInvoice(null)
        console.log('✅ Invoice deleted:', id)
        setToast({ message: 'Invoice deleted successfully', type: 'success' })
      } else {
        setToast({ message: `Failed to delete invoice: ${result.error}`, type: 'error' })
      }
    } catch (error) {
      console.error('Failed to delete invoice:', error)
      setToast({ message: 'Failed to delete invoice', type: 'error' })
    }
  }

  const clearAllHistory = async () => {
    if (!confirm('Are you sure you want to clear ALL invoice history? This will remove all invoices from Supabase (and all devices). This cannot be undone.')) {
      return
    }

    try {
      const result = await invoiceHistoryService.clearAllInvoices()

      if (result.success) {
        setInvoices([])
        setSelectedInvoice(null)
        console.log('✅ All invoice history cleared')
        setToast({ message: 'All invoice history cleared', type: 'success' })
      } else {
        setToast({ message: `Failed to clear invoice history: ${result.error}`, type: 'error' })
      }
    } catch (error) {
      console.error('Failed to clear invoice history:', error)
      setToast({ message: 'Failed to clear invoice history', type: 'error' })
    }
  }

  const syncFromStripe = async () => {
    setSyncing(true)
    setError(null)

    try {
      // Initialize Stripe first
      const initResult = await stripeInvoiceService.initialize()

      if (!initResult.success) {
        setError(initResult.error || 'Failed to initialize Stripe')
        setToast({ message: initResult.error || 'Failed to initialize Stripe', type: 'error' })
        return
      }

      // Fetch invoices from Stripe (with optional customer email filter)
      const fetchResult = await stripeInvoiceService.fetchAllInvoices(
        customerEmailFilter || undefined,
        100
      )

      if (!fetchResult.success || !fetchResult.data) {
        setError(fetchResult.error || 'Failed to fetch invoices from Stripe')
        setToast({ message: fetchResult.error || 'Failed to fetch invoices from Stripe', type: 'error' })
        return
      }

      console.log(`📥 Fetched ${fetchResult.data.length} invoices from Stripe${customerEmailFilter ? ` for ${customerEmailFilter}` : ''}`)

      // Sync to local database
      const syncResult = await invoiceHistoryService.syncFromStripe(fetchResult.data)

      if (!syncResult.success) {
        setError(syncResult.error || 'Failed to sync invoices')
        setToast({ message: syncResult.error || 'Failed to sync invoices', type: 'error' })
        return
      }

      // Reload invoice history
      await loadInvoiceHistory()

      console.log(`✅ Successfully synced ${syncResult.synced} invoices from Stripe`)
      setToast({ message: `Successfully synced ${syncResult.synced} invoices from Stripe`, type: 'success' })
    } catch (error) {
      console.error('Failed to sync from Stripe:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setError(errorMessage)
      setToast({ message: `Failed to sync from Stripe: ${errorMessage}`, type: 'error' })
    } finally {
      setSyncing(false)
    }
  }

  const exportHistory = () => {
    try {
      const dataStr = JSON.stringify(invoices, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `artlee-invoice-history-${new Date().toISOString().split('T')[0]}.json`
      link.click()
      URL.revokeObjectURL(url)
      console.log('📥 Invoice history exported')
      setToast({ message: 'Invoice history exported successfully', type: 'success' })
    } catch (error) {
      console.error('Failed to export invoice history:', error)
      setToast({ message: 'Failed to export invoice history', type: 'error' })
    }
  }

  const getPaymentStatusBadge = (invoice: InvoiceRecord) => {
    const status = invoice.invoice_status?.toLowerCase()
    const isPaid = invoice.paid_at || status === 'paid'

    if (isPaid) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs font-semibold rounded-full">
          <CheckCircle className="w-3 h-3" />
          Paid
        </span>
      )
    }

    if (status === 'open' || status === 'sent') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-xs font-semibold rounded-full">
          <Clock className="w-3 h-3" />
          Unpaid
        </span>
      )
    }

    if (status === 'void' || status === 'uncollectible') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-xs font-semibold rounded-full">
          <XCircle className="w-3 h-3" />
          {status === 'void' ? 'Void' : 'Uncollectible'}
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 text-xs font-semibold rounded-full">
        {status || 'Draft'}
      </span>
    )
  }

  // Filter invoices by customer email
  const filteredInvoices = customerEmailFilter
    ? invoices.filter(inv => inv.email?.toLowerCase().includes(customerEmailFilter.toLowerCase()))
    : invoices

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Invoice History</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {loading ? 'Loading invoices from Supabase...' : 'Viewing invoices for create@artlee.agency (synced across devices)'}
          </p>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              ⚠️ {error}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={syncFromStripe}
            disabled={loading || syncing}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            title="Sync from Stripe"
          >
            <CloudDownload className={`w-4 h-4 ${syncing ? 'animate-bounce' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync from Stripe'}
          </button>
          <button
            onClick={loadInvoiceHistory}
            disabled={loading || syncing}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            title="Refresh from Supabase"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportHistory}
            disabled={invoices.length === 0 || loading || syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={clearAllHistory}
            disabled={invoices.length === 0 || loading || syncing}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Clear All
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-blue-600" />
            <div>
              <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{filteredInvoices.length}</div>
              <div className="text-xs text-blue-700 dark:text-blue-300">Total Invoices</div>
            </div>
          </div>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-600 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-green-600" />
            <div>
              <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                {filteredInvoices.length > 0
                  ? filteredInvoices.reduce((sum, inv) => {
                      // Try to get amount from different fields
                      const amountStr = inv.amount || `${inv.total_cost_cad || 0}`
                      const amount = parseFloat(amountStr.toString().replace(/[^0-9.-]+/g, ''))
                      return sum + (isNaN(amount) ? 0 : amount)
                    }, 0).toFixed(2)
                  : '0.00'}
              </div>
              <div className="text-xs text-green-700 dark:text-green-300">Total Amount (CAD)</div>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-600 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-purple-600" />
            <div>
              <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {filteredInvoices.length > 0
                  ? new Date(filteredInvoices[0].timestamp).toLocaleDateString()
                  : 'N/A'}
              </div>
              <div className="text-xs text-purple-700 dark:text-purple-300">Latest Invoice</div>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice List */}
      {filteredInvoices.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-12 text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">No Invoices Found</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {customerEmailFilter
              ? `No invoices found for "${customerEmailFilter}". Generate a new invoice or sync from Stripe to see results.`
              : 'No invoices found. Click "Sync from Stripe" to fetch invoices from your Stripe account.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Period
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredInvoices.map((invoice) => (
                  <tr
                    key={invoice.invoiceId}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    onClick={() => {
                      setSelectedInvoice(invoice)
                      setIsDetailModalOpen(true)
                    }}
                  >
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {new Date(invoice.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {invoice.customerName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {invoice.email}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-green-600 dark:text-green-400">
                      {invoice.amount}
                    </td>
                    <td className="px-4 py-3">
                      {getPaymentStatusBadge(invoice)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {invoice.dateRange}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {invoice.invoice_url && (
                          <a
                            href={invoice.invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
                            title="View in Stripe"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteInvoice(invoice.id || invoice.invoice_id)
                          }}
                          className="p-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false)
            setSelectedInvoice(null)
          }}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 transition-all duration-300 ease-in-out">
          <div
            className={`flex items-center gap-3 px-6 py-4 rounded-lg shadow-lg border-l-4 ${
              toast.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-500 text-green-800 dark:text-green-300'
                : toast.type === 'error'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-500 text-red-800 dark:text-red-300'
                : 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-800 dark:text-blue-300'
            }`}
          >
            <div className="flex-shrink-0">
              {toast.type === 'success' && <CheckCircle className="w-6 h-6" />}
              {toast.type === 'error' && <XCircle className="w-6 h-6" />}
              {toast.type === 'info' && <FileText className="w-6 h-6" />}
            </div>
            <div className="flex-1 font-medium">{toast.message}</div>
            <button
              onClick={() => setToast(null)}
              className="flex-shrink-0 p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default InvoiceHistorySettings
