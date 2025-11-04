import React, { useState, useEffect, useRef } from 'react'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { useNotesCount } from '@/hooks/useNotesCount'
import { DateRangePicker, DateRange, getDateRangeFromSelection } from '@/components/common/DateRangePicker'
import { CallDetailModal } from '@/components/common/CallDetailModal'
import { SiteHelpChatbot } from '@/components/common/SiteHelpChatbot'
import { ToastManager } from '@/components/common/ToastManager'
import { RetellWebClient } from 'retell-client-js-sdk'
import { retellService, type RetellCall, currencyService, twilioCostService, enhancedCostService } from '@/services'
import { notesService } from '@/services/notesService'
import { fuzzySearchService } from '@/services/fuzzySearchService'
import { toastNotificationService } from '@/services/toastNotificationService'
import {
  PhoneIcon,
  PlayIcon,
  DownloadIcon,
  MicIcon,
  MicOffIcon,
  PhoneCallIcon,
  PhoneOffIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  SearchIcon,
  FilterIcon,
  MoreVerticalIcon,
  ClockIcon,
  UserIcon,
  CalendarIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  DollarSignIcon,
  ThumbsUpIcon,
  BarChart3Icon,
  StickyNoteIcon,
  ZapIcon
} from 'lucide-react'
import { supabase } from '@/config/supabase'
import { PHIDataHandler, encryptionService } from '@/services/encryption'
import { auditLogger, AuditAction, ResourceType, AuditOutcome } from '@/services/auditLogger'
import jsPDF from 'jspdf'
import { patientIdService } from '@/services/patientIdService'

// CRITICAL FIX: Disable console logging in production to prevent infinite loops
const isProduction = !import.meta.env.DEV
const safeLog = isProduction ? () => {} : console.log
const safeWarn = isProduction ? () => {} : console.warn
const safeError = isProduction ? () => {} : console.error

interface CallsPageProps {
  user: any
}

interface CallMetrics {
  totalCalls: number
  avgDuration: string
  avgCostPerCall: number
  successRate: number
  totalDuration: string
  positiveSentiment: number
  highestCostCall: number
  failedCalls: number
  totalCost: number
  totalMinutes: number
}

// Using RetellCall interface from service
type Call = RetellCall & {
  // Add any additional fields for compatibility
  customer_id?: string
  call_length_seconds?: number
  call_summary?: string
  metadata?: {
    customer_name?: string
    call_type?: string
    [key: string]: any
  }
  sentiment_analysis?: {
    overall_sentiment: 'positive' | 'negative' | 'neutral'
    confidence_score: number
  }
}

export const CallsPage: React.FC<CallsPageProps> = ({ user }) => {
  const [retellWebClient] = useState(() => new RetellWebClient())
  const [isCallActive, setIsCallActive] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [calls, setCalls] = useState<Call[]>([])
  const previousCallsRef = useRef<Call[]>([])
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [callStatus, setCallStatus] = useState<string>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sentimentFilter, setSentimentFilter] = useState('all')
  const [isFuzzySearchEnabled, setIsFuzzySearchEnabled] = useState(true)
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>(() => {
    // Remember last selected date range from localStorage
    const saved = localStorage.getItem('calls_page_date_range')
    return (saved as DateRange) || 'today'
  })

  // State for custom date range
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem('calls_page_custom_start_date')
    return saved ? new Date(saved) : undefined
  })
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem('calls_page_custom_end_date')
    return saved ? new Date(saved) : undefined
  })
  const [metrics, setMetrics] = useState<CallMetrics>({
    totalCalls: 0,
    avgDuration: '0:00',
    avgCostPerCall: 0,
    successRate: 0,
    totalDuration: '0:00',
    positiveSentiment: 0,
    highestCostCall: 0,
    failedCalls: 0,
    totalCost: 0,
    totalMinutes: 0
  })
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [showHelpChatbot, setShowHelpChatbot] = useState(false)

  // Use the new notes count hook for cross-device accessible note icons
  const {
    hasNotes,
    getNoteCount,
    refetch: refetchNotesCount
  } = useNotesCount({
    referenceType: 'call',
    referenceIds: calls.map(call => call.call_id),
    enabled: calls.length > 0
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCallsCount, setTotalCallsCount] = useState(0)

  // Enhanced cost cache for Twilio API data
  const [enhancedCostsCache, setEnhancedCostsCache] = useState<Map<string, number>>(new Map())
  const recordsPerPage = 50

  // Auto-refresh functionality
  const { formatLastRefreshTime } = useAutoRefresh({
    enabled: true,
    interval: 60000, // 1 minute refresh interval
    onRefresh: () => {
      fetchCalls()
      safeLog('Calls page refreshed at:', new Date().toLocaleTimeString())
    }
  })

  useEffect(() => {
    // Set up Retell client event listeners
    retellWebClient.on("call_started", () => {
      safeLog("Call started")
      setIsCallActive(true)
      setCallStatus('active')
      setCurrentTranscript('')
    })

    retellWebClient.on("call_ended", () => {
      safeLog("Call ended")
      setIsCallActive(false)
      setCallStatus('completed')
      fetchCalls()
    })

    retellWebClient.on("update", (update) => {
      if (update.transcript) {
        setCurrentTranscript(update.transcript)
      }
    })

    retellWebClient.on("error", (error) => {
      safeError("Call error:", error)
      setError(`Call error: ${error.message}`)
      setIsCallActive(false)
      setCallStatus('failed')
    })

    return () => {
      if (isCallActive) {
        retellWebClient.stopCall()
      }
    }
  }, [retellWebClient])

  // Fetch calls when component mounts or date range changes
  useEffect(() => {
    setCurrentPage(1) // Reset to first page when date range changes
    fetchCalls()
  }, [selectedDateRange, customStartDate, customEndDate])

  useEffect(() => {
    fetchCalls()
  }, [currentPage])

  // Listen for API configuration events from AuthContext and ensure services are initialized
  useEffect(() => {
    const handleApiConfigurationReady = (event: CustomEvent) => {
      console.log('🚀 [CallsPage]: Received apiConfigurationReady event', event.detail)
      // Retry fetching data if there was a configuration error
      if (error?.includes('API not configured') || !retellService.getApiKey()) {
        console.log('🔄 [CallsPage]: API is now configured, retrying data fetch...')
        fetchCalls()
      }
    }

    // Ensure services are initialized on page load
    const initializeServices = async () => {
      try {
        console.log('🔧 [CallsPage]: Ensuring services are initialized...')
        const { globalServiceInitializer } = await import('../services/globalServiceInitializer')
        await globalServiceInitializer.initialize()

        const status = globalServiceInitializer.getStatus()
        console.log('✅ [CallsPage]: Services status:', status)
      } catch (error) {
        console.error('❌ [CallsPage]: Service initialization error:', error)
      }
    }

    initializeServices()

    window.addEventListener('apiConfigurationReady', handleApiConfigurationReady as EventListener)

    return () => {
      window.removeEventListener('apiConfigurationReady', handleApiConfigurationReady as EventListener)
    }
  }, [error])

  // Initialize fuzzy search engine when calls are loaded
  useEffect(() => {
    if (calls.length > 0 && isFuzzySearchEnabled) {
      fuzzySearchService.initializeCallsSearch(calls)
    }
  }, [calls, isFuzzySearchEnabled])

  // Fetch enhanced Twilio API costs when calls change
  useEffect(() => {
    if (calls.length === 0) return

    const fetchEnhancedCosts = async () => {
      try {
        const costsMap = await enhancedCostService.getEnhancedCallCostsBatch(calls)

        const newCache = new Map<string, number>()
        costsMap.forEach((cost, callId) => {
          if (!cost.error) {
            newCache.set(callId, cost.totalCostCAD)

            // Log when using actual Twilio API data
            if (cost.isActualData) {
              safeLog('💰 Using Twilio API data for call:', callId, cost.totalCostCAD.toFixed(4))
            }
          }
        })

        setEnhancedCostsCache(newCache)
      } catch (error) {
        safeLog('💰 Enhanced cost fetch failed, using calculations:', error)
      }
    }

    fetchEnhancedCosts()
  }, [calls.map(c => c.call_id).join(',')])

  const fetchCalls = async (retryCount = 0) => {
    setLoading(true)
    setError('')

    try {
      // Reload credentials (localStorage + Supabase sync)
      await retellService.loadCredentialsAsync()
      safeLog('Reloaded credentials with cross-device sync:', {
        hasApiKey: !!retellService.isConfigured(),
        configured: retellService.isConfigured()
      })

      // Check if Retell API has at minimum an API key configured
      const hasApiKey = !!retellService.getApiKey()
      if (!hasApiKey) {
        setError('API not configured. Go to Settings → API Configuration to set up your credentials.')
        setLoading(false)
        return
      }

      // Skip connection test for faster subsequent loads
      const skipConnectionTest = retellService.isConfigured()
      if (!skipConnectionTest) {
        const connectionTest = await retellService.testConnection()
        if (!connectionTest.success) {
          setError(`API Connection Error: ${connectionTest.message}`)
          setLoading(false)
          return
        }
      }

      // Get date range
      const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)

      // Fetch with retry logic for rate limiting
      let allCallsResponse
      try {
        // Add small delay to prevent rate limiting
        if (retryCount > 0) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 8000) // Exponential backoff, max 8 seconds
          safeLog(`Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1})`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        // Optimized: Fetch with reduced limit for faster initial load
        allCallsResponse = await retellService.getCallHistoryByDateRange(start, end, { limit: 300 })
      } catch (error: any) {
        // Handle rate limiting specifically
        if (error.message?.includes('429') || error.status === 429) {
          if (retryCount < 3) {
            safeLog(`Rate limited (429), retrying... (attempt ${retryCount + 1}/3)`)
            return fetchCalls(retryCount + 1)
          } else {
            throw new Error('Rate limit exceeded. Please wait a moment and try again.')
          }
        }
        throw error
      }

      const totalCalls = allCallsResponse.calls
      setTotalCallsCount(totalCalls.length)

      // Calculate pagination
      const startIndex = (currentPage - 1) * recordsPerPage
      const endIndex = startIndex + recordsPerPage
      const paginatedCalls = totalCalls.slice(startIndex, endIndex)

      // Transform paginated calls to our Call interface
      const transformedCalls: Call[] = paginatedCalls.map(retellCall => {
        // Calculate duration properly using the same logic as retell service
        let durationSeconds: number | undefined = undefined

        if (retellCall.duration_ms !== undefined && retellCall.duration_ms !== null) {
          // Use API duration_ms if available (prioritize this field as per Retell AI docs)
          durationSeconds = retellCall.duration_ms / 1000
          safeLog(`Call ${retellCall.call_id}: Using API duration_ms = ${retellCall.duration_ms}ms = ${durationSeconds.toFixed(3)}s`)
        } else if (retellCall.start_timestamp && retellCall.end_timestamp) {
          // Calculate from timestamps with proper conversion
          let startMs = retellCall.start_timestamp
          let endMs = retellCall.end_timestamp

          // Convert to milliseconds if needed (timestamps might be in seconds)
          if (retellCall.start_timestamp.toString().length <= 10) {
            startMs = retellCall.start_timestamp * 1000
          }
          if (retellCall.end_timestamp.toString().length <= 10) {
            endMs = retellCall.end_timestamp * 1000
          }

          durationSeconds = (endMs - startMs) / 1000
          safeLog(`Call ${retellCall.call_id}: Calculated from timestamps: start=${startMs}, end=${endMs}, duration=${durationSeconds.toFixed(3)}s`)
        } else {
          safeLog(`Call ${retellCall.call_id}: No duration data available`)
        }

        return {
          ...retellCall,
          customer_id: retellCall.metadata?.customer_id || `customer_${Math.random().toString(36).substr(2, 9)}`,
          call_length_seconds: durationSeconds,
          call_summary: retellCall.call_analysis?.call_summary || undefined,
          sentiment_analysis: retellCall.call_analysis?.user_sentiment ? {
            overall_sentiment: retellCall.call_analysis.user_sentiment.toLowerCase() as 'positive' | 'negative' | 'neutral',
            confidence_score: 0.8 // Default confidence score
          } : undefined,
          metadata: {
            customer_name: retellCall.metadata?.customer_name || `Caller Unknown`,
            call_type: retellCall.call_type === 'phone_call' ? 'Phone Call' : 'Web Call',
            ...retellCall.metadata
          }
        }
      })

      setCalls(transformedCalls)

      // Note: Toast notifications for truly new records are handled by toastNotificationService
      // via Supabase real-time monitoring, not through pagination logic

      // Update previous calls reference
      previousCallsRef.current = [...transformedCalls]

      // Fetch notes count for all calls
      try {
        const callIds = transformedCalls.map(call => call.call_id)
        const notesCountData = await notesService.getNotesCount(callIds, 'call')
        setNotesCount(notesCountData)
      } catch (notesError) {
        safeError('Error fetching notes count:', notesError)
        // Don't fail the whole operation if notes fetch fails
      }

      // Calculate base metrics using ALL calls for accurate totals
      const baseMetrics = retellService.calculateCallMetrics(totalCalls)

      // Add Twilio costs to the metrics
      const metricsWithTwilio = addTwilioCostsToMetrics(baseMetrics, totalCalls)

      // Debug: Log the total cost to verify it's correct
      safeLog('📊 Enhanced Metrics (Retell + Twilio):', {
        totalCalls: metricsWithTwilio.totalCalls,
        totalCostCAD: metricsWithTwilio.totalCost,
        avgCostPerCallCAD: metricsWithTwilio.avgCostPerCall,
        baseRetellCostUSD: baseMetrics.totalCost,
        sampleCallCosts: totalCalls.slice(0, 3).map(c => ({
          id: c.call_id,
          retell_cents: c.call_cost?.combined_cost,
          duration_sec: c.call_length_seconds,
          total_cad: calculateTotalCallCostCAD(c).toFixed(4)
        }))
      })

      setMetrics(metricsWithTwilio)

      // Log audit event for compliance
      await auditLogger.logPHIAccess(
        AuditAction.VIEW,
        ResourceType.CALL,
        'call-list-access',
        AuditOutcome.SUCCESS,
        {
          calls_count: transformedCalls.length,
          date_range: selectedDateRange,
          user_id: user.id
        }
      )

    } catch (error) {
      safeError('Failed to fetch calls:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch call data')
    } finally {
      setLoading(false)
    }
  }

  const startCall = async (patientId?: string) => {
    setLoading(true)
    setError('')

    try {
      safeLog('Starting demo call...')
      setCallStatus('connecting')

      setTimeout(() => {
        setIsCallActive(true)
        setCallStatus('active')
        setCurrentTranscript('Call connected. AI agent is ready to assist...')
      }, 2000)

    } catch (error) {
      safeError('Failed to start call:', error)
      setError('Failed to start call. Please try again.')
      setCallStatus('failed')
    } finally {
      setLoading(false)
    }
  }

  const stopCall = () => {
    retellWebClient.stopCall()
    setIsCallActive(false)
    setCallStatus('completed')
  }

  const toggleMute = () => {
    if (isCallActive) {
      setIsMuted(!isMuted)
    }
  }

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '0s'

    // Show exact duration without any rounding
    // For very short calls (less than 1 second), show with high precision
    if (seconds < 1) {
      return `${seconds.toFixed(3)}s`
    }

    // For calls less than 60 seconds, show exact seconds with 2 decimal places
    if (seconds < 60) {
      return `${seconds.toFixed(2)}s`
    }

    // For calls 60 seconds or longer, show exact minutes with 3 decimal places
    const minutes = seconds / 60
    if (minutes < 60) {
      return `${minutes.toFixed(3)} min`
    }

    // For calls 1 hour or longer, show exact hours and remaining minutes
    const hours = seconds / 3600
    return `${hours.toFixed(3)}h`
  }

  const calculateTotalCallCostCAD = (call: Call) => {
    // Check cache first for enhanced Twilio API cost
    const cachedCost = enhancedCostsCache.get(call.call_id)
    if (cachedCost !== undefined) {
      return cachedCost
    }

    // Fallback: Use existing calculation method
    const retellCostCents = call.call_cost?.combined_cost || 0
    const retellCostUSD = retellCostCents / 100
    const retellCostCAD = currencyService.convertUSDToCAD(retellCostUSD)

    // Get Twilio cost (already in CAD)
    const twilioCostCAD = twilioCostService.getTwilioCostCAD(call.call_length_seconds || 0)

    // Debug logging to understand why all calls show $0.69
    if (retellCostCAD + twilioCostCAD > 0.68 && retellCostCAD + twilioCostCAD < 0.70) {
      safeLog('Call Cost Debug - Potential $0.69 issue:', {
        callId: call.call_id,
        duration: call.call_length_seconds,
        retellCostCents,
        retellCostUSD,
        retellCostCAD: retellCostCAD.toFixed(4),
        twilioCostCAD: twilioCostCAD.toFixed(4),
        totalCAD: (retellCostCAD + twilioCostCAD).toFixed(4),
        exchangeRate: currencyService.getCurrentRate?.() || 'unknown'
      })
    }

    // Total cost
    return retellCostCAD + twilioCostCAD
  }

  const formatCallCost = (call: Call) => {
    const totalCostCAD = calculateTotalCallCostCAD(call)
    return `$${totalCostCAD.toFixed(3)}`
  }

  const addTwilioCostsToMetrics = (baseMetrics: any, calls: Call[]) => {
    // Calculate total Twilio costs for all calls
    const totalTwilioCostCAD = calls.reduce((sum, call) => {
      return sum + twilioCostService.getTwilioCostCAD(call.call_length_seconds || 0)
    }, 0)

    // Convert base metrics to CAD and add Twilio costs
    const baseTotalCostCAD = currencyService.convertUSDToCAD(baseMetrics.totalCost)
    const baseAvgCostCAD = currencyService.convertUSDToCAD(baseMetrics.avgCostPerCall)
    const baseHighestCostCAD = currencyService.convertUSDToCAD(baseMetrics.highestCostCall)

    // Calculate new totals
    const newTotalCostCAD = baseTotalCostCAD + totalTwilioCostCAD
    const newAvgCostCAD = baseMetrics.totalCalls > 0 ? newTotalCostCAD / baseMetrics.totalCalls : 0

    // Find highest cost call including Twilio
    const callCostsWithTwilio = calls.map(call => calculateTotalCallCostCAD(call))
    const newHighestCostCAD = callCostsWithTwilio.length > 0 ? Math.max(...callCostsWithTwilio) : 0

    return {
      ...baseMetrics,
      totalCost: newTotalCostCAD,
      avgCostPerCall: newAvgCostCAD,
      highestCostCall: newHighestCostCAD
    }
  }

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-50 border-green-200'
      case 'negative': return 'text-red-600 bg-red-50 border-red-200'
      case 'neutral': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50'
      case 'failed': return 'text-red-600 bg-red-50'
      case 'active': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  // Export all calls in selected date range to PDF
  const exportAllCallsToPDF = async () => {
    try {
      safeLog('🔄 Starting PDF export for all calls in date range:', selectedDateRange)

      // Show loading state
      const originalButtonText = 'Export Call Report'
      const button = document.querySelector('[title*="Export all calls"]') as HTMLButtonElement
      if (button) {
        button.disabled = true
        button.innerHTML = '<svg class="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating PDF...'
      }

      // Get the filtered calls for the current date range (including custom dates)
      const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)
      safeLog(`📅 Export date range: ${start.toLocaleString()} to ${end.toLocaleString()}`)

      // Use the already filtered calls from the page state to ensure consistency
      let callsToExport = filteredCalls.filter(call => {
        const callDate = new Date(call.start_timestamp || 0)
        // Double-check the date filtering to ensure accuracy
        return callDate >= start && callDate <= end
      })

      if (callsToExport.length === 0) {
        alert(`No calls found for ${selectedDateRange}. Please select a different date range.`)
        return
      }

      // Limit export to prevent performance issues
      const MAX_CALLS = 50
      if (callsToExport.length > MAX_CALLS) {
        const confirmLarge = confirm(`You are about to export ${callsToExport.length} calls. This may take a while and create a large PDF. Would you like to limit to the most recent ${MAX_CALLS} calls instead?`)
        if (confirmLarge) {
          callsToExport = callsToExport.slice(0, MAX_CALLS)
        }
      }

      safeLog(`📊 Exporting ${callsToExport.length} calls for ${selectedDateRange}`)

      // Create PDF document with error handling
      let doc: jsPDF
      try {
        doc = new jsPDF()
      } catch (pdfError) {
        throw new Error(`Failed to create PDF document: ${pdfError instanceof Error ? pdfError.message : 'Unknown PDF error'}`)
      }
      let yPosition = 20
      const pageWidth = doc.internal.pageSize.width
      const pageHeight = doc.internal.pageSize.height
      const margin = 20

      // Helper function to add new page if needed
      const checkNewPage = (requiredSpace = 20) => {
        if (yPosition + requiredSpace > pageHeight - 30) {
          doc.addPage()
          yPosition = 20
        }
      }

      // Helper function to format dates
      const formatDateTime = (timestamp: number) => {
        const date = new Date(timestamp)
        return {
          date: date.toLocaleDateString(),
          time: date.toLocaleTimeString()
        }
      }

      // Title page
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('Call Export Report', pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 15

      doc.setFontSize(14)
      doc.setFont('helvetica', 'normal')
      const displayRange = selectedDateRange === 'custom' ? 'CUSTOM RANGE' : selectedDateRange.toUpperCase()
      doc.text(`Date Range: ${displayRange}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      doc.setFontSize(12)
      doc.text(`From: ${start.toLocaleDateString()} To: ${end.toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      doc.text(`Total Calls: ${callsToExport.length}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 20

      // Process each call with async yields to prevent blocking
      for (let i = 0; i < callsToExport.length; i++) {
        const call = callsToExport[i]

        // Yield control every 10 calls to prevent blocking and update progress
        if (i > 0 && i % 10 === 0) {
          if (button) {
            const progress = Math.round((i / callsToExport.length) * 100)
            button.innerHTML = `<svg class="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 714 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing ${progress}%...`
          }
          await new Promise(resolve => setTimeout(resolve, 10)) // 10ms yield
        }

        checkNewPage(60) // Ensure enough space for call header

        // Call separator
        if (i > 0) {
          doc.setDrawColor(200, 200, 200)
          doc.line(margin, yPosition, pageWidth - margin, yPosition)
          yPosition += 10
        }

        // Call header
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(`Call ${i + 1}: ${call.call_id}`, margin, yPosition)
        yPosition += 8

        // Basic call info
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')

        const callDateTime = formatDateTime(call.start_timestamp || 0)
        doc.text(`Date: ${callDateTime.date} ${callDateTime.time}`, margin, yPosition)
        yPosition += 6

        // Patient info - prioritize to_number (called number) over from_number (calling number)
        const phoneNumber = call.call_analysis?.custom_analysis_data?.phone_number ||
                           call.call_analysis?.custom_analysis_data?.customer_phone_number ||
                           call.metadata?.phone_number ||
                           call.to_number ||
                           call.from_number ||
                           'Unknown'

        // Get patient ID safely to avoid audit logging issues
        let patientId = 'PT00000000'
        try {
          patientId = phoneNumber !== 'Unknown' ? patientIdService.getPatientId(phoneNumber) : 'PT00000000'
        } catch (patientError) {
          safeWarn('Patient ID generation error (using fallback):', patientError)
          patientId = 'PT00000000'
        }
        doc.text(`Patient ID: ${patientId}`, margin, yPosition)
        yPosition += 6

        doc.text(`Status: ${call.call_status || 'Unknown'}`, margin, yPosition)
        yPosition += 6

        // Duration and cost info
        const duration = call.duration_ms ? `${(call.duration_ms / 1000).toFixed(2)}s` : 'Unknown'
        const totalCostCAD = calculateTotalCallCostCAD(call)
        const costDisplay = `$${totalCostCAD.toFixed(4)} CAD`
        doc.text(`Duration: ${duration} | Cost: ${costDisplay}`, margin, yPosition)
        yPosition += 10

        // Detailed Analysis Section
        if (call.call_analysis?.custom_analysis_data && Object.keys(call.call_analysis.custom_analysis_data).length > 0) {
          checkNewPage(40)

          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          doc.text('Detailed Analysis:', margin, yPosition)
          yPosition += 8

          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')

          Object.entries(call.call_analysis.custom_analysis_data).forEach(([key, value]) => {
            checkNewPage(12)

            const displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            const displayValue = String(value || 'N/A')

            // Handle long values by wrapping text
            const maxWidth = pageWidth - 2 * margin
            if (displayValue.length > 60) {
              const lines = doc.splitTextToSize(`${displayKey}: ${displayValue}`, maxWidth)
              lines.forEach((line: string) => {
                checkNewPage(6)
                doc.text(line, margin, yPosition)
                yPosition += 6
              })
            } else {
              doc.text(`${displayKey}: ${displayValue}`, margin, yPosition)
              yPosition += 6
            }
          })
        }

        // Call Summary and Sentiment
        if (call.call_analysis?.call_summary) {
          checkNewPage(20)

          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          doc.text('Call Summary:', margin, yPosition)
          yPosition += 8

          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          const summaryLines = doc.splitTextToSize(call.call_analysis.call_summary, pageWidth - 2 * margin)
          summaryLines.forEach((line: string) => {
            checkNewPage(6)
            doc.text(line, margin, yPosition)
            yPosition += 6
          })
        }

        if (call.call_analysis?.user_sentiment) {
          checkNewPage(10)
          doc.text(`User Sentiment: ${call.call_analysis.user_sentiment}`, margin, yPosition)
          yPosition += 6
        }

        // Transcript (if available and not too long)
        if (call.transcript && call.transcript.length > 0) {
          checkNewPage(30)

          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          doc.text('Call Transcript:', margin, yPosition)
          yPosition += 8

          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')

          // Limit transcript length to keep PDF reasonable
          const transcriptPreview = call.transcript.length > 1000 ?
            call.transcript.substring(0, 1000) + '...' : call.transcript

          const transcriptLines = doc.splitTextToSize(transcriptPreview, pageWidth - 2 * margin)
          transcriptLines.forEach((line: string) => {
            checkNewPage(5)
            doc.text(line, margin, yPosition)
            yPosition += 5
          })

          if (call.transcript.length > 1000) {
            doc.setFontSize(9)
            doc.setFont('helvetica', 'italic')
            doc.text(`... (transcript truncated for brevity)`, margin, yPosition)
            yPosition += 8
          }
        }

        yPosition += 15 // Space between calls
      }

      // Footer on last page
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.text('🤖 Generated with ARTLEE Business Platform CRM', margin, pageHeight - 20)
      doc.text(`Exported by: ${user?.email || 'System'}`, margin, pageHeight - 12)
      doc.text(`Total Pages: ${doc.getNumberOfPages()}`, pageWidth - margin - 40, pageHeight - 12)

      // Save the PDF
      const dateStr = new Date().toISOString().split('T')[0]
      const rangeStr = selectedDateRange === 'custom' ?
        `${start.toISOString().split('T')[0]}_to_${end.toISOString().split('T')[0]}` :
        selectedDateRange
      const filename = `Call-Export-${rangeStr}-${dateStr}.pdf`
      doc.save(filename)

      safeLog(`✅ PDF export completed: ${filename}`)
      alert(`Successfully exported ${callsToExport.length} calls to ${filename}`)

    } catch (error) {
      safeError('❌ PDF export failed:', error)

      // Show detailed error information
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'

      alert([
        'Failed to Export PDF. Please try again.',
        '',
        'Error Details:',
        errorMessage,
        '',
        'If the problem persists, try:',
        '• Reducing the date range',
        '• Refreshing the page',
        '• Checking your browser console for details'
      ].join('\n'))
    } finally {
      // Restore button state
      const button = document.querySelector('[title*="Export all calls"]') as HTMLButtonElement
      if (button) {
        button.disabled = false
        button.innerHTML = '<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>Export Call Report'
      }
    }
  }

  const filteredCalls = React.useMemo(() => {
    let searchFilteredCalls = calls

    // Apply search filter using fuzzy search or fallback to basic search
    if (searchTerm && searchTerm.trim()) {
      if (isFuzzySearchEnabled) {
        try {
          const fuzzyResults = fuzzySearchService.searchCalls(searchTerm)
          searchFilteredCalls = fuzzyResults.map(result => result.item)
        } catch (error) {
          console.error('Fuzzy search failed, falling back to basic search:', error)
          searchFilteredCalls = fuzzySearchService.basicCallsSearch(calls, searchTerm)
        }
      } else {
        // Use basic search when fuzzy search is disabled
        searchFilteredCalls = fuzzySearchService.basicCallsSearch(calls, searchTerm)
      }
    }

    // Apply status and sentiment filters to search results
    return searchFilteredCalls.filter(call => {
      const matchesStatus = statusFilter === 'all' || call.call_status === statusFilter
      const matchesSentiment = sentimentFilter === 'all' ||
        call.sentiment_analysis?.overall_sentiment?.toLowerCase() === sentimentFilter.toLowerCase()

      return matchesStatus && matchesSentiment
    })
  }, [calls, searchTerm, statusFilter, sentimentFilter, isFuzzySearchEnabled])

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4">
        <DateRangePicker
          selectedRange={selectedDateRange}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onRangeChange={(range, customStart, customEnd) => {
            setSelectedDateRange(range)
            // Save selected date range to localStorage
            localStorage.setItem('calls_page_date_range', range)

            // Handle custom date range
            if (range === 'custom' && customStart && customEnd) {
              setCustomStartDate(customStart)
              setCustomEndDate(customEnd)
              // Save custom dates to localStorage
              localStorage.setItem('calls_page_custom_start_date', customStart.toISOString())
              localStorage.setItem('calls_page_custom_end_date', customEnd.toISOString())
            } else if (range !== 'custom') {
              // Clear custom dates when switching to non-custom range
              setCustomStartDate(undefined)
              setCustomEndDate(undefined)
              localStorage.removeItem('calls_page_custom_start_date')
              localStorage.removeItem('calls_page_custom_end_date')
            }

            const { start, end } = getDateRangeFromSelection(range, customStart, customEnd)
            safeLog('Calls date range changed:', { range, start, end, customStart, customEnd })
          }}
        />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={fetchCalls}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors min-h-[44px] text-sm sm:text-base touch-manipulation"
          >
            <RefreshCwIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => toastNotificationService.triggerTestNotification('call')}
            className="flex items-center gap-2 px-3 py-2 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 transition-colors min-h-[44px] text-sm sm:text-base touch-manipulation"
          >
            <ZapIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Test Toast</span>
          </button>
          <button
            onClick={exportAllCallsToPDF}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors min-h-[44px] text-sm sm:text-base flex-1 sm:flex-initial justify-center touch-manipulation"
            title={`Export all calls for ${selectedDateRange} to PDF`}
          >
            <DownloadIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Export Call Report</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>
      <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6 text-center sm:text-left px-2 sm:px-0">
        Last refreshed: {formatLastRefreshTime()}
        <span className="hidden sm:inline"> (Auto-refresh every minute)</span>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Calls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Calls</span>
            <PhoneIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mb-1 numeric-data">
            {loading ? '...' : metrics.totalCalls}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {metrics.totalCalls > 0 ? (
              <><span className="numeric-data">{metrics.totalCalls - metrics.failedCalls}</span> completed, <span className="numeric-data">{metrics.failedCalls}</span> failed</>
            ) : 'No calls made'}
          </div>
        </div>

        {/* Avg Call Duration */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Avg Call Duration</span>
            <ClockIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mb-1 numeric-data">
            {loading ? '...' : metrics.avgDuration}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Longest: <span className="numeric-data">{metrics.avgDuration}</span>
          </div>
        </div>

        {/* Avg Cost Per Call */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Avg Cost Per Call</span>
            <DollarSignIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black text-blue-600 dark:text-blue-400 mb-1 numeric-data">
            ${loading ? '...' : ((metrics.avgCostPerCall || 0) * 1.45).toFixed(3)}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Total cost: $<span className="numeric-data">{((metrics.totalCost || 0) * 1.45).toFixed(2)}</span>
          </div>
        </div>

        {/* Success Rate */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Success Rate</span>
            <TrendingUpIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mb-1 numeric-data">
            {loading ? '...' : `${metrics.successRate.toFixed(1)}%`}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {metrics.totalCalls > 0 ? (
              <><span className="numeric-data">{metrics.totalCalls - metrics.failedCalls}</span> goals achieved</>
            ) : (<><span className="numeric-data">0</span> goals achieved</>)}
          </div>
        </div>

        {/* Total Duration */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Duration</span>
            <ClockIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mb-1 numeric-data">
            {loading ? '...' : metrics.totalDuration}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            0 calls analyzed
          </div>
        </div>

        {/* Total Minutes */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Minutes</span>
            <ClockIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mb-1 numeric-data">
            {loading ? '...' : (metrics.totalMinutes || 0)}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            <span className="numeric-data">{metrics.totalCalls}</span> calls
          </div>
        </div>

        {/* Highest Cost Call */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Highest Cost Call</span>
            <TrendingUpIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black text-blue-600 dark:text-blue-400 mb-1 numeric-data">
            ${loading ? '...' : ((metrics.highestCostCall || 0) * 1.45).toFixed(3)}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            Per-call range with Retell + Twilio costs
          </div>
        </div>

        {/* Failed Calls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Failed Calls</span>
            <AlertCircleIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400 mb-1">
            {loading ? '...' : metrics.failedCalls}
          </div>
          <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            0% failure rate
          </div>
        </div>
      </div>

      {/* Total Call Costs Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <DollarSignIcon className="w-5 h-5 text-green-600" />
              <span className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">Total Call Costs</span>
            </div>
            <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">Complete cost breakdown for selected date range</p>
          </div>
          <div className="text-left sm:text-right w-full sm:w-auto">
            <div className="text-2xl sm:text-3xl font-black text-green-600 dark:text-green-400">${loading ? '...' : ((metrics.totalCost || 0) * 1.45).toFixed(2)}</div>
            <div className="text-sm sm:text-base text-gray-500 dark:text-gray-400">{metrics.totalCalls} calls</div>
          </div>
        </div>
      </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-red-700">{error}</span>
            <button
              onClick={() => setError('')}
              className="ml-auto text-red-600 hover:text-red-800 text-xl"
            >
              ×
            </button>
          </div>
        )}

        {/* Active Call Interface */}
        {isCallActive && (
          <div className="mb-4 sm:mb-6 lg:mb-8 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-600 rounded-xl p-4 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                  <PhoneCallIcon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">Active Call</h3>
                  <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">Status: {callStatus}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 justify-center sm:justify-end">
                <button
                  onClick={toggleMute}
                  className={`p-3 rounded-lg transition-colors min-h-[44px] min-w-[44px] touch-manipulation ${
                    isMuted ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {isMuted ? <MicOffIcon className="w-5 h-5" /> : <MicIcon className="w-5 h-5" />}
                </button>
                <button
                  onClick={stopCall}
                  className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-lg transition-colors min-h-[44px] min-w-[44px] touch-manipulation"
                >
                  <PhoneOffIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Live Transcript */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 sm:p-4">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Live Transcript</h4>
              <div className="h-24 sm:h-32 overflow-y-auto bg-white dark:bg-gray-800 p-3 sm:p-4 rounded border border-gray-200 dark:border-gray-600 text-sm sm:text-base text-gray-900 dark:text-gray-100">
                {currentTranscript || 'Listening...'}
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="mb-4 sm:mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="relative w-full sm:w-80">
              <SearchIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="search"
                placeholder="Search calls by customer name, ID, or content..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-12 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] text-sm sm:text-base touch-manipulation"
              />
              <button
                onClick={() => setIsFuzzySearchEnabled(!isFuzzySearchEnabled)}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded transition-colors ${
                  isFuzzySearchEnabled
                    ? 'text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
                title={isFuzzySearchEnabled ? 'Fuzzy search enabled - click to disable' : 'Basic search - click to enable fuzzy search'}
              >
                <ZapIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={sentimentFilter}
                onChange={(e) => setSentimentFilter(e.target.value)}
                className="px-3 sm:px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] text-sm sm:text-base w-full sm:w-80 touch-manipulation capitalize"
              >
                <option value="all">All Sentiment</option>
                <option value="positive" className="capitalize">positive</option>
                <option value="neutral" className="capitalize">neutral</option>
                <option value="negative" className="capitalize">negative</option>
              </select>
            </div>
          </div>
        </div>

        {/* Calls Table */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="text-center py-8 sm:py-12">
              <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 dark:text-gray-400 mt-3 sm:mt-4 text-sm sm:text-base">Loading calls...</p>
            </div>
          ) : filteredCalls.length > 0 ? (
            <div className="overflow-x-auto">
              {/* Table Header */}
              <div className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 px-4 sm:px-6 py-3 hidden lg:block">
                <div className="grid grid-cols-10 gap-2 lg:gap-4 text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  <div className="col-span-1">#</div>
                  <div className="col-span-3">Customer</div>
                  <div className="col-span-2">Date & Time</div>
                  <div className="col-span-2">Duration</div>
                  <div className="col-span-2">Cost</div>
                </div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-gray-200 dark:divide-gray-600">
                {filteredCalls.map((call, index) => {
                  // Calculate the actual row number based on current page and pagination
                  const rowNumber = (currentPage - 1) * recordsPerPage + index + 1
                  // Determine if this row should have gray background (even rows)
                  const isEvenRow = index % 2 === 0
                  const rowBgColor = isEvenRow ? 'bg-white' : 'bg-gray-25'

                  return (
                    <div
                      key={call.call_id}
                      className={`px-4 sm:px-6 py-4 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors ${rowBgColor}`}
                      onClick={() => {
                        setSelectedCall(call)
                        setIsDetailModalOpen(true)
                      }}
                    >
                      {/* Desktop Layout */}
                      <div className="hidden lg:grid grid-cols-10 gap-2 lg:gap-4 items-center">
                        {/* Row Number */}
                        <div className="col-span-1">
                          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">#{rowNumber}</span>
                        </div>

                        {/* Customer Info */}
                        <div className="col-span-3">
                        <div className="flex items-center">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                              {call.metadata?.customer_name || 'Caller Unknown'}
                              {hasNotes(call.call_id) && (
                                <div className="flex items-center gap-1">
                                  <StickyNoteIcon className="h-4 w-4 text-blue-500" />
                                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                    {getNoteCount(call.call_id)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {call.to_number || call.from_number || 'No phone number'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Date & Time */}
                      <div className="col-span-2">
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {new Date(call.start_timestamp).toLocaleDateString()}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {new Date(call.start_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>

                      {/* Duration */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-2">
                          <ClockIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatDuration(call.call_length_seconds)}
                          </span>
                        </div>
                      </div>

                      {/* Cost */}
                      <div className="col-span-2">
                        <div className="flex items-center gap-2">
                          <DollarSignIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatCallCost(call)}
                          </span>
                          {call.sentiment_analysis && (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSentimentColor(call.sentiment_analysis.overall_sentiment)}`}>
                              {call.sentiment_analysis.overall_sentiment}
                            </span>
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Mobile and Tablet Layout */}
                    <div className="lg:hidden space-y-2 sm:space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center min-w-0 flex-1">
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm sm:text-base text-gray-900 dark:text-gray-100 truncate">
                              {call.metadata?.customer_name || 'Caller Unknown'}
                              {hasNotes(call.call_id) && (
                                <span className="ml-2 inline-flex items-center gap-1">
                                  <StickyNoteIcon className="h-3 w-3 text-blue-500" />
                                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                    {getNoteCount(call.call_id)}
                                  </span>
                                </span>
                              )}
                            </div>
                            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                              {call.to_number || call.from_number || 'No phone number'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                          <ClockIcon className="w-3 h-3" />
                          {formatDuration(call.call_length_seconds)}
                        </span>
                        <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                          <DollarSignIcon className="w-3 h-3" />
                          {formatCallCost(call)}
                        </span>
                        {call.sentiment_analysis && (
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSentimentColor(call.sentiment_analysis.overall_sentiment)}`}>
                            {call.sentiment_analysis.overall_sentiment}
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-gray-500">
                        {new Date(call.start_timestamp).toLocaleDateString()} at {new Date(call.start_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <PhoneIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-2">No calls found</h3>
              <p className="text-gray-600 dark:text-gray-400">No calls have been made yet.</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalCallsCount > recordsPerPage && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 mt-4 sm:mt-6 lg:mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
            <div className="flex items-center text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center sm:text-left">
              <span>
                Showing {((currentPage - 1) * recordsPerPage) + 1} to {Math.min(currentPage * recordsPerPage, totalCallsCount)} of {totalCallsCount} calls
              </span>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2 flex-wrap justify-center">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
              >
                <span className="sm:hidden">Prev</span>
                <span className="hidden sm:inline">Previous</span>
              </button>

              {/* Page Numbers */}
              <div className="flex items-center space-x-1">
                {(() => {
                  const totalPages = Math.ceil(totalCallsCount / recordsPerPage)
                  const pages = []
                  const startPage = Math.max(1, currentPage - 2)
                  const endPage = Math.min(totalPages, currentPage + 2)

                  // First page
                  if (startPage > 1) {
                    pages.push(
                      <button
                        key={1}
                        onClick={() => setCurrentPage(1)}
                        className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
                      >
                        1
                      </button>
                    )
                    if (startPage > 2) {
                      pages.push(<span key="ellipsis1" className="px-2 text-gray-500 dark:text-gray-400">...</span>)
                    }
                  }

                  // Current page range
                  for (let i = startPage; i <= endPage; i++) {
                    pages.push(
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i)}
                        className={`px-3 py-2 text-sm font-medium rounded-lg ${
                          i === currentPage
                            ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600'
                            : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        {i}
                      </button>
                    )
                  }

                  // Last page
                  if (endPage < totalPages) {
                    if (endPage < totalPages - 1) {
                      pages.push(<span key="ellipsis2" className="px-2 text-gray-500 dark:text-gray-400">...</span>)
                    }
                    pages.push(
                      <button
                        key={totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                        className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600"
                      >
                        {totalPages}
                      </button>
                    )
                  }

                  return pages
                })()}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(totalCallsCount / recordsPerPage)))}
                disabled={currentPage >= Math.ceil(totalCallsCount / recordsPerPage)}
                className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Call Detail Modal */}
        {selectedCall && (
          <CallDetailModal
            call={selectedCall}
            isOpen={isDetailModalOpen}
            onClose={() => {
              setIsDetailModalOpen(false)
              setSelectedCall(null)
            }}
            onNotesChanged={() => refetchNotesCount()}
          />
        )}

        {/* Site Help Chatbot - NO PHI ACCESS */}
        <SiteHelpChatbot
          isVisible={showHelpChatbot}
          onToggle={() => setShowHelpChatbot(!showHelpChatbot)}
        />

        {/* Toast Notifications for new records */}
        <ToastManager userId={user?.id} />

    </div>
  )
}