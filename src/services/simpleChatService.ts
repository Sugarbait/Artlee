/**
 * 🔒 LOCKED CODE: SIMPLE CHAT SERVICE - PRODUCTION READY - NO MODIFICATIONS
 *
 * CRITICAL WARNING - PRODUCTION READY CODE
 * ABSOLUTELY NO MODIFICATIONS ALLOWED TO THIS SERVICE
 *
 * Simple Chat Service - Direct OpenAI Integration
 * A clean, straightforward implementation for ChatGPT integration
 *
 * This service is now working perfectly and is locked for production use.
 * Any modifications could result in:
 * - Breaking the OpenAI API authentication
 * - Environment detection issues (dev vs prod)
 * - Response format parsing errors
 * - Security vulnerabilities
 *
 * Last Verified Working: 2025-09-22
 * Status: Production Ready - LOCKED ✅
 * Development API: Direct OpenAI - Working ✅
 * Production API: Azure Function Proxy - Working ✅
 * Environment Detection: Working ✅
 * Response Formatting: Working ✅
 *
 * 🔒 END LOCKED CODE: SIMPLE CHAT SERVICE - PRODUCTION READY
 */

export interface SimpleChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SimpleChatResponse {
  success: boolean
  message?: string
  error?: string
}

class SimpleChatService {
  private readonly apiUrl: string

  constructor() {
    // Use Azure Function in production, direct OpenAI API in development
    const isDevelopment = import.meta.env.DEV

    if (isDevelopment) {
      this.apiUrl = 'https://api.openai.com/v1/chat/completions'
    } else {
      // Production uses Azure Function proxy
      const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin
      this.apiUrl = `${baseUrl}/api/chatgpt`
    }

    console.log('SimpleChatService initialized:', { isDevelopment, apiUrl: this.apiUrl })
  }

  async sendMessage(userMessage: string): Promise<SimpleChatResponse> {
    try {
      console.log('Sending message:', userMessage)

      const messages: SimpleChatMessage[] = [
        {
          role: 'system',
          content: 'You are a helpful assistant for the Phaeton AI CRM platform. Help users navigate and use platform features. Use natural language with elegant, well-structured sentences and numbered lists when appropriate. Do NOT use markdown formatting. Write in a conversational, professional tone.'
        },
        {
          role: 'user',
          content: userMessage
        }
      ]

      const isDevelopment = import.meta.env.DEV
      let response: Response

      if (isDevelopment) {
        // Development: Direct OpenAI API call
        const apiKey = import.meta.env.VITE_OPENAI_API_KEY || 'your-openai-api-key-here'

        response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: messages,
            max_tokens: 1000,
            temperature: 0.7
          })
        })
      } else {
        // Production: Azure Function proxy
        response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: messages,
            max_tokens: 1000
          })
        })
      }

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      const data = await response.json()

      if (isDevelopment) {
        // Development: Direct OpenAI response format
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return {
            success: true,
            message: data.choices[0].message.content.trim()
          }
        }
      } else {
        // Production: Azure Function response format
        if (data.success && data.message) {
          return {
            success: true,
            message: data.message
          }
        }
      }

      throw new Error('No response generated')

    } catch (error) {
      console.error('Chat service error:', error)
      return {
        success: false,
        error: 'Unable to connect to chat service. Please try again later.'
      }
    }
  }
}

export const simpleChatService = new SimpleChatService()