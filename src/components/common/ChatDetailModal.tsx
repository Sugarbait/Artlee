import React, { useState, useEffect } from 'react'
import {
  MessageCircleIcon,
  DownloadIcon,
  UserIcon,
  ClockIcon,
  CalendarIcon,
  DollarSignIcon,
  CheckCircleIcon,
  XIcon,
  BotIcon,
  TrendingUpIcon,
  PhoneIcon,
  AlertCircleIcon,
  PlayCircleIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  IdCardIcon
} from 'lucide-react'
import { Chat, chatService } from '@/services/chatService'
import { ChatNotes } from './ChatNotes'
import { twilioCostService } from '@/services'
import { patientIdService } from '@/services/patientIdService'
import { generalToast } from '@/services/generalToastService'
import jsPDF from 'jspdf'

interface ChatDetailModalProps {
  chat: Chat
  isOpen: boolean
  onClose: () => void
  onNotesChanged?: () => void
}

export const ChatDetailModal: React.FC<ChatDetailModalProps> = ({ chat, isOpen, onClose, onNotesChanged }) => {
  const [fullChat, setFullChat] = useState<Chat | null>(null)
  const [loadingFullTranscript, setLoadingFullTranscript] = useState(false)
  const [generatedPatientId, setGeneratedPatientId] = useState<string>('')
  const [patientRecord, setPatientRecord] = useState<any>(null)


  // Load full chat details when modal opens
  useEffect(() => {
    if (isOpen && chat?.chat_id) {
      loadFullChatDetails()
    }
  }, [isOpen, chat?.chat_id])

  // Generate Patient ID based on phone number when modal opens
  useEffect(() => {
    if (isOpen && chat) {
      // Use the same phone number extraction logic as the display (around line 441)
      const phoneNumber = chat.chat_analysis?.custom_analysis_data?.phone_number ||
                         chat.chat_analysis?.custom_analysis_data?.customer_phone_number ||
                         chat.chat_analysis?.custom_analysis_data?.phone ||
                         chat.chat_analysis?.custom_analysis_data?.contact_number ||
                         chat.metadata?.phone_number ||
                         chat.metadata?.customer_phone_number ||
                         chat.metadata?.from_phone_number ||
                         chat.metadata?.to_phone_number ||
                         chat.collected_dynamic_variables?.phone_number ||
                         chat.collected_dynamic_variables?.customer_phone_number

      console.log('ChatDetailModal: Phone number detection:', {
        chat_id: chat.chat_id,
        phoneNumber: '[PHONE-REDACTED - PROTECTED]',
        sources: {
          analysis_phone: '[REDACTED]',
          analysis_customer: '[REDACTED]',
          analysis_phone_short: '[REDACTED]',
          analysis_contact: '[REDACTED]',
          metadata_phone: '[REDACTED]',
          metadata_customer: '[REDACTED]',
          metadata_from: '[REDACTED]',
          metadata_to: '[REDACTED]',
          dynamic_phone: '[REDACTED]',
          dynamic_customer: '[REDACTED]',
          direct: '[REDACTED]'
        }
      })

      if (phoneNumber && phoneNumber !== 'Unknown Number') {
        const patientId = patientIdService.getPatientId(phoneNumber)
        const record = patientIdService.getPatientRecord(phoneNumber)
        console.log('ChatDetailModal: Generated Patient ID:', patientId, 'for phone: [REDACTED]')
        setGeneratedPatientId(patientId)
        setPatientRecord(record)
      } else {
        console.log('ChatDetailModal: No valid phone number found - setting fallback')
        setGeneratedPatientId('PT00000000')
        setPatientRecord(null)
      }
    }
  }, [isOpen, chat])

  const loadFullChatDetails = async () => {
    if (!chat?.chat_id) return

    setLoadingFullTranscript(true)

    try{
      console.log('Loading full chat details for:', chat.chat_id)
      const fullChatDetails = await chatService.getChatById(chat.chat_id)
      console.log('Full chat details loaded:', fullChatDetails)
      setFullChat(fullChatDetails)

      // Update the SMS page cache with accurate segment calculation from full data
      if ((window as any).updateSMSSegments && fullChatDetails) {
        console.log('🔄 Updating SMS page cache with modal data for chat:', chat.chat_id)
        const accurateSegments = (window as any).updateSMSSegments(chat.chat_id, fullChatDetails)
        console.log(`✅ SMS segments synchronized: ${accurateSegments} segments for chat ${chat.chat_id}`)
      }

    } catch (error) {
      console.error('Failed to load full chat details:', error)
      // Fallback to original chat data
      setFullChat(chat)
    } finally {
      setLoadingFullTranscript(false)
    }
  }


  const exportToPDF = () => {
    const doc = new jsPDF()
    let yPosition = 20
    const pageWidth = doc.internal.pageSize.width
    const margin = 20
    const lineHeight = 6
    const maxWidth = pageWidth - (margin * 2)

    // Helper function to add text with word wrapping
    const addWrappedText = (text: string, x: number, y: number, maxWidth: number, fontSize: number = 12) => {
      doc.setFontSize(fontSize)
      const lines = doc.splitTextToSize(text, maxWidth)
      doc.text(lines, x, y)
      return y + (lines.length * lineHeight)
    }

    // Helper function to check if we need a new page
    const checkNewPage = (yPos: number, requiredSpace: number = 20) => {
      if (yPos + requiredSpace > doc.internal.pageSize.height - 20) {
        doc.addPage()
        return 20
      }
      return yPos
    }

    try {
      // Title
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('Chat Analysis Report', margin, yPosition)
      yPosition += 15

      // Chat Information Header
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('Chat Information', margin, yPosition)
      yPosition += 10

      // Basic chat info
      doc.setFontSize(11)
      doc.setFont('helvetica', 'normal')
      const { date, time } = formatDateTime(displayChat.start_timestamp)

      yPosition = addWrappedText(`Chat ID: ${displayChat.chat_id}`, margin, yPosition, maxWidth, 11)
      yPosition = addWrappedText(`Date: ${date} at ${time}`, margin, yPosition, maxWidth, 11)
      yPosition = addWrappedText(`Caller: ${callerName}`, margin, yPosition, maxWidth, 11)
      yPosition = addWrappedText(`Phone: ${phoneNumber}`, margin, yPosition, maxWidth, 11)
      yPosition = addWrappedText(`Status: ${displayChat.chat_status}`, margin, yPosition, maxWidth, 11)
      yPosition = addWrappedText(`SMS Segments: ${calculateChatSMSSegments(displayChat)}`, margin, yPosition, maxWidth, 11)
      yPosition = addWrappedText(`Cost: $${(displayChat.chat_cost?.total_cost || 0).toFixed(3)}`, margin, yPosition, maxWidth, 11)
      yPosition += 10

      // Post Chat Analysis
      if (displayChat.chat_analysis) {
        yPosition = checkNewPage(yPosition, 30)

        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('Post Chat Analysis', margin, yPosition)
        yPosition += 10

        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')

        // Chat Success
        yPosition = addWrappedText(`Success Status: ${displayChat.chat_analysis.chat_successful ? 'Successful' : 'Unsuccessful'}`, margin, yPosition, maxWidth, 11)

        // User Sentiment
        if (displayChat.chat_analysis.user_sentiment) {
          yPosition = addWrappedText(`User Sentiment: ${displayChat.chat_analysis.user_sentiment}`, margin, yPosition, maxWidth, 11)
        }

        yPosition += 5

        // Chat Summary
        if (displayChat.chat_analysis.chat_summary) {
          yPosition = checkNewPage(yPosition, 30)

          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          doc.text('Conversation Summary:', margin, yPosition)
          yPosition += 8

          doc.setFont('helvetica', 'normal')
          yPosition = addWrappedText(displayChat.chat_analysis.chat_summary, margin, yPosition, maxWidth, 11)
          yPosition += 10
        }

        // Custom Analysis Data
        if (displayChat.chat_analysis.custom_analysis_data && Object.keys(displayChat.chat_analysis.custom_analysis_data).length > 0) {
          yPosition = checkNewPage(yPosition, 30)

          doc.setFontSize(12)
          doc.setFont('helvetica', 'bold')
          doc.text('Detailed Analysis:', margin, yPosition)
          yPosition += 8

          doc.setFont('helvetica', 'normal')
          Object.entries(displayChat.chat_analysis.custom_analysis_data).forEach(([key, value]) => {
            yPosition = checkNewPage(yPosition, 15)
            const formattedKey = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()
            const formattedValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)

            doc.setFont('helvetica', 'bold')
            yPosition = addWrappedText(`${formattedKey}:`, margin, yPosition, maxWidth, 11)
            doc.setFont('helvetica', 'normal')
            yPosition = addWrappedText(formattedValue, margin + 10, yPosition, maxWidth - 10, 11)
            yPosition += 3
          })
          yPosition += 5
        }
      }

      // Message Thread
      if (displayChat.message_with_tool_calls && displayChat.message_with_tool_calls.length > 0) {
        yPosition = checkNewPage(yPosition, 40)

        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('Message Thread', margin, yPosition)
        yPosition += 10

        displayChat.message_with_tool_calls.forEach((message, index) => {
          yPosition = checkNewPage(yPosition, 25)

          // Message header
          doc.setFontSize(11)
          doc.setFont('helvetica', 'bold')
          const sender = message.role === 'agent' ? 'AI Assistant' : 'Patient'
          yPosition = addWrappedText(`${sender}:`, margin, yPosition, maxWidth, 11)

          // Message content
          doc.setFont('helvetica', 'normal')
          yPosition = addWrappedText(message.content, margin + 10, yPosition, maxWidth - 10, 11)

          // Tool calls if any
          if (message.tool_calls && message.tool_calls.length > 0) {
            yPosition += 3
            doc.setFont('helvetica', 'italic')
            const toolCallsText = `Tool calls: ${message.tool_calls.map((tool: any) => tool.function?.name || tool.type).join(', ')}`
            yPosition = addWrappedText(toolCallsText, margin + 10, yPosition, maxWidth - 10, 10)
          }

          yPosition += 8
        })
      }

      // Dynamic Variables
      if (displayChat.collected_dynamic_variables && Object.keys(displayChat.collected_dynamic_variables).length > 0) {
        yPosition = checkNewPage(yPosition, 30)

        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('Collected Information', margin, yPosition)
        yPosition += 10

        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        Object.entries(displayChat.collected_dynamic_variables).forEach(([key, value]) => {
          yPosition = checkNewPage(yPosition, 15)
          const formattedKey = key.replace(/_/g, ' ')
          yPosition = addWrappedText(`${formattedKey}: ${String(value)}`, margin, yPosition, maxWidth, 11)
        })
        yPosition += 10
      }

      // Cost Breakdown
      if (displayChat.chat_cost && displayChat.chat_cost.product_costs) {
        yPosition = checkNewPage(yPosition, 30)

        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('Cost Breakdown', margin, yPosition)
        yPosition += 10

        doc.setFontSize(11)
        doc.setFont('helvetica', 'normal')
        Object.entries(displayChat.chat_cost.product_costs).forEach(([product, cost]) => {
          yPosition = checkNewPage(yPosition, 10)
          const formattedProduct = product.replace(/_/g, ' ')
          const costValue = typeof cost === 'number' ? cost : 0
          yPosition = addWrappedText(`${formattedProduct}: $${costValue.toFixed(3)}`, margin, yPosition, maxWidth, 11)
        })

        yPosition += 5
        doc.setFont('helvetica', 'bold')
        yPosition = addWrappedText(`Total SMS Cost: $${calculateChatSMSCost(displayChat).toFixed(3)}`, margin, yPosition, maxWidth, 11)
      }

      // Footer
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.text(`Generated by ARTLEE CRM - Page ${i} of ${pageCount}`, margin, doc.internal.pageSize.height - 10)
        doc.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth - margin - 60, doc.internal.pageSize.height - 10)
      }

      // Save the PDF
      const filename = `chat-analysis-${displayChat.chat_id}-${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(filename)

    } catch (error) {
      console.error('Error generating PDF:', error)
      generalToast.error('Failed to generate PDF. Please try again.', 'PDF Generation Failed')
    }
  }

  if (!isOpen) return null

  // Use full chat data if available, otherwise fall back to original
  const displayChat = fullChat || chat

  const formatDuration = (startTimestamp: number, endTimestamp?: number) => {
    if (!endTimestamp) return 'Ongoing'

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

  const formatDateTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString()
    }
  }

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-50 border-green-200'
      case 'negative': return 'text-red-600 bg-red-50 border-red-200'
      case 'neutral': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-700'
    }
  }

  const getChatStatusColor = (status: string) => {
    switch (status) {
      case 'ended': return 'text-green-600 bg-green-50'
      case 'ongoing': return 'text-blue-600 bg-blue-50'
      case 'error': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700'
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

  const calculateChatSMSCost = (chat: Chat): number => {
    try {
      // Use the full chat data if available (which includes full messages)
      const chatToUse = fullChat || chat

      let messages: any[] = []
      if (chatToUse.message_with_tool_calls && Array.isArray(chatToUse.message_with_tool_calls)) {
        messages = chatToUse.message_with_tool_calls
      } else if (chatToUse.transcript) {
        // If only transcript available, create a message for cost calculation
        messages = [{ content: chatToUse.transcript, role: 'user' }]
      }

      const cost = twilioCostService.getSMSCostCAD(messages)
      console.log('Modal SMS cost calculation:', {
        chatId: chat.chat_id,
        usingFullChat: !!fullChat,
        messageCount: messages.length,
        cost
      })
      return cost
    } catch (error) {
      console.error('Error calculating SMS cost in modal for chat:', chat.chat_id, error)
      return 0
    }
  }

  const calculateChatSMSSegments = (chat: Chat): number => {
    try {
      // Use the full chat data if available (which includes full messages)
      const chatToUse = fullChat || chat

      let messages: any[] = []
      if (chatToUse.message_with_tool_calls && Array.isArray(chatToUse.message_with_tool_calls)) {
        messages = chatToUse.message_with_tool_calls
      } else if (chatToUse.transcript) {
        // If only transcript available, create a message for segment calculation
        messages = [{ content: chatToUse.transcript, role: 'user' }]
      }

      const breakdown = twilioCostService.getDetailedSMSBreakdown(messages)
      console.log('Modal SMS segments calculation:', {
        chatId: chat.chat_id,
        usingFullChat: !!fullChat,
        messageCount: messages.length,
        segments: breakdown.segmentCount
      })
      return breakdown.segmentCount
    } catch (error) {
      console.error('Error calculating SMS segments in modal for chat:', chat.chat_id, error)
      return 0
    }
  }

  const { date, time } = formatDateTime(displayChat.start_timestamp)

  // Extract phone number - prioritize analysis data
  const phoneNumber = displayChat.chat_analysis?.custom_analysis_data?.phone_number ||
                     displayChat.chat_analysis?.custom_analysis_data?.customer_phone_number ||
                     displayChat.chat_analysis?.custom_analysis_data?.phone ||
                     displayChat.chat_analysis?.custom_analysis_data?.contact_number ||
                     displayChat.metadata?.phone_number ||
                     displayChat.metadata?.customer_phone_number ||
                     displayChat.metadata?.from_phone_number ||
                     displayChat.metadata?.to_phone_number ||
                     displayChat.collected_dynamic_variables?.phone_number ||
                     displayChat.collected_dynamic_variables?.customer_phone_number ||
                     'Unknown Number'

  // Extract caller name - prioritize analysis data
  const extractedName = displayChat.chat_analysis?.custom_analysis_data?.patient_name ||
                       displayChat.chat_analysis?.custom_analysis_data?.customer_name ||
                       displayChat.chat_analysis?.custom_analysis_data?.caller_name ||
                       displayChat.chat_analysis?.custom_analysis_data?.name ||
                       displayChat.metadata?.patient_name ||
                       displayChat.metadata?.customer_name ||
                       displayChat.metadata?.caller_name ||
                       displayChat.metadata?.name ||
                       displayChat.collected_dynamic_variables?.patient_name ||
                       displayChat.collected_dynamic_variables?.customer_name ||
                       displayChat.collected_dynamic_variables?.name ||
                       null

  const callerName = extractedName || 'Caller'
  const displayName = extractedName ? callerName : `Caller`

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              displayChat.chat_status === 'ongoing' ? 'bg-blue-100' :
              displayChat.chat_status === 'ended' ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {displayChat.chat_status === 'ongoing' ? (
                <BotIcon className="w-6 h-6 text-blue-600" />
              ) : displayChat.chat_status === 'ended' ? (
                <MessageCircleIcon className="w-6 h-6 text-green-600" />
              ) : (
                <AlertCircleIcon className="w-6 h-6 text-red-600" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {callerName}
              </h2>
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                <PhoneIcon className="w-4 h-4 inline mr-1" />
                {phoneNumber}
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>Chat ID: {displayChat.chat_id}</span>
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-4 h-4" />
                  {date} at {time}
                </span>
                {loadingFullTranscript && (
                  <span className="flex items-center gap-1 text-blue-600">
                    <RefreshCwIcon className="w-3 h-3 animate-spin" />
                    Loading full transcript...
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadFullChatDetails}
              disabled={loadingFullTranscript}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-700 transition-colors disabled:opacity-50"
              title="Refresh full transcript"
            >
              <RefreshCwIcon className={`w-4 h-4 ${loadingFullTranscript ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <XIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquareIcon className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">SMS Segments</span>
                </div>
                <div className="text-2xl font-bold text-blue-600">
                  {calculateChatSMSSegments(displayChat)}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUpIcon className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Status</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getChatStatusColor(displayChat.chat_status)}`}>
                    {getChatStatusIcon(displayChat.chat_status)}
                    {displayChat.chat_status}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquareIcon className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Messages</span>
                </div>
                <div className="text-2xl font-bold text-purple-600">
                  {displayChat.message_with_tool_calls?.length || 0}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSignIcon className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">SMS Cost</span>
                </div>
                <div className="text-2xl font-bold text-orange-600">
                  ${calculateChatSMSCost(displayChat).toFixed(3)}
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Chat Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Caller Name</label>
                  <p className="text-gray-900 dark:text-gray-100">{callerName}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
                  <p className="text-gray-900 dark:text-gray-100">{phoneNumber}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Patient ID</label>
                  <div className="flex items-center gap-2">
                    <IdCardIcon className="w-4 h-4 text-blue-600" />
                    <p className="text-gray-900 dark:text-gray-100 font-mono font-semibold">
                      {generatedPatientId || 'PT00000000'}
                    </p>
                    {patientRecord && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">(Phone-based)</span>
                    )}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Agent ID</label>
                  <p className="text-gray-900 dark:text-gray-100">{displayChat.agent_id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Success Status</label>
                  <p className={`font-medium ${
                    displayChat.chat_analysis?.chat_successful ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {displayChat.chat_analysis?.chat_successful ? 'Successful' : 'Unsuccessful'}
                  </p>
                </div>
              </div>
            </div>


            {/* Post Chat Analysis */}
            {displayChat.chat_analysis && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Post Chat Analysis</h3>
                <div className="space-y-4">

                  {/* Analysis Summary Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Chat Success Status */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Chat Success</span>
                      </div>
                      <div className={`text-lg font-semibold ${
                        displayChat.chat_analysis.chat_successful ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {displayChat.chat_analysis.chat_successful ? 'Successful' : 'Unsuccessful'}
                      </div>
                    </div>

                    {/* User Sentiment */}
                    {displayChat.chat_analysis.user_sentiment && (
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUpIcon className="w-5 h-5 text-purple-600" />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">User Sentiment</span>
                        </div>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getSentimentColor(displayChat.chat_analysis.user_sentiment)}`}>
                          {displayChat.chat_analysis.user_sentiment}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Chat Summary */}
                  {displayChat.chat_analysis.chat_summary && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                      <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-2">Conversation Summary</h4>
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{displayChat.chat_analysis.chat_summary}</p>
                    </div>
                  )}

                  {/* Custom Analysis Data */}
                  {displayChat.chat_analysis.custom_analysis_data && Object.keys(displayChat.chat_analysis.custom_analysis_data).length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border">
                      <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-3">Detailed Analysis</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {Object.entries(displayChat.chat_analysis.custom_analysis_data).map(([key, value]) => (
                          <div key={key} className="border-l-4 border-blue-500 pl-3">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                              {key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim()}
                            </label>
                            <p className="text-gray-900 dark:text-gray-100 text-sm mt-1">
                              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Dynamic Variables */}
            {(displayChat.collected_dynamic_variables && Object.keys(displayChat.collected_dynamic_variables).length > 0) && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Collected Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(displayChat.collected_dynamic_variables).map(([key, value]) => (
                    <div key={key}>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                        {key.replace(/_/g, ' ')}
                      </label>
                      <p className="text-gray-900 dark:text-gray-100">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Message Thread with Tabs */}
            {displayChat.message_with_tool_calls && displayChat.message_with_tool_calls.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Messages</h3>

                <div className="bg-white dark:bg-gray-800 rounded border p-4 max-h-96 overflow-y-auto">
                  {(() => {
                    // Enhanced SMS message parsing for timestamped format
                    const parseSMSMessages = (messages: any[]) => {
                      const parsedMessages = []

                      for (const message of messages) {
                        let content = message.content || ''

                        // Check if content has timestamp format like "11:26:13, 09/23"
                        const timestampMatch = content.match(/^(.+?)\s+(\d{1,2}:\d{2}:\d{2},\s*\d{1,2}\/\d{1,2})[\s\n]+(.*)/s)

                        if (timestampMatch) {
                          // Content with embedded timestamp and details
                          const [, userDetails, timestamp, actualContent] = timestampMatch

                          // Check if this is user details (like "User: Melissa Ann Muir...")
                          const userDetailsMatch = userDetails.match(/^User:\s*(.+)/)

                          parsedMessages.push({
                            ...message,
                            originalContent: content,
                            userDetails: userDetailsMatch ? userDetailsMatch[1] : null,
                            timestamp: timestamp,
                            content: actualContent.trim(),
                            hasTimestamp: true
                          })
                        } else {
                          // Regular content format
                          parsedMessages.push({
                            ...message,
                            originalContent: content,
                            userDetails: null,
                            timestamp: null,
                            hasTimestamp: false
                          })
                        }
                      }

                      return parsedMessages
                    }

                    const parsedMessages = parseSMSMessages(displayChat.message_with_tool_calls)

                    return (
                      <div className="space-y-4">
                        {parsedMessages.map((message, index) => {
                          // Handle Tool Invocation messages
                          if (message.content && (message.content.includes('Tool Invocation:') || message.tool_calls?.length > 0)) {
                            return (
                              <div key={message.message_id || index} className="space-y-2">
                                {message.timestamp && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded inline-block">
                                    {message.timestamp}
                                  </div>
                                )}
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-xs font-medium text-purple-700 mb-1">🔧 Tool Invocation</div>
                                    <div className="bg-purple-50 border border-purple-200 rounded px-3 py-2">
                                      <span className="text-purple-800 text-sm">
                                        {message.tool_calls?.map((tool: any) => tool.function?.name || tool.type).join(', ') ||
                                         message.content.replace(/Tool Invocation:\s*/, '')}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          }

                          // Handle User details message (first message with user info)
                          if (message.userDetails) {
                            return (
                              <div key={message.message_id || index} className="space-y-2">
                                {message.timestamp && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded inline-block">
                                    {message.timestamp}
                                  </div>
                                )}
                                <div className="flex items-start gap-3">
                                  <div className="flex-shrink-0 w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                    <UserIcon className="w-4 h-4 text-green-600" />
                                  </div>
                                  <div className="flex-1">
                                    <div className="text-xs font-medium text-green-700 mb-1">Patient Details</div>
                                    <div className="bg-green-50 border border-green-200 rounded px-3 py-2 mb-2">
                                      <div className="text-green-800 text-sm font-mono whitespace-pre-line">
                                        {message.userDetails}
                                      </div>
                                    </div>
                                    {message.content && (
                                      <div>
                                        <div className="text-xs font-medium text-blue-700 mb-1">Agent Response</div>
                                        <p className="text-gray-800 dark:text-gray-200 leading-relaxed">{message.content}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          }

                          // Regular message with or without timestamp
                          const isAgent = message.role === 'agent'
                          const bgColor = isAgent ? 'bg-blue-100' : 'bg-green-100'
                          const iconColor = isAgent ? 'text-blue-600' : 'text-green-600'
                          const textColor = isAgent ? 'text-blue-700' : 'text-green-700'
                          const label = isAgent ? 'Agent' : 'User'

                          return (
                            <div key={message.message_id || index} className="space-y-2">
                              {message.timestamp && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded inline-block">
                                  {message.timestamp}
                                </div>
                              )}
                              <div className="flex items-start gap-3">
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${bgColor}`}>
                                  {isAgent ?
                                    <BotIcon className={`w-4 h-4 ${iconColor}`} /> :
                                    <UserIcon className={`w-4 h-4 ${iconColor}`} />
                                  }
                                </div>
                                <div className="flex-1">
                                  <div className={`text-xs font-medium mb-1 ${textColor}`}>
                                    {label}
                                  </div>
                                  <p className="text-gray-800 dark:text-gray-200 leading-relaxed">{message.content}</p>
                                  {message.tool_calls && message.tool_calls.length > 0 && (
                                    <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded text-xs">
                                      <span className="font-medium text-purple-700">Tool calls:</span>
                                      {message.tool_calls.map((tool: any, toolIndex: number) => (
                                        <div key={toolIndex} className="ml-2 text-purple-800">
                                          🔧 {tool.function?.name || tool.type}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* Chat Notes - Now appears after Message Thread for better workflow */}
            <ChatNotes chatId={chat.chat_id} onNotesChanged={onNotesChanged} />

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={exportToPDF}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-700 transition-colors"
              >
                <DownloadIcon className="w-4 h-4" />
                Export Chat
              </button>
              <div className="ml-auto flex items-center gap-2">
                <CheckCircleIcon className="w-4 h-4 text-green-500" />
                <span className="text-sm text-green-600 font-medium">Compliant</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}