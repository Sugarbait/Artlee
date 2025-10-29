/**
 * General Toast Component - Enhanced with Beautiful Animations & Gradients
 * Displays success, error, info, and warning toast messages
 * Replaces browser alert() dialogs with stunning on-screen notifications
 */

import React, { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X, Sparkles } from 'lucide-react'
import { generalToast, ToastMessage } from '@/services/generalToastService'

interface ToastItemProps {
  toast: ToastMessage
  onDismiss: (id: string) => void
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [isAnimating, setIsAnimating] = useState(false)
  const [isEntering, setIsEntering] = useState(true)

  useEffect(() => {
    // Smooth entrance animation
    setTimeout(() => setIsEntering(false), 50)

    const timer = setTimeout(() => {
      handleDismiss()
    }, toast.duration || 5000)

    return () => clearTimeout(timer)
  }, [toast])

  const handleDismiss = () => {
    setIsAnimating(true)
    setTimeout(() => {
      onDismiss(toast.id)
    }, 300)
  }

  const getIcon = () => {
    const iconClass = "w-6 h-6 animate-[bounce_0.5s_ease-in-out_2]"
    switch (toast.type) {
      case 'success':
        return <CheckCircle className={`${iconClass} text-green-100`} />
      case 'error':
        return <XCircle className={`${iconClass} text-red-100`} />
      case 'warning':
        return <AlertTriangle className={`${iconClass} text-amber-100`} />
      default:
        return <Info className={`${iconClass} text-blue-100`} />
    }
  }

  const getGradientClass = () => {
    switch (toast.type) {
      case 'success':
        return 'from-emerald-500 via-green-500 to-teal-500'
      case 'error':
        return 'from-rose-500 via-red-500 to-pink-500'
      case 'warning':
        return 'from-amber-500 via-orange-500 to-yellow-500'
      default:
        return 'from-blue-500 via-indigo-500 to-purple-500'
    }
  }

  const getProgressGradient = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-gradient-to-r from-green-400 to-emerald-400'
      case 'error':
        return 'bg-gradient-to-r from-red-400 to-rose-400'
      case 'warning':
        return 'bg-gradient-to-r from-amber-400 to-orange-400'
      default:
        return 'bg-gradient-to-r from-blue-400 to-indigo-400'
    }
  }

  const getGlowClass = () => {
    switch (toast.type) {
      case 'success':
        return 'shadow-green-500/50'
      case 'error':
        return 'shadow-red-500/50'
      case 'warning':
        return 'shadow-amber-500/50'
      default:
        return 'shadow-blue-500/50'
    }
  }

  return (
    <div
      className={`
        relative backdrop-blur-xl bg-gradient-to-br ${getGradientClass()}
        rounded-2xl shadow-2xl ${getGlowClass()} p-[1px] mb-3
        transition-all duration-300 ease-out
        ${isEntering ? 'opacity-0 transform translate-x-full scale-95' : 'opacity-100 transform translate-x-0 scale-100'}
        ${isAnimating ? 'opacity-0 transform translate-x-full scale-95' : ''}
        hover:scale-105 hover:shadow-3xl
      `}
      style={{
        minWidth: '340px',
        maxWidth: '420px',
        animation: 'shimmer 3s infinite'
      }}
    >
      {/* Inner container with glass morphism effect */}
      <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm rounded-2xl p-4">
        {/* Sparkle decoration */}
        <div className="absolute -top-1 -right-1">
          <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
        </div>

        <div className="flex items-start space-x-3">
          {/* Animated icon with gradient background */}
          <div className={`
            flex-shrink-0 p-2 rounded-xl bg-gradient-to-br ${getGradientClass()}
            shadow-lg transform transition-transform hover:rotate-12
          `}>
            {getIcon()}
          </div>

          <div className="flex-1 min-w-0">
            {toast.title && (
              <div className="text-sm font-bold bg-gradient-to-r from-gray-900 to-gray-700
                            dark:from-white dark:to-gray-300 bg-clip-text text-transparent mb-1">
                {toast.title}
              </div>
            )}
            <div className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line font-medium">
              {toast.message}
            </div>
          </div>

          <button
            onClick={handleDismiss}
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
            className={`${getProgressGradient()} h-1.5 rounded-full shadow-lg transition-all ease-linear`}
            style={{
              animation: `shrink ${toast.duration}ms linear forwards, pulse 1s ease-in-out infinite`
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
          0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.5); }
          50% { box-shadow: 0 0 40px rgba(59, 130, 246, 0.8), 0 0 60px rgba(59, 130, 246, 0.4); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}

export const GeneralToast: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    const unsubscribe = generalToast.subscribe((toast) => {
      setToasts(prev => [...prev, toast])
    })

    return unsubscribe
  }, [])

  const handleDismiss = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={handleDismiss} />
      ))}
    </div>
  )
}
