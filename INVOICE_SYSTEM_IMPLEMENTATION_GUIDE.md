# Invoice System Implementation Guide

## Overview

This document provides a complete implementation guide for the invoice generation, history tracking, and subscription management system built for ARTLEE CRM. This system can be replicated in other CRM applications.

**Key Features:**
- Generate Stripe invoices with PDF reports
- Email invoices to customers with attachments
- Track invoice history with search and filtering
- Manage subscriptions via Stripe Customer Portal
- Export detailed PDF reports with charts and analytics

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Architecture Overview](#architecture-overview)
3. [Generate Invoice Button](#generate-invoice-button)
4. [Invoice History Component](#invoice-history-component)
5. [Manage Subscription Portal](#manage-subscription-portal)
6. [PDF Export Service](#pdf-export-service)
7. [Email Notification Service](#email-notification-service)
8. [Database Schema](#database-schema)
9. [Environment Variables](#environment-variables)
10. [Testing & Verification](#testing--verification)

---

## Prerequisites

### Required Services
- **Stripe Account**: For invoice generation and customer portal
- **Supabase Account**: For database and storage
- **Resend Account**: For email delivery (or alternative SMTP service)
- **Node.js**: v18 or higher
- **React**: v18 or higher

### Required NPM Packages
```json
{
  "dependencies": {
    "@stripe/stripe-js": "^2.0.0",
    "stripe": "^14.0.0",
    "jspdf": "^2.5.1",
    "html2canvas": "^1.4.1",
    "date-fns": "^2.30.0",
    "recharts": "^2.10.0",
    "@supabase/supabase-js": "^2.38.0",
    "lucide-react": "^0.300.0"
  }
}
```

### Stripe Setup
1. Create Stripe account at https://stripe.com
2. Enable Invoicing in Stripe Dashboard → Billing → Invoices
3. Set up Customer Portal at Settings → Customer Portal
4. Get API keys from Developers → API Keys
5. Create webhook endpoint for invoice events (optional)

### Supabase Setup
1. Create project at https://supabase.com
2. Create `invoice-reports` storage bucket:
   - Go to Storage → New Bucket
   - Name: `invoice-reports`
   - Public: No
   - File size limit: 50MB
3. Set up RLS policies (see Database Schema section)
4. Get service role key from Settings → API

---

## Architecture Overview

### System Flow

```
User Clicks "Generate Invoice"
    ↓
Dashboard Page validates data
    ↓
Creates Stripe Invoice via API
    ↓
Generates PDF Report (jsPDF)
    ↓
Uploads PDF to Supabase Storage
    ↓
Sends Email with Invoice Link + PDF Download
    ↓
Saves Invoice Record to Database
    ↓
Shows Success Toast Notification
```

### Component Hierarchy

```
DashboardPage.tsx
├── Generate Invoice Button
├── Date Range Picker
└── Dashboard Metrics

SettingsPage.tsx
├── Invoice History Tab
│   └── InvoiceHistorySettings.tsx
│       ├── Search Bar
│       ├── Status Filter
│       └── Invoice Table
└── Manage Subscription Tab
    └── Stripe Customer Portal UI

Services
├── pdfExportService.ts (PDF generation)
├── emailNotificationService.ts (email sending)
└── generalToastService.ts (notifications)
```

---

## Generate Invoice Button

### 1. Add Button to Dashboard

**File:** `src/pages/DashboardPage.tsx`

Add the button to your dashboard header:

```tsx
// Import required icons
import { DollarSignIcon, Loader2Icon } from 'lucide-react'

// Add state for invoice generation
const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false)

// Add button in your dashboard header/toolbar
<button
  onClick={handleGenerateInvoice}
  disabled={isGeneratingInvoice || isLoadingMetrics}
  className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium shadow-sm hover:shadow-md"
  title="Generate invoice for current date range"
>
  {isGeneratingInvoice ? (
    <>
      <Loader2Icon className="w-5 h-5 animate-spin" />
      Generating...
    </>
  ) : (
    <>
      <DollarSignIcon className="w-5 h-5" />
      Generate Invoice
    </>
  )}
</button>
```

### 2. Implement Invoice Generation Logic

**File:** `src/pages/DashboardPage.tsx`

Add the complete invoice generation function:

```tsx
const handleGenerateInvoice = async () => {
  // Validate customer email
  const invoiceCustomerEmail = prompt('Enter customer email address for invoice:')
  if (!invoiceCustomerEmail || !invoiceCustomerEmail.includes('@')) {
    generalToast.warning('Please provide a valid email address.', 'Invalid Email')
    return
  }

  setIsGeneratingInvoice(true)

  try {
    const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)

    // Format date range for display
    const dateRangeText = `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`

    // Convert costs to CAD (if needed)
    const callCostCAD = (metrics.totalCost || 0) * 1.45
    const smsCostCAD = (metrics.totalSMSCost || 0) * 1.45
    const totalCAD = callCostCAD + smsCostCAD

    // Create Stripe invoice
    console.log('📝 Creating Stripe invoice...')
    const stripeResponse = await fetch('https://api.stripe.com/v1/invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': 'YOUR_STRIPE_CUSTOMER_ID', // Replace with actual customer lookup
        'auto_advance': 'true',
        'collection_method': 'send_invoice',
        'days_until_due': '30',
        'description': `Invoice for ${dateRangeText}`,
        'metadata[date_range]': dateRangeText,
        'metadata[call_count]': String(metrics.totalCalls || 0),
        'metadata[sms_count]': String(metrics.totalChats || 0),
      }),
    })

    if (!stripeResponse.ok) {
      throw new Error(`Stripe API error: ${stripeResponse.statusText}`)
    }

    const invoice = await stripeResponse.json()
    console.log('✅ Stripe invoice created:', invoice.id)

    // Add line items
    await fetch(`https://api.stripe.com/v1/invoiceitems`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': 'YOUR_STRIPE_CUSTOMER_ID',
        'invoice': invoice.id,
        'description': `Voice Call Services (${metrics.totalCalls || 0} calls)`,
        'amount': String(Math.round(callCostCAD * 100)), // Stripe uses cents
        'currency': 'cad',
      }),
    })

    await fetch(`https://api.stripe.com/v1/invoiceitems`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'customer': 'YOUR_STRIPE_CUSTOMER_ID',
        'invoice': invoice.id,
        'description': `SMS Messaging (${metrics.totalChats || 0} messages)`,
        'amount': String(Math.round(smsCostCAD * 100)),
        'currency': 'cad',
      }),
    })

    // Finalize invoice
    await fetch(`https://api.stripe.com/v1/invoices/${invoice.id}/finalize`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_STRIPE_SECRET_KEY}`,
      },
    })

    console.log('✅ Stripe invoice finalized')

    // Generate and upload PDF report
    console.log('📤 Uploading PDF report to Supabase Storage...')
    const cadMetrics = {
      ...metrics,
      totalCost: callCostCAD,
      avgCostPerCall: (metrics.avgCostPerCall || 0) * 1.45,
      highestCostCall: (metrics.highestCostCall || 0) * 1.45,
      lowestCostCall: (metrics.lowestCostCall || 0) * 1.45,
      totalSMSCost: smsCostCAD,
      avgCostPerMessage: (metrics.avgCostPerMessage || 0) * 1.45
    }

    const pdfUploadResult = await pdfExportService.uploadReportToStorage(cadMetrics, {
      dateRange: selectedDateRange,
      startDate: start,
      endDate: end,
      companyName: 'ARTLEE Business Platform CRM',
      reportTitle: `Invoice ${invoice.number} - Dashboard Report`
    })

    let pdfDownloadLink = pdfUploadResult.downloadUrl || ''

    if (!pdfUploadResult.success) {
      console.error('❌ PDF upload failed:', pdfUploadResult.error)
      console.error('⚠️ Email will be sent WITHOUT Dashboard PDF download link')
    } else {
      console.log('✅ PDF uploaded successfully:', pdfDownloadLink)
    }

    // Send email notification
    console.log('📧 Sending invoice email...')
    const emailResult = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-invoice-email`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          to_email: invoiceCustomerEmail.trim(),
          to_name: 'Valued Customer',
          invoice_id: invoice.number,
          date_range: dateRangeText,
          total_amount: `CAD $${totalCAD.toFixed(2)}`,
          total_calls: metrics.totalCalls || 0,
          call_cost: `CAD $${callCostCAD.toFixed(2)}`,
          total_chats: metrics.totalChats || 0,
          sms_cost: `CAD $${smsCostCAD.toFixed(2)}`,
          invoice_url: invoice.hosted_invoice_url,
          pdf_download_link: pdfDownloadLink,
          pdf_expiry_days: 7
        })
      }
    )

    const emailResponse = await emailResult.json()

    // Save to invoice history (optional - see Database Schema section)
    // await saveInvoiceToDatabase({ ... })

    // Show success notification
    if (emailResponse.success) {
      generalToast.success(
        `Invoice generated and emailed successfully! Invoice ID: ${invoice.number}. Email sent to ${invoiceCustomerEmail.trim()}.`,
        'Invoice Sent',
        7000
      )
    } else {
      generalToast.warning(
        `Invoice generated successfully (ID: ${invoice.number}) but email failed to send. Error: ${emailResponse.error || 'Unknown error'}`,
        'Email Failed',
        8000
      )
    }

  } catch (error) {
    console.error('❌ Invoice generation failed:', error)
    generalToast.error(
      `Failed to generate invoice: ${error.message}`,
      'Invoice Generation Failed',
      8000
    )
  } finally {
    setIsGeneratingInvoice(false)
  }
}
```

### 3. Customer Email Input Options

**Option 1: Prompt Dialog** (shown above)
```tsx
const invoiceCustomerEmail = prompt('Enter customer email address for invoice:')
```

**Option 2: Modal with Form** (recommended for better UX)
```tsx
// Add state
const [showInvoiceModal, setShowInvoiceModal] = useState(false)
const [invoiceEmail, setInvoiceEmail] = useState('')

// Modal component
{showInvoiceModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
      <h3 className="text-xl font-bold mb-4">Generate Invoice</h3>
      <label className="block mb-2">Customer Email</label>
      <input
        type="email"
        value={invoiceEmail}
        onChange={(e) => setInvoiceEmail(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg mb-4"
        placeholder="customer@example.com"
      />
      <div className="flex gap-2">
        <button onClick={() => generateInvoiceWithEmail(invoiceEmail)}>
          Generate
        </button>
        <button onClick={() => setShowInvoiceModal(false)}>
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
```

---

## Invoice History Component

### 1. Create Invoice History Component

**File:** `src/components/settings/InvoiceHistorySettings.tsx`

Create the complete invoice history component:

```tsx
import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { SearchIcon, DollarSignIcon, FileTextIcon, CalendarIcon, MailIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from 'lucide-react'
import { supabase } from '@/config/supabase'

interface Invoice {
  id: string
  invoice_number: string
  customer_email: string
  customer_name: string
  date_range: string
  total_amount: number
  currency: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  stripe_invoice_id: string
  stripe_invoice_url: string
  pdf_download_url: string | null
  created_at: string
  paid_at: string | null
  due_date: string | null
  call_count: number
  call_cost: number
  sms_count: number
  sms_cost: number
}

const statusColors = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  open: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  paid: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  void: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  uncollectible: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
}

const statusIcons = {
  draft: ClockIcon,
  open: FileTextIcon,
  paid: CheckCircleIcon,
  void: XCircleIcon,
  uncollectible: XCircleIcon
}

export const InvoiceHistorySettings: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    loadInvoices()
  }, [])

  const loadInvoices = async () => {
    try {
      setLoading(true)

      // Load from Supabase
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading invoices:', error)
        return
      }

      setInvoices(data || [])
    } catch (error) {
      console.error('Failed to load invoices:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter invoices
  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customer_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customer_name.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter

    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Invoice History</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          View and manage all generated invoices
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by invoice number, email, or customer name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="open">Open</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
          <option value="uncollectible">Uncollectible</option>
        </select>
      </div>

      {/* Invoice Table */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Loading invoices...</p>
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="p-8 text-center">
            <FileTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              {searchTerm || statusFilter !== 'all'
                ? 'No invoices match your filters'
                : 'No invoices generated yet'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Date Range
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredInvoices.map((invoice) => {
                  const StatusIcon = statusIcons[invoice.status]

                  return (
                    <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {invoice.customer_name}
                          </div>
                          <div className="text-gray-500 dark:text-gray-400">
                            {invoice.customer_email}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {invoice.date_range}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {invoice.currency.toUpperCase()} ${invoice.total_amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[invoice.status]}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {format(new Date(invoice.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <a
                            href={invoice.stripe_invoice_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
                          >
                            View Invoice
                          </a>
                          {invoice.pdf_download_url && (
                            <>
                              <span className="text-gray-300 dark:text-gray-600">|</span>
                              <a
                                href={invoice.pdf_download_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 text-sm font-medium"
                              >
                                Download PDF
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {filteredInvoices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="text-sm text-blue-700 dark:text-blue-300 font-medium mb-1">Total Invoices</div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">{filteredInvoices.length}</div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="text-sm text-green-700 dark:text-green-300 font-medium mb-1">Paid</div>
            <div className="text-2xl font-bold text-green-900 dark:text-green-100">
              {filteredInvoices.filter(i => i.status === 'paid').length}
            </div>
          </div>

          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
            <div className="text-sm text-orange-700 dark:text-orange-300 font-medium mb-1">Open</div>
            <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
              {filteredInvoices.filter(i => i.status === 'open').length}
            </div>
          </div>

          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div className="text-sm text-purple-700 dark:text-purple-300 font-medium mb-1">Total Revenue</div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              CAD ${filteredInvoices
                .filter(i => i.status === 'paid')
                .reduce((sum, i) => sum + i.total_amount, 0)
                .toFixed(2)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

### 2. Add Invoice History Tab to Settings

**File:** `src/pages/SettingsPage.tsx`

Add the invoice history tab:

```tsx
// Add to imports
import { DollarSignIcon } from 'lucide-react'
import { InvoiceHistorySettings } from '@/components/settings/InvoiceHistorySettings'

// Add to tabs array (for Super Users only)
const tabs = [
  // ... other tabs
  ...(user?.role === 'super_user' ? [
    { id: 'invoices', name: 'Invoice History', icon: DollarSignIcon },
  ] : [])
]

// Add tab content rendering
{activeTab === 'invoices' && user?.role === 'super_user' && (
  <InvoiceHistorySettings />
)}
```

---

## Manage Subscription Portal

### 1. Add Subscription Tab to Settings

**File:** `src/pages/SettingsPage.tsx`

Add the Stripe Customer Portal UI:

```tsx
// Add to imports
import { CreditCardIcon, CheckIcon, LinkIcon } from 'lucide-react'

// Add to tabs array (for Super Users only)
const tabs = [
  // ... other tabs
  ...(user?.role === 'super_user' ? [
    { id: 'subscription', name: 'Manage Subscription', icon: CreditCardIcon },
  ] : [])
]

// Add tab content rendering
{activeTab === 'subscription' && user?.role === 'super_user' && (
  <div className="space-y-6">
    {/* Header */}
    <div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Manage Subscription</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        View and manage your Stripe billing and subscription details
      </p>
    </div>

    {/* Subscription Card */}
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
      <div className="flex items-center gap-6">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <CreditCardIcon className="w-8 h-8 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Stripe Customer Portal
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Access your Stripe billing portal to view invoices, update payment methods, and manage your subscription.
          </p>
          <a
            href="YOUR_STRIPE_CUSTOMER_PORTAL_URL"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm hover:shadow-md"
          >
            <CreditCardIcon className="w-5 h-5" />
            Open Billing Portal
            <LinkIcon className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <div className="text-xs text-blue-700 dark:text-blue-300 font-semibold mb-1">
            What You Can Do
          </div>
          <ul className="text-sm text-blue-900 dark:text-blue-100 space-y-1">
            <li className="flex items-start gap-2">
              <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>View all invoices</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Download receipts</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Update payment method</span>
            </li>
          </ul>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
          <div className="text-xs text-purple-700 dark:text-purple-300 font-semibold mb-1">
            Subscription Details
          </div>
          <ul className="text-sm text-purple-900 dark:text-purple-100 space-y-1">
            <li className="flex items-start gap-2">
              <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>View current plan</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Update subscription</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Cancel anytime</span>
            </li>
          </ul>
        </div>

        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
          <div className="text-xs text-green-700 dark:text-green-300 font-semibold mb-1">
            Secure & Private
          </div>
          <ul className="text-sm text-green-900 dark:text-green-100 space-y-1">
            <li className="flex items-start gap-2">
              <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>256-bit SSL encryption</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>PCI compliant</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Powered by Stripe</span>
            </li>
          </ul>
        </div>
      </div>
    </div>

    {/* Help Text */}
    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <p className="text-sm text-gray-700 dark:text-gray-300">
        <strong>Note:</strong> The Stripe Customer Portal is a secure way to manage your billing information.
        All payment processing is handled by Stripe, our trusted payment provider. Your payment information is never stored on our servers.
      </p>
    </div>
  </div>
)}
```

### 2. Get Your Stripe Customer Portal URL

1. Go to Stripe Dashboard → Settings → Customer Portal
2. Enable the portal and configure allowed actions
3. Copy the portal login URL
4. Replace `YOUR_STRIPE_CUSTOMER_PORTAL_URL` in the code above

Example URL format: `https://billing.stripe.com/p/login/YOUR_PORTAL_ID`

---

## PDF Export Service

### 1. Create PDF Export Service

**File:** `src/services/pdfExportService.ts`

```tsx
import jsPDF from 'jspdf'
import { format } from 'date-fns'
import { supabase, supabaseAdmin } from '@/config/supabase'

interface DashboardMetrics {
  totalCalls: number
  totalChats: number
  totalCost: number
  avgCostPerCall: number
  totalSMSCost: number
  avgCostPerMessage: number
  highestCostCall: number
  lowestCostCall: number
  successRate: number
  avgDuration: string
  // ... add other metrics as needed
}

interface ExportOptions {
  dateRange: string
  startDate: Date
  endDate: Date
  companyName: string
  reportTitle: string
}

class PDFExportService {
  private pdf: jsPDF

  constructor() {
    this.pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    })
  }

  /**
   * Upload report to Supabase Storage and return signed URL
   */
  async uploadReportToStorage(
    metrics: DashboardMetrics,
    options: ExportOptions
  ): Promise<{ success: boolean; downloadUrl?: string; filename?: string; error?: string }> {
    const STORAGE_BUCKET = 'invoice-reports'
    const EXPIRY_SECONDS = 7 * 24 * 60 * 60 // 7 days

    try {
      // Generate PDF
      this.pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      await this.generateDashboardReport(metrics, options)

      // Convert to Blob
      const pdfBlob = this.pdf.output('blob')

      // Generate filename
      const timestamp = format(new Date(), 'yyyy-MM-dd_HHmmss')
      const fileName = `invoice-report-${timestamp}.pdf`
      const storagePath = `reports/${fileName}`

      // Use service role client to bypass RLS
      const storageClient = supabaseAdmin || supabase
      if (!supabaseAdmin) {
        console.warn('⚠️ Service role key not available, using regular client (may fail due to RLS)')
      } else {
        console.log('✅ Using service role client for storage operations (bypasses RLS)')
      }

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await storageClient.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, pdfBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'application/pdf'
        })

      if (uploadError) {
        console.error('❌ Storage upload error:', uploadError)
        return { success: false, error: uploadError.message }
      }

      console.log('✅ PDF uploaded to storage:', uploadData.path)

      // Generate signed URL
      const { data: signedUrlData, error: signedUrlError } = await storageClient.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, EXPIRY_SECONDS)

      if (signedUrlError) {
        console.error('❌ Signed URL generation error:', signedUrlError)
        return { success: false, error: signedUrlError.message }
      }

      console.log('✅ Signed URL generated (expires in 7 days)')

      return {
        success: true,
        downloadUrl: signedUrlData.signedUrl,
        filename: fileName
      }
    } catch (error: any) {
      console.error('❌ PDF upload failed:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Generate PDF report with charts
   */
  async generateDashboardReport(metrics: DashboardMetrics, options: ExportOptions): Promise<void> {
    const pageWidth = this.pdf.internal.pageSize.getWidth()
    const pageHeight = this.pdf.internal.pageSize.getHeight()
    const margin = 20
    let yPosition = margin

    // Add header
    this.pdf.setFontSize(24)
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.text(options.reportTitle, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 10

    this.pdf.setFontSize(12)
    this.pdf.setFont('helvetica', 'normal')
    this.pdf.text(options.companyName, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 8

    // Date range
    const dateRangeText = `${format(options.startDate, 'MMM d, yyyy')} - ${format(options.endDate, 'MMM d, yyyy')}`
    this.pdf.text(dateRangeText, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 15

    // Add metrics
    this.pdf.setFontSize(14)
    this.pdf.setFont('helvetica', 'bold')
    this.pdf.text('Summary', margin, yPosition)
    yPosition += 8

    this.pdf.setFontSize(10)
    this.pdf.setFont('helvetica', 'normal')

    const summaryData = [
      ['Total Calls:', `${metrics.totalCalls}`],
      ['Total SMS Messages:', `${metrics.totalChats}`],
      ['Total Call Cost:', `CAD $${metrics.totalCost.toFixed(2)}`],
      ['Total SMS Cost:', `CAD $${metrics.totalSMSCost.toFixed(2)}`],
      ['Total Revenue:', `CAD $${(metrics.totalCost + metrics.totalSMSCost).toFixed(2)}`],
      ['Success Rate:', `${metrics.successRate.toFixed(1)}%`],
      ['Avg Cost Per Call:', `CAD $${metrics.avgCostPerCall.toFixed(2)}`],
      ['Avg Cost Per Message:', `CAD $${metrics.avgCostPerMessage.toFixed(2)}`]
    ]

    summaryData.forEach(([label, value]) => {
      this.pdf.text(label, margin, yPosition)
      this.pdf.setFont('helvetica', 'bold')
      this.pdf.text(value, margin + 60, yPosition)
      this.pdf.setFont('helvetica', 'normal')
      yPosition += 6
    })

    yPosition += 10

    // Add cost breakdown pie chart
    await this.generateCostBreakdownChart(metrics, yPosition)

    // Add footer
    this.pdf.setFontSize(8)
    this.pdf.setTextColor(128, 128, 128)
    this.pdf.text(
      `Generated on ${format(new Date(), 'MMM d, yyyy HH:mm')}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    )
  }

  /**
   * Generate pie chart for cost breakdown
   */
  private async generateCostBreakdownChart(metrics: DashboardMetrics, yPosition: number): Promise<void> {
    const canvas = document.createElement('canvas')
    const size = 300
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    const centerXCanvas = size / 2
    const centerYCanvas = size / 2
    const radius = size / 2.5

    const callCost = metrics.totalCost || 0
    const smsCost = metrics.totalSMSCost || 0
    const totalCost = callCost + smsCost

    if (totalCost > 0) {
      const callPercentage = (callCost / totalCost) * 100

      // Draw Call costs slice (blue)
      ctx.fillStyle = '#3b82f6'
      ctx.beginPath()
      ctx.moveTo(centerXCanvas, centerYCanvas)
      ctx.arc(centerXCanvas, centerYCanvas, radius, 0, (callPercentage / 100) * 2 * Math.PI)
      ctx.closePath()
      ctx.fill()

      // Draw SMS costs slice (purple)
      ctx.fillStyle = '#a855f7'
      ctx.beginPath()
      ctx.moveTo(centerXCanvas, centerYCanvas)
      ctx.arc(centerXCanvas, centerYCanvas, radius, (callPercentage / 100) * 2 * Math.PI, 2 * Math.PI)
      ctx.closePath()
      ctx.fill()

      // Add labels
      ctx.fillStyle = '#000000'
      ctx.font = '16px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(`Calls: ${callPercentage.toFixed(1)}%`, centerXCanvas, centerYCanvas - 30)
      ctx.fillText(`SMS: ${(100 - callPercentage).toFixed(1)}%`, centerXCanvas, centerYCanvas + 40)
    }

    // Convert canvas to image
    const imgData = canvas.toDataURL('image/png')
    const chartWidth = 80
    const chartHeight = 80
    const centerX = this.pdf.internal.pageSize.getWidth() / 2

    this.pdf.addImage(imgData, 'PNG', centerX - chartWidth / 2, yPosition, chartWidth, chartHeight)
  }
}

export const pdfExportService = new PDFExportService()
```

### 2. Supabase Configuration

Create the service role client in your Supabase config:

**File:** `src/config/supabase.ts`

```tsx
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Service role client (bypasses RLS)
export const supabaseAdmin = supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null
```

---

## Email Notification Service

### 1. Create Supabase Edge Function

**File:** `supabase/functions/send-invoice-email/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Resend } from 'npm:resend@2.0.0'

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ARTLEE Invoice</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            max-width: 650px;
            margin: 0 auto;
            padding: 40px 20px;
            background-color: #f8f9fa;
        }
        .email-wrapper {
            background: #ffffff;
            border: 1px solid #e1e4e8;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }
        .header {
            background: #ffffff;
            color: #000000;
            padding: 40px;
            border-bottom: 3px solid #e2e8f0;
            text-align: center;
        }
        .header h1 {
            margin: 0 0 8px 0;
            font-size: 28px;
            font-weight: 600;
        }
        .content {
            padding: 40px;
        }
        .invoice-summary {
            background: #f7fafc;
            border: 1px solid #e2e8f0;
            padding: 30px;
            margin: 30px 0;
        }
        .amount {
            font-size: 42px;
            font-weight: 700;
            color: #1e3a5f;
            text-align: center;
        }
        .button {
            display: block;
            width: 100%;
            padding: 16px 24px;
            text-align: center;
            text-decoration: none;
            font-weight: 600;
            font-size: 15px;
            margin-bottom: 12px;
        }
        .btn-primary {
            background: #1e3a5f;
            color: #ffffff !important;
        }
        .btn-secondary {
            background: #ffffff;
            color: #1e3a5f !important;
            border: 2px solid #cbd5e0;
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <h1>Invoice Statement</h1>
            <p>Billing Period:<br>{{date_range}}</p>
        </div>
        <div class="content">
            <div class="invoice-summary">
                <div style="text-align: center; margin-bottom: 20px;">INVOICE #{{invoice_id}}</div>
                <div class="amount">{{total_amount}}</div>
                <div style="margin-top: 20px;">
                    <div>Voice Calls: {{total_calls}} calls - {{call_cost}}</div>
                    <div>SMS Messages: {{total_chats}} messages - {{sms_cost}}</div>
                </div>
            </div>
            <a href="{{invoice_url}}" class="button btn-primary">Pay Invoice in Stripe</a>
            <a href="{{pdf_download_link}}" class="button btn-secondary">Download PDF Details</a>
        </div>
    </div>
</body>
</html>`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const requestBody = await req.json()

    const {
      to_email,
      to_name,
      invoice_id,
      date_range,
      total_amount,
      total_calls,
      call_cost,
      total_chats,
      sms_cost,
      invoice_url,
      pdf_download_link,
      pdf_expiry_days
    } = requestBody

    // Replace template placeholders
    let emailHtml = HTML_TEMPLATE
      .replace(/{{to_name}}/g, to_name)
      .replace(/{{invoice_id}}/g, invoice_id)
      .replace(/{{date_range}}/g, date_range)
      .replace(/{{total_amount}}/g, total_amount)
      .replace(/{{total_calls}}/g, total_calls.toString())
      .replace(/{{call_cost}}/g, call_cost)
      .replace(/{{total_chats}}/g, total_chats.toString())
      .replace(/{{sms_cost}}/g, sms_cost)
      .replace(/{{invoice_url}}/g, invoice_url)
      .replace(/{{pdf_download_link}}/g, pdf_download_link)
      .replace(/{{pdf_expiry_days}}/g, pdf_expiry_days.toString())

    // Send email via Resend
    const data = await resend.emails.send({
      from: 'Your CRM <notifications@yourdomain.com>',
      to: [to_email],
      subject: `Invoice ${invoice_id} - ${total_amount}`,
      html: emailHtml,
    })

    return new Response(
      JSON.stringify({ success: true, data }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      },
    )
  }
})
```

### 2. Deploy Supabase Edge Function

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy send-invoice-email --no-verify-jwt

# Set environment variable
supabase secrets set RESEND_API_KEY=your_resend_api_key
```

### 3. Configure Resend

1. Sign up at https://resend.com
2. Verify your domain
3. Get API key from API Keys section
4. Set as Supabase secret (shown above)

---

## Database Schema

### 1. Create Invoices Table

Run this SQL in your Supabase SQL Editor:

```sql
-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  date_range TEXT NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'cad',
  status TEXT DEFAULT 'open' CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  stripe_invoice_url TEXT NOT NULL,
  pdf_download_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE,
  due_date TIMESTAMP WITH TIME ZONE,
  call_count INTEGER DEFAULT 0,
  call_cost DECIMAL(10, 2) DEFAULT 0,
  sms_count INTEGER DEFAULT 0,
  sms_cost DECIMAL(10, 2) DEFAULT 0,
  metadata JSONB,
  tenant_id TEXT DEFAULT 'default'
);

-- Create index on invoice_number for fast lookups
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);

-- Create index on customer_email
CREATE INDEX idx_invoices_customer_email ON invoices(customer_email);

-- Create index on status
CREATE INDEX idx_invoices_status ON invoices(status);

-- Create index on created_at for sorting
CREATE INDEX idx_invoices_created_at ON invoices(created_at DESC);

-- Create index on tenant_id (if multi-tenant)
CREATE INDEX idx_invoices_tenant_id ON invoices(tenant_id);

-- Enable Row Level Security
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for authenticated users
CREATE POLICY "Users can view their own invoices"
  ON invoices
  FOR SELECT
  TO authenticated
  USING (true); -- Adjust based on your authentication logic

-- Create RLS policy for inserting invoices
CREATE POLICY "Service role can insert invoices"
  ON invoices
  FOR INSERT
  TO service_role
  WITH CHECK (true);
```

### 2. Create Storage Bucket RLS Policies

Run this SQL to set up storage policies:

```sql
-- Policy 1: Enable upload for authenticated users
CREATE POLICY "Enable upload for authenticated users"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoice-reports');

-- Policy 2: Enable download via signed URLs
CREATE POLICY "Enable download via signed URLs"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (bucket_id = 'invoice-reports');

-- Policy 3: Enable update for authenticated users
CREATE POLICY "Enable update for authenticated users"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'invoice-reports')
WITH CHECK (bucket_id = 'invoice-reports');

-- Policy 4: Enable delete for authenticated users
CREATE POLICY "Enable delete for authenticated users"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'invoice-reports');
```

### 3. Save Invoice to Database Function

Add this function to save invoices after generation:

```tsx
// File: src/services/invoiceService.ts

import { supabase } from '@/config/supabase'

interface InvoiceData {
  invoice_number: string
  customer_email: string
  customer_name: string
  date_range: string
  total_amount: number
  currency: string
  status: string
  stripe_invoice_id: string
  stripe_invoice_url: string
  pdf_download_url: string | null
  call_count: number
  call_cost: number
  sms_count: number
  sms_cost: number
  tenant_id: string
}

export const saveInvoiceToDatabase = async (invoiceData: InvoiceData) => {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .insert([invoiceData])
      .select()
      .single()

    if (error) {
      console.error('Error saving invoice to database:', error)
      return { success: false, error: error.message }
    }

    console.log('✅ Invoice saved to database:', data.id)
    return { success: true, data }
  } catch (error: any) {
    console.error('Failed to save invoice:', error)
    return { success: false, error: error.message }
  }
}
```

Use it in your invoice generation:

```tsx
// After Stripe invoice creation and email sending
await saveInvoiceToDatabase({
  invoice_number: invoice.number,
  customer_email: invoiceCustomerEmail.trim(),
  customer_name: 'Customer Name', // Get from your system
  date_range: dateRangeText,
  total_amount: totalCAD,
  currency: 'cad',
  status: 'open',
  stripe_invoice_id: invoice.id,
  stripe_invoice_url: invoice.hosted_invoice_url,
  pdf_download_url: pdfDownloadLink,
  call_count: metrics.totalCalls || 0,
  call_cost: callCostCAD,
  sms_count: metrics.totalChats || 0,
  sms_cost: smsCostCAD,
  tenant_id: 'your_tenant_id'
})
```

---

## Environment Variables

Create a `.env.local` file with these variables:

```bash
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Stripe
VITE_STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx

# Resend (for email function)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Your app settings
VITE_APP_NAME=Your CRM Name
VITE_COMPANY_NAME=Your Company Name
```

**Security Notes:**
- Never commit `.env.local` to version control
- Use environment variables in production (Vercel, Netlify, etc.)
- Rotate keys regularly
- Use test keys in development, live keys in production

---

## Testing & Verification

### 1. Test Invoice Generation

```tsx
// Test checklist:
✅ Click "Generate Invoice" button
✅ Enter customer email
✅ Verify Stripe invoice is created
✅ Check invoice appears in Stripe Dashboard
✅ Verify email is sent with correct data
✅ Check PDF download link works
✅ Verify invoice saved to database
✅ Confirm success toast notification appears
```

### 2. Test Invoice History

```tsx
// Test checklist:
✅ Navigate to Settings → Invoice History
✅ Verify all invoices load correctly
✅ Test search functionality
✅ Test status filter
✅ Click "View Invoice" - opens Stripe
✅ Click "Download PDF" - downloads report
✅ Verify summary stats are accurate
```

### 3. Test Subscription Portal

```tsx
// Test checklist:
✅ Navigate to Settings → Manage Subscription
✅ Click "Open Billing Portal"
✅ Verify redirects to Stripe Customer Portal
✅ Test viewing invoices in portal
✅ Test updating payment method
✅ Test viewing subscription details
```

### 4. Common Issues & Solutions

**Issue: PDF upload fails with RLS error**
```
Solution: Use supabaseAdmin (service role client) instead of regular supabase client
```

**Issue: Email not sending**
```
Solution: Check Resend API key is set correctly in Supabase secrets
Solution: Verify domain is verified in Resend dashboard
```

**Issue: Stripe API errors**
```
Solution: Verify Stripe secret key is correct
Solution: Check customer ID exists in your Stripe account
Solution: Ensure invoice items are added before finalizing
```

**Issue: Invoice history not loading**
```
Solution: Check RLS policies on invoices table
Solution: Verify user has SELECT permission
Solution: Check browser console for errors
```

---

## Deployment Checklist

Before deploying to production:

- [ ] All environment variables set in production
- [ ] Stripe live keys configured
- [ ] Resend domain verified
- [ ] Supabase Edge Function deployed
- [ ] Storage bucket created with correct policies
- [ ] Database tables and indexes created
- [ ] RLS policies configured
- [ ] Test invoice generation end-to-end
- [ ] Test email delivery
- [ ] Test PDF generation and upload
- [ ] Verify Customer Portal link works
- [ ] Test invoice history page
- [ ] Check mobile responsiveness
- [ ] Set up error monitoring (Sentry, etc.)
- [ ] Configure webhook endpoints (optional)

---

## Additional Enhancements

### Webhook Integration

Set up Stripe webhooks to automatically update invoice status:

```typescript
// File: api/stripe-webhook/index.ts

export default async function handler(req, res) {
  const sig = req.headers['stripe-signature']
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object

      // Update invoice status in database
      await supabase
        .from('invoices')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString()
        })
        .eq('stripe_invoice_id', invoice.id)
    }

    res.status(200).json({ received: true })
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`)
  }
}
```

### Automated Monthly Invoicing

Set up a cron job or scheduled function:

```typescript
// File: api/cron/generate-monthly-invoices.ts

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Get all customers
  const customers = await getActiveCustomers()

  for (const customer of customers) {
    try {
      // Generate invoice for each customer
      await generateInvoiceForCustomer(customer.id)
      console.log(`✅ Invoice generated for ${customer.email}`)
    } catch (error) {
      console.error(`❌ Failed to generate invoice for ${customer.email}:`, error)
    }
  }

  res.status(200).json({ processed: customers.length })
}
```

---

## Support & Resources

- **Stripe Documentation**: https://stripe.com/docs/invoicing
- **Supabase Storage**: https://supabase.com/docs/guides/storage
- **Resend API**: https://resend.com/docs
- **jsPDF Documentation**: https://artskydj.github.io/jsPDF/docs/
- **Stripe Customer Portal**: https://stripe.com/docs/customer-management

---

## Version History

- **v1.0** (2025-01-28): Initial implementation
  - Generate Invoice button
  - Invoice History component
  - Stripe Customer Portal integration
  - PDF export with charts
  - Email notifications via Resend
  - Database schema and RLS policies

---

## Credits

Implemented for ARTLEE CRM by Claude Code (Anthropic)
Based on ARTLEE CRM invoice system requirements

---

**End of Implementation Guide**
