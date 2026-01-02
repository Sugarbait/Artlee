import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import { useDebounce, useDebouncedCallback } from '@/hooks/useDebounce'
import { useSMSCostManager } from '@/hooks/useSMSCostManager'
import { useNotesCount } from '@/hooks/useNotesCount'
import { DateRangePicker, DateRange, getDateRangeFromSelection } from '@/components/common/DateRangePicker'
import { ChatDetailModal } from '@/components/common/ChatDetailModal'
import { SiteHelpChatbot } from '@/components/common/SiteHelpChatbot'
import { ToastManager } from '@/components/common/ToastManager'
import { chatService, type Chat, type ChatListOptions } from '@/services/chatService'
import { retellService } from '@/services'
import { twilioCostService } from '@/services/twilioCostService'
import { currencyService } from '@/services/currencyService'
import { userSettingsService } from '@/services'
import { fuzzySearchService } from '@/services/fuzzySearchService'
import { toastNotificationService } from '@/services/toastNotificationService'
import {
  MessageSquareIcon,
  SendIcon,
  UserIcon,
  SearchIcon,
  PhoneIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  ClockIcon,
  MoreVerticalIcon,
  PlusIcon,
  DownloadIcon,
  RefreshCwIcon,
  CalendarIcon,
  TrendingUpIcon,
  DollarSignIcon,
  ThumbsUpIcon,
  MessageCircleIcon,
  BotIcon,
  PlayCircleIcon,
  StopCircleIcon,
  EyeIcon,
  StickyNoteIcon,
  TrashIcon,
  ZapIcon
} from 'lucide-react'
import jsPDF from 'jspdf'
import { patientIdService } from '@/services/patientIdService'

// CRITICAL FIX: Disable console logging in production to prevent infinite loops
const isProduction = !import.meta.env.DEV
const safeLog = isProduction ? () => { } : console.log
const safeWarn = isProduction ? () => { } : console.warn
const safeError = isProduction ? () => { } : console.error

// ==================================================================================
// 🔒 LOCKED CODE: SMS SEGMENT CACHE UTILITIES - PRODUCTION READY - NO MODIFICATIONS
// ==================================================================================
// CRITICAL WARNING - PRODUCTION READY CODE
// ABSOLUTELY NO MODIFICATIONS ALLOWED
// Persistent cache utilities for SMS segments calculations
// Status: PRODUCTION READY ✅
// ==================================================================================

// Persistent cache utilities for SMS segments
const SMS_SEGMENT_CACHE_KEY = 'sms_segment_cache_v2'
const CACHE_EXPIRY_HOURS = 12 // Cache expires after 12 hours

interface CachedSegmentData {
  chatId: string
  segments: number
  timestamp: number
  content?: string // Optional: store content hash for validation
}

interface SegmentCache {
  data: CachedSegmentData[]
  lastUpdated: number
}

const loadSegmentCache = (): Map<string, number> => {
  try {
    const cached = localStorage.getItem(SMS_SEGMENT_CACHE_KEY)
    if (!cached) return new Map()

    const cacheData: SegmentCache = JSON.parse(cached)
    const now = Date.now()
    const expiryTime = CACHE_EXPIRY_HOURS * 60 * 60 * 1000

    // Check if cache is expired
    if (now - cacheData.lastUpdated > expiryTime) {
      safeLog('📅 SMS segment cache expired, clearing old data')
      localStorage.removeItem(SMS_SEGMENT_CACHE_KEY)
      return new Map()
    }

    // Filter out expired individual entries and convert to Map
    const validEntries = cacheData.data.filter(entry => {
      return now - entry.timestamp < expiryTime
    })

    safeLog(`💾 Loaded ${validEntries.length} cached SMS segment calculations`)
    return new Map(validEntries.map(entry => [entry.chatId, entry.segments]))
  } catch (error) {
    safeError('Failed to load SMS segment cache:', error)
    return new Map()
  }
}

const saveSegmentCache = (cache: Map<string, number>) => {
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
    safeLog(`💾 Saved ${cache.size} SMS segment calculations to cache`)
  } catch (error) {
    safeError('Failed to save SMS segment cache:', error)
  }
}

// ==================================================================================
// 🔒 END LOCKED CODE: SMS SEGMENT CACHE UTILITIES - PRODUCTION READY
// ==================================================================================

interface SMSPageProps {
  user: any
}

interface ChatMetrics {
  totalChats: number
  activeChats: number
  completedChats: number
  errorChats: number
  avgDuration: string
  totalCost: number
  avgCostPerChat: number
  successRate: number
  positiveSentimentCount: number
  totalMessages: number
  avgMessagesPerChat: number
  totalSMSSegments: number
  peakHour: string
  peakHourCount: number
}


export const SMSPage: React.FC<SMSPageProps> = ({ user }) => {
  const { user: currentUser } = useAuth()
  const [chats, setChats] = useState<Chat[]>([])
  const previousChatsRef = useRef<Chat[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sentimentFilter, setSentimentFilter] = useState('all')
  const [isFuzzySearchEnabled, setIsFuzzySearchEnabled] = useState(true)
  const [selectedDateRange, setSelectedDateRange] = useState<DateRange>(() => {
    // Remember last selected date range from localStorage
    const saved = localStorage.getItem('sms_page_date_range')
    return (saved as DateRange) || 'thisMonth'
  })

  // State for custom date range
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem('sms_page_custom_start_date')
    return saved ? new Date(saved) : undefined
  })
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(() => {
    const saved = localStorage.getItem('sms_page_custom_end_date')
    return saved ? new Date(saved) : undefined
  })

  // Optimization state
  const [lastDataFetch, setLastDataFetch] = useState<number>(0)
  const [showHelpChatbot, setShowHelpChatbot] = useState(false)
  const mountedRef = useRef(true)
  const [metrics, setMetrics] = useState<ChatMetrics>({
    totalChats: 0,
    activeChats: 0,
    completedChats: 0,
    errorChats: 0,
    avgDuration: '0s',
    totalCost: 0,
    avgCostPerChat: 0,
    successRate: 0,
    positiveSentimentCount: 0,
    totalMessages: 0,
    avgMessagesPerChat: 0,
    totalSMSSegments: 0,
    peakHour: 'N/A',
    peakHourCount: 0
  })

  // SMS cost management using cache service - stable onProgress callback to prevent infinite loops
  const onProgress = useCallback((loaded: number, total: number) => {
    safeLog(`SMS cost loading progress: ${loaded}/${total}`)
  }, [])

  const smsCostManager = useSMSCostManager({
    onProgress
  })
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
  const [isChatDetailModalOpen, setIsChatDetailModalOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalChatsCount, setTotalChatsCount] = useState(0)
  const [allFilteredChats, setAllFilteredChats] = useState<Chat[]>([])
  const [totalSegments, setTotalSegments] = useState<number>(0)
  const [smsAgentConfigured, setSmsAgentConfigured] = useState<boolean>(true)
  const [smsAgentId, setSmsAgentId] = useState<string>('')
  const recordsPerPage = 50

  // Cache for SMS segment calculations to avoid repeated API calls
  const [segmentCache, setSegmentCache] = useState<Map<string, number>>(new Map())
  const [loadingFullChats, setLoadingFullChats] = useState<Set<string>>(new Set())
  // Cache for accurate segment calculations from full chat data (used by modal) with persistent storage
  const [fullDataSegmentCache, setFullDataSegmentCache] = useState<Map<string, number>>(() => {
    // Load cached data on initial mount
    return loadSegmentCache()
  })
  // Force re-render trigger for segment updates
  const [segmentUpdateTrigger, setSegmentUpdateTrigger] = useState(0)

  // Progress tracking for bulk segment loading
  const [isLoadingSegments, setIsLoadingSegments] = useState(false)
  const [segmentLoadingProgress, setSegmentLoadingProgress] = useState({ completed: 0, total: 0 })
  const [segmentLoadingComplete, setSegmentLoadingComplete] = useState(false)

  // Use the notes count hook for cross-device accessible note icons
  const {
    hasNotes,
    getNoteCount,
    refetch: refetchNotesCount
  } = useNotesCount({
    referenceType: 'sms',
    referenceIds: chats.map(chat => chat.chat_id),
    enabled: chats.length > 0
  })

  // ==================================================================================
  // 🔒 LOCKED CODE: SMS SEGMENTS CALCULATOR - PRODUCTION READY - NO MODIFICATIONS
  // ==================================================================================
  // CRITICAL WARNING - PRODUCTION READY CODE
  // ABSOLUTELY NO MODIFICATIONS ALLOWED
  // Year view calculation fix verified and locked
  // Status: PRODUCTION READY WITH YEAR VIEW IMPROVEMENTS ✅
  // ==================================================================================

  // Helper function to calculate SMS segments for a chat (prioritizes modal's accurate data)
  // Note: This function should NOT update caches during metrics calculation to prevent circular dependencies
  const calculateChatSMSSegments = useCallback((chat: Chat, shouldCache: boolean = true): number => {
    try {
      // Priority 1: Check full data cache first (populated by modal with accurate data)
      const fullDataCached = fullDataSegmentCache.get(chat.chat_id)
      if (fullDataCached !== undefined) {
        safeLog(`✅ Using accurate segment count from modal: ${fullDataCached} segments for chat ${chat.chat_id}`)
        return fullDataCached
      }

      // Priority 2: Check regular cache
      const cached = segmentCache.get(chat.chat_id)
      if (cached !== undefined) {
        return cached
      }

      let messages = []
      let segments = 1 // Default fallback

      safeLog(`🔍 CALCULATING SEGMENTS for chat ${chat.chat_id}:`, {
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
          safeLog(`📝 Using ${messages.length} content messages from message_with_tool_calls`)
        }
      }

      // Priority 2: Use transcript as fallback if no proper messages found
      if (messages.length === 0 && chat.transcript && chat.transcript.trim().length > 0) {
        messages = [{ content: chat.transcript, role: 'user' }]
        safeLog(`📝 Using transcript (${chat.transcript.trim().length} chars) as single message`)
      }

      // Calculate segments if we have content
      if (messages.length > 0 && messages.some(m => m.content && m.content.trim().length > 0)) {
        const breakdown = twilioCostService.getDetailedSMSBreakdown(messages)
        segments = Math.max(breakdown.segmentCount, 1)

        // Enhanced debugging for segment calculation
        const totalChars = messages.reduce((acc, msg) => acc + (msg.content?.length || 0), 0)
        safeLog(`📊 ✅ Chat ${chat.chat_id}: ${segments} segments calculated from available data (${messages.length} messages, ${totalChars} total characters)`)

        // If segments seem unusually low for the content, investigate
        if (totalChars > 500 && segments < 3) {
          safeWarn(`🚨 SEGMENT CALCULATION WARNING: Chat ${chat.chat_id} has ${totalChars} characters but only ${segments} segments - investigating breakdown:`)
          safeWarn(`🚨 Breakdown:`, breakdown)
          safeWarn(`🚨 Messages:`, messages.map(m => ({ role: m.role, length: m.content?.length || 0, content: m.content?.substring(0, 100) + '...' })))
        }
      } else {
        // No content available - use a more accurate estimate based on chat data
        // For year view with many chats, 1 segment is too conservative
        // Use chat duration or other indicators to estimate better
        if (chat.end_timestamp && chat.start_timestamp) {
          const duration = Math.abs(chat.end_timestamp - chat.start_timestamp)
          const durationMinutes = duration / 60

          // Longer conversations likely have more segments
          if (durationMinutes > 10) {
            segments = 3 // Longer conversations
          } else if (durationMinutes > 5) {
            segments = 2 // Medium conversations
          } else {
            segments = 1 // Short conversations
          }

          safeLog(`📊 Chat ${chat.chat_id}: Using duration-based fallback ${segments} segments (${durationMinutes.toFixed(1)} min duration)`)
        } else {
          // If no duration data, use a slightly higher estimate for year view
          segments = selectedDateRange === 'year' ? 2 : 1
          safeLog(`📊 Chat ${chat.chat_id}: Using conservative fallback ${segments} segment (no duration data, range: ${selectedDateRange})`)
        }
      }

      // Only cache the result if explicitly requested (prevents circular dependencies in metrics calculation)
      if (shouldCache) {
        setSegmentCache(prev => {
          const newCache = new Map(prev.set(chat.chat_id, segments))
          return newCache
        })
      }
      return segments

    } catch (error) {
      safeError(`❌ Error calculating SMS segments for chat ${chat.chat_id}:`, error)

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

          safeLog(`🆘 Emergency fallback using transcript for ${chat.chat_id}: ${fallbackSegments} segments`)

          // Only cache this emergency fallback if explicitly requested
          if (shouldCache) {
            setSegmentCache(prev => {
              const newCache = new Map(prev.set(chat.chat_id, fallbackSegments))
              return newCache
            })
          }

          return fallbackSegments
        }
      } catch (fallbackError) {
        safeError(`❌ Emergency fallback failed for ${chat.chat_id}:`, fallbackError)
      }

      // Final fallback - use 1 instead of 2 for more realistic base cost
      return 1
    }
  }, [segmentCache, fullDataSegmentCache])

  // ==================================================================================
  // 🔒 END LOCKED CODE: SMS SEGMENTS CALCULATOR - PRODUCTION READY
  // ==================================================================================

  // Function for modals to register accurate segment calculations from full chat data
  const updateFullDataSegmentCache = useCallback((chatId: string, fullChatData: any) => {
    try {
      if (!fullChatData?.message_with_tool_calls || !Array.isArray(fullChatData.message_with_tool_calls)) {
        safeLog(`⚠️ No full message data available for chat ${chatId}`)
        return
      }

      const messagesWithContent = fullChatData.message_with_tool_calls.filter(m => m.content && m.content.trim().length > 0)

      if (messagesWithContent.length > 0) {
        const breakdown = twilioCostService.getDetailedSMSBreakdown(messagesWithContent)
        const accurateSegments = Math.max(breakdown.segmentCount, 1)

        safeLog(`🎯 Modal calculated accurate segments for chat ${chatId}: ${accurateSegments} segments`)

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
      safeError(`❌ Error calculating accurate segments for chat ${chatId}:`, error)
    }
  }, [])

  // Expose the function globally so modals can access it
  useEffect(() => {
    (window as any).updateSMSSegments = updateFullDataSegmentCache
    return () => {
      delete (window as any).updateSMSSegments
    }
  }, [updateFullDataSegmentCache])

  // Expose twilioCostService for debugging cost calculations
  useEffect(() => {
    (window as any).twilioCostService = twilioCostService
    return () => {
      delete (window as any).twilioCostService
    }
  }, [])

  // Cache for full chat details to avoid repeated API calls
  const fullChatCache = useRef<Map<string, Chat>>(new Map())

  // Helper function to get full chat details with caching
  const getFullChatDetails = useCallback(async (chatId: string): Promise<Chat | null> => {
    // Check cache first
    if (fullChatCache.current.has(chatId)) {
      return fullChatCache.current.get(chatId) || null
    }

    try {
      const fullChat = await chatService.getChatById(chatId)
      if (fullChat) {
        fullChatCache.current.set(chatId, fullChat)
        return fullChat
      }
    } catch (error) {
      console.error('Error fetching full chat details:', error)
    }

    return null
  }, [])

  // Helper function to calculate SMS cost for a chat - LOADS FULL DETAILS ON DEMAND
  const calculateChatSMSCost = useCallback(async (chat: Chat): Promise<number> => {
    try {
      // Try to get full chat details (with message_with_tool_calls) like the modal does
      const fullChat = await getFullChatDetails(chat.chat_id)
      const chatToUse = fullChat || chat

      let messages = []
      if (chatToUse.message_with_tool_calls && Array.isArray(chatToUse.message_with_tool_calls) && chatToUse.message_with_tool_calls.length > 0) {
        messages = chatToUse.message_with_tool_calls
      } else if (chatToUse.transcript && chatToUse.transcript.trim().length > 0) {
        messages = [{ content: chatToUse.transcript, role: 'user' }]
      }

      if (messages.length === 0) {
        return 0
      }

      const cost = twilioCostService.getSMSCostCAD(messages)
      console.log('SMS cost calculation (modal-style with full data):', {
        chatId: chat.chat_id,
        usingFullChat: !!fullChat,
        messageCount: messages.length,
        cost
      })
      return cost
    } catch (error) {
      console.error('Error calculating SMS cost for chat:', chat.chat_id, error)
      return 0
    }
  }, [getFullChatDetails])

  // Component to handle async cost calculation and display
  const CostDisplay = memo(({ chat }: { chat: Chat }) => {
    // Use combined cost from smsCostManager (Twilio SMS + Retell AI)
    const { cost, loading } = smsCostManager.getChatCost(chat.chat_id)

    if (loading) {
      return <span className="text-gray-400">...</span>
    }

    return <span>${cost.toFixed(3)}</span>
  })

  // Smart cache management for date range changes
  // Only clear cache if the date range actually changed (not initial mount)
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)
  const [lastDateRange, setLastDateRange] = useState<DateRange>(selectedDateRange)

  useEffect(() => {
    // Skip clearing cache on initial mount - preserve loaded cache
    if (!hasInitiallyLoaded) {
      setHasInitiallyLoaded(true)
      setLastDateRange(selectedDateRange)
      return
    }

    // Only update tracking if date range actually changed
    // Note: We do NOT clear fullDataSegmentCache as it contains persistent data that should survive date range changes
    if (lastDateRange !== selectedDateRange) {
      safeLog(`📅 Date range changed from ${lastDateRange} to ${selectedDateRange}, keeping persistent segment cache`)
      safeLog(`💾 Persistent cache contains ${fullDataSegmentCache.size} entries that will be preserved`)
      setLastDateRange(selectedDateRange)
    }
  }, [selectedDateRange, hasInitiallyLoaded, lastDateRange])

  // Function to bulk load accurate segment data for all visible chats
  const loadAccurateSegmentsForAllChats = useCallback(async () => {
    if (!allFilteredChats || allFilteredChats.length === 0) return

    // Add debugging to verify we're processing the correct chats for this date range
    safeLog(`🔍 loadAccurateSegmentsForAllChats called for ${selectedDateRange} with ${allFilteredChats.length} chats`)
    safeLog(`📊 Current date range: ${selectedDateRange}`)
    safeLog(`📅 Sample chat dates:`, allFilteredChats.slice(0, 3).map(chat => ({
      id: chat.chat_id,
      created: chat.created_at,
      date: new Date(chat.created_at).toLocaleDateString()
    })))

    const chatsToProcess = allFilteredChats.filter(chat => !fullDataSegmentCache.has(chat.chat_id))
    const cachedCount = allFilteredChats.length - chatsToProcess.length

    if (chatsToProcess.length === 0) {
      safeLog(`💾 All ${allFilteredChats.length} chats already have cached segment data - no processing needed!`)
      return
    }

    safeLog(`🚀 Loading accurate segment data for ${chatsToProcess.length} chats (${cachedCount} already cached)...`)
    safeLog(`📊 Processing ${chatsToProcess.length} chats for ${selectedDateRange} date range (Total: ${allFilteredChats.length} chats)`)
    safeLog(`📅 Date range: ${selectedDateRange} - Expected large batches for extended ranges like "year"`)

    // Safety check: If processing too many chats for "today", something is wrong
    // But allow larger ranges like "year" to process all chats
    if (selectedDateRange === 'today' && chatsToProcess.length > 50) {
      safeError(`🚨 SAFETY ABORT: Attempting to process ${chatsToProcess.length} chats for "today" - this seems wrong! Aborting to prevent server overload.`)
      safeError(`🚨 Expected ~10 chats for today, got ${allFilteredChats.length} total chats`)
      safeError(`🚨 This suggests the allFilteredChats contains data from wrong date range`)
      return
    }

    // For larger date ranges (year, etc.), allow processing but with warning
    if (chatsToProcess.length > 500) {
      safeWarn(`⚠️ Processing ${chatsToProcess.length} chats for ${selectedDateRange} - this is a large batch but expected for extended date ranges`)
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
        safeError(`Failed to load accurate segments for chat ${chat.chat_id}:`, error)
        completed++
        setSegmentLoadingProgress({ completed, total: chatsToProcess.length })
      }
    }

    // Finish loading state
    setIsLoadingSegments(false)
    setSegmentLoadingComplete(true)
    safeLog(`✅ Finished loading accurate segment data`)

    // Hide completion message after 3 seconds
    setTimeout(() => {
      setSegmentLoadingComplete(false)
    }, 3000)
  }, [allFilteredChats, fullDataSegmentCache, updateFullDataSegmentCache])

  // Smart auto-load segments with proper cache synchronization
  useEffect(() => {
    if (allFilteredChats.length === 0) return

    // Wait for cache to be properly initialized on mount
    if (!hasInitiallyLoaded) {
      safeLog(`⏳ Waiting for initial cache load to complete before processing ${allFilteredChats.length} chats`)
      return
    }

    // Check how many chats need processing after cache is ready
    const chatsToProcess = allFilteredChats.filter(chat => !fullDataSegmentCache.has(chat.chat_id))
    const cachedCount = allFilteredChats.length - chatsToProcess.length

    safeLog(`📊 Chats loaded: ${allFilteredChats.length} total, ${cachedCount} already cached, ${chatsToProcess.length} need processing`)

    // Only trigger bulk loading if there are uncached chats AND it's worth processing
    if (chatsToProcess.length > 0) {
      const cacheHitRate = cachedCount / allFilteredChats.length
      safeLog(`💾 Cache hit rate: ${(cacheHitRate * 100).toFixed(1)}% (${cachedCount}/${allFilteredChats.length})`)

      // For full date range coverage, always auto-load if there are uncached chats
      // Only skip if very few chats need processing to avoid unnecessary API calls
      if (chatsToProcess.length >= 2) {
        safeLog(`🚀 Auto-triggering bulk load for ${chatsToProcess.length} uncached chats (cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%) - ensuring complete date range coverage`)
        const timer = setTimeout(() => {
          loadAccurateSegmentsForAllChats()
        }, 1000)
        return () => clearTimeout(timer)
      } else {
        safeLog(`✨ Only ${chatsToProcess.length} chat(s) need processing (cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%), will load on demand.`)
      }
    } else {
      safeLog(`💾 All ${allFilteredChats.length} chats already cached - no bulk loading needed!`)
    }
  }, [allFilteredChats, fullDataSegmentCache, hasInitiallyLoaded])

  // Debounced search and filters
  const { debouncedValue: debouncedSearchTerm } = useDebounce(searchTerm, 500, {
    leading: false,
    trailing: true,
    maxWait: 2000
  })

  const { debouncedValue: debouncedStatusFilter } = useDebounce(statusFilter, 300)
  const { debouncedValue: debouncedSentimentFilter } = useDebounce(sentimentFilter, 300)

  // Note: debouncedFetchChats is defined after fetchChatsOptimized (around line 1156)

  // Note: useEffect that calls debouncedFetchChats is moved after its definition (around line 1160)

  // Fetch when page changes (no debouncing for pagination)
  useEffect(() => {
    // 🔴 CRITICAL: Don't fetch if no SMS Agent ID
    const smsAgentId = retellService.getSmsAgentId()
    if (!smsAgentId) {
      console.log('⚠️ [SMS] Skipping fetch - no SMS Agent ID configured')
      return
    }
    fetchChatsOptimized()
  }, [currentPage])

  // Listen for API configuration events from AuthContext
  useEffect(() => {
    const handleApiConfigurationReady = (event: CustomEvent) => {
      console.log('🚀 [SMSPage]: Received apiConfigurationReady event', event.detail)
      // Retry fetching data if there was a configuration error
      if (error?.includes('API not configured') || !retellService.getApiKey()) {
        console.log('🔄 [SMSPage]: API is now configured, retrying data fetch...')
        fetchChatsOptimized()
      }
    }

    window.addEventListener('apiConfigurationReady', handleApiConfigurationReady as EventListener)

    return () => {
      window.removeEventListener('apiConfigurationReady', handleApiConfigurationReady as EventListener)
    }
  }, [error])

  // Fetch when debounced filters change
  // Note: useEffect for search filter changes moved after debouncedFetchChats definition (around line 1175)

  // Load SMS costs for visible chats - use ref to track loaded chats
  const loadedChatsRef = useRef<string>('')
  useEffect(() => {
    if (chats.length > 0) {
      const chatIds = chats.map(c => c.chat_id).sort().join(',')
      if (loadedChatsRef.current !== chatIds) {
        console.log(`[SMSPage] Triggering cost load for ${chats.length} chats`)
        loadedChatsRef.current = chatIds
        smsCostManager.loadCostsForChats(chats)
      }
    } else {
      console.log('[SMSPage] No chats to load costs for')
      loadedChatsRef.current = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats])

  // Initialize fuzzy search engine when chats are loaded
  useEffect(() => {
    if (chats.length > 0 && isFuzzySearchEnabled) {
      fuzzySearchService.initializeSMSSearch(chats)
    }
  }, [chats, isFuzzySearchEnabled])

  // ==================================================================================
  // 🔒 LOCKED CODE: CLEAR CACHE FUNCTION - PRODUCTION READY - NO MODIFICATIONS
  // ==================================================================================
  // CRITICAL WARNING - PRODUCTION READY CODE
  // ABSOLUTELY NO MODIFICATIONS ALLOWED
  // Manual and automatic cache clearing functionality
  // Status: PRODUCTION READY ✅
  // ==================================================================================

  // Clear all segment caches function
  const clearAllSegmentCaches = useCallback((isAutomatic = false) => {
    const timestamp = new Date().toLocaleString()
    const triggerType = isAutomatic ? '🕐 AUTOMATIC (4-hour timer)' : '🗑️ MANUAL (button click)'

    safeLog(`${triggerType} - Clearing all segment caches at ${timestamp}`)

    // Clear in-memory caches
    setSegmentCache(new Map())
    setFullDataSegmentCache(new Map())

    // Clear localStorage cache
    localStorage.removeItem(SMS_SEGMENT_CACHE_KEY)

    // Reset segment update trigger to force recalculation
    setSegmentUpdateTrigger(prev => prev + 1)

    safeLog(`✅ All segment caches cleared successfully (${isAutomatic ? 'automatic' : 'manual'})`)
  }, [])

  // ==================================================================================
  // 🔒 END LOCKED CODE: CLEAR CACHE FUNCTION - PRODUCTION READY
  // ==================================================================================

  // ==================================================================================
  // 🔒 LOCKED CODE: AUTOMATIC CACHE CLEARING - PRODUCTION READY - NO MODIFICATIONS
  // ==================================================================================
  // CRITICAL WARNING - PRODUCTION READY CODE
  // ABSOLUTELY NO MODIFICATIONS ALLOWED
  // Auto-clear cache every 4 hours to maintain performance
  // Status: PRODUCTION READY ✅
  // ==================================================================================

  // Auto-clear cache every 4 hours
  useEffect(() => {
    safeLog('🕐 Setting up automatic cache clearing every 4 hours...')

    const FOUR_HOURS_MS = 4 * 60 * 60 * 1000 // 4 hours in milliseconds

    const interval = setInterval(() => {
      safeLog('🕐 4-hour timer triggered - automatically clearing SMS segment caches...')
      clearAllSegmentCaches(true) // Pass true to indicate automatic clearing
    }, FOUR_HOURS_MS)

    // Cleanup interval on component unmount
    return () => {
      safeLog('🕐 Cleaning up automatic cache clearing timer')
      clearInterval(interval)
    }
  }, [clearAllSegmentCaches])

  // ==================================================================================
  // 🔒 END LOCKED CODE: AUTOMATIC CACHE CLEARING - PRODUCTION READY
  // ==================================================================================

  // ==================================================================================
  // 🔒 LOCKED CODE: SMS SEGMENTS METRICS CALCULATION - PRODUCTION READY - NO MODIFICATIONS
  // ==================================================================================
  // CRITICAL WARNING - PRODUCTION READY CODE
  // ABSOLUTELY NO MODIFICATIONS ALLOWED
  // Year view calculation fixes verified and locked
  // Status: PRODUCTION READY WITH YEAR VIEW IMPROVEMENTS ✅
  // ==================================================================================

  // Optimized metrics calculation with consolidated SMS segments calculation
  useEffect(() => {
    if (allFilteredChats.length === 0) {
      // Reset everything when no chats
      setTotalSegments(0)
      setMetrics(prevMetrics => ({
        ...prevMetrics,
        totalSMSSegments: 0,
        totalCost: 0,
        avgCostPerChat: 0,
        positiveSentimentCount: 0,
        peakHour: 'N/A',
        peakHourCount: 0
      }))
      return
    }

    const calculateMetrics = () => {
      // Calculate SMS segments using accurate modal data when available
      let calculatedTotalSegments = 0
      let chatsWithAccurateData = 0
      safeLog(`📊 Calculating SMS segments for ${allFilteredChats.length} chats using fullDataSegmentCache priority`)
      safeLog(`📅 Date range: ${selectedDateRange} - Processing ${allFilteredChats.length} total chats for segment calculation`)
      safeLog(`🔍 DEBUG: Cache state - fullDataSegmentCache has ${fullDataSegmentCache.size} entries`)

      // YEAR VIEW DEBUGGING
      if (selectedDateRange === 'year') {
        safeWarn(`🎯 YEAR VIEW DEBUG: Processing ${allFilteredChats.length} chats for year view`)
        safeWarn(`🎯 YEAR VIEW DEBUG: Cache has ${fullDataSegmentCache.size} entries`)
        safeWarn(`🎯 YEAR VIEW DEBUG: Expected 1300+ segments, investigating calculation`)

        const chatsWithCache = allFilteredChats.filter(chat => fullDataSegmentCache.has(chat.chat_id))
        const chatsWithoutCache = allFilteredChats.filter(chat => !fullDataSegmentCache.has(chat.chat_id))

        safeWarn(`🎯 YEAR VIEW DEBUG: ${chatsWithCache.length} chats have cached data, ${chatsWithoutCache.length} need calculation`)
      }

      // DEBUGGING: Check if the issue is with date filtering or segment calculation
      if (selectedDateRange === 'today' && allFilteredChats.length < 5) {
        safeWarn(`🚨 POTENTIAL ISSUE: Only ${allFilteredChats.length} chats for today - expected more for 16 segments`)
        safeWarn(`🚨 This suggests the date filtering might be too restrictive or no chats exist for today`)
        safeWarn(`🚨 Current date range filtering for 'today' may need investigation`)
      }

      allFilteredChats.forEach((chat, index) => {
        // Priority: Use accurate data from modal if available
        const accurateSegments = fullDataSegmentCache.get(chat.chat_id)
        if (accurateSegments !== undefined) {
          calculatedTotalSegments += accurateSegments
          chatsWithAccurateData++
          // Always log for debugging when dealing with low chat counts (today issue)
          if (allFilteredChats.length <= 10 || index % 50 === 0 || index < 10 || index >= allFilteredChats.length - 5) {
            safeLog(`Chat ${index + 1} (${chat.chat_id}): ${accurateSegments} segments (ACCURATE from modal)`)
          }
        } else {
          // Fallback to basic calculation only when no accurate data available
          // Use shouldCache: false to prevent circular dependency during metrics calculation
          const fallbackSegments = calculateChatSMSSegments(chat, false)
          calculatedTotalSegments += fallbackSegments
          // Always log for debugging when dealing with low chat counts (today issue)
          if (allFilteredChats.length <= 10 || index % 50 === 0 || index < 10 || index >= allFilteredChats.length - 5) {
            safeLog(`Chat ${index + 1} (${chat.chat_id}): ${fallbackSegments} segments (fallback)`)
          }
        }
      })

      safeLog(`📊 ✅ COMPLETE: Total SMS segments calculated: ${calculatedTotalSegments} (${chatsWithAccurateData}/${allFilteredChats.length} from accurate modal data)`)
      safeLog(`📈 Segment breakdown: ${chatsWithAccurateData} accurate + ${allFilteredChats.length - chatsWithAccurateData} fallback = ${calculatedTotalSegments} total segments`)
      safeLog(`🔍 DEBUG: Expected 16 segments but got ${calculatedTotalSegments} - investigating discrepancy`)
      safeLog(`🔍 DEBUG: Date range verification - Selected: ${selectedDateRange}, Chats processed: ${allFilteredChats.length}`)

      // DEBUGGING FIX: If we're getting significantly fewer segments than expected for today, trigger accurate recalculation
      if (selectedDateRange === 'today' && calculatedTotalSegments < 10 && allFilteredChats.length > 0) {
        safeWarn(`🚨 APPLYING FIX: Only ${calculatedTotalSegments} segments for ${allFilteredChats.length} chats today - this seems low`)
        safeWarn(`🚨 Triggering accurate segment recalculation for all today's chats`)

        // Clear cache for today's chats and trigger fresh calculation
        allFilteredChats.forEach(chat => {
          fullDataSegmentCache.delete(chat.chat_id)
          setSegmentCache(prev => {
            const newCache = new Map(prev)
            newCache.delete(chat.chat_id)
            return newCache
          })
        })

        // Trigger bulk load to get accurate data - but only if not already loading
        if (!isLoadingSegments) {
          setTimeout(() => {
            loadAccurateSegmentsForAllChats()
          }, 500)
        }
      }

      // YEAR VIEW FIX: If we're getting significantly fewer segments than expected for year view
      if (selectedDateRange === 'year' && calculatedTotalSegments < 1000 && allFilteredChats.length > 0) {
        safeWarn(`🎯 YEAR VIEW FIX: Only ${calculatedTotalSegments} segments for ${allFilteredChats.length} chats in year view - expected 1300+`)
        safeWarn(`🎯 YEAR VIEW FIX: Cache coverage: ${chatsWithAccurateData}/${allFilteredChats.length} = ${Math.round((chatsWithAccurateData / allFilteredChats.length) * 100)}%`)

        // If less than 50% of chats have accurate cache data, trigger bulk recalculation
        const cacheCoverage = chatsWithAccurateData / allFilteredChats.length
        if (cacheCoverage < 0.5) {
          safeWarn(`🎯 YEAR VIEW FIX: Cache coverage too low (${Math.round(cacheCoverage * 100)}%), triggering bulk recalculation`)

          // Don't clear cache, but trigger bulk loading for missing data - but only if not already loading
          if (!isLoadingSegments) {
            setTimeout(() => {
              safeWarn(`🎯 YEAR VIEW FIX: Starting bulk segment loading for year view`)
              loadSegmentDataForChats(allFilteredChats)
            }, 1000)
          }
        }
      }

      setTotalSegments(calculatedTotalSegments)

      // Calculate total cost from calculated segments (more accurate than individual chat costs)
      const totalCostFromSegmentsUSD = calculatedTotalSegments * 0.0083 // USD per segment
      const totalCostFromSegments = currencyService.convertUSDToCAD(totalCostFromSegmentsUSD) // Convert to CAD
      safeLog(`💰 Total cost calculated from ${calculatedTotalSegments} segments: $${totalCostFromSegmentsUSD.toFixed(4)} USD → $${totalCostFromSegments.toFixed(4)} CAD`)

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

      safeLog(`💰 Cost comparison - Segments (Twilio only): $${totalCostFromSegments.toFixed(4)} CAD, Combined (Twilio+Retell): $${totalCostFromFilteredChats.toFixed(4)}, Using: $${finalTotalCost.toFixed(4)} CAD`)

      // Calculate positive sentiment count from filtered chats
      const positiveSentimentCount = allFilteredChats.filter(chat =>
        chat.chat_analysis?.user_sentiment === 'Positive'
      ).length

      // Calculate peak hours from filtered chats (optimized)
      const hourCounts = allFilteredChats.reduce((acc, chat) => {
        const timestamp = chat.start_timestamp
        const chatTimeMs = timestamp.toString().length <= 10 ? timestamp * 1000 : timestamp
        const hour = new Date(chatTimeMs).getHours()
        acc[hour] = (acc[hour] || 0) + 1
        return acc
      }, {} as Record<number, number>)

      let peakHour = 'N/A'
      let peakHourCount = 0

      if (Object.keys(hourCounts).length > 0) {
        const peakHourNumber = Number(Object.keys(hourCounts).reduce((a, b) =>
          hourCounts[Number(a)] > hourCounts[Number(b)] ? a : b
        ))
        peakHourCount = hourCounts[peakHourNumber]

        // Format hour in 12-hour format
        const hour12 = peakHourNumber === 0 ? 12 : peakHourNumber > 12 ? peakHourNumber - 12 : peakHourNumber
        const ampm = peakHourNumber >= 12 ? 'PM' : 'AM'
        peakHour = `${hour12}:00 ${ampm}`
      }

      // Update metrics with calculated SMS segments (prioritizing accurate modal data)
      safeLog(`💰 Updating metrics with totalSMSSegments: ${calculatedTotalSegments} (${chatsWithAccurateData}/${allFilteredChats.length} from accurate modal data)`)

      setMetrics(prevMetrics => {
        const updatedMetrics = {
          ...prevMetrics,
          totalCost: finalTotalCost, // Use segments-based calculation
          avgCostPerChat,
          totalSMSSegments: calculatedTotalSegments,
          positiveSentimentCount,
          peakHour,
          peakHourCount
        }
        safeLog(`💰 Updated metrics: Total SMS Segments = ${updatedMetrics.totalSMSSegments}, Total Cost = $${updatedMetrics.totalCost.toFixed(4)} CAD`)
        return updatedMetrics
      })
    }

    calculateMetrics()
  }, [allFilteredChats, smsCostManager.costs, segmentUpdateTrigger, fullDataSegmentCache])

  // ==================================================================================
  // 🔒 END LOCKED CODE: SMS SEGMENTS METRICS CALCULATION - PRODUCTION READY
  // ==================================================================================

  // Proactively load segment data for all chats to ensure accurate totals
  const loadSegmentDataForChats = useCallback(async (chats: Chat[]) => {
    // Only load for chats that don't already have cached data
    const chatsNeedingData = chats.filter(chat => !fullDataSegmentCache.has(chat.chat_id))

    if (chatsNeedingData.length === 0) {
      safeLog('📊 All chats already have cached segment data')
      return
    }

    safeLog(`📊 Loading segment data for ${chatsNeedingData.length}/${chats.length} chats in background`)

    // Process in batches to avoid overwhelming the API
    const batchSize = 10
    const batches = []
    for (let i = 0; i < chatsNeedingData.length; i += batchSize) {
      batches.push(chatsNeedingData.slice(i, i + batchSize))
    }

    // Process batches with delay between them
    for (const [batchIndex, batch] of batches.entries()) {
      try {
        // Process batch in parallel
        const batchPromises = batch.map(async (chat) => {
          try {
            const fullChatData = await chatService.getChat(chat.chat_id)
            if (fullChatData?.message_with_tool_calls) {
              const segments = twilioCostService.calculateSMSSegments(fullChatData.message_with_tool_calls)

              // Update the cache
              setFullDataSegmentCache(prev => {
                const newCache = new Map(prev.set(chat.chat_id, segments))
                saveSegmentCache(newCache)
                return newCache
              })

              return { chatId: chat.chat_id, segments }
            }
          } catch (error) {
            safeWarn(`Failed to load segment data for chat ${chat.chat_id}:`, error)
          }
          return null
        })

        const batchResults = await Promise.all(batchPromises)
        const successCount = batchResults.filter(r => r !== null).length
        safeLog(`📊 Batch ${batchIndex + 1}/${batches.length}: Loaded segment data for ${successCount}/${batch.length} chats`)

        // Small delay between batches to avoid overwhelming the API
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (error) {
        safeError(`Error processing batch ${batchIndex + 1}:`, error)
      }
    }

    safeLog(`📊 ✅ Finished loading segment data for ${chatsNeedingData.length} chats`)
  }, [fullDataSegmentCache, saveSegmentCache])

  // Simplified chat fetching following CallsPage pattern
  const fetchChatsOptimized = useCallback(async (retryCount = 0) => {
    console.log('🟡 [SMS DEBUG] fetchChatsOptimized called with retryCount:', retryCount)
    console.log('🟡 [SMS DEBUG] mountedRef.current:', mountedRef.current)

    if (!mountedRef.current) {
      console.log('🔴 [SMS DEBUG] Early exit: mountedRef.current is false')
      return
    }

    // 🔴 CRITICAL FIX: Check SMS Agent ID BEFORE setting loading state
    // This prevents infinite loading spinner when no SMS Agent ID is configured
    try {
      // WORKING CALLS PAGE PATTERN: Simple and reliable
      console.log('🔄 [SMSPage] Using PROVEN Calls page pattern...')

      // FORCE HARDWIRED CREDENTIALS FIRST
      console.log('🔧 [SMSPage] FORCING hardwired credentials immediately...')
      retellService.updateCredentials(
        'key_c3f084f5ca67781070e188b47d7f',
        'agent_447a1b9da540237693b0440df6',
        'agent_643486efd4b5a0e9d7e094ab99'
      )

      // Reload credentials (localStorage + Supabase sync) - EXACT CALLS PAGE PATTERN
      await retellService.loadCredentialsAsync()
      safeLog('✅ [SMSPage] Reloaded credentials with cross-device sync:', {
        hasApiKey: !!retellService.isConfigured(),
        configured: retellService.isConfigured()
      })

      // Check if Retell API has at minimum an API key configured - EXACT CALLS PAGE PATTERN
      const hasApiKey = !!retellService.getApiKey()
      console.log('🟡 [SMS DEBUG] API key check - hasApiKey:', hasApiKey)
      // Security: Do not log API key value

      if (!hasApiKey) {
        console.log('🔴 [SMS DEBUG] Early exit: No API key found')
        setError('API not configured. Go to Settings → API Configuration to set up your credentials.')
        setLoading(false)
        return
      }

      // 🔴 CRITICAL: Check if SMS Agent ID is configured BEFORE setting loading state
      // This prevents the infinite loading spinner issue
      const smsAgentIdCheck = retellService.getSmsAgentId()
      const hasSmsAgentId = !!smsAgentIdCheck

      if (!hasSmsAgentId) {
        console.log('⚠️ [SMS DEBUG] No SMS Agent ID configured - returning empty data')
        // Return all 0's - NO ghost data, NO mock data, NO past Agent IDs
        setChats([])
        setAllFilteredChats([])
        setTotalChatsCount(0)
        setTotalSegments(0)
        setMetrics({
          totalChats: 0,
          activeChats: 0,
          completedChats: 0,
          errorChats: 0,
          avgDuration: '0s',
          totalCost: 0,
          avgCostPerChat: 0,
          successRate: 0,
          positiveSentimentCount: 0,
          totalMessages: 0,
          avgMessagesPerChat: 0,
          totalSMSSegments: 0,
          peakHour: 'N/A',
          peakHourCount: 0
        })
        setLoading(false)
        setError('No SMS Agent ID configured. Add your SMS Agent ID in Settings → API Configuration to see SMS data.')
        return
      }

      // Only set loading state AFTER we've confirmed SMS Agent ID exists
      console.log('🟡 [SMS DEBUG] SMS Agent ID found - setting loading true and clearing error...')
      setLoading(true)
      setError('')

      // Sync chat service with retell service
      console.log('🟡 [SMS DEBUG] Syncing chat service with retell service...')
      await chatService.syncWithRetellService()

      const isChatConfigured = chatService.isConfigured()
      console.log('🟡 [SMS DEBUG] Chat service configured:', isChatConfigured)

      if (!isChatConfigured) {
        console.log('🔴 [SMS DEBUG] Early exit: Chat service not configured')
        setError('Chat service not configured properly. API credentials may be missing.')
        setLoading(false)
        return
      }

      // Get date range for filtering
      const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)
      safeLog(`🔍 fetchChatsOptimized: selectedDateRange = "${selectedDateRange}"`)
      safeLog(`📅 Date range for filtering: ${start.toLocaleString()} to ${end.toLocaleString()}`)
      safeLog(`⏰ Current time: ${new Date().toLocaleString()}`)

      // Fetch with retry logic for rate limiting - same as Calls page
      let allChatsResponse
      try {
        // Add small delay to prevent rate limiting
        if (retryCount > 0) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 8000) // Exponential backoff, max 8 seconds
          safeLog(`Rate limited, retrying in ${delay}ms (attempt ${retryCount + 1})`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }

        // Fetch chats using standard service - same pattern as Calls page
        console.log('🚀 [SMSPage] Making API call to fetch chats...')
        allChatsResponse = await chatService.getChatHistory({
          limit: 1000, // CHANGED from 2000 to 1000
          sort_order: 'descending'
        })
        console.log('✅ [SMSPage] Successfully fetched chats from API:', {
          hasResponse: !!allChatsResponse,
          chatsCount: allChatsResponse?.chats?.length || 0,
          hasMore: allChatsResponse?.has_more || false
        })
      } catch (error: any) {
        console.error('❌ [SMSPage] Error fetching chats from API:', {
          error: error.message,
          status: error.status,
          stack: error.stack
        })

        // Handle rate limiting specifically
        if (error.message?.includes('429') || error.status === 429) {
          if (retryCount < 3) {
            console.log(`🔄 [SMSPage] Rate limited (429), retrying... (attempt ${retryCount + 1}/3)`)
            return fetchChatsOptimized(retryCount + 1)
          } else {
            throw new Error('Rate limit exceeded. Please wait a moment and try again.')
          }
        }

        // Handle 404 errors with better messaging
        if (error.message?.includes('404') || error.status === 404) {
          throw new Error('API endpoint not found. Please check your configuration and try again.')
        }

        // Handle authentication errors
        if (error.message?.includes('401') || error.status === 401) {
          throw new Error('Authentication failed. Please check your API credentials in Settings.')
        }

        // Handle other HTTP errors
        if (error.status) {
          throw new Error(`API error ${error.status}: ${error.message}`)
        }

        throw error
      }

      if (!mountedRef.current) return

      // Filter by date range - same as Calls page
      const startMs = start.getTime()
      const endMs = end.getTime()

      safeLog(`🔍 Total chats received from API: ${allChatsResponse.chats.length} (requested up to 2000 chats)`)
      safeLog(`📅 Filtering range: ${startMs} to ${endMs}`)

      // Warn if we hit the API limit - might need multiple requests for very large date ranges
      if (allChatsResponse.chats.length >= 2000) {
        safeWarn(`⚠️ WARNING: Received maximum API limit (2000 chats). Some chats from ${selectedDateRange} may be missing!`)
        safeWarn(`📋 Consider implementing pagination for date ranges with >2000 chats`)
      }

      const dateFiltered = allChatsResponse.chats.filter(chat => {
        const timestamp = chat.start_timestamp
        const chatTimeMs = timestamp.toString().length <= 10 ? timestamp * 1000 : timestamp
        const isInRange = chatTimeMs >= startMs && chatTimeMs <= endMs

        // Debug first few chats
        if (allChatsResponse.chats.indexOf(chat) < 3) {
          safeLog(`Chat ${chat.chat_id}: timestamp=${timestamp}, chatTimeMs=${chatTimeMs}, date=${new Date(chatTimeMs).toLocaleString()}, inRange=${isInRange}`)
        }

        return isInRange
      })

      // Store all date-filtered chats for filtering in useMemo (like calls page)
      const totalChats = dateFiltered

      safeLog(`📊 After date filtering: ${totalChats.length} chats in date range ${selectedDateRange}`)
      safeLog(`📅 Date range: ${start.toLocaleString()} to ${end.toLocaleString()}`)

      setTotalChatsCount(totalChats.length)
      setAllFilteredChats(totalChats)

      // Store chats for display - cost calculation will load full details on demand
      setChats(totalChats)

      // Note: Toast notifications for truly new records are handled by toastNotificationService
      // via Supabase real-time monitoring, not through pagination logic

      // Update previous chats reference
      previousChatsRef.current = [...totalChats]

      // Proactively load segment data for accurate totals (async, don't block UI)
      loadSegmentDataForChats(totalChats)
      setLastDataFetch(Date.now())

      // Calculate basic metrics using optimized service (exclude SMS segments, handled separately)
      const calculatedMetrics = chatService.getChatStats(totalChats)
      safeLog('📊 Chat metrics calculated:', calculatedMetrics)
      setMetrics(prev => ({
        ...prev,
        ...calculatedMetrics,
        // Preserve totalSMSSegments - it will be calculated in the separate useEffect
        totalSMSSegments: prev.totalSMSSegments
      }))

      safeLog('Optimized SMS Chats fetched:', {
        agentFilter: smsAgentId || 'All agents',
        totalChats: totalChats.length,
        totalFilteredChats: allFilteredChats.length,
        cacheUsed: Date.now() - lastDataFetch < 300000
      })

    } catch (error) {
      if (!mountedRef.current) return

      safeError('Failed to fetch chats:', error)
      setError(error instanceof Error ? error.message : 'Failed to fetch chat data')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [selectedDateRange, customStartDate, customEndDate])

  // Optimized data fetching - defined after fetchChatsOptimized to avoid dependency issues
  const { debouncedCallback: debouncedFetchChats, cancel: cancelDebouncedFetchChats } = useDebouncedCallback(
    async (resetPage: boolean = false) => {
      if (resetPage) {
        setCurrentPage(1)
      }
      await fetchChatsOptimized()
    },
    300,
    { leading: false, trailing: true }
  )

  // Fetch chats when component mounts or date range changes - immediate fetch for initial load
  useEffect(() => {
    console.log('🚀 [SMS DEBUG] Main useEffect triggered - dependency change detected')
    setCurrentPage(1)

    // Only clear other caches if not initial load (preserve persistent segment cache)
    if (hasInitiallyLoaded) {
      smsCostManager.clearCosts() // Clear costs when date range changes
      setSegmentCache(new Map()) // Clear segment cache for new date range
      setLoadingFullChats(new Set()) // Clear loading state for new date range
      setTotalSegments(0) // Reset segments count for new date range
      setSegmentUpdateTrigger(0) // Reset segment update trigger
      safeLog('📅 Date range changed, cleared non-persistent caches and reset state')
    } else {
      safeLog('📅 Initial mount, preserving cached segment data')
    }

    // 🔴 CRITICAL: Don't fetch if no SMS Agent ID
    const smsAgentId = retellService.getSmsAgentId()
    if (!smsAgentId) {
      console.log('⚠️ [SMS] Skipping fetch - no SMS Agent ID configured')
      return
    }

    // Call fetchChatsOptimized directly for immediate execution, especially important for initial load
    console.log('🚀 [SMSPage] Triggering immediate data fetch from useEffect...')
    fetchChatsOptimized()
  }, [selectedDateRange, customStartDate, customEndDate, hasInitiallyLoaded, fetchChatsOptimized])

  // BACKUP: Additional useEffect to ensure data fetch on mount (no dependencies)
  useEffect(() => {
    console.log('🚀 [SMS DEBUG] Backup mount effect - ensuring initial data load...')
    console.log('🚀 [SMS DEBUG] Setting mountedRef to true on mount...')
    mountedRef.current = true // Ensure mountedRef is true on mount

    // Simple timeout to ensure services are initialized
    const timeoutId = setTimeout(() => {
      // 🔴 CRITICAL: Don't fetch if no SMS Agent ID
      const smsAgentId = retellService.getSmsAgentId()
      if (!smsAgentId) {
        console.log('⚠️ [SMS] Backup mount - Skipping fetch - no SMS Agent ID configured')
        return
      }
      console.log('🚀 [SMS DEBUG] Backup mount effect - calling fetchChatsOptimized after timeout...')
      fetchChatsOptimized()
    }, 100)

    return () => clearTimeout(timeoutId)
  }, []) // Empty dependency array - only runs on mount

  // Fetch when debounced filters change - defined after debouncedFetchChats
  useEffect(() => {
    if (debouncedSearchTerm !== searchTerm ||
      debouncedStatusFilter !== statusFilter ||
      debouncedSentimentFilter !== sentimentFilter) {
      return // Wait for debouncing to complete
    }
    setCurrentPage(1)
    debouncedFetchChats(true)
  }, [debouncedSearchTerm, debouncedStatusFilter, debouncedSentimentFilter, debouncedFetchChats])

  // Auto-refresh functionality like other pages - defined after fetchChatsOptimized
  const { formatLastRefreshTime } = useAutoRefresh({
    enabled: true,
    interval: 60000, // 1 minute
    onRefresh: useCallback(() => {
      // 🔴 CRITICAL: Don't fetch if no SMS Agent ID
      const smsAgentId = retellService.getSmsAgentId()
      if (!smsAgentId) {
        console.log('⚠️ [SMS] Auto-refresh - Skipping fetch - no SMS Agent ID configured')
        return
      }
      fetchChatsOptimized()
      safeLog('SMS page refreshed at:', new Date().toLocaleTimeString())
    }, [fetchChatsOptimized])
  })

  const endChat = async (chatId: string) => {
    try {
      const result = await chatService.endChat(chatId)
      if (result.success) {
        safeLog('Chat ended successfully:', chatId)
        fetchChatsOptimized() // Refresh to show updated status
      } else {
        throw new Error(result.error || 'Failed to end chat')
      }
    } catch (error) {
      safeError('Failed to end chat:', error)
      setError(error instanceof Error ? error.message : 'Failed to end chat')
    }
  }

  const formatDateTime = (timestamp: number) => {
    // Check if timestamp is in seconds (10 digits) or milliseconds (13+ digits)
    let timeMs: number
    const timestampStr = timestamp.toString()

    if (timestampStr.length <= 10) {
      // Timestamp is in seconds, convert to milliseconds
      timeMs = timestamp * 1000
    } else {
      // Timestamp is already in milliseconds
      timeMs = timestamp
    }

    const date = new Date(timeMs)

    return {
      date: date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }),
      time: date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })
    }
  }

  const formatDuration = (startTimestamp: number, endTimestamp?: number) => {
    if (!endTimestamp) return ''

    const durationSeconds = endTimestamp - startTimestamp
    if (durationSeconds < 60) {
      return `${durationSeconds}s`
    } else if (durationSeconds < 3600) {
      const minutes = Math.floor(durationSeconds / 60)
      const seconds = durationSeconds % 60
      return `${minutes}m ${seconds}s`
    } else {
      const hours = Math.floor(durationSeconds / 3600)
      const minutes = Math.floor((durationSeconds % 3600) / 60)
      return `${hours}h ${minutes}m`
    }
  }

  // Export all chats in selected date range to PDF
  const exportAllChatsToPDF = async () => {
    try {
      safeLog('🔄 Starting PDF export for all chats in date range:', selectedDateRange)

      // Show loading state
      const originalButtonText = 'Export Chat Report'
      const button = document.querySelector('[title*="Export all SMS chats"]') as HTMLButtonElement
      if (button) {
        button.disabled = true
        button.innerHTML = '<svg class="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating PDF...'
      }

      // Get the filtered chats for the current date range (including custom dates)
      const { start, end } = getDateRangeFromSelection(selectedDateRange, customStartDate, customEndDate)
      safeLog(`📅 Export date range: ${start.toLocaleString()} to ${end.toLocaleString()}`)

      // Use the already filtered chats from the page state to ensure consistency
      // allFilteredChats already contains the correctly filtered chats for the current date range
      let chatsToExport = allFilteredChats.filter(chat => {
        const chatDate = new Date(chat.start_timestamp || chat.created_at || 0)
        // Double-check the date filtering to ensure accuracy
        return chatDate >= start && chatDate <= end
      })

      if (chatsToExport.length === 0) {
        alert(`No SMS chats found for ${selectedDateRange}. Please select a different date range.`)
        return
      }

      // Limit export to prevent performance issues
      const MAX_CHATS = 50
      if (chatsToExport.length > MAX_CHATS) {
        const confirmLarge = confirm(`You are about to export ${chatsToExport.length} chats. This may take a while and create a large PDF. Would you like to limit to the most recent ${MAX_CHATS} chats instead?`)
        if (confirmLarge) {
          chatsToExport = chatsToExport.slice(0, MAX_CHATS)
        }
      }

      safeLog(`📊 Exporting ${chatsToExport.length} chats for ${selectedDateRange}`)

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

      // Title page
      doc.setFontSize(20)
      doc.setFont('helvetica', 'bold')
      doc.text('SMS Chat Export Report', pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 15

      doc.setFontSize(14)
      doc.setFont('helvetica', 'normal')
      const displayRange = selectedDateRange === 'custom' ? 'CUSTOM RANGE' : selectedDateRange.toUpperCase()
      doc.text(`Date Range: ${displayRange}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      doc.setFontSize(12)
      doc.text(`From: ${start.toLocaleDateString()} To: ${end.toLocaleDateString()}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      doc.text(`Total Chats: ${chatsToExport.length}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 20

      // Process each chat with async yields to prevent blocking
      for (let i = 0; i < chatsToExport.length; i++) {
        const chat = chatsToExport[i]

        // Yield control every 10 chats to prevent blocking and update progress
        if (i > 0 && i % 10 === 0) {
          if (button) {
            const progress = Math.round((i / chatsToExport.length) * 100)
            button.innerHTML = `<svg class="animate-spin w-4 h-4 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing ${progress}%...`
          }
          await new Promise(resolve => setTimeout(resolve, 10)) // 10ms yield
        }

        checkNewPage(60) // Ensure enough space for chat header

        // Chat separator
        if (i > 0) {
          doc.setDrawColor(200, 200, 200)
          doc.line(margin, yPosition, pageWidth - margin, yPosition)
          yPosition += 10
        }

        // Chat header
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(`Chat ${i + 1}: ${chat.chat_id}`, margin, yPosition)
        yPosition += 8

        // Basic chat info
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')

        const chatDateTime = formatDateTime(chat.start_timestamp || chat.created_at || 0)
        doc.text(`Date: ${chatDateTime.date} ${chatDateTime.time}`, margin, yPosition)
        yPosition += 6

        // Patient info
        const phoneNumber = chat.chat_analysis?.custom_analysis_data?.phone_number ||
          chat.chat_analysis?.custom_analysis_data?.customer_phone_number ||
          chat.metadata?.phone_number ||
          chat.phone_number ||
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

        doc.text(`Status: ${chat.status || 'Unknown'}`, margin, yPosition)
        yPosition += 6

        // Cost info
        const segments = calculateChatSMSSegments(chat, false) // Don't cache during PDF export
        const { cost: totalCost, loading: costLoading } = smsCostManager.getChatCost(chat.chat_id)
        const costPerSegment = segments > 0 ? (totalCost / segments) : 0
        const costDisplay = costLoading ? 'Loading...' : `$${totalCost.toFixed(4)} CAD`
        doc.text(`SMS Segments: ${segments} | Cost: ${costDisplay}`, margin, yPosition)
        yPosition += 10

        // Detailed Analysis Section
        if (chat.chat_analysis?.custom_analysis_data && Object.keys(chat.chat_analysis.custom_analysis_data).length > 0) {
          checkNewPage(40)

          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          doc.text('Detailed Analysis:', margin, yPosition)
          yPosition += 8

          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')

          Object.entries(chat.chat_analysis.custom_analysis_data).forEach(([key, value]) => {
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

        // Message Thread (if available and not too long)
        if (chat.transcript && chat.transcript.length > 0) {
          checkNewPage(30)

          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          doc.text('Message Thread:', margin, yPosition)
          yPosition += 8

          doc.setFontSize(9)
          doc.setFont('helvetica', 'normal')

          // Limit to first 5 messages to improve performance and keep PDF reasonable
          const messagesToShow = chat.transcript.slice(0, 5)
          messagesToShow.forEach((message, idx) => {
            checkNewPage(15)

            const role = message.role === 'user' ? 'Patient' : 'Assistant'
            const content = message.content || message.message || 'No content'

            doc.setFont('helvetica', 'bold')
            doc.text(`${role}:`, margin, yPosition)
            yPosition += 5

            doc.setFont('helvetica', 'normal')
            const messageLines = doc.splitTextToSize(content, pageWidth - 2 * margin - 10)
            messageLines.forEach((line: string) => {
              checkNewPage(5)
              doc.text(line, margin + 10, yPosition)
              yPosition += 5
            })
            yPosition += 3
          })

          if (chat.transcript.length > 5) {
            doc.setFontSize(9)
            doc.setFont('helvetica', 'italic')
            doc.text(`... and ${chat.transcript.length - 5} more messages`, margin, yPosition)
            yPosition += 8
          }
        }

        yPosition += 15 // Space between chats
      }

      // Footer on last page
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.text('🤖 Generated with ARTLEE Business Platform CRM', margin, pageHeight - 20)
      doc.text(`Exported by: ${currentUser?.email || 'System'}`, margin, pageHeight - 12)
      doc.text(`Total Pages: ${doc.getNumberOfPages()}`, pageWidth - margin - 40, pageHeight - 12)

      // Save the PDF
      const dateStr = new Date().toISOString().split('T')[0]
      const rangeStr = selectedDateRange === 'custom' ?
        `${start.toISOString().split('T')[0]}_to_${end.toISOString().split('T')[0]}` :
        selectedDateRange
      const filename = `SMS-Export-${rangeStr}-${dateStr}.pdf`
      doc.save(filename)

      safeLog(`✅ PDF export completed: ${filename}`)
      alert(`Successfully exported ${chatsToExport.length} SMS chats to ${filename}`)

    } catch (error) {
      safeError('❌ PDF export failed:', error)

      // Show detailed error information
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      const detailedError = `PDF Export Failed:\n\nError: ${errorMessage}\n\nThis might be due to:\n• Too many chats selected (try a smaller date range)\n• Network connectivity issues\n• Browser memory limitations\n\nPlease try:\n1. Select a smaller date range\n2. Refresh the page and try again\n3. Check your internet connection`

      alert(detailedError)
      safeError('PDF export error details:', { error, selectedDateRange, chatCount: allFilteredChats.length })
    } finally {
      // Reset button state
      const button = document.querySelector('[title*="Export all SMS chats"]') as HTMLButtonElement
      if (button) {
        button.disabled = false
        button.innerHTML = '<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>Export Chat Report'
      }
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

  const getChatStatusColor = (status: string) => {
    switch (status) {
      case 'ended': return 'text-green-600 bg-green-50'
      case 'ongoing': return 'text-blue-600 bg-blue-50'
      case 'error': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getChatStatusIcon = (status: string) => {
    switch (status) {
      case 'ended': return <CheckCircleIcon className="w-4 h-4" />
      case 'ongoing': return <PlayCircleIcon className="w-4 h-4" />
      case 'error': return <AlertCircleIcon className="w-4 h-4" />
      default: return <ClockIcon className="w-4 h-4" />
    }
  }


  // Load SMS agent configuration on mount
  useEffect(() => {
    const loadSMSAgentConfig = async () => {
      try {
        // Load from user settings
        if (currentUser?.id) {
          const settings = JSON.parse(localStorage.getItem(`settings_${currentUser.id}`) || '{}')
          const agentId = settings.smsAgentId || ''

          setSmsAgentId(agentId)
          setSmsAgentConfigured(!!agentId)

          safeLog('SMS Agent Configuration:', {
            agentId,
            configured: !!agentId
          })
        }
      } catch (error) {
        safeError('Error loading SMS agent configuration:', error)
        setSmsAgentConfigured(false)
      }
    }

    loadSMSAgentConfig()
  }, [])

  // Cleanup on unmount - ONLY run on actual unmount, not dependency changes
  useEffect(() => {
    return () => {
      console.log('🔴 [SMS DEBUG] Component unmounting - setting mountedRef to false')
      mountedRef.current = false
      cancelDebouncedFetchChats()
    }
  }, []) // Empty dependency array - only runs on mount/unmount

  // 🛡️ BULLETPROOF API KEY MONITORING - Monitors navigation-based API key persistence
  useEffect(() => {
    let monitoringInterval: NodeJS.Timeout | null = null

    const startMonitoring = () => {
      if (monitoringInterval) return // Avoid duplicate intervals

      console.log('🛡️ [SMSPage] Starting bulletproof API monitoring...')

      monitoringInterval = setInterval(async () => {
        try {
          // Check if API key is still available
          const apiKey = retellService.getApiKey()

          if (!apiKey || apiKey === 'your-retell-api-key-here') {
            console.warn('🚨 [SMSPage] API key lost during navigation - triggering recovery')

            // Force reload API credentials using the bulletproof system
            const recovered = await retellService.initializeWithCredentials()

            if (recovered.success) {
              console.log('✅ [SMSPage] API credentials recovered successfully')

              // CRITICAL: Sync chatService credentials with retellService
              await chatService.syncWithRetellService()
              console.log('🔄 [SMSPage] Synchronized chatService with recovered API credentials')

              // Dispatch event to notify page components
              window.dispatchEvent(new CustomEvent('apiConfigurationReady', {
                detail: { source: 'SMSPage-recovery' }
              }))

              // Retry data fetch if needed
              if (error?.includes('API not configured')) {
                fetchChatsOptimized()
              }
            } else {
              console.error('❌ [SMSPage] Failed to recover API credentials:', recovered.error)
            }
          }
        } catch (error) {
          console.error('🚨 [SMSPage] Error during API monitoring:', error)
        }
      }, 2000) // Check every 2 seconds during navigation
    }

    const stopMonitoring = () => {
      if (monitoringInterval) {
        clearInterval(monitoringInterval)
        monitoringInterval = null
        console.log('🛡️ [SMSPage] Stopped bulletproof API monitoring')
      }
    }

    // CRITICAL: Synchronize chatService with retellService (async to ensure proper timing)
    console.log('🔄 [SMSPage] Synchronizing chatService with bulletproof API system on mount...')
    chatService.syncWithRetellService().catch(error => {
      console.error('❌ [SMSPage] Failed to sync chatService with retellService:', error)
      // Fallback to regular reload
      chatService.reloadCredentials()
    })

    // Start monitoring when component mounts
    startMonitoring()

    // Listen for focus events to restart monitoring after navigation
    const handleFocus = async () => {
      console.log('🛡️ [SMSPage] Window focused - applying Calls page pattern')
      try {
        // FORCE HARDWIRED CREDENTIALS - SIMPLE APPROACH
        console.log('🔧 [SMSPage] Focus: Forcing hardwired credentials...')
        retellService.updateCredentials(
          'key_c3f084f5ca67781070e188b47d7f',
          'agent_447a1b9da540237693b0440df6',
          'agent_643486efd4b5a0e9d7e094ab99'
        )

        // SIMPLE CALLS PAGE PATTERN
        await retellService.loadCredentialsAsync()
        await chatService.syncWithRetellService()

        console.log('✅ [SMSPage] Focus: Calls page pattern applied successfully')
      } catch (error) {
        console.error('Focus sync error:', error)
      }
      startMonitoring()
    }

    const handleBlur = () => {
      console.log('🛡️ [SMSPage] Window blurred - maintaining API monitoring')
      // Keep monitoring during blur for navigation scenarios
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('blur', handleBlur)

    // Cleanup on unmount
    return () => {
      stopMonitoring()
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('blur', handleBlur)
    }
  }, [error]) // Include error in dependencies to restart monitoring when error state changes

  // 🎯 NAVIGATION FIX: Ensure services are initialized on page load
  useEffect(() => {
    const handleNavigationSync = async () => {
      console.log('🧭 [SMSPage] Navigation detected - ensuring services are initialized...')

      try {
        // Use global service initializer to ensure all services are ready
        const { globalServiceInitializer } = await import('../services/globalServiceInitializer')
        await globalServiceInitializer.initialize()

        const status = globalServiceInitializer.getStatus()
        console.log('✅ [SMSPage] Services initialized:', status)

        // If services aren't configured, force initialization
        if (!status.retellConfigured || !status.chatConfigured) {
          console.log('🔧 [SMSPage] Forcing service reinitialization...')
          await globalServiceInitializer.forceReinitialize()
        }
      } catch (error) {
        console.error('❌ [SMSPage] Navigation sync error:', error)
      }
    }

    // Trigger on component mount (includes navigation)
    handleNavigationSync()
  }, []) // Empty dependency array - runs once per navigation/mount

  // Apply search and filter logic to paginated chats (exactly like CallsPage pattern)
  const filteredChats = React.useMemo(() => {
    // Use chats (all data) - apply filtering first, then pagination
    let searchFilteredChats = chats

    // Apply search filter using fuzzy search or fallback to basic search
    if (debouncedSearchTerm && debouncedSearchTerm.trim()) {
      if (isFuzzySearchEnabled) {
        try {
          const fuzzyResults = fuzzySearchService.searchSMS(debouncedSearchTerm)
          searchFilteredChats = fuzzyResults.filter(result => chats.some(chat => chat.chat_id === result.chat_id))
        } catch (error) {
          console.error('Fuzzy search failed, falling back to basic search:', error)
          searchFilteredChats = fuzzySearchService.basicSMSSearch(chats, debouncedSearchTerm)
        }
      } else {
        // Use basic search when fuzzy search is disabled
        searchFilteredChats = fuzzySearchService.basicSMSSearch(chats, debouncedSearchTerm)
      }
    }

    // Apply status and sentiment filters to search results
    const fullyFilteredChats = searchFilteredChats.filter(chat => {
      const matchesStatus = debouncedStatusFilter === 'all' || chat.chat_status === debouncedStatusFilter
      const matchesSentiment = debouncedSentimentFilter === 'all' || chat.chat_analysis?.user_sentiment === debouncedSentimentFilter

      return matchesStatus && matchesSentiment
    })

    // Apply pagination to filtered results (CallsPage pattern)
    const startIndex = (currentPage - 1) * recordsPerPage
    const endIndex = startIndex + recordsPerPage
    return fullyFilteredChats.slice(startIndex, endIndex)
  }, [chats, debouncedSearchTerm, debouncedStatusFilter, debouncedSentimentFilter, isFuzzySearchEnabled, currentPage, recordsPerPage])

  // Calculate total filtered count (before pagination) for pagination display
  const filteredChatsCount = React.useMemo(() => {
    let searchFilteredChats = chats

    // Apply search filter using fuzzy search or fallback to basic search
    if (debouncedSearchTerm && debouncedSearchTerm.trim()) {
      if (isFuzzySearchEnabled) {
        try {
          const fuzzyResults = fuzzySearchService.searchSMS(debouncedSearchTerm)
          searchFilteredChats = fuzzyResults.filter(result => chats.some(chat => chat.chat_id === result.chat_id))
        } catch (error) {
          console.error('Fuzzy search failed, falling back to basic search:', error)
          searchFilteredChats = fuzzySearchService.basicSMSSearch(chats, debouncedSearchTerm)
        }
      } else {
        // Use basic search when fuzzy search is disabled
        searchFilteredChats = fuzzySearchService.basicSMSSearch(chats, debouncedSearchTerm)
      }
    }

    // Apply status and sentiment filters to search results
    const fullyFilteredChats = searchFilteredChats.filter(chat => {
      const matchesStatus = debouncedStatusFilter === 'all' || chat.chat_status === debouncedStatusFilter
      const matchesSentiment = debouncedSentimentFilter === 'all' || chat.chat_analysis?.user_sentiment === debouncedSentimentFilter

      return matchesStatus && matchesSentiment
    })

    return fullyFilteredChats.length
  }, [chats, debouncedSearchTerm, debouncedStatusFilter, debouncedSentimentFilter, isFuzzySearchEnabled])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchTerm, debouncedStatusFilter, debouncedSentimentFilter])

  // Remove displayChats - render filteredChats directly like CallsPage

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-6 min-h-screen overflow-x-hidden">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4">
        <div className="w-full sm:w-auto min-w-0 flex-shrink-0">
          <DateRangePicker
            selectedRange={selectedDateRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            onRangeChange={(range, customStart, customEnd) => {
              setSelectedDateRange(range)
              // Save selected date range to localStorage
              localStorage.setItem('sms_page_date_range', range)

              // Handle custom date range
              if (range === 'custom' && customStart && customEnd) {
                setCustomStartDate(customStart)
                setCustomEndDate(customEnd)
                // Save custom dates to localStorage
                localStorage.setItem('sms_page_custom_start_date', customStart.toISOString())
                localStorage.setItem('sms_page_custom_end_date', customEnd.toISOString())
              } else if (range !== 'custom') {
                // Clear custom dates when switching to non-custom range
                setCustomStartDate(undefined)
                setCustomEndDate(undefined)
                localStorage.removeItem('sms_page_custom_start_date')
                localStorage.removeItem('sms_page_custom_end_date')
              }

              const { start, end } = getDateRangeFromSelection(range, customStart, customEnd)
              safeLog('SMS date range changed:', { range, start, end, customStart, customEnd })
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto min-w-0">
          <button
            onClick={() => {
              console.log('🔴 [SMS DEBUG] Refresh button clicked at:', new Date().toLocaleTimeString())
              console.log('🔴 [SMS DEBUG] mountedRef.current:', mountedRef.current)
              console.log('🔴 [SMS DEBUG] loading state before:', loading)

              safeLog('SMS page manual refresh triggered at:', new Date().toLocaleTimeString())
              // Clear caches and force a complete refresh
              smsCostManager.clearCosts()
              setSegmentCache(new Map()) // Clear segment cache on manual refresh
              setLoadingFullChats(new Set()) // Clear loading state
              setSegmentUpdateTrigger(0) // Reset segment update trigger
              setError('')
              // Note: We preserve fullDataSegmentCache as it contains persistent data
              // It will be validated against new chat data automatically
              safeLog('🔄 Manual refresh: cleared temporary caches, preserving persistent segment cache')

              console.log('🔴 [SMS DEBUG] About to call fetchChatsOptimized...')
              fetchChatsOptimized()
              console.log('🔴 [SMS DEBUG] fetchChatsOptimized called')
            }}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-900 transition-colors disabled:opacity-50 min-h-[44px] text-sm sm:text-base touch-manipulation"
          >
            <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            onClick={() => toastNotificationService.triggerTestNotification('sms')}
            className="flex items-center gap-2 px-3 py-2 text-green-600 hover:text-green-800 hover:bg-green-50 rounded-lg transition-colors min-h-[44px] text-sm sm:text-base touch-manipulation"
            title="Test SMS toast notification"
          >
            <MessageCircleIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Test Toast</span>
          </button>
          <button
            onClick={clearAllSegmentCaches}
            className="flex items-center gap-2 px-3 py-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors min-h-[44px] text-sm sm:text-base touch-manipulation"
            title="Clear all SMS segment calculation caches"
          >
            <TrashIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Clear Cache</span>
          </button>
          <button
            onClick={exportAllChatsToPDF}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors min-h-[44px] text-sm sm:text-base flex-shrink-0 justify-center touch-manipulation"
            title={`Export all SMS chats for ${selectedDateRange} to PDF`}
          >
            <DownloadIcon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline whitespace-nowrap">Export Chat Report</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>
      <div className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-2 sm:px-0">
        <div className="text-center sm:text-left">
          Last refreshed: {formatLastRefreshTime()}
          <span className="hidden sm:inline"> (Auto-refresh every minute)</span>
          <span className="block sm:inline sm:ml-2">{totalChatsCount} total chats</span>
        </div>
        {smsCostManager.progress && (
          <div className="flex items-center gap-2">
            <div className="w-32 bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(smsCostManager.progress.loaded / smsCostManager.progress.total) * 100}%` }}
              ></div>
            </div>
            <span className="text-xs">
              Loading costs: {smsCostManager.progress.loaded}/{smsCostManager.progress.total}
            </span>
          </div>
        )}
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Chats */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Total Chats</span>
            <MessageCircleIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black text-blue-600 mb-1 numeric-data">
            {loading ? '...' : metrics.totalChats}
          </div>
          <div className="text-xs sm:text-sm text-gray-500">
            {metrics.totalChats > 0 ? (
              <><span className="numeric-data">{metrics.completedChats}</span> completed, <span className="numeric-data">{metrics.errorChats}</span> failed</>
            ) : 'No chats started'}
          </div>
        </div>

        {/* Active Chats */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Active Chats</span>
            <PlayCircleIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black text-blue-600 mb-1 numeric-data">
            {loading ? '...' : metrics.activeChats}
          </div>
          <div className="text-xs text-gray-500">
            Currently ongoing conversations
          </div>
        </div>

        {/* Avg Cost Per Chat */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Avg Cost Per Chat</span>
            <DollarSignIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black text-blue-600 mb-1 numeric-data">
            ${loading ? '...' : metrics.avgCostPerChat.toFixed(3)}
          </div>
          <div className="text-xs sm:text-sm text-gray-500">
            Total cost: $<span className="numeric-data">{metrics.totalCost.toFixed(2)}</span>
          </div>
        </div>

        {/* Success Rate */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Success Rate</span>
            <TrendingUpIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-xl sm:text-2xl lg:text-3xl font-black text-blue-600 mb-1 numeric-data">
            {loading ? '...' : `${metrics.successRate.toFixed(1)}%`}
          </div>
          <div className="text-xs sm:text-sm text-gray-500">
            {metrics.totalChats > 0 ? (
              <><span className="numeric-data">{Math.round(metrics.totalChats * metrics.successRate / 100)}</span> successful chats</>
            ) : (<><span className="numeric-data">0</span> successful chats</>)}
          </div>
        </div>

        {/* Total SMS Segments */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Total SMS Segments</span>
            <MessageSquareIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 mb-1">
            <span className="numeric-data">{loading ? '...' : metrics.totalSMSSegments}</span>
          </div>

          {/* Progress Indicator */}
          {isLoadingSegments && (
            <div className="mt-2 mb-1">
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
              {/* Cache info */}
              <div className="text-[10px] text-gray-500 mt-1">
                💾 {fullDataSegmentCache.size} chats cached • Only processing uncached chats
              </div>
            </div>
          )}

          {/* Completion Message - Only show once after actual loading */}
          {segmentLoadingComplete && !isLoadingSegments && fullDataSegmentCache.size > 0 && (
            <div className="mt-2 mb-1 transition-opacity duration-500">
              <div className="flex items-center gap-2 text-xs text-green-600">
                <CheckCircleIcon className="w-3 h-3" />
                <span>Calculation complete</span>
              </div>
              <div className="text-[10px] text-gray-500 mt-1">
                {fullDataSegmentCache.size} chats cached
              </div>
            </div>
          )}

          {/* Manual Refresh Button (show when there are uncached chats but auto-load was skipped) */}
          {!isLoadingSegments && !segmentLoadingComplete && allFilteredChats.length > 0 && (
            (() => {
              const chatsToProcess = allFilteredChats.filter(chat => !fullDataSegmentCache.has(chat.chat_id))
              const cachedCount = allFilteredChats.length - chatsToProcess.length
              const cacheHitRate = cachedCount / allFilteredChats.length

              // Show button if there are uncached chats
              return chatsToProcess.length > 0 ? (
                <div className="mt-2 mb-1">
                  <button
                    onClick={() => loadAccurateSegmentsForAllChats()}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-600 rounded border border-blue-200 transition-colors touch-manipulation"
                    title={`Calculate accurate segments for ${chatsToProcess.length} uncached chats`}
                  >
                    <RefreshCwIcon className="w-3 h-3" />
                    <span>Calculate {chatsToProcess.length} uncached</span>
                  </button>
                </div>
              ) : null
            })()
          )}

          <div className="text-xs text-gray-500">
            Total segments for date range
          </div>
        </div>

        {/* Positive Sentiment */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Positive Sentiment</span>
            <ThumbsUpIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 mb-1">
            <span className="numeric-data">{loading ? '...' : metrics.positiveSentimentCount}</span>
          </div>
          <div className="text-xs sm:text-sm text-gray-500">
            {allFilteredChats.length > 0 ? (
              <><span className="numeric-data">{((metrics.positiveSentimentCount / allFilteredChats.length) * 100).toFixed(1)}</span>% positive</>
            ) : (<><span className="numeric-data">0</span>% positive</>)}
          </div>
        </div>

        {/* Peak Hours */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Peak Hours</span>
            <ClockIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 mb-1">
            <span className="numeric-data">{loading ? '...' : metrics.peakHour}</span>
          </div>
          <div className="text-xs sm:text-sm text-gray-500">
            {metrics.peakHourCount > 0 ? (
              <><span className="numeric-data">{metrics.peakHourCount}</span> chat{metrics.peakHourCount === 1 ? '' : 's'} at peak time</>
            ) : 'No peak data'}
          </div>
        </div>

        {/* Error Chats */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Error Chats</span>
            <AlertCircleIcon className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 mb-1">
            <span className="numeric-data">{loading ? '...' : metrics.errorChats}</span>
          </div>
          <div className="text-xs sm:text-sm text-gray-500">
            {metrics.totalChats > 0 ? (
              <><span className="numeric-data">{((metrics.errorChats / metrics.totalChats) * 100).toFixed(1)}</span>% failure rate</>
            ) : (<><span className="numeric-data">0</span>% failure rate</>)}
          </div>
        </div>
      </div>

      {/* Total Chat Costs Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <DollarSignIcon className="w-5 h-5 text-green-600" />
              <span className="text-lg sm:text-xl font-semibold text-gray-900">Total SMS Costs</span>
            </div>
            <p className="text-sm sm:text-base text-gray-500">Complete cost breakdown for selected date range</p>
          </div>
          <div className="text-left sm:text-right w-full sm:w-auto">
            <div className="text-2xl sm:text-3xl font-black text-green-600 numeric-data">${(metrics.totalCost * 1.45).toFixed(2)}</div>
            <div className="text-sm sm:text-base text-gray-500">{metrics.totalChats} chats</div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 sm:mb-6 bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-red-700">{error}</span>
            <button
              onClick={() => setError('')}
              className="ml-auto text-red-600 hover:text-red-800 text-xl"
            >
              ×
            </button>
          </div>
          {error.includes('API not configured') && (
            <div className="flex gap-2 mt-2">
              <button
                onClick={async () => {
                  // IMMEDIATE FIX: Use hardwired credentials to reinitialize
                  console.log('🔐 [SMSPage] Reinitializing with HARDWIRED credentials...')

                  try {
                    const { getBulletproofCredentials, storeCredentialsEverywhere } = await import('../config/retellCredentials')
                    const hardwiredCreds = getBulletproofCredentials()

                    // Store hardwired credentials in all locations
                    storeCredentialsEverywhere(hardwiredCreds)

                    // Force update services with hardwired credentials
                    retellService.updateCredentials(
                      hardwiredCreds.apiKey,
                      hardwiredCreds.callAgentId,
                      hardwiredCreds.smsAgentId
                    )

                    // Also store in user settings for consistency
                    const userId = 'dynamic-pierre-user'
                    const hardwiredApiSettings = {
                      theme: 'light',
                      mfaEnabled: false,
                      refreshInterval: 30000,
                      sessionTimeout: 15,
                      notifications: { calls: true, sms: true, system: true },
                      retellApiKey: hardwiredCreds.apiKey,
                      callAgentId: hardwiredCreds.callAgentId,
                      smsAgentId: hardwiredCreds.smsAgentId
                    }
                    localStorage.setItem(`settings_${userId}`, JSON.stringify(hardwiredApiSettings))

                    console.log('✅ [SMSPage] HARDWIRED credentials forcefully reinitialized')
                    // Security: Do not log API keys or Agent IDs

                    safeLog('✅ HARDWIRED API keys reinitialized')
                    setError('')
                    fetchChatsOptimized()
                  } catch (error) {
                    console.error('Failed to reinitialize hardwired credentials:', error)
                  }
                }}
                className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm min-h-[44px] touch-manipulation"
              >
                Fix API Keys
              </button>
              <button
                onClick={() => window.location.href = '/settings'}
                className="px-3 sm:px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm min-h-[44px] touch-manipulation"
              >
                Go to Settings
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chat Conversations List */}
      <div>
        {/* Search and Filters */}
        <div className="mb-4 sm:mb-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-5 lg:p-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex-1 relative">
              <SearchIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="search"
                placeholder="Search chats by phone number, patient name, or content..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-12 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px] text-sm sm:text-base touch-manipulation"
              />
              <button
                onClick={() => setIsFuzzySearchEnabled(!isFuzzySearchEnabled)}
                className={`absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded transition-colors ${isFuzzySearchEnabled
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
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 sm:px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] text-sm sm:text-base flex-1 sm:min-w-[120px] touch-manipulation"
              >
                <option value="all">All Status</option>
                <option value="ongoing">Ongoing</option>
                <option value="ended">Ended</option>
                <option value="error">Error</option>
              </select>
              <select
                value={sentimentFilter}
                onChange={(e) => setSentimentFilter(e.target.value)}
                className="px-3 sm:px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] text-sm sm:text-base flex-1 sm:min-w-[130px] touch-manipulation"
              >
                <option value="all">All Sentiment</option>
                <option value="positive">Positive</option>
                <option value="neutral">Neutral</option>
                <option value="negative">Negative</option>
              </select>
            </div>
          </div>
        </div>

        {/* Chat Conversations Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="text-center py-8 sm:py-12">
              <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-3 sm:mt-4 text-sm sm:text-base">Loading chat conversations...</p>
            </div>
          ) : filteredChats.length > 0 ? (
            <div className="overflow-x-auto">
              {/* Table Header */}
              <div className="bg-gray-50 border-b border-gray-200 px-4 sm:px-6 py-3 hidden lg:block">
                <div className="grid grid-cols-12 gap-2 lg:gap-4 text-xs sm:text-sm font-medium text-gray-700">
                  <div className="col-span-1">#</div>
                  <div className="col-span-3">Patient</div>
                  <div className="col-span-3">Chat Info</div>
                  <div className="col-span-2">Cost</div>
                  <div className="col-span-2">Status & Duration</div>
                  <div className="col-span-1">Actions</div>
                </div>
              </div>

              {/* Table Rows */}
              <div className="divide-y divide-gray-200">
                {filteredChats.map((chat, index) => {
                  // Calculate the actual row number based on current page and pagination
                  const rowNumber = (currentPage - 1) * recordsPerPage + index + 1
                  // Determine if this row should have gray background (even rows)
                  const isEvenRow = index % 2 === 0
                  const rowBgColor = isEvenRow ? 'bg-white' : 'bg-gray-25'
                  // Check all possible phone number fields - prioritize analysis data
                  const phoneNumber = chat.chat_analysis?.custom_analysis_data?.phone_number ||
                    chat.chat_analysis?.custom_analysis_data?.customer_phone_number ||
                    chat.chat_analysis?.custom_analysis_data?.phone ||
                    chat.chat_analysis?.custom_analysis_data?.contact_number ||
                    chat.metadata?.phone_number ||
                    chat.metadata?.customer_phone_number ||
                    chat.metadata?.from_phone_number ||
                    chat.metadata?.to_phone_number ||
                    chat.metadata?.phone ||
                    chat.collected_dynamic_variables?.phone_number ||
                    chat.collected_dynamic_variables?.customer_phone_number ||
                    ''

                  // Try multiple approaches to extract name - check analysis data first
                  const extractedName = chat.chat_analysis?.custom_analysis_data?.patient_name ||
                    chat.chat_analysis?.custom_analysis_data?.caller_name ||
                    chat.chat_analysis?.custom_analysis_data?.customer_name ||
                    chat.chat_analysis?.custom_analysis_data?.name ||
                    chat.metadata?.patient_name ||
                    chat.metadata?.customer_name ||
                    chat.metadata?.caller_name ||
                    chat.metadata?.name ||
                    chat.metadata?.first_name ||
                    chat.metadata?.last_name ||
                    chat.collected_dynamic_variables?.patient_name ||
                    chat.collected_dynamic_variables?.customer_name ||
                    chat.collected_dynamic_variables?.caller_name ||
                    chat.collected_dynamic_variables?.name ||
                    chat.collected_dynamic_variables?.first_name ||
                    chat.collected_dynamic_variables?.last_name ||
                    null

                  // Create a better fallback name
                  let patientName = extractedName
                  if (!patientName) {
                    if (phoneNumber) {
                      // Format phone number nicely if we have it
                      const last4 = phoneNumber.replace(/\D/g, '').slice(-4)
                      patientName = `Patient (${last4 ? '***-' + last4 : phoneNumber})`
                    } else {
                      // Use a portion of chat ID as last resort
                      patientName = `Patient #${chat.chat_id.slice(0, 6)}`
                    }
                  }

                  return (
                    <div
                      key={chat.chat_id}
                      className={`px-3 sm:px-4 lg:px-6 py-3 sm:py-4 hover:bg-blue-50 cursor-pointer transition-colors touch-manipulation ${rowBgColor}`}
                      onClick={() => {
                        setSelectedChat(chat)
                        setIsChatDetailModalOpen(true)
                      }}
                    >
                      {/* Desktop Layout */}
                      <div className="hidden lg:grid grid-cols-12 gap-2 lg:gap-4 items-center">
                        {/* Row Number */}
                        <div className="col-span-1">
                          <span className="text-xs lg:text-sm font-medium text-gray-500">#{rowNumber}</span>
                        </div>

                        {/* Patient Info */}
                        <div className="col-span-3">
                          <div>
                            <div className="font-medium text-sm lg:text-base text-gray-900 flex items-center gap-2">
                              {patientName}
                              {hasNotes(chat.chat_id) && (
                                <div className="flex items-center gap-1">
                                  <StickyNoteIcon className="h-4 w-4 text-blue-500" />
                                  <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                    {getNoteCount(chat.chat_id)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="text-xs lg:text-sm text-gray-500">
                              {phoneNumber || 'No phone number'}
                            </div>
                          </div>
                        </div>

                        {/* Chat Info */}
                        <div className="col-span-3">
                          <div className="text-xs lg:text-sm text-gray-900">
                            {formatDateTime(chat.start_timestamp).date}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDateTime(chat.start_timestamp).time}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {chat.chat_analysis?.user_sentiment && (
                              <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSentimentColor(chat.chat_analysis.user_sentiment)}`}>
                                {chat.chat_analysis.user_sentiment}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Cost */}
                        <div className="col-span-2">
                          <div className="text-xs lg:text-sm font-medium text-gray-900">
                            <CostDisplay chat={chat} />
                          </div>
                          <div className="text-xs text-gray-500">
                            SMS cost
                          </div>
                        </div>

                        {/* Status & Duration */}
                        <div className="col-span-2">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getChatStatusColor(chat.chat_status)}`}>
                              {chat.chat_status}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatDuration(chat.start_timestamp, chat.end_timestamp)}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="col-span-1">
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1 hover:bg-gray-200 rounded transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedChat(chat)
                                setIsChatDetailModalOpen(true)
                              }}
                              title="View Details"
                            >
                              <EyeIcon className="w-4 h-4 text-gray-500" />
                            </button>
                            {chat.chat_status === 'ongoing' && (
                              <button
                                className="p-1 hover:bg-red-200 rounded transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  endChat(chat.chat_id)
                                }}
                                title="End Chat"
                              >
                                <StopCircleIcon className="w-4 h-4 text-red-500" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mobile and Tablet Layout */}
                      <div className="lg:hidden space-y-2 sm:space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${chat.chat_status === 'ongoing' ? 'bg-blue-100' :
                                chat.chat_status === 'ended' ? 'bg-green-100' : 'bg-red-100'
                              }`}>
                              {chat.chat_status === 'ongoing' ?
                                <BotIcon className="w-5 h-5 text-blue-600" /> :
                                chat.chat_status === 'ended' ?
                                  <CheckCircleIcon className="w-5 h-5 text-green-600" /> :
                                  <AlertCircleIcon className="w-5 h-5 text-red-600" />
                              }
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold text-sm sm:text-base text-gray-900 truncate">
                                {patientName}
                                {hasNotes(chat.chat_id) && (
                                  <span className="ml-2 inline-flex items-center gap-1">
                                    <StickyNoteIcon className="h-3 w-3 text-blue-500" />
                                    <span className="text-xs text-blue-600 font-medium">
                                      {getNoteCount(chat.chat_id)}
                                    </span>
                                  </span>
                                )}
                              </div>
                              <div className="text-xs sm:text-sm text-gray-500 truncate">
                                {phoneNumber || 'No phone number'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {chat.chat_status === 'ongoing' && (
                              <button
                                className="p-2 hover:bg-red-200 rounded transition-colors min-h-[44px] min-w-[44px] touch-manipulation"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  endChat(chat.chat_id)
                                }}
                              >
                                <StopCircleIcon className="w-4 h-4 text-red-500" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="bg-gray-50 rounded p-2 sm:p-3">
                          <p className="text-sm text-gray-900 line-clamp-2">
                            {chat.transcript || 'No conversation yet'}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getChatStatusColor(chat.chat_status)}`}>
                            {chat.chat_status}
                          </span>
                          {chat.chat_analysis?.user_sentiment && (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSentimentColor(chat.chat_analysis.user_sentiment)}`}>
                              {chat.chat_analysis.user_sentiment}
                            </span>
                          )}
                          <span className="text-gray-500">
                            {formatDateTime(chat.start_timestamp).date} {formatDateTime(chat.start_timestamp).time}
                          </span>
                          <span className="text-gray-500">
                            {chat.message_with_tool_calls?.length || 0} msgs
                          </span>
                          <span className="text-green-600 font-medium">
                            <CostDisplay chat={chat} />
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 sm:py-16">
              <MessageCircleIcon className="w-12 h-12 sm:w-16 sm:h-16 text-gray-400 mx-auto mb-3 sm:mb-4" />
              <h3 className="text-lg sm:text-xl font-medium text-gray-900 mb-2">No chat conversations found</h3>
              <p className="text-sm sm:text-base text-gray-600">No chat conversations have been started yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {filteredChatsCount > recordsPerPage && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 mt-4 sm:mt-6 lg:mt-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-3 sm:px-4 lg:px-6 py-3 sm:py-4">
          <div className="flex items-center text-xs sm:text-sm text-gray-700 dark:text-gray-300 text-center sm:text-left">
            <span>
              Showing {((currentPage - 1) * recordsPerPage) + 1} to {Math.min(currentPage * recordsPerPage, filteredChatsCount)} of {filteredChatsCount} chats
            </span>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2 flex-wrap justify-center">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
            >
              Previous
            </button>

            {/* Page Numbers */}
            <div className="flex items-center space-x-1">
              {(() => {
                const totalPages = Math.ceil(filteredChatsCount / recordsPerPage)
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
                      className={`px-3 py-2 text-sm font-medium rounded-lg ${i === currentPage
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
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, Math.ceil(filteredChatsCount / recordsPerPage)))}
              disabled={currentPage >= Math.ceil(filteredChatsCount / recordsPerPage)}
              className="px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] touch-manipulation"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Chat Detail Modal */}
      {selectedChat && isChatDetailModalOpen && (
        <ChatDetailModal
          chat={selectedChat}
          isOpen={isChatDetailModalOpen}
          onClose={() => {
            setIsChatDetailModalOpen(false)
            setSelectedChat(null)
          }}
          onEndChat={endChat}
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