import React from 'react'
import {
  FileText,
  XIcon,
  DollarSign,
  Calendar,
  User,
  Mail,
  ExternalLink,
  Download,
  CheckCircle,
  Clock,
  XCircle
} from 'lucide-react'

interface InvoiceDetailModalProps {
  invoice: {
    invoiceId?: string
    invoice_id?: string
    timestamp?: string
    amount?: string
    total_cost_cad?: number
    customerName?: string
    customer_name?: string
    email?: string
    customer_email?: string
    dateRange?: string
    invoice_month?: string
    generatedBy?: string
    generated_by?: string
    invoiceUrl?: string
    invoice_url?: string
    invoice_status?: string
    paid_at?: Date | string
    period_start?: Date | string
    period_end?: Date | string
  }
  isOpen: boolean
  onClose: () => void
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ invoice, isOpen, onClose }) => {
  if (!isOpen) return null

  const getPaymentStatusBadge = () => {
    const status = invoice.invoice_status?.toLowerCase()
    const isPaid = invoice.paid_at || status === 'paid'

    if (isPaid) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-sm font-semibold rounded-full">
          <CheckCircle className="w-4 h-4" />
          Paid
        </span>
      )
    }

    if (status === 'open' || status === 'sent') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 text-sm font-semibold rounded-full">
          <Clock className="w-4 h-4" />
          Unpaid
        </span>
      )
    }

    if (status === 'void' || status === 'uncollectible') {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm font-semibold rounded-full">
          <XCircle className="w-4 h-4" />
          {status === 'void' ? 'Void' : 'Uncollectible'}
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 text-sm font-semibold rounded-full">
        {status || 'Draft'}
      </span>
    )
  }

  const invoiceId = invoice.invoiceId || invoice.invoice_id || 'N/A'
  const customerName = invoice.customerName || invoice.customer_name || 'Unknown'
  const customerEmail = invoice.email || invoice.customer_email || 'N/A'
  const amount = invoice.amount || `CAD $${invoice.total_cost_cad?.toFixed(2) || '0.00'}`
  const dateRange = invoice.dateRange || invoice.invoice_month || 'N/A'
  const generatedBy = invoice.generatedBy || invoice.generated_by || 'Unknown'
  const invoiceUrl = invoice.invoiceUrl || invoice.invoice_url
  const timestamp = invoice.timestamp || new Date().toISOString()

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Invoice Details
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mt-1">
                <span className="font-mono">{invoiceId}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <XIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Amount</span>
                </div>
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {amount}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Generated</span>
                </div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {new Date(timestamp).toLocaleDateString()}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {new Date(timestamp).toLocaleTimeString()}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">Status</span>
                </div>
                <div className="mt-2">
                  {getPaymentStatusBadge()}
                </div>
              </div>
            </div>

            {/* Customer Information */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-4 flex items-center gap-2">
                <User className="w-5 h-5" />
                Customer Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">Customer Name</div>
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {customerName}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-blue-700 dark:text-blue-300 mb-1 flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    Email Address
                  </div>
                  <div className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    {customerEmail}
                  </div>
                </div>
              </div>
            </div>

            {/* Invoice Details */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Invoice Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Invoice ID</div>
                  <div className="text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                    {invoiceId}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Billing Period
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    {dateRange}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Generated By</div>
                  <div className="text-sm text-gray-900 dark:text-gray-100">
                    {generatedBy}
                  </div>
                </div>
                {invoice.paid_at && (
                  <div>
                    <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Paid On</div>
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {new Date(invoice.paid_at).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {invoiceUrl && (
              <div className="flex gap-3">
                <a
                  href={invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  <ExternalLink className="w-5 h-5" />
                  View Invoice in Stripe
                </a>
                <a
                  href={invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
                >
                  <Download className="w-5 h-5" />
                  PDF
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
