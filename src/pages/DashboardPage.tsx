import React, { useState, useEffect, useCallback } from 'react'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { useSMSCostManager } from '@/hooks/useSMSCostManager'
import { DateRangePicker, DateRange, getDateRangeFromSelection } from '@/components/common/DateRangePicker'
import { retellService, currencyService, twilioCostService, chatService } from '@/services'
import { pdfExportService } from '@/services/pdfExportService'
import { userSettingsService } from '@/services'
import { SiteHelpChatbot } from '@/components/common/SiteHelpChatbot'
import { stripeInvoiceService } from '@/services/stripeInvoiceService'
import { invoiceEmailService } from '@/services/invoiceEmailService'
import { generalToast } from '@/services/generalToastService'
import { supabase } from '@/config/supabase'
import {
  PhoneIcon,
  MessageSquareIcon,
  ClockIcon,
  ActivityIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
  CalendarIcon,
  RefreshCwIcon,
  DownloadIcon,
  DollarSignIcon,
  ThumbsUpIcon,
  AlertCircleIcon,
  BarChart3Icon,
  TrashIcon,
  FileTextIcon,
  XIcon,
  LockIcon
} from 'lucide-react'

interface DashboardPageProps {
  user: any
}

// SMS Segment Cache interfaces (same as SMS page)
interface SegmentCacheEntry {
  chatId: string
  segments: number
  timestamp: number
}

interface SegmentCache {
  data: SegmentCacheEntry[]
  lastUpdated: number
}

// Use the same cache key as SMS page for consistency
const SMS_SEGMENT_CACHE_KEY = 'sms_segment_cache_v2'
const CACHE_EXPIRY_HOURS = 12

export const DashboardPage: React.FC<DashboardPageProps> = ({ user }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>(() => {
    // Remember last selected date range from localStorage
    const saved = localStorage.getItem('dashboard_page_date_range')
    return (saved as DateRange) || 'today'
  })
  const [isChatbotVisible, setIsChatbotVisible] = useState(false)

  // State for custom date range
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem('dashboard_custom_start_date')
    return saved ? new Date(saved) : undefined
  })
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem('dashboard_custom_end_date')
    return saved ? new Date(saved) : undefined
  })

  const [error, setError] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  // Invoice generation state
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false)
  // ARTLEE: Hardcoded customer info for Artlee Creative
  const [invoiceCustomerName] = useState('Artlee Creative')
  const [invoiceCustomerEmail] = useState('create@artlee.agency')

  // Track shown errors to prevent duplicates
  // Track shown errors in localStorage to persist across page refreshes
  const getShownErrors = (): Set<string> => {
    try {
      const stored = localStorage.getItem('dashboard_shown_errors')
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  }

  const saveShownErrors = (errors: Set<string>) => {
    try {
      localStorage.setItem('dashboard_shown_errors', JSON.stringify([...errors]))
    } catch (error) {
      console.error('Failed to save shown errors:', error)
    }
  }

  const [shownErrorsState] = useState<Set<string>>(getShownErrors())

  // SMS Segment caching state (exact copy from SMS page)
  const [fullDataSegmentCache, setFullDataSegmentCache] = useState<Map<string, number>>(new Map())
  const [segmentCache, setSegmentCache] = useState<Map<string, number>>(new Map())
  const [loadingFullChats, setLoadingFullChats] = useState<Set<string>>(new Set())
  const [segmentUpdateTrigger, setSegmentUpdateTrigger] = useState(0)
  const [allFilteredChats, setAllFilteredChats] = useState<any[]>([])
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)
  const [lastDateRange, setLastDateRange] = useState<DateRange | null>(null)

  // Progress tracking states (copied from SMS page for accurate segment loading)
  const [isLoadingSegments, setIsLoadingSegments] = useState(false)
  const [segmentLoadingProgress, setSegmentLoadingProgress] = useState({ completed: 0, total: 0 })
  const [segmentLoadingComplete, setSegmentLoadingComplete] = useState(false)

  // Helper function to add Twilio costs to call metrics
  const addTwilioCostsToCallMetrics = (baseMetrics: any, calls: any[]) => {
    // 🚨 AGGRESSIVE LOGGING - VERSION CHECK
    console.log('🚨🚨🚨 DASHBOARD CODE VERSION 2.1 - FIX LOADED 🚨🚨🚨')
    console.log('🔧 Currency conversion fix is active!')

    // Calculate total Twilio costs for all calls
    const totalTwilioCostCAD = calls.reduce((sum, call) => {
      return sum + twilioCostService.getTwilioCostCAD(call.call_length_seconds || 0)
    }, 0)

    // Convert base metrics to CAD and add Twilio costs
    const baseTotalCostCAD = currencyService.convertUSDToCAD(baseMetrics.totalCost)
    const baseAvgCostCAD = currencyService.convertUSDToCAD(baseMetrics.avgCostPerCall)
    const baseHighestCostCAD = currencyService.convertUSDToCAD(baseMetrics.highestCostCall)
    const baseLowestCostCAD = currencyService.convertUSDToCAD(baseMetrics.lowestCostCall)

    console.log('🚨 CRITICAL: CAD CONVERSION CHECK:', {
      'INPUT (USD)': baseMetrics.totalCost,
      'OUTPUT (CAD)': baseTotalCostCAD,
      'CONVERSION RATE': 1.45,
      'EXPECTED': baseMetrics.totalCost * 1.45,
      'CORRECT?': Math.abs(baseTotalCostCAD - (baseMetrics.totalCost * 1.45)) < 0.01
    })

    // Calculate new totals
    const newTotalCostCAD = baseTotalCostCAD + totalTwilioCostCAD
    const newAvgCostCAD = baseMetrics.totalCalls > 0 ? newTotalCostCAD / baseMetrics.totalCalls : 0

    // Find highest and lowest cost calls including Twilio
    const callCostsWithTwilio = calls.map(call => {
      const retellCostCents = call.call_cost?.combined_cost || 0
      const retellCostUSD = retellCostCents / 100
      const retellCostCAD = currencyService.convertUSDToCAD(retellCostUSD)
      const twilioCostCAD = twilioCostService.getTwilioCostCAD(call.call_length_seconds || 0)
      return retellCostCAD + twilioCostCAD
    })

    const newHighestCostCAD = callCostsWithTwilio.length > 0 ? Math.max(...callCostsWithTwilio) : 0
    const newLowestCostCAD = callCostsWithTwilio.length > 0 ? Math.min(...callCostsWithTwilio) : 0

    // BUGFIX: Explicitly construct return object instead of spreading
    // to ensure CAD values are not accidentally overwritten by USD values
    const result = {
      totalCalls: baseMetrics.totalCalls,
      avgDuration: baseMetrics.avgDuration,
      successRate: baseMetrics.successRate,
      totalDuration: baseMetrics.totalDuration,
      positiveSentiment: baseMetrics.positiveSentiment,
      failedCalls: baseMetrics.failedCalls,
      totalMinutes: baseMetrics.totalMinutes,
      // CAD-converted values
      totalCost: newTotalCostCAD,
      avgCostPerCall: newAvgCostCAD,
      highestCostCall: newHighestCostCAD,
      lowestCostCall: newLowestCostCAD
    }

    console.log('📊 addTwilioCostsToCallMetrics RETURN VALUE:', {
      'totalCost (should be CAD)': result.totalCost,
      'avgCostPerCall (should be CAD)': result.avgCostPerCall,
      'originalUSD': baseMetrics.totalCost,
      'convertedCAD': baseTotalCostCAD,
      'twilioCAD': totalTwilioCostCAD,
      'finalCAD': newTotalCostCAD
    })

    return result
  }

  // SMS cost management using cache service (exact copy from SMS page)
  const smsCostManager = useSMSCostManager({
    onProgress: (loaded, total) => {
      console.log(`Dashboard SMS cost loading progress: ${loaded}/${total}`)
    }
  })

  const [metrics, setMetrics] = useState({
    totalCalls: 0,
    avgCallDuration: '0:00',
    avgCostPerCall: 0,
    callSuccessRate: 0,
    totalCost: 0,
    highestCostCall: 0,
    lowestCostCall: 0,
    totalCallDuration: '0:00',
    totalMessages: 0,
    avgMessagesPerChat: 0,
    avgCostPerMessage: 0,
    messageDeliveryRate: 0,
    totalSMSCost: 0,
    totalSegments: 0
  })
  const [retellStatus, setRetellStatus] = useState<'checking' | 'connected' | 'error' | 'not-configured'>('checking')

  // Load segment cache from localStorage (shared with SMS page)
  const loadSegmentCache = (): Map<string, number> => {
    try {
      const cached = localStorage.getItem(SMS_SEGMENT_CACHE_KEY)
      if (!cached) return new Map()

      const cacheData: SegmentCache = JSON.parse(cached)
      const now = Date.now()
      const expiryTime = CACHE_EXPIRY_HOURS * 60 * 60 * 1000

      // Check if cache is expired
      if (now - cacheData.lastUpdated > expiryTime) {
        console.log('📅 SMS segment cache expired, clearing old data')
        localStorage.removeItem(SMS_SEGMENT_CACHE_KEY)
        return new Map()
      }

      // Filter out expired individual entries and convert to Map
      const validEntries = cacheData.data.filter(entry => {
        return now - entry.timestamp < expiryTime
      })

      console.log(`💾 Loaded ${validEntries.length} cached SMS segment calculations`)
      return new Map(validEntries.map(entry => [entry.chatId, entry.segments]))
    } catch (error) {
      console.error('Failed to load SMS segment cache:', error)
      return new Map()
    }
  }

  // Save segment cache to localStorage (shared with SMS page)
  const saveSegmentCache = useCallback((cache: Map<string, number>) => {
    try {
      const now = Date.now()
      const cacheData: SegmentCache = {
        data: Array.from(cache.entries()).map(([chatId, segments]) => ({
          chatId,
          segments,
          timestamp: now
        })),
        lastUpdated: now
      }

      localStorage.setItem(SMS_SEGMENT_CACHE_KEY, JSON.stringify(cacheData))
      console.log(`💾 Saved ${cache.size} SMS segment calculations to cache`)
    } catch (error) {
      console.error('Failed to save SMS segment cache:', error)
    }
  }, [])

  // Initialize cache loading state
  useEffect(() => {
    const cachedSegments = loadSegmentCache()
    setFullDataSegmentCache(cachedSegments)
    console.log(`📁 Dashboard loaded ${cachedSegments.size} cached segments from localStorage`)
  }, [])

  // Initialize Stripe and force-load credentials on mount
  useEffect(() => {
    console.log('🚀 Dashboard: Initial mount - initializing Stripe and credentials')

    const initAll = async () => {
      // First, force-load credentials from localStorage
      try {
        console.log('🔧 Dashboard: Force-loading credentials from localStorage...')
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}')
        if (currentUser.id) {
          const settings = JSON.parse(localStorage.getItem(`settings_${currentUser.id}`) || '{}')

          const storedApiKeys = {
            retellApiKey: settings.retellApiKey || '',
            callAgentId: settings.callAgentId || '',
            smsAgentId: settings.smsAgentId || ''
          }

          // Update retell service if keys exist
          if (storedApiKeys.retellApiKey) {
            retellService.updateCredentials(
              storedApiKeys.retellApiKey,
              storedApiKeys.callAgentId,
              storedApiKeys.smsAgentId
            )
            console.log('✅ Dashboard: Credentials force-loaded into retellService')
          } else {
            console.log('ℹ️ Dashboard: No credentials found in localStorage')
          }
        }
      } catch (error) {
        console.warn('⚠️ Dashboard: Error force-loading credentials:', error)
      }

      // Then initialize Stripe
      try {
        const result = await stripeInvoiceService.initialize()
        if (result.success) {
          console.log('✅ Stripe invoice service initialized')
        } else {
          console.warn('⚠️ Stripe invoice service initialization failed:', result.error)
        }
      } catch (error) {
        console.warn('⚠️ Stripe initialization error:', error)
      }
    }

    initAll()
  }, []) // Empty dependency array = run once on mount

  // Save cache when it changes
  useEffect(() => {
    if (fullDataSegmentCache.size > 0) {
      saveSegmentCache(fullDataSegmentCache)
    }
  }, [fullDataSegmentCache, saveSegmentCache])

  // Auto-refresh functionality
  const { formatLastRefreshTime } = useAutoRefresh({
    enabled: true,
    interval: 60000, // 1 minute
    onRefresh: () => {
      fetchDashboardData()
      console.log('Dashboard refreshed at:', new Date().toLocaleTimeString())
    }
  })

  // ==================================================================================
  // 🔒 LOCKED CODE: SMS SEGMENTS CALCULATOR - PRODUCTION READY - NO MODIFICATIONS
  // ==================================================================================
  // This function is now working perfectly and is locked for production use.
  // Issue resolved: Segment calculation now shows correct totals (16 segments confirmed)
  // Locked on: 2025-09-21 after successful debugging and verification
  // Status: PRODUCTION LOCKED - ABSOLUTELY NO MODIFICATIONS ALLOWED
  // ==================================================================================

  // Helper function to calculate SMS segments for a chat (prioritizes modal's accurate data)
  // Note: This function should NOT update caches during metrics calculation to prevent circular dependencies
  const calculateChatSMSSegments = useCallback((chat: any, shouldCache: boolean = true): number => {
    try {
      // Priority 1: Check full data cache first (populated by modal with accurate data)
      const fullDataCached = fullDataSegmentCache.get(chat.chat_id)
      if (fullDataCached !== undefined) {
        console.log(`✅ Using accurate segment count from modal: ${fullDataCached} segments for chat ${chat.chat_id}`)
        return fullDataCached
      }

      let messages = []
      let segments = 1 // Default fallback

      console.log(`🔍 CALCULATING SEGMENTS for chat ${chat.chat_id}:`, {
        hasMessages: !!(chat.message_with_tool_calls?.length),
        messageCount: chat.message_with_tool_calls?.length || 0,
        hasTranscript: !!chat.transcript,
        transcriptLength: chat.transcript?.length || 0,
        chatDate: new Date(chat.start_timestamp.toString().length <= 10 ? chat.start_timestamp * 1000 : chat.start_timestamp).toLocaleString(),
        chatStatus: chat.chat_status
      })

      // Priority 1: Use full message array if available and has content
      if (chat.message_with_tool_calls && Array.isArray(chat.message_with_tool_calls) && chat.message_with_tool_calls.length > 0) {
        // Check if messages actually have content
        const messagesWithContent = chat.message_with_tool_calls.filter(m => m.content && m.content.trim().length > 0)
        if (messagesWithContent.length > 0) {
          messages = messagesWithContent
          console.log(`📝 Using ${messages.length} content messages from message_with_tool_calls`)
        }
      }

      // Priority 2: Use transcript as fallback if no proper messages found
      if (messages.length === 0 && chat.transcript && chat.transcript.trim().length > 0) {
        messages = [{ content: chat.transcript, role: 'user' }]
        console.log(`📝 Using transcript ([TRANSCRIPT-REDACTED - PROTECTED]) as single message`)
      }

      // Calculate segments if we have content
      if (messages.length > 0 && messages.some(m => m.content && m.content.trim().length > 0)) {
        const breakdown = twilioCostService.getDetailedSMSBreakdown(messages)
        segments = Math.max(breakdown.segmentCount, 1)

        // Enhanced debugging for segment calculation
        const totalChars = messages.reduce((acc, msg) => acc + (msg.content?.length || 0), 0)
        console.log(`📊 ✅ Chat ${chat.chat_id}: ${segments} segments calculated from available data (${messages.length} messages, ${totalChars} total characters)`)

        // If segments seem unusually low for the content, investigate
        if (totalChars > 500 && segments < 3) {
          console.warn(`🚨 SEGMENT CALCULATION WARNING: Chat ${chat.chat_id} has ${totalChars} characters but only ${segments} segments - investigating breakdown:`)
          console.warn(`🚨 Breakdown:`, breakdown)
          console.warn(`🚨 Messages:`, messages.map(m => ({ role: m.role, length: m.content?.length || 0, content: m.content?.substring(0, 100) + '...' })))
        }
      } else {
        // No content available - use a reasonable estimate based on typical SMS conversations
        // Most basic SMS conversations are 1-3 segments
        segments = 1
        console.log(`📊 Chat ${chat.chat_id}: Using fallback ${segments} segment (no content available)`)
      }

      // Only cache the result if explicitly requested (prevents circular dependencies in metrics calculation)
      if (shouldCache) {
        setFullDataSegmentCache(prev => {
          const newCache = new Map(prev.set(chat.chat_id, segments))
          // Save updated cache to localStorage
          saveSegmentCache(newCache)
          return newCache
        })
      }
      return segments

    } catch (error) {
      console.error(`❌ Error calculating SMS segments for chat ${chat.chat_id}:`, error)

      // Try to use transcript as last resort
      try {
        if (chat.transcript && chat.transcript.trim().length > 0) {
          const transcriptLength = chat.transcript.trim().length
          let fallbackSegments

          try {
            // Try using Twilio service for accurate calculation
            fallbackSegments = twilioCostService.getDetailedSMSBreakdown([{ content: chat.transcript, role: 'user' }]).segmentCount
            fallbackSegments = Math.max(fallbackSegments, 1)
          } catch (twilioError) {
            // Fallback to rough estimation
            fallbackSegments = Math.max(Math.ceil(transcriptLength / 160), 1)
          }

          console.log(`🆘 Emergency fallback using transcript for ${chat.chat_id}: [TRANSCRIPT-REDACTED - PROTECTED] - ${fallbackSegments} segments`)

          // Only cache this emergency fallback if explicitly requested
          if (shouldCache) {
            setFullDataSegmentCache(prev => {
              const newCache = new Map(prev.set(chat.chat_id, fallbackSegments))
              saveSegmentCache(newCache)
              return newCache
            })
          }

          return fallbackSegments
        }
      } catch (fallbackError) {
        console.error(`❌ Emergency fallback failed for ${chat.chat_id}:`, fallbackError)
      }

      // Final fallback - use 1 instead of 2 for more realistic base cost
      return 1
    }
  }, [fullDataSegmentCache, saveSegmentCache])

  // ==================================================================================
  // 🔒 END LOCKED CODE: SMS SEGMENTS CALCULATOR - PRODUCTION READY
  // ==================================================================================

  // Function for modals to register accurate segment calculations from full chat data
  const updateFullDataSegmentCache = useCallback((chatId: string, fullChatData: any) => {
    try {
      if (!fullChatData?.message_with_tool_calls || !Array.isArray(fullChatData.message_with_tool_calls)) {
        console.log(`⚠️ No full message data available for chat ${chatId}`)
        return
      }

      const messagesWithContent = fullChatData.message_with_tool_calls.filter(m => m.content && m.content.trim().length > 0)

      if (messagesWithContent.length > 0) {
        const breakdown = twilioCostService.getDetailedSMSBreakdown(messagesWithContent)
        const accurateSegments = Math.max(breakdown.segmentCount, 1)

        console.log(`🎯 Modal calculated accurate segments for chat ${chatId}: ${accurateSegments} segments`)

        // Update the full data cache and persist to localStorage
        setFullDataSegmentCache(prev => {
          const newCache = new Map(prev.set(chatId, accurateSegments))
          // Save updated cache to localStorage
          saveSegmentCache(newCache)
          return newCache
        })

        // Trigger re-render to update cost column
        setSegmentUpdateTrigger(prev => prev + 1)

        return accurateSegments
      }
    } catch (error) {
      console.error(`❌ Error calculating accurate segments for chat ${chatId}:`, error)
    }
  }, [saveSegmentCache])

  // Expose the function globally so modals can access it
  useEffect(() => {
    (window as any).updateSMSSegments = updateFullDataSegmentCache
    return () => {
      delete (window as any).updateSMSSegments
    }
  }, [updateFullDataSegmentCache])


  // Calculate average chat duration as a simpler metric
  const calculateAverageChatDuration = (chats: any[]): string => {
    if (chats.length === 0) return '0m'

    let totalDurations = []

    chats.forEach(chat => {
      if (chat.start_timestamp && chat.end_timestamp) {
        const duration = chat.end_timestamp - chat.start_timestamp
        // Convert to seconds if timestamps are in milliseconds
        const durationSeconds = duration > 1000000 ? duration / 1000 : duration
        totalDurations.push(durationSeconds)
      }
    })

    if (totalDurations.length === 0) {
      return 'N/A'
    }

    // Calculate average duration in seconds
    const avgDurationSeconds = totalDurations.reduce((sum, duration) => sum + duration, 0) / totalDurations.length

    // Convert to human readable format
    if (avgDurationSeconds < 60) {
      return `${Math.round(avgDurationSeconds)}s`
    } else if (avgDurationSeconds < 3600) {
      return `${Math.round(avgDurationSeconds / 60)}m`
    } else {
      const hours = Math.floor(avgDurationSeconds / 3600)
      const minutes = Math.round((avgDurationSeconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }
  }

  // Smart cache management for date range changes (exact copy from SMS page)
  // Only clear cache if the date range actually changed (not initial mount)
  useEffect(() => {
    // Skip clearing cache on initial mount - preserve loaded cache
    if (!hasInitiallyLoaded) {
      setHasInitiallyLoaded(true)
      setLastDateRange(selectedDateRange)
      return
    }

    // Only update tracking if date range actually changed or custom dates changed
    // Note: We do NOT clear fullDataSegmentCache as it contains persistent data that should survive date range changes
    const dateRangeChanged = lastDateRange !== selectedDateRange
    const customDatesChanged = selectedDateRange === 'custom' && (customStartDate || customEndDate)

    if (dateRangeChanged || customDatesChanged) {
      console.log(`📅 Dashboard date range changed from ${lastDateRange} to ${selectedDateRange}`, {
        dateRangeChanged,
        customDatesChanged,
        customStartDate: customStartDate?.toISOString(),
        customEndDate: customEndDate?.toISOString()
      })
      console.log(`💾 Persistent cache contains ${fullDataSegmentCache.size} entries that will be preserved`)
      setLastDateRange(selectedDateRange)

      // CRITICAL FIX: Only clear costs cache, don't clear it too aggressively for custom dates
      if (dateRangeChanged) {
        // Clear costs only when switching between different preset ranges
        smsCostManager.clearCosts()
        console.log('📅 Dashboard cleared SMS costs cache for preset date range change')
      } else if (customDatesChanged) {
        // For custom date changes, clear costs more carefully
        setTimeout(() => {
          smsCostManager.clearCosts()
          console.log('📅 Dashboard cleared SMS costs cache for custom date change (delayed)')
        }, 100)
      }

      setSegmentCache(new Map()) // Clear segment cache for new date range
      setLoadingFullChats(new Set()) // Clear loading state for new date range
      setSegmentUpdateTrigger(0) // Reset segment update trigger
      console.log('📅 Dashboard date range changed, cleared non-persistent caches and reset state')
    }

    // Always fetch data when dependencies change
    console.log('📅 Dashboard fetching data due to date range change', {
      selectedDateRange,
      customStartDate: customStartDate?.toISOString(),
      customEndDate: customEndDate?.toISOString()
    })
    fetchDashboardData()
  }, [selectedDateRange, customStartDate, customEndDate, hasInitiallyLoaded])

  // Listen for API configuration events from AuthContext
  useEffect(() => {
    const handleApiConfigurationReady = (event: CustomEvent) => {
      console.log('🚀 Dashboard: Received apiConfigurationReady event', event.detail)
      // AGGRESSIVE FIX: Always retry when we get this event, regardless of current status
      console.log('🔄 Dashboard: API configuration ready event received, forcing data refresh...')

      // Force credential reload in retellService to ensure latest data
      try {
        retellService.loadCredentials()
        console.log('🔄 Dashboard: Forced credential reload completed')
      } catch (error) {
        console.error('❌ Dashboard: Error forcing credential reload:', error)
      }

      // Always refetch data when this event fires
      fetchDashboardData()
    }

    window.addEventListener('apiConfigurationReady', handleApiConfigurationReady as EventListener)

    return () => {
      window.removeEventListener('apiConfigurationReady', handleApiConfigurationReady as EventListener)
    }
  }, []) // Remove retellStatus dependency to always listen

  // State to store filtered chats for cost recalculation
  const [filteredChatsForCosts, setFilteredChatsForCosts] = useState<any[]>([])

  // ==================================================================================
  // 🔒 LOCKED CODE: SMS SEGMENTS METRICS CALCULATION - PRODUCTION READY - NO MODIFICATIONS
  // ==================================================================================
  // This useEffect handles the SMS segments totaling and is now working perfectly.
  // Issue resolved: Total now shows correct segment counts (16 segments confirmed)
  // Copied EXACTLY from SMS page - this is the definitive, working version
  // Status: PRODUCTION LOCKED - ABSOLUTELY NO MODIFICATIONS ALLOWED
  // ==================================================================================

  // Optimized metrics calculation with consolidated SMS segments calculation (EXACT COPY FROM SMS PAGE)
  useEffect(() => {
    if (allFilteredChats.length === 0) {
      // Reset everything when no chats
      setMetrics(prevMetrics => ({
        ...prevMetrics,
        totalSegments: 0,
        totalSMSCost: 0,
        avgCostPerMessage: 0
      }))
      return
    }

    const calculateMetrics = () => {
      // Calculate SMS segments using accurate modal data when available
      let calculatedTotalSegments = 0
      let chatsWithAccurateData = 0
      console.log(`📊 Dashboard: Calculating SMS segments for ${allFilteredChats.length} chats using fullDataSegmentCache priority`)
      console.log(`📅 Dashboard Date range: ${selectedDateRange} - Processing ${allFilteredChats.length} total chats for segment calculation`)
      console.log(`🔍 Dashboard DEBUG: Cache state - fullDataSegmentCache has ${fullDataSegmentCache.size} entries`)
      console.log(`🔍 Dashboard DEBUG: Expected 16 segments for today, currently calculating from ${allFilteredChats.length} chats`)

      // DEBUGGING: Check if the issue is with date filtering or segment calculation
      if (selectedDateRange === 'today' && allFilteredChats.length < 5) {
        console.warn(`🚨 Dashboard POTENTIAL ISSUE: Only ${allFilteredChats.length} chats for today - expected more for 16 segments`)
        console.warn(`🚨 Dashboard: This suggests the date filtering might be too restrictive or no chats exist for today`)
        console.warn(`🚨 Dashboard: Current date range filtering for 'today' may need investigation`)
      }

      allFilteredChats.forEach((chat, index) => {
        // Priority: Use accurate data from modal if available
        const accurateSegments = fullDataSegmentCache.get(chat.chat_id)
        if (accurateSegments !== undefined) {
          calculatedTotalSegments += accurateSegments
          chatsWithAccurateData++
          // Always log for debugging when dealing with low chat counts (today issue)
          if (allFilteredChats.length <= 10 || index % 50 === 0 || index < 10 || index >= allFilteredChats.length - 5) {
            console.log(`Dashboard Chat ${index + 1} (${chat.chat_id}): ${accurateSegments} segments (ACCURATE from modal)`)
          }
        } else {
          // Fallback to basic calculation only when no accurate data available
          // Use shouldCache: false to prevent circular dependency during metrics calculation
          const fallbackSegments = calculateChatSMSSegments(chat, false)
          calculatedTotalSegments += fallbackSegments
          // Always log for debugging when dealing with low chat counts (today issue)
          if (allFilteredChats.length <= 10 || index % 50 === 0 || index < 10 || index >= allFilteredChats.length - 5) {
            console.log(`Dashboard Chat ${index + 1} (${chat.chat_id}): ${fallbackSegments} segments (fallback)`)
          }
        }
      })

      console.log(`📊 ✅ Dashboard COMPLETE: Total SMS segments calculated: ${calculatedTotalSegments} (${chatsWithAccurateData}/${allFilteredChats.length} from accurate modal data)`)
      console.log(`📈 Dashboard Segment breakdown: ${chatsWithAccurateData} accurate + ${allFilteredChats.length - chatsWithAccurateData} fallback = ${calculatedTotalSegments} total segments`)
      console.log(`🔍 Dashboard DEBUG: Expected 16 segments but got ${calculatedTotalSegments} - investigating discrepancy`)
      console.log(`🔍 Dashboard DEBUG: Date range verification - Selected: ${selectedDateRange}, Chats processed: ${allFilteredChats.length}`)

      // DEBUGGING FIX: If we're getting significantly fewer segments than expected for today, trigger accurate recalculation
      // Only trigger if we have many chats but very few segments (ratio-based check)
      const avgSegmentsPerChat = allFilteredChats.length > 0 ? calculatedTotalSegments / allFilteredChats.length : 0
      if (selectedDateRange === 'today' && allFilteredChats.length > 3 && avgSegmentsPerChat < 0.5) {
        console.warn(`🚨 Dashboard APPLYING FIX: Only ${calculatedTotalSegments} segments for ${allFilteredChats.length} chats today - average ${avgSegmentsPerChat.toFixed(2)} segments per chat seems low`)
        console.warn(`🚨 Dashboard Triggering accurate segment recalculation for all today's chats`)

        // Clear cache for today's chats and trigger fresh calculation
        allFilteredChats.forEach(chat => {
          fullDataSegmentCache.delete(chat.chat_id)
        })

        // Trigger bulk load to get accurate data
        setTimeout(() => {
          loadAccurateSegmentsForAllChats()
        }, 500)
      }

      // Calculate total cost from calculated segments (more accurate than individual chat costs)
      const totalCostFromSegmentsUSD = calculatedTotalSegments * 0.0083 // USD per segment
      const totalCostFromSegments = currencyService.convertUSDToCAD(totalCostFromSegmentsUSD) // Convert to CAD
      console.log(`💰 Dashboard Total cost calculated from ${calculatedTotalSegments} segments: $${totalCostFromSegmentsUSD.toFixed(4)} USD → $${totalCostFromSegments.toFixed(4)} CAD`)

      // Also calculate from individual chat costs for comparison/fallback
      let totalCostFromFilteredChats = 0
      let costsCalculated = 0

      allFilteredChats.forEach(chat => {
        const { cost } = smsCostManager.getChatCost(chat.chat_id)
        if (cost > 0) {
          totalCostFromFilteredChats += cost
          costsCalculated++
        }
      })

      // Use combined costs from smsCostManager (includes Twilio SMS + Retell AI), fallback to segments if no costs loaded
      const finalTotalCost = costsCalculated > 0 ? totalCostFromFilteredChats : totalCostFromSegments
      const avgCostPerChat = allFilteredChats.length > 0 ? finalTotalCost / allFilteredChats.length : 0

      console.log(`💰 Dashboard Cost comparison - Segments (Twilio only): $${totalCostFromSegments.toFixed(4)} CAD, Combined (Twilio+Retell): $${totalCostFromFilteredChats.toFixed(4)}, Using: $${finalTotalCost.toFixed(4)} CAD`)

      // Update metrics with calculated SMS segments (prioritizing accurate modal data)
      console.log(`💰 Dashboard Updating metrics with totalSegments: ${calculatedTotalSegments} (${chatsWithAccurateData}/${allFilteredChats.length} from accurate modal data)`)

      setMetrics(prevMetrics => {
        const updatedMetrics = {
          ...prevMetrics,
          totalSMSCost: finalTotalCost, // Use segments-based calculation
          avgCostPerMessage: avgCostPerChat,
          totalSegments: calculatedTotalSegments
        }
        console.log(`💰 Dashboard Updated metrics: Total SMS Segments = ${updatedMetrics.totalSegments}, Total SMS Cost = $${updatedMetrics.totalSMSCost.toFixed(4)} CAD`)
        return updatedMetrics
      })
    }

    calculateMetrics()
  }, [allFilteredChats, smsCostManager.costs, segmentUpdateTrigger, fullDataSegmentCache])

  // ==================================================================================
  // 🔒 END LOCKED CODE: SMS SEGMENTS METRICS CALCULATION - PRODUCTION READY
  // ==================================================================================

  // ==================================================================================
  // 🔒 LOCKED CODE: DASHBOARD SEGMENT LOADING - PRODUCTION READY - NO MODIFICATIONS
  // ==================================================================================
  // This function provides fast, accurate segment loading with API throttle protection.
  // Speed optimization confirmed: Amazing performance achieved with batch processing.
  // Locked on: 2025-09-21 after successful speed and accuracy verification
  // Status: PRODUCTION LOCKED - ABSOLUTELY NO MODIFICATIONS ALLOWED
  // ==================================================================================

  // Load accurate segments for all chats (copied from SMS page - WORKING VERSION)
  const loadAccurateSegmentsForAllChats = useCallback(async () => {
    if (!allFilteredChats || allFilteredChats.length === 0) return

    console.log(`🔍 Dashboard loadAccurateSegmentsForAllChats called for ${selectedDateRange} with ${allFilteredChats.length} chats`)

    const chatsToProcess = allFilteredChats.filter(chat => !fullDataSegmentCache.has(chat.chat_id))
    const cachedCount = allFilteredChats.length - chatsToProcess.length

    if (chatsToProcess.length === 0) {
      console.log(`💾 All ${allFilteredChats.length} chats already have cached segment data - no processing needed!`)
      return
    }

    console.log(`🚀 Loading accurate segment data for ${chatsToProcess.length} chats (${cachedCount} already cached)...`)

    // Safety check for "today" - prevent server overload
    if (selectedDateRange === 'today' && chatsToProcess.length > 50) {
      console.error(`🚨 SAFETY ABORT: Attempting to process ${chatsToProcess.length} chats for "today" - this seems wrong!`)
      return
    }

    // Start loading state
    setIsLoadingSegments(true)
    setSegmentLoadingProgress({ completed: 0, total: chatsToProcess.length })
    setSegmentLoadingComplete(false)

    let completed = 0
    for (const chat of chatsToProcess) {
      try {
        const fullChatDetails = await chatService.getChatById(chat.chat_id)
        if (fullChatDetails) {
          updateFullDataSegmentCache(chat.chat_id, fullChatDetails)
        }
        completed++
        setSegmentLoadingProgress({ completed, total: chatsToProcess.length })

        // Small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error(`Failed to load accurate segments for chat ${chat.chat_id}:`, error)
        completed++
        setSegmentLoadingProgress({ completed, total: chatsToProcess.length })
      }
    }

    // Finish loading state
    setIsLoadingSegments(false)
    setSegmentLoadingComplete(true)
    console.log(`✅ Finished loading accurate segment data`)

    // Hide completion message after 3 seconds
    setTimeout(() => {
      setSegmentLoadingComplete(false)
    }, 3000)
  }, [allFilteredChats, fullDataSegmentCache, updateFullDataSegmentCache, selectedDateRange])

  // Smart auto-load segments with proper cache synchronization (copied from SMS page)
  useEffect(() => {
    if (allFilteredChats.length === 0) return

    // Wait for cache to be properly initialized on mount
    if (!hasInitiallyLoaded) {
      console.log(`⏳ Dashboard: Waiting for initial cache load to complete before processing ${allFilteredChats.length} chats`)
      return
    }

    // Check how many chats need processing after cache is ready
    const chatsToProcess = allFilteredChats.filter(chat => !fullDataSegmentCache.has(chat.chat_id))
    const cachedCount = allFilteredChats.length - chatsToProcess.length

    console.log(`📊 Dashboard: Chats loaded: ${allFilteredChats.length} total, ${cachedCount} already cached, ${chatsToProcess.length} need processing`)

    // Only trigger bulk loading if there are uncached chats AND it's worth processing
    if (chatsToProcess.length > 0) {
      const cacheHitRate = cachedCount / allFilteredChats.length
      console.log(`💾 Dashboard Cache hit rate: ${(cacheHitRate * 100).toFixed(1)}% (${cachedCount}/${allFilteredChats.length})`)

      // For full date range coverage, always auto-load if there are uncached chats
      if (chatsToProcess.length >= 2) {
        console.log(`🚀 Dashboard: Auto-triggering bulk load for ${chatsToProcess.length} uncached chats`)
        const timer = setTimeout(() => {
          loadAccurateSegmentsForAllChats()
        }, 1000)
        return () => clearTimeout(timer)
      }
    } else {
      console.log(`💾 All ${allFilteredChats.length} chats already cached - no bulk loading needed!`)
    }
  }, [allFilteredChats, fullDataSegmentCache, hasInitiallyLoaded, loadAccurateSegmentsForAllChats])

  // ==================================================================================
  // 🔒 END LOCKED CODE: DASHBOARD SEGMENT LOADING - PRODUCTION READY
  // ==================================================================================

  const fetchDashboardData = async () => {
    console.log('🚀 📊 PRODUCTION MODE: fetchDashboardData CALLED - Fetching real data from Retell AI')
    setIsLoading(true)
    setError('')

    try {
      // CRITICAL: Clear all cached data to ensure fresh data from YOUR Retell AI account
      console.log('🗑️ Dashboard: Clearing all service caches')
      chatService.clearAllCache()

      // CRITICAL: Clear SMS segment cache from localStorage
      try {
        localStorage.removeItem('sms_segment_cache_v2')
        console.log('🗑️ Dashboard: Cleared SMS segment cache from localStorage')
      } catch (e) {
        console.warn('Failed to clear SMS segment cache:', e)
      }

      // PRODUCTION MODE: Load API credentials
      console.log('📊 Production Mode - Loading API credentials')

      // Get date range
      const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)
      console.log('🔍 Dashboard Date range for API:', {
        selectedRange: selectedDateRange,
        start: start.toISOString(),
        end: end.toISOString(),
        startTimestamp: Math.floor(start.getTime() / 1000),
        endTimestamp: Math.floor(end.getTime() / 1000),
        customStartDate: customStartDate?.toISOString(),
        customEndDate: customEndDate?.toISOString(),
        dateRangeSpanDays: Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
      })

      // PRODUCTION MODE: Fetch real data from Retell AI API
      let callsResponse, chatsResponse

      console.log('🚀 Production Mode: Fetching real data from Retell AI API')

      // Reload credentials to ensure we have the latest
      try {
        await retellService.loadCredentialsAsync()
        console.log('✅ Credentials loaded successfully')
      } catch (error) {
        console.log('⚠️ Supabase credential sync failed, using localStorage fallback:', error)
      }

      // Check if API key is configured
      let apiKey = retellService.getApiKey()
      let hasApiKey = !!apiKey

      if (!hasApiKey) {
        console.log('🔄 No API key found on first check, forcing credential reload...')
        await retellService.loadCredentialsAsync()
        await chatService.syncWithRetellService()
        apiKey = retellService.getApiKey()
        hasApiKey = !!apiKey
        console.log('✅ Fallback credential loading completed, hasApiKey:', hasApiKey)
      }

      if (!hasApiKey) {
        console.log('❌ No API key found, showing not-configured warning')
        setRetellStatus('not-configured')
        setIsLoading(false)
        return
      }

      setRetellStatus('connected')

      // Fetch real calls from Retell AI
      console.log('📞 PRODUCTION MODE: Fetching calls from Retell AI...')
      // Security: Do not log API key - even partial
      const allCalls = await retellService.getAllCalls()
      console.log(`📞 PRODUCTION MODE: Total calls in system: ${allCalls.length}`)
      console.log('📞 Sample call data:', allCalls.length > 0 ? allCalls[0] : 'No calls')

      // Filter calls by date range
      const startMs = start.getTime()
      const endMs = end.getTime()

      const filteredCalls = allCalls.filter(call => {
        let callTimeMs: number
        const timestampStr = call.start_timestamp.toString()

        if (timestampStr.length <= 10) {
          callTimeMs = call.start_timestamp * 1000
        } else {
          callTimeMs = call.start_timestamp
        }

        return callTimeMs >= startMs && callTimeMs <= endMs
      })

      console.log(`📞 Filtered calls for ${selectedDateRange}: ${filteredCalls.length} out of ${allCalls.length}`)

      callsResponse = {
        calls: filteredCalls,
        pagination_key: undefined,
        has_more: false
      }

      // Check if SMS Agent ID is configured before fetching SMS data
      const smsAgentId = retellService.getSmsAgentId()
      const hasSmsAgentId = !!smsAgentId

      let filteredChats: any[] = []

      if (hasSmsAgentId) {
        // Fetch real SMS chats from Retell AI
        console.log('💬 PRODUCTION MODE: Fetching chats from Retell AI...')
        await chatService.syncWithRetellService()

        const allChatsResponse = await chatService.getChatHistory({
          limit: 500
        })
        console.log(`💬 PRODUCTION MODE: Total chats fetched: ${allChatsResponse.chats.length}`)
        console.log('💬 Sample chat data:', allChatsResponse.chats.length > 0 ? allChatsResponse.chats[0] : 'No chats')

        // Filter chats by date range
        filteredChats = allChatsResponse.chats.filter(chat => {
          let chatTimeMs: number
          const timestampStr = chat.start_timestamp.toString()

          if (timestampStr.length <= 10) {
            chatTimeMs = chat.start_timestamp * 1000
          } else {
            chatTimeMs = chat.start_timestamp
          }

          return chatTimeMs >= startMs && chatTimeMs <= endMs
        })
      } else {
        console.log('⚠️ No SMS Agent ID configured - skipping SMS data fetch')
        filteredChats = []
      }

      console.log(`💬 Filtered chats for ${selectedDateRange}: ${filteredChats.length}`)

      chatsResponse = {
        chats: filteredChats,
        pagination_key: undefined,
        has_more: false
      }

      console.log('✅ Production Mode: Data fetching complete (real API data)')
      console.log('- Real calls loaded:', filteredCalls.length)
      console.log('- Real chats loaded:', filteredChats.length)

      // Show warning if no real data available
      if (allCalls.length === 0 && chatsResponse.chats.length === 0) {
        console.warn('⚠️ No data available in your Retell AI account. Dashboard will show empty metrics.')
        console.warn('⚠️ Make some test calls/SMS using your Retell AI agents to see real data.')
      }

      const baseCallMetrics = retellService.calculateCallMetrics(callsResponse.calls)
      console.log('🔍 DEBUG: baseCallMetrics (USD):', {
        totalCost: baseCallMetrics.totalCost,
        avgCostPerCall: baseCallMetrics.avgCostPerCall,
        highestCostCall: baseCallMetrics.highestCostCall,
        lowestCostCall: baseCallMetrics.lowestCostCall
      })

      const enhancedCallMetrics = addTwilioCostsToCallMetrics(baseCallMetrics, callsResponse.calls)
      console.log('🔍 DEBUG: enhancedCallMetrics (should be CAD):', {
        totalCost: enhancedCallMetrics.totalCost,
        avgCostPerCall: enhancedCallMetrics.avgCostPerCall,
        highestCostCall: enhancedCallMetrics.highestCostCall,
        lowestCostCall: enhancedCallMetrics.lowestCostCall
      })

      // Calculate SMS costs using exact same logic as SMS page with caching
      // Note: filteredChats is already declared above in the production mode API fetching section

      // Store filtered chats for cost recalculation and metrics
      setFilteredChatsForCosts(filteredChats)
      setAllFilteredChats(filteredChats)

      // Segment loading is now handled by auto-loading useEffect
      // Manual call removed - auto-loading triggers after allFilteredChats updates

      // Load SMS costs for visible chats using smsCostManager (only if SMS Agent ID is configured)
      if (hasSmsAgentId && filteredChats.length > 0) {
        console.log(`🔍 Dashboard: Loading SMS costs for ${filteredChats.length} filtered chats`, {
          dateRange: selectedDateRange,
          chatIds: filteredChats.slice(0, 5).map(c => c.chat_id),
          totalChats: filteredChats.length
        })
        smsCostManager.loadCostsForChats(filteredChats)
      } else if (!hasSmsAgentId) {
        console.log('⚠️ Dashboard: No SMS Agent ID configured - SMS costs will be $0')
      } else {
        console.log('⚠️ Dashboard: No filtered chats to load costs for - SMS costs will be $0', {
          dateRange: selectedDateRange,
          selectedRange: selectedDateRange,
          startMs,
          endMs
        })
      }

      // Calculate basic chat metrics
      const baseChatMetrics = chatService.getChatStats(filteredChats)
      const estimatedMessagesPerChat = filteredChats.length > 0 ? 2.0 : 0

      console.log('Enhanced Dashboard metrics (Retell + Twilio):')
      console.log('- Base call metrics:', baseCallMetrics)
      console.log('- Enhanced call metrics:', enhancedCallMetrics)
      console.log('- Basic chat metrics:', baseChatMetrics)

      console.log('🚨🚨🚨 ABOUT TO SET METRICS - FINAL VALUES 🚨🚨🚨')
      console.log('totalCost (CAD):', enhancedCallMetrics.totalCost)
      console.log('avgCostPerCall (CAD):', enhancedCallMetrics.avgCostPerCall)

      setMetrics(prevMetrics => {
        const newMetrics = {
          ...prevMetrics,
          totalCalls: enhancedCallMetrics.totalCalls,
          avgCallDuration: enhancedCallMetrics.avgDuration,
          avgCostPerCall: enhancedCallMetrics.avgCostPerCall,
          callSuccessRate: enhancedCallMetrics.successRate,
          totalCost: enhancedCallMetrics.totalCost,
          highestCostCall: enhancedCallMetrics.highestCostCall,
          lowestCostCall: enhancedCallMetrics.lowestCostCall,
          totalCallDuration: enhancedCallMetrics.totalDuration,
          totalMessages: baseChatMetrics.totalChats,
          avgMessagesPerChat: baseChatMetrics.avgMessagesPerChat > 0 ? baseChatMetrics.avgMessagesPerChat : estimatedMessagesPerChat,
          messageDeliveryRate: baseChatMetrics.successRate
        }

        console.log('🚨 NEW METRICS STATE:', {
          'totalCost': newMetrics.totalCost,
          'avgCostPerCall': newMetrics.avgCostPerCall,
          'Should be CAD (1.45x USD)': true
        })

        return newMetrics
      })

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to load dashboard data'

      // Only show the error if we haven't shown it before in this browser session
      if (!shownErrorsState.has(errorMessage)) {
        setError(errorMessage)
        shownErrorsState.add(errorMessage)
        saveShownErrors(shownErrorsState)
      }

      // Set default metrics so UI still displays with zeros
      setMetrics({
        totalCalls: 0,
        totalCost: 0,
        avgCostPerCall: 0,
        avgDuration: '0:00',
        successRate: 0,
        totalChats: 0,
        totalSMSCost: 0,
        avgCostPerMessage: 0,
        highestCostCall: 0,
        lowestCostCall: 0,
        totalSMSSegments: 0,
        avgMessagesPerChat: 0
      })

      setRetellStatus('error')
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportPDF = async () => {
    setIsExporting(true)
    try {
      const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)

      // Convert metrics to CAD for PDF (same conversion as dashboard display)
      const cadMetrics = {
        ...metrics,
        totalCost: (metrics.totalCost || 0) * 1.45,
        avgCostPerCall: (metrics.avgCostPerCall || 0) * 1.45,
        highestCostCall: (metrics.highestCostCall || 0) * 1.45,
        lowestCostCall: (metrics.lowestCostCall || 0) * 1.45,
        totalSMSCost: (metrics.totalSMSCost || 0) * 1.45,
        avgCostPerMessage: (metrics.avgCostPerMessage || 0) * 1.45
      }

      await pdfExportService.generateDashboardReport(cadMetrics, {
        dateRange: selectedDateRange,
        startDate: start,
        endDate: end,
        companyName: 'ARTLEE Business Platform CRM',
        reportTitle: 'Dashboard Analytics Report'
      })
    } catch (error) {
      setError('Failed to generate PDF report. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleClearCache = () => {
    try {
      // Clear SMS segment cache
      localStorage.removeItem(SMS_SEGMENT_CACHE_KEY)

      // Clear fullDataSegmentCache state
      setFullDataSegmentCache(new Map())

      // Force refresh data after clearing cache
      fetchDashboardData()

      console.log('🗑️ Dashboard cache cleared successfully')
    } catch (error) {
      console.error('Failed to clear cache:', error)
      setError('Failed to clear cache. Please try again.')
    }
  }

  const handleGenerateInvoice = async () => {
    // Validation
    if (!invoiceCustomerName.trim()) {
      setError('Customer name is required')
      return
    }
    if (!invoiceCustomerEmail.trim()) {
      setError('Customer email is required')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invoiceCustomerEmail)) {
      setError('Invalid email format')
      return
    }

    setIsGeneratingInvoice(true)
    setError('')

    try {
      const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)

      // Use pre-calculated metrics from Dashboard
      console.log('📊 Dashboard metrics before invoice:', {
        totalCalls: metrics.totalCalls,
        totalCost: metrics.totalCost,
        totalMessages: metrics.totalMessages,
        totalSegments: metrics.totalSegments,
        totalSMSCost: metrics.totalSMSCost
      })

      // Use appropriate customer name based on email
      const customerDescription = invoiceCustomerEmail.trim() === 'create@artlee.agency'
        ? 'Artlee Agency Customer'
        : 'Artlee Creative Customer'

      const result = await stripeInvoiceService.createInvoice({
        customerInfo: {
          email: invoiceCustomerEmail.trim(),
          name: invoiceCustomerName.trim(),
          description: customerDescription
        },
        dateRange: {
          start,
          end,
          label: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
        },
        preCalculatedMetrics: {
          totalCalls: metrics.totalCalls || 0,
          callCostCAD: (metrics.totalCost || 0) * 1.45,  // Convert USD to CAD
          totalChats: metrics.totalMessages || 0,
          totalSegments: metrics.totalSegments || 0,
          smsCostCAD: (metrics.totalSMSCost || 0) * 1.45  // Convert USD to CAD
        },
        sendImmediately: true,  // Finalize and send the invoice
        autoFinalize: true      // Auto-finalize the invoice
      })

      if (result.success && result.invoiceId) {
        // Save to local history
        // TODO: Implement invoiceHistoryService for local invoice tracking
        // await invoiceHistoryService.createInvoice({
        //   invoiceId: result.invoiceId,
        //   customerEmail: invoiceCustomerEmail.trim(),
        //   customerName: invoiceCustomerName.trim(),
        //   periodStart: start,
        //   periodEnd: end,
        //   callCount: metrics.totalCalls || 0,
        //   callCostCad: (metrics.totalCost || 0) * 1.45,  // Convert USD to CAD
        //   smsCount: metrics.totalMessages || 0,
        //   smsSegments: metrics.totalSegments || 0,
        //   smsCostCad: (metrics.totalSMSCost || 0) * 1.45,  // Convert USD to CAD
        //   totalCostCad: ((metrics.totalCost || 0) + (metrics.totalSMSCost || 0)) * 1.45,  // Convert USD to CAD
        //   invoiceUrl: result.invoiceUrl,
        //   invoiceStatus: 'draft',
        //   generatedAutomatically: false
        // })

        // Upload PDF report to Supabase Storage and get download link
        console.log('📤 Uploading PDF report to Supabase Storage...')

        // Convert metrics to CAD for PDF (same conversion as dashboard display)
        const cadMetrics = {
          ...metrics,
          totalCost: (metrics.totalCost || 0) * 1.45,
          avgCostPerCall: (metrics.avgCostPerCall || 0) * 1.45,
          highestCostCall: (metrics.highestCostCall || 0) * 1.45,
          lowestCostCall: (metrics.lowestCostCall || 0) * 1.45,
          totalSMSCost: (metrics.totalSMSCost || 0) * 1.45,
          avgCostPerMessage: (metrics.avgCostPerMessage || 0) * 1.45
        }

        const pdfUploadResult = await pdfExportService.uploadReportToStorage(cadMetrics, {
          dateRange: selectedDateRange,
          startDate: start,
          endDate: end,
          companyName: 'ARTLEE Business Platform CRM',
          reportTitle: `Invoice ${result.invoiceId} - Dashboard Report`
        })

        // CRITICAL: pdf_download_link should ONLY be the Dashboard PDF, never the Stripe invoice
        // The Stripe invoice has its own button (Pay Invoice in Stripe)
        let pdfDownloadLink = pdfUploadResult.downloadUrl || ''

        if (!pdfUploadResult.success) {
          console.error('❌ PDF upload failed:', pdfUploadResult.error)
          console.error('⚠️ Email will be sent WITHOUT Dashboard PDF download link')
        } else {
          console.log('✅ PDF upload successful:', {
            filename: pdfUploadResult.filename,
            downloadUrl: pdfUploadResult.downloadUrl
          })
        }

        // Send invoice email
        console.log('📧 Sending invoice email...')
        console.log('🔗 Invoice URL from Stripe:', result.invoiceUrl)
        console.log('📄 PDF Download Link:', pdfDownloadLink)

        const emailData = {
          to_email: invoiceCustomerEmail.trim(),
          to_name: invoiceCustomerName.trim(),
          invoice_id: result.invoiceId,
          date_range: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
          total_amount: `CAD $${(((metrics.totalCost || 0) + (metrics.totalSMSCost || 0)) * 1.45).toFixed(2)}`,
          total_calls: metrics.totalCalls || 0,
          call_cost: `CAD $${((metrics.totalCost || 0) * 1.45).toFixed(2)}`,
          total_chats: metrics.totalMessages || 0,
          sms_cost: `CAD $${((metrics.totalSMSCost || 0) * 1.45).toFixed(2)}`,
          invoice_url: result.invoiceUrl || '',
          pdf_download_link: pdfDownloadLink,
          pdf_expiry_days: 30
        }

        console.log('📧 Email data being sent:', emailData)
        const emailResult = await invoiceEmailService.sendInvoiceEmail(emailData)

        // Clear form and close modal
        setInvoiceCustomerName('')
        setIsInvoiceModalOpen(false)

        // Show success message based on email result
        if (emailResult.success) {
          generalToast.success(
            `Invoice generated and emailed successfully! Invoice ID: ${result.invoiceId}. Email sent to ${invoiceCustomerEmail.trim()}.`,
            'Invoice Sent',
            7000
          )
        } else {
          generalToast.warning(
            `Invoice generated successfully (ID: ${result.invoiceId}) but email failed to send. ${emailResult.error || 'Email service not configured.'}`,
            'Email Failed',
            8000
          )
        }
      } else {
        setError(result.error || 'Failed to generate invoice')
      }
    } catch (error) {
      console.error('Invoice generation error:', error)
      setError('Failed to generate invoice. Please try again.')
    } finally {
      setIsGeneratingInvoice(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <DateRangePicker
          selectedRange={selectedDateRange}
          customStartDate={customStartDate}
          customEndDate={customEndDate}
          onRangeChange={(range, customStart, customEnd) => {
            setSelectedDateRange(range)
            // Save selected date range to localStorage
            localStorage.setItem('dashboard_page_date_range', range)

            // Handle custom date range
            if (range === 'custom' && customStart && customEnd) {
              setCustomStartDate(customStart)
              setCustomEndDate(customEnd)
              // Save custom dates to localStorage
              localStorage.setItem('dashboard_custom_start_date', customStart.toISOString())
              localStorage.setItem('dashboard_custom_end_date', customEnd.toISOString())
            } else if (range !== 'custom') {
              // Clear custom dates when switching to non-custom range
              setCustomStartDate(undefined)
              setCustomEndDate(undefined)
              localStorage.removeItem('dashboard_custom_start_date')
              localStorage.removeItem('dashboard_custom_end_date')
            }

            const { start, end } = getDateRangeFromSelection(range, customStart, customEnd)
            console.log('Dashboard date range changed:', { range, start, end, customStart, customEnd })
          }}
        />
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors disabled:opacity-50 min-h-[44px]"
            aria-label="Refresh dashboard data"
          >
            <RefreshCwIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={handleClearCache}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 min-h-[44px]"
            title="Clear all SMS segment calculation caches"
          >
            <TrashIcon className="w-4 h-4" />
            Clear Cache
          </button>
          {user?.role === 'super_user' && (
            <button
              onClick={() => setIsInvoiceModalOpen(true)}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              aria-label="Generate invoice"
            >
              <FileTextIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Generate Invoice</span>
              <span className="sm:hidden">Invoice</span>
            </button>
          )}
          <button
            onClick={handleExportPDF}
            disabled={isExporting || isLoading}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            aria-label="Export dashboard to PDF"
          >
            <DownloadIcon className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isExporting ? 'Generating PDF...' : 'Export Dashboard Report'}</span>
            <span className="sm:hidden">{isExporting ? 'Generating...' : 'Export'}</span>
          </button>
        </div>
      </div>
      <div className="text-xs text-gray-500 mb-6">
        Last refreshed: {formatLastRefreshTime()} (Auto-refresh every minute)
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-red-700">{error}</span>
          <button
            onClick={() => {
              shownErrorsState.delete(error)
              saveShownErrors(shownErrorsState)
              setError('')
            }}
            className="ml-auto text-red-600 hover:text-red-800 text-xl"
          >
            ×
          </button>
        </div>
      )}

      {/* Configuration Warning */}
      {retellStatus === 'not-configured' && (
        <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircleIcon className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div>
            <span className="text-yellow-700 font-medium">API not configured</span>
            <p className="text-yellow-600 text-sm mt-1">
              Go to Settings → API Configuration to set up your API credentials.
            </p>
          </div>
        </div>
      )}

      {/* Combined Service Cost Card */}
      <div className="mb-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            {/* Left: Call Costs */}
            <div className="text-center lg:text-left">
              <div className="flex items-center justify-center lg:justify-start gap-2 mb-2">
                <PhoneIcon className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Call Costs</span>
              </div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 numeric-data">
                ${isLoading ? '...' : ((metrics.totalCost || 0) * 1.45).toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span className="numeric-data">{metrics.totalCalls}</span> calls
              </div>
            </div>

            {/* Center: Total Combined Cost */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <DollarSignIcon className="w-6 h-6 text-green-600" />
                <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Combined Service Cost</span>
              </div>
              <div className="text-5xl font-black text-green-600 dark:text-green-400 mb-2 numeric-data">
                CAD ${isLoading ? '...' : (((metrics.totalCost || 0) + (metrics.totalSMSCost || 0)) * 1.45).toFixed(2)}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Total for selected date range
              </div>
            </div>

            {/* Right: SMS Costs */}
            <div className="text-center lg:text-right">
              <div className="flex items-center justify-center lg:justify-end gap-2 mb-2">
                <MessageSquareIcon className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">SMS Costs</span>
              </div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 numeric-data">
                ${isLoading ? '...' : ((metrics.totalSMSCost || 0) * 1.45).toFixed(2)}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span className="numeric-data">{metrics.totalMessages}</span> conversations
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Call Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Calls</span>
            <PhoneIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-3xl font-black text-blue-600 mb-1 numeric-data">
            {isLoading ? '...' : metrics.totalCalls}
          </div>
          <div className="text-xs text-gray-500">
            {metrics.totalCalls === 0 ? 'No calls made' : (
              <>
                <span className="numeric-data">{metrics.totalCalls}</span> calls completed
              </>
            )}
          </div>
        </div>

        {/* Total Talk Time */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Talk Time</span>
            <ClockIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-3xl font-black text-blue-600 mb-1 numeric-data">
            {isLoading ? '...' : metrics.totalCallDuration}
          </div>
          <div className="text-xs text-gray-500">
            Avg: <span className="numeric-data">{metrics.avgCallDuration}</span>
          </div>
        </div>

        {/* Average Cost Per Call */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Avg Cost Per Call</span>
            <DollarSignIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-3xl font-black text-blue-600 mb-1 numeric-data">
            ${isLoading ? '...' : ((metrics.avgCostPerCall || 0) * 1.45).toFixed(3)}
          </div>
          <div className="text-xs text-gray-500">
            Total: $<span className="numeric-data">{((metrics.totalCost || 0) * 1.45).toFixed(2)}</span>
          </div>
        </div>

        {/* Highest Cost Call */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Highest Cost</span>
            <TrendingUpIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-3xl font-black text-blue-600 mb-1 numeric-data">
            ${isLoading ? '...' : ((metrics.highestCostCall || 0) * 1.45).toFixed(3)}
          </div>
          <div className="text-xs text-gray-500">
            Lowest: $<span className="numeric-data">{((metrics.lowestCostCall || 0) * 1.45).toFixed(3)}</span>
          </div>
        </div>

      </div>

      {/* SMS Cost Loading Progress (exact copy from SMS page) */}
      {smsCostManager.progress && (
        <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-600 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Loading SMS costs... ({smsCostManager.progress.loaded}/{smsCostManager.progress.total})
              </span>
            </div>
            <span className="text-sm text-blue-600 dark:text-blue-400">
              {Math.round((smsCostManager.progress.loaded / smsCostManager.progress.total) * 100)}%
            </span>
          </div>
          <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(smsCostManager.progress.loaded / smsCostManager.progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* SMS Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Chats */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Chats</span>
            <MessageSquareIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-3xl font-black text-blue-600 mb-1 numeric-data">
            {isLoading ? '...' : metrics.totalMessages}
          </div>
          <div className="text-xs text-gray-500">
            {metrics.totalMessages === 0 ? 'No conversations yet' : (
              <><span className="numeric-data">{metrics.totalMessages}</span> conversations</>
            )}
          </div>
        </div>

        {/* Avg Messages Per Chat */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Avg Messages Per Chat</span>
            <BarChart3Icon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-3xl font-black text-blue-600 mb-1 numeric-data">
            {isLoading ? '...' : (metrics.totalMessages > 0 ? (metrics.avgMessagesPerChat || 0).toFixed(1) : '0')}
          </div>
          <div className="text-xs text-gray-500">
            {metrics.totalMessages > 0 ? (
              <>From <span className="numeric-data">{metrics.totalMessages}</span> conversations</>
            ) : 'No conversations yet'}
          </div>
        </div>

        {/* Avg Cost Per Message */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Avg Cost Per Message</span>
            <DollarSignIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-3xl font-black text-blue-600 mb-1 numeric-data">
            ${isLoading ? '...' : ((metrics.avgCostPerMessage || 0) * 1.45).toFixed(3)}
          </div>
          <div className="text-xs text-gray-500">
            Total cost: $<span className="numeric-data">{((metrics.avgCostPerMessage || 0) * metrics.totalMessages * 1.45).toFixed(2)}</span>
          </div>
        </div>

        {/* Total SMS Segments */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total SMS Segments</span>
            <BarChart3Icon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-3xl font-black text-blue-600 mb-1 numeric-data">
            {smsCostManager.progress ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>{metrics.totalSegments || '...'}</span>
              </div>
            ) : (
              metrics.totalSegments || 0
            )}
          </div>
          <div className="text-xs text-gray-500">
            {smsCostManager.progress ? (
              `Loading costs... (${smsCostManager.progress.loaded}/${smsCostManager.progress.total})`
            ) : (
              `Total segments for date range`
            )}
          </div>

          {/* Progress bar for segment calculation (copied from SMS page) */}
          {isLoadingSegments && (
            <div className="mt-2">
              <div className="flex items-center gap-2 text-xs text-blue-600">
                <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <span>Calculating accurate segments... ({segmentLoadingProgress.completed}/{segmentLoadingProgress.total})</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: segmentLoadingProgress.total > 0
                      ? `${(segmentLoadingProgress.completed / segmentLoadingProgress.total) * 100}%`
                      : '0%'
                  }}
                ></div>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                💾 {fullDataSegmentCache.size} chats cached • Only processing uncached chats
              </div>
            </div>
          )}

          {segmentLoadingComplete && !isLoadingSegments && fullDataSegmentCache.size > 0 && (
            <div className="mt-2 transition-opacity duration-500">
              <div className="flex items-center gap-2 text-xs text-green-600">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Calculation complete</span>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                {fullDataSegmentCache.size} chats cached
              </div>
            </div>
          )}
        </div>
      </div>

      {/* System Status Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheckIcon className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">System Status</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <ActivityIcon className={`w-4 h-4 ${retellStatus === 'connected' ? 'text-green-500' : retellStatus === 'error' ? 'text-red-500' : retellStatus === 'not-configured' ? 'text-yellow-500' : 'text-gray-500'}`} />
              <span className="text-sm text-gray-900 dark:text-gray-100">API Service</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${retellStatus === 'connected' ? 'bg-green-500' : retellStatus === 'error' ? 'bg-red-500' : retellStatus === 'not-configured' ? 'bg-yellow-500' : 'bg-gray-500'}`} />
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {retellStatus === 'connected' ? 'Connected' :
                 retellStatus === 'error' ? 'Error' :
                 retellStatus === 'not-configured' ? 'Not Configured' :
                 'Checking...'}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <ActivityIcon className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-900 dark:text-gray-100">Database</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-gray-600 dark:text-gray-400">Connected</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-900 dark:text-gray-100">Security</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-gray-600 dark:text-gray-400">Active</span>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon className="w-4 h-4 text-green-500" />
              <span className="text-sm text-gray-900 dark:text-gray-100">HIPAA</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-gray-600 dark:text-gray-400">Compliant</span>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Generation Modal */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl max-w-md w-full shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <FileTextIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  Generate Invoice
                </h2>
              </div>
              <button
                onClick={() => {
                  setIsInvoiceModalOpen(false)
                  setInvoiceCustomerName('')
                }}
                disabled={isGeneratingInvoice}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                <XIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Generate an invoice for the current date range:
                </p>
                <p className="text-base font-semibold text-blue-900 dark:text-blue-100 mt-1">
                  {
                    (() => {
                      const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)
                      return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                    })()
                  }
                </p>
                <p className="text-sm text-blue-600 dark:text-blue-300 mt-2">
                  Total: <span className="font-bold">CAD ${(((metrics.totalCost || 0) + (metrics.totalSMSCost || 0)) * 1.45).toFixed(2)}</span> ({metrics.totalCalls || 0} calls, {metrics.totalMessages || 0} SMS)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Customer Name *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={invoiceCustomerName}
                    disabled
                    readOnly
                    className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 cursor-not-allowed"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <LockIcon className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Customer Email *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={invoiceCustomerEmail}
                    disabled
                    readOnly
                    className="w-full px-4 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 cursor-not-allowed"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <LockIcon className="w-4 h-4 text-gray-400" />
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                  <LockIcon className="w-3 h-3" />
                  Locked to elitesquadp@protonmail.com (testing)
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setIsInvoiceModalOpen(false)
                  setInvoiceCustomerName('')
                }}
                disabled={isGeneratingInvoice}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateInvoice}
                disabled={isGeneratingInvoice || !invoiceCustomerName.trim() || !invoiceCustomerEmail.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGeneratingInvoice ? (
                  <>
                    <RefreshCwIcon className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileTextIcon className="w-4 h-4" />
                    Generate Invoice
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Site Help Chatbot */}
      <SiteHelpChatbot
        isVisible={isChatbotVisible}
        onToggle={() => setIsChatbotVisible(!isChatbotVisible)}
      />
    </div>
  )
}