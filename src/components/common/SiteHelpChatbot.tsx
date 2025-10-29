/**
 * 🔒 LOCKED CODE: SITE HELP CHATBOT - PRODUCTION READY - NO MODIFICATIONS
 *
 * CRITICAL WARNING - PRODUCTION READY CODE
 * ABSOLUTELY NO MODIFICATIONS ALLOWED TO THIS COMPONENT
 *
 * Simple Site Help Chatbot - Fresh Start
 * Direct OpenAI integration with clean implementation
 *
 * This chatbot is now working perfectly and is locked for production use.
 * Any modifications could result in:
 * - Breaking the OpenAI API integration
 * - UI/UX issues with the chat interface
 * - Authentication or security problems
 * - Breaking the dual environment setup (dev/prod)
 *
 * Last Verified Working: 2025-09-22
 * Status: Production Ready - LOCKED ✅
 * OpenAI Integration: Verified Working ✅
 * Azure Function Proxy: Verified Working ✅
 * Dual Environment Support: Verified Working ✅
 *
 * 🔒 END LOCKED CODE: SITE HELP CHATBOT - PRODUCTION READY
 */

import React, { useState, useRef, useEffect } from 'react'
import {
  MessageCircleIcon,
  SendIcon,
  MinimizeIcon,
  XIcon,
  UserIcon
} from 'lucide-react'
import { simpleChatService } from '@/services/simpleChatService'

interface ChatMessage {
  id: string
  type: 'user' | 'bot'
  content: string
  timestamp: Date
}

interface SiteHelpChatbotProps {
  isVisible?: boolean
  onToggle?: () => void
}

export const SiteHelpChatbot: React.FC<SiteHelpChatbotProps> = ({
  isVisible = false,
  onToggle
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'bot',
      content: 'Hello! I\'m your ARTLEE Assistant. I can help you navigate the platform and answer questions about using the system. How can I help you today?',
      timestamp: new Date()
    }
  ])
  const [inputMessage, setInputMessage] = useState('')
  const [isMinimized, setIsMinimized] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    }

    const currentMessage = inputMessage
    setMessages(prev => [...prev, userMessage])
    setInputMessage('')
    setIsTyping(true)

    try {
      console.log('Sending message to ChatGPT:', currentMessage)
      const response = await simpleChatService.sendMessage(currentMessage)

      const botResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: response.success ? response.message! : 'Sorry, I\'m having trouble responding right now. Please try again.',
        timestamp: new Date()
      }

      setMessages(prev => [...prev, botResponse])
    } catch (error) {
      console.error('Error sending message:', error)

      const errorResponse: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        content: 'I apologize, but I\'m having trouble responding right now. Please try again in a moment.',
        timestamp: new Date()
      }

      setMessages(prev => [...prev, errorResponse])
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const clearChat = () => {
    setMessages([
      {
        id: '1',
        type: 'bot',
        content: 'Chat cleared! I\'m your ARTLEE Assistant. How can I help you today?',
        timestamp: new Date()
      }
    ])
  }

  if (!isVisible) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-4 right-4 bg-blue-600 text-white p-4 rounded-full shadow-lg hover:bg-blue-700 transition-all duration-200 z-50 group"
        title="Get Help"
      >
        <MessageCircleIcon className="w-6 h-6" />
        <div className="absolute -top-10 right-0 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
          Need help? Click to chat!
        </div>
      </button>
    )
  }

  return (
    <div className={`fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-xl z-50 transition-all duration-200 ${
      isMinimized ? 'w-80 h-12' : 'w-80 h-[500px]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-blue-50 rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">AI</span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">ARTLEE Assistant</h3>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title={isMinimized ? 'Maximize' : 'Minimize'}
          >
            <MinimizeIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
            title="Close chat"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <div className="h-80 overflow-y-auto p-3 space-y-3">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-2 ${message.type === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                  message.type === 'user' ? 'bg-blue-600' : 'bg-green-600'
                }`}>
                  {message.type === 'user' ? (
                    <UserIcon className="w-3 h-3 text-white" />
                  ) : (
                    <span className="text-white text-xs font-bold">AI</span>
                  )}
                </div>
                <div className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white ml-auto'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  <div className="whitespace-pre-line">{message.content}</div>
                  <div className={`text-xs mt-1 ${
                    message.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                  }`}>
                    {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-2">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">AI</span>
                </div>
                <div className="bg-gray-100 px-3 py-2 rounded-lg text-sm">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-gray-200">
            <div className="flex gap-2 mb-2">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything about ARTLEE..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                disabled={isTyping}
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isTyping}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <SendIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="flex justify-between items-center">
              <button
                onClick={clearChat}
                className="text-xs text-blue-600 hover:text-blue-700 transition-colors font-medium"
              >
                Clear chat
              </button>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-xs text-gray-500">Connected to AI</span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}