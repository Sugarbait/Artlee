import React, { useState, useEffect } from 'react'
import { X, Phone, MessageSquare, Bell, Sparkles, Zap } from 'lucide-react'

export interface ToastNotificationData {
  id: string
  type: 'call' | 'sms'
  title: string
  timestamp: Date
  recordId: string
}

interface ToastNotificationProps {
  notification: ToastNotificationData
  onDismiss: (id: string) => void
  onClose: (id: string) => void
  soundEnabled?: boolean
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({
  notification,
  onDismiss,
  onClose,
  soundEnabled = true
}) => {
  const [isVisible, setIsVisible] = useState(true)
  const [isAnimating, setIsAnimating] = useState(false)
  const [isEntering, setIsEntering] = useState(true)

  // Smooth entrance animation
  useEffect(() => {
    setTimeout(() => setIsEntering(false), 50)
  }, [])

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss()
    }, 5000)

    return () => clearTimeout(timer)
  }, [])

  // Play gentle notification sound
  useEffect(() => {
    if (soundEnabled && isVisible) {
      playNotificationSound()
    }
  }, [soundEnabled, isVisible])

  const playNotificationSound = () => {
    try {
      // Create a gentle notification sound using Web Audio API
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // Gentle bell-like sound: 800Hz for 0.1s then 600Hz for 0.2s
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(600, audioContext.currentTime + 0.1)

      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.3)
    } catch (error) {
      // Fallback: no sound if Web Audio API not available
      console.log('Audio notification not available')
    }
  }

  const handleDismiss = () => {
    setIsAnimating(true)
    setTimeout(() => {
      setIsVisible(false)
      onDismiss(notification.id)
    }, 300)
  }

  const handleClick = () => {
    onClose(notification.id)
    handleDismiss()
  }

  if (!isVisible) return null

  const getIcon = () => {
    const iconClass = "w-6 h-6 animate-[bounce_0.5s_ease-in-out_2]"
    switch (notification.type) {
      case 'call':
        return <Phone className={`${iconClass} text-blue-100`} />
      case 'sms':
        return <MessageSquare className={`${iconClass} text-green-100`} />
      default:
        return <Bell className={`${iconClass} text-purple-100`} />
    }
  }

  const getGradientClass = () => {
    switch (notification.type) {
      case 'call':
        return 'from-blue-500 via-indigo-500 to-purple-500'
      case 'sms':
        return 'from-emerald-500 via-green-500 to-teal-500'
      default:
        return 'from-purple-500 via-pink-500 to-rose-500'
    }
  }

  const getGlowClass = () => {
    switch (notification.type) {
      case 'call':
        return 'shadow-blue-500/50'
      case 'sms':
        return 'shadow-green-500/50'
      default:
        return 'shadow-purple-500/50'
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div
      className={`
        relative backdrop-blur-xl bg-gradient-to-br ${getGradientClass()}
        rounded-2xl shadow-2xl ${getGlowClass()} p-[1px] mb-3
        cursor-pointer transition-all duration-300 ease-out
        ${isEntering ? 'opacity-0 transform translate-x-full scale-95' : 'opacity-100 transform translate-x-0 scale-100'}
        ${isAnimating ? 'opacity-0 transform translate-x-full scale-95' : ''}
        hover:scale-105 hover:shadow-3xl
      `}
      style={{
        minWidth: '300px',
        maxWidth: '360px',
        animation: 'shimmer 3s infinite, float 3s ease-in-out infinite'
      }}
      onClick={handleClick}
    >
      {/* Inner container with glass morphism effect */}
      <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl p-4">
        {/* Sparkle decorations */}
        <div className="absolute -top-1 -right-1">
          <Sparkles className="w-4 h-4 text-yellow-400 animate-pulse" />
        </div>
        <div className="absolute -bottom-1 -left-1">
          <Zap className="w-4 h-4 text-orange-400 animate-ping" style={{ animationDuration: '2s' }} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Animated icon with gradient background */}
            <div className={`
              flex-shrink-0 p-2.5 rounded-xl bg-gradient-to-br ${getGradientClass()}
              shadow-lg transform transition-transform hover:rotate-12
            `}>
              {getIcon()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold bg-gradient-to-r from-gray-900 to-gray-700
                            dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-0.5">
                {notification.title}
              </div>
              <div className={`
                text-xs font-semibold bg-gradient-to-r ${
                  notification.type === 'call'
                    ? 'from-blue-600 to-indigo-600'
                    : 'from-green-600 to-emerald-600'
                } bg-clip-text text-transparent
              `}>
                {formatTime(notification.timestamp)}
              </div>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDismiss()
            }}
            className={`
              ml-2 p-1.5 rounded-lg bg-gradient-to-br ${getGradientClass()}
              text-white hover:scale-110 transition-all duration-200
              shadow-md hover:shadow-lg flex-shrink-0
            `}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Enhanced progress bar with gradient */}
        <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
          <div
            className={`
              ${notification.type === 'call'
                ? 'bg-gradient-to-r from-blue-400 to-indigo-400'
                : 'bg-gradient-to-r from-green-400 to-emerald-400'}
              h-1.5 rounded-full shadow-lg transition-all ease-linear
            `}
            style={{
              animation: 'shrink 5s linear forwards, pulse 1s ease-in-out infinite'
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
        @keyframes shimmer {
          0%, 100% {
            box-shadow: 0 0 20px ${notification.type === 'call' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(16, 185, 129, 0.5)'};
          }
          50% {
            box-shadow: 0 0 40px ${notification.type === 'call' ? 'rgba(59, 130, 246, 0.8)' : 'rgba(16, 185, 129, 0.8)'},
                        0 0 60px ${notification.type === 'call' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'};
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  )
}