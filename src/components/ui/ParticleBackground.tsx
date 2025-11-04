import React, { useEffect, useRef } from 'react'

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match parent container with high DPI support
    const resizeCanvas = () => {
      const parent = canvas.parentElement
      if (parent) {
        const dpr = window.devicePixelRatio || 1
        const rect = parent.getBoundingClientRect()

        // Set display size
        canvas.style.width = rect.width + 'px'
        canvas.style.height = rect.height + 'px'

        // Set actual canvas size (accounting for device pixel ratio)
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr

        // Scale context to match device pixel ratio
        ctx.scale(dpr, dpr)
      }
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    // Animated waves
    let time = 0

    // Animation loop
    let animationFrameId: number

    const animate = () => {
      const parent = canvas.parentElement
      if (!parent) return

      const rect = parent.getBoundingClientRect()
      ctx.clearRect(0, 0, rect.width, rect.height)

      time += 0.01

      // Draw multiple wave layers
      const waves = [
        { amplitude: 30, frequency: 0.015, speed: 0.5, opacity: 0.15, offset: 0 },
        { amplitude: 25, frequency: 0.02, speed: 0.3, opacity: 0.1, offset: 50 },
        { amplitude: 20, frequency: 0.025, speed: 0.4, opacity: 0.12, offset: 100 }
      ]

      waves.forEach((wave, index) => {
        ctx.beginPath()
        ctx.moveTo(0, rect.height / 2)

        // Draw smooth wave
        for (let x = 0; x <= rect.width; x += 2) {
          const y = rect.height / 2 +
            Math.sin((x * wave.frequency) + (time * wave.speed)) * wave.amplitude +
            Math.sin((x * wave.frequency * 0.5) + (time * wave.speed * 1.5)) * (wave.amplitude * 0.5)

          if (x === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        }

        // Complete the shape
        ctx.lineTo(rect.width, rect.height)
        ctx.lineTo(0, rect.height)
        ctx.closePath()

        // Fill with gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, rect.height)
        gradient.addColorStop(0, `rgba(255, 255, 255, ${wave.opacity})`)
        gradient.addColorStop(1, `rgba(255, 255, 255, 0)`)

        ctx.fillStyle = gradient
        ctx.fill()
      })

      // Add floating circles
      const circles = 12
      for (let i = 0; i < circles; i++) {
        const x = (rect.width / circles) * i + (Math.sin(time * 0.5 + i) * 30)
        const y = rect.height / 2 + (Math.sin(time * 0.3 + i * 0.5) * 40)
        const radius = 3 + Math.sin(time + i) * 1.5

        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + Math.sin(time + i) * 0.1})`
        ctx.fill()
      }

      animationFrameId = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 opacity-60"
      style={{ mixBlendMode: 'screen' }}
    />
  )
}
