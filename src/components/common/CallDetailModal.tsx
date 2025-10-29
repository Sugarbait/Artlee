import React, { useState, useEffect } from 'react'
import {
  DownloadIcon,
  ClockIcon,
  CalendarIcon,
  DollarSignIcon,
  CheckCircleIcon,
  XIcon,
  PhoneCallIcon,
  TrendingUpIcon,
  IdCardIcon
} from 'lucide-react'
import { CallNotes } from './CallNotes'
import { patientIdService } from '@/services/patientIdService'
import type { RetellCall } from '@/services/retellService'

interface CallDetailModalProps {
  call: RetellCall & {
    patient_id?: string
    call_length_seconds?: number
    sentiment_analysis?: {
      overall_sentiment: 'positive' | 'negative' | 'neutral'
      confidence_score: number
    }
    cost?: number
    phone_number?: string
    from_number?: string
    to_number?: string
    call_summary?: string
  }
  isOpen: boolean
  onClose: () => void
  onNotesChanged?: () => void
}

export const CallDetailModal: React.FC<CallDetailModalProps> = ({ call, isOpen, onClose, onNotesChanged }) => {
  const [generatedPatientId, setGeneratedPatientId] = useState<string>('')
  const [patientRecord, setPatientRecord] = useState<any>(null)

  // Generate Patient ID based on phone number when modal opens
  useEffect(() => {
    if (isOpen && call) {
      // Extract phone number from various possible fields
      const phoneNumber = call.phone_number || call.from_number || call.to_number

      if (phoneNumber) {
        const patientId = patientIdService.getPatientId(phoneNumber)
        const record = patientIdService.getPatientRecord(phoneNumber)
        setGeneratedPatientId(patientId)
        setPatientRecord(record)
      } else {
        setGeneratedPatientId('PT00000000')
        setPatientRecord(null)
      }
    }
  }, [isOpen, call])

  if (!isOpen) return null

  const formatDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '0:00'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50'
      case 'failed': return 'text-red-600 bg-red-50'
      case 'active': return 'text-blue-600 bg-blue-50'
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700'
    }
  }

  const { date, time } = formatDateTime(call.start_timestamp)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <PhoneCallIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {call.metadata?.patient_name || 'Caller'}
              </h2>
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span>ID: {generatedPatientId || 'PT00000000'}</span>
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-4 h-4" />
                  {date} at {time}
                </span>
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
                  <ClockIcon className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Duration</span>
                </div>
                <div className="text-2xl font-bold text-blue-600">
                  {formatDuration(call.call_length_seconds)}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUpIcon className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Status</span>
                </div>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(call.call_status)}`}>
                  {call.call_status}
                </span>
              </div>

              {call.cost && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSignIcon className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Cost</span>
                  </div>
                  <div className="text-2xl font-bold text-purple-600">
                    ${call.cost.toFixed(3)}
                  </div>
                </div>
              )}
            </div>

            {/* Contact Information */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Patient Name</label>
                  <p className="text-gray-900 dark:text-gray-100">{call.metadata?.patient_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Phone Number</label>
                  <p className="text-gray-900 dark:text-gray-100">{call.from_number || call.to_number || call.phone_number || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Call Type</label>
                  <p className="text-gray-900 dark:text-gray-100">{call.metadata?.call_type || call.call_type || 'N/A'}</p>
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
              </div>
            </div>

            {/* Sentiment Analysis */}
            {call.sentiment_analysis && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Sentiment Analysis</h3>
                <div className="flex items-center gap-4">
                  <span className={`px-4 py-2 rounded-full text-sm font-medium border ${getSentimentColor(call.sentiment_analysis.overall_sentiment)}`}>
                    {call.sentiment_analysis.overall_sentiment}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Confidence: {Math.round(call.sentiment_analysis.confidence_score * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* Call Summary */}
            {call.call_summary && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Call Summary</h3>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{call.call_summary}</p>
              </div>
            )}

            {/* Post-Call Analysis */}
            {call.call_analysis && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Post-Call Analysis</h3>

                {/* Call Summary (full width if present) */}
                {call.call_analysis.call_summary && (
                  <div className="mb-4">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Call Summary</label>
                    <p className="text-gray-900 dark:text-gray-100 mt-1">{call.call_analysis.call_summary}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {call.call_analysis.in_voicemail !== undefined && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Voicemail Detection</label>
                      <p className={`text-gray-900 dark:text-gray-100 font-medium ${call.call_analysis.in_voicemail ? 'text-yellow-600' : 'text-green-600'}`}>
                        {call.call_analysis.in_voicemail ? 'Reached Voicemail' : 'Live Answer'}
                      </p>
                    </div>
                  )}
                  {call.call_analysis.call_successful !== undefined && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Call Successful</label>
                      <p className={`text-gray-900 dark:text-gray-100 font-medium ${call.call_analysis.call_successful ? 'text-green-600' : 'text-red-600'}`}>
                        {call.call_analysis.call_successful ? 'Yes' : 'No'}
                      </p>
                    </div>
                  )}
                  {call.call_analysis.user_sentiment && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">User Sentiment</label>
                      <p className={`text-gray-900 dark:text-gray-100 font-medium ${
                        call.call_analysis.user_sentiment.toLowerCase() === 'positive' ? 'text-green-600' :
                        call.call_analysis.user_sentiment.toLowerCase() === 'negative' ? 'text-red-600' :
                        call.call_analysis.user_sentiment.toLowerCase() === 'neutral' ? 'text-blue-600' :
                        'text-gray-600'
                      }`}>
                        {call.call_analysis.user_sentiment}
                      </p>
                    </div>
                  )}
                </div>

                {/* Custom Analysis Data */}
                {call.call_analysis.custom_analysis_data && Object.keys(call.call_analysis.custom_analysis_data).length > 0 && (
                  <div className="mt-4">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Custom Analysis Data</label>
                    <div className="bg-white dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-600 p-3 space-y-2">
                      {Object.entries(call.call_analysis.custom_analysis_data).map(([key, value]) => (
                        <div key={key} className="flex justify-between items-start">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                            {key.replace(/_/g, ' ')}:
                          </span>
                          <span className="text-sm text-gray-900 dark:text-gray-100 ml-2 text-right">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Full Transcript */}
            {call.transcript && (
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Full Transcript</h3>
                <div className="bg-white dark:bg-gray-800 rounded border p-4 max-h-96 overflow-y-auto">
                  {(() => {
                    // Enhanced transcript parsing for timestamped conversations with tool calls
                    const transcript = call.transcript.trim()

                    // Check if transcript is truncated and handle accordingly
                    if (transcript.includes('…')) {
                      console.log('⚠️ Transcript appears truncated, displaying available content')
                    }

                    // Check for different transcript formats
                    const hasTimestamps = /\d+:\d+\s*$/m.test(transcript)
                    const hasKeypadInputs = /User pressed keypad/i.test(transcript)
                    const hasVoiceConversation = /Agent:.*\n\n\d+:\d+\n\nUser:/i.test(transcript) ||
                                               /Agent:.*\n\d+:\d+\n\nAgent:/i.test(transcript)

                    // Check for multiple types of speaker patterns that Retell AI might use
                    const hasStructuredFormat = /\b(AI|Agent|Assistant|Patient|User|Human|Caller|Customer|Client|Bot|System):\s/i.test(transcript) ||
                                              /^(AI|Agent|Assistant|Patient|User|Human|Caller|Customer|Client|Bot|System)\s*:/im.test(transcript) ||
                                              /\[(AI|Agent|Assistant|Patient|User|Human|Caller|Customer|Client|Bot|System)\]/i.test(transcript)

                    if (hasTimestamps || hasStructuredFormat) {
                      // Parse different transcript formats
                      const parseTranscript = (text: string) => {
                        const entries = []

                        if (hasVoiceConversation && !hasKeypadInputs) {
                          // Voice conversation format: "Agent: content\n\n0:00\n\nUser: content"
                          return parseVoiceTranscript(text)
                        } else if (hasKeypadInputs) {
                          // Keypad/dial tone format
                          return parseKeypadTranscript(text)
                        } else {
                          // Generic structured format
                          return parseGenericTranscript(text)
                        }
                      }

                      const parseVoiceTranscript = (text: string) => {
                        const entries = []
                        // Split by double newlines to get message blocks
                        const blocks = text.split(/\n\n+/).filter(block => block.trim())
                        let currentTimestamp = ''

                        for (let i = 0; i < blocks.length; i++) {
                          const block = blocks[i].trim()

                          // Check if this is a standalone timestamp
                          const timestampMatch = block.match(/^(\d+:\d+)$/)
                          if (timestampMatch) {
                            currentTimestamp = timestampMatch[1]
                            continue
                          }

                          // Check for Tool Invocation/Result
                          if (block.match(/^Tool (Invocation|Result)/)) {
                            const type = block.includes('Invocation') ? 'tool_call' : 'tool_result'
                            const content = block.replace(/^Tool (Invocation|Result):\s*/, '')
                            entries.push({
                              speaker: block.match(/^Tool (Invocation|Result)/)?.[0] || block,
                              content: content,
                              timestamp: currentTimestamp,
                              type: type
                            })
                            continue
                          }

                          // Check for speaker patterns (Agent: or User:)
                          const speakerMatch = block.match(/^(Agent|User):\s*(.*)/s)
                          if (speakerMatch) {
                            const [, speaker, content] = speakerMatch
                            entries.push({
                              speaker: speaker,
                              content: content.trim(),
                              timestamp: currentTimestamp,
                              type: 'message'
                            })
                            continue
                          }

                          // If no speaker pattern, might be continuation of previous message
                          if (entries.length > 0 && !block.match(/^\d+:\d+$/)) {
                            const lastEntry = entries[entries.length - 1]
                            if (lastEntry.type === 'message') {
                              lastEntry.content += (lastEntry.content ? ' ' : '') + block
                            }
                          }
                        }

                        return entries
                      }

                      const parseKeypadTranscript = (text: string) => {
                        const entries = []
                        let currentEntry = { speaker: '', content: '', timestamp: '', type: 'message' }
                        const lines = text.split('\n')

                        for (let i = 0; i < lines.length; i++) {
                          const line = lines[i].trim()

                          // Check for timestamp (e.g., "0:00", "0:28", etc.)
                          const timestampMatch = line.match(/^(\d+:\d+)$/)
                          if (timestampMatch) {
                            // If we have a current entry, save it
                            if (currentEntry.content || currentEntry.speaker) {
                              entries.push({...currentEntry})
                            }
                            currentEntry = { speaker: '', content: '', timestamp: timestampMatch[1], type: 'message' }
                            continue
                          }

                          // Check for Tool Invocation/Result
                          if (line.match(/^Tool (Invocation|Result)/)) {
                            if (currentEntry.content || currentEntry.speaker) {
                              entries.push({...currentEntry})
                            }
                            currentEntry = {
                              speaker: line,
                              content: '',
                              timestamp: currentEntry.timestamp,
                              type: line.includes('Invocation') ? 'tool_call' : 'tool_result'
                            }
                            continue
                          }

                          // Check for speaker patterns
                          const speakerMatch = line.match(/^(Agent|User pressed keypad|Tool Invocation|Tool Result):\s*(.*)$/i)
                          if (speakerMatch) {
                            if (currentEntry.content || currentEntry.speaker) {
                              entries.push({...currentEntry})
                            }

                            const speaker = speakerMatch[1]
                            const content = speakerMatch[2]

                            currentEntry = {
                              speaker,
                              content,
                              timestamp: currentEntry.timestamp,
                              type: speaker.includes('keypad') ? 'keypad' :
                                   speaker.includes('Tool') ? 'tool_call' : 'message'
                            }
                            continue
                          }

                          // Continuation of current content
                          if (line && currentEntry.speaker) {
                            currentEntry.content += (currentEntry.content ? ' ' : '') + line
                          } else if (line && !currentEntry.speaker) {
                            // Line without clear speaker, probably continuation
                            currentEntry.content += (currentEntry.content ? ' ' : '') + line
                            currentEntry.speaker = currentEntry.speaker || 'Agent'
                          }
                        }

                        // Add final entry
                        if (currentEntry.content || currentEntry.speaker) {
                          entries.push(currentEntry)
                        }

                        return entries
                      }

                      const parseGenericTranscript = (text: string) => {
                        // Fallback to basic parsing
                        const lines = text.split('\n').filter(line => line.trim())
                        const entries = []

                        for (const line of lines) {
                          const speakerMatch = line.match(/^(Agent|User|AI|Assistant):\s*(.*)/i)
                          if (speakerMatch) {
                            entries.push({
                              speaker: speakerMatch[1],
                              content: speakerMatch[2],
                              timestamp: '',
                              type: 'message'
                            })
                          }
                        }

                        return entries
                      }

                      const parsedEntries = parseTranscript(transcript)

                      return (
                        <div className="space-y-4">
                          {parsedEntries.map((entry, index) => {
                            const { speaker, content, timestamp, type } = entry

                            // Handle different types of entries
                            if (type === 'keypad') {
                              const keypadInput = content.match(/([0-9#*]+)/)?.[1] || content
                              return (
                                <div key={index} className="space-y-2">
                                  {timestamp && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded inline-block">
                                      {timestamp}
                                    </div>
                                  )}
                                  <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                                    </div>
                                    <div className="flex-1">
                                      <div className="text-xs font-medium text-orange-700 mb-1">📞 Keypad Input</div>
                                      <div className="bg-orange-50 border border-orange-200 rounded px-3 py-1 inline-block">
                                        <span className="text-orange-800 font-mono text-sm font-bold">{keypadInput}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            }

                            if (type === 'tool_call') {
                              return (
                                <div key={index} className="space-y-2">
                                  {timestamp && (
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded inline-block">
                                      {timestamp}
                                    </div>
                                  )}
                                  <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                                      <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                                    </div>
                                    <div className="flex-1">
                                      <div className="text-xs font-medium text-purple-700 mb-1">🔧 {speaker}</div>
                                      <div className="bg-purple-50 border border-purple-200 rounded px-3 py-2">
                                        <span className="text-purple-800 text-sm">{content}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            }

                            if (type === 'tool_result') {
                              return (
                                <div key={index} className="flex items-start gap-3 ml-11">
                                  <div className="flex-1">
                                    <div className="text-xs font-medium text-purple-600 mb-1">📋 Tool Result</div>
                                    <div className="bg-purple-25 border border-purple-100 rounded px-3 py-2">
                                      <span className="text-purple-700 text-sm">{content || 'Tool executed successfully'}</span>
                                    </div>
                                  </div>
                                </div>
                              )
                            }

                            // Regular message
                            const isAgent = speaker.toLowerCase().includes('agent') || !speaker.toLowerCase().includes('user')
                            const bgColor = isAgent ? 'bg-blue-100' : 'bg-green-100'
                            const dotColor = isAgent ? 'bg-blue-500' : 'bg-green-500'
                            const textColor = isAgent ? 'text-blue-700' : 'text-green-700'
                            const label = isAgent ? 'Agent' : 'Caller'

                            return (
                              <div key={index} className="space-y-2">
                                {timestamp && (
                                  <div className="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded inline-block">
                                    {timestamp}
                                  </div>
                                )}
                                <div className="flex items-start gap-3">
                                  <div className={`flex-shrink-0 w-8 h-8 ${bgColor} rounded-full flex items-center justify-center`}>
                                    <div className={`w-3 h-3 ${dotColor} rounded-full`}></div>
                                  </div>
                                  <div className="flex-1">
                                    <div className={`text-xs font-medium ${textColor} mb-1`}>{label}</div>
                                    <p className="text-gray-800 dark:text-gray-200 leading-relaxed">{content}</p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    } else {
                      // No structured format - display as single continuous conversation
                      // Look for clear speaker changes only with very obvious patterns
                      const lines = transcript.split('\n').filter(line => line.trim().length > 0)

                      // If multiple lines exist and they look like natural conversation turns
                      if (lines.length > 1 && lines.some(line => line.length > 100)) {
                        // Only split if we find very clear conversation markers
                        const conversationParts = []
                        let currentPart = ''

                        for (const line of lines) {
                          // Look for clear conversation breaks (greeting, thanks, questions)
                          const isConversationBreak = /^(Hello|Hi|Thank you|Thanks|Yes|No|Okay|Sure)\b/i.test(line.trim()) ||
                                                    /^(How|What|When|Where|Why|Can|Could|Would|Are|Do|Did)\b/i.test(line.trim())

                          if (isConversationBreak && currentPart.length > 50) {
                            conversationParts.push(currentPart.trim())
                            currentPart = line
                          } else {
                            currentPart += (currentPart ? ' ' : '') + line
                          }
                        }

                        if (currentPart) {
                          conversationParts.push(currentPart.trim())
                        }

                        // Only use conversation parts if we have 2-4 clear segments
                        if (conversationParts.length >= 2 && conversationParts.length <= 4) {
                          return (
                            <div className="space-y-3">
                              {conversationParts.map((part, index) => {
                                const isAI = index % 2 === 0
                                const bgColor = isAI ? 'bg-blue-100' : 'bg-green-100'
                                const dotColor = isAI ? 'bg-blue-500' : 'bg-green-500'
                                const textColor = isAI ? 'text-blue-700' : 'text-green-700'
                                const label = isAI ? 'AI Assistant' : 'Caller'

                                return (
                                  <div key={index} className="flex items-start gap-3">
                                    <div className={`flex-shrink-0 w-8 h-8 ${bgColor} rounded-full flex items-center justify-center`}>
                                      <div className={`w-3 h-3 ${dotColor} rounded-full`}></div>
                                    </div>
                                    <div className="flex-1">
                                      <div className={`text-xs font-medium ${textColor} mb-1`}>{label}</div>
                                      <p className="text-gray-800 dark:text-gray-200 leading-relaxed">{part}</p>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        }
                      }

                      // Default: display as single continuous conversation
                      return (
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                            </div>
                            <div className="flex-1">
                              <div className="text-xs font-medium text-blue-700 mb-1">AI Assistant</div>
                              <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{transcript}</p>
                            </div>
                          </div>
                        </div>
                      )
                    }
                  })()}
                </div>
              </div>
            )}

            {/* Call Notes */}
            <CallNotes
              callId={call.call_id}
              onNotesChanged={() => {
                console.log('CallDetailModal: onNotesChanged called for callId:', call.call_id)
                onNotesChanged?.()
              }}
            />

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 dark:bg-gray-700 transition-colors">
                <DownloadIcon className="w-4 h-4" />
                Download
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