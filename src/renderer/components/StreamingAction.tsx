import React, { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Lightweight flip/replace animation for the latest action line.
// Uses Web Animations via the browser; no external deps required.
export const StreamingAction: React.FC<{ text: string; className?: string; dotSpeedMs?: number }> = ({ text, className, dotSpeedMs = 500 }) => {
  const [display, setDisplay] = useState(text)
  const [dots, setDots] = useState(1)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (display === text) return
    const el = ref.current
    if (!el) { setDisplay(text); return }

    // Animate out the current line
    const out = el.animate(
      [
        { transform: 'perspective(600px) rotateX(0deg)', opacity: 1 },
        { transform: 'perspective(600px) rotateX(90deg)', opacity: 0 }
      ],
      { duration: 220, easing: 'ease-in' }
    )
    out.onfinish = () => {
      setDisplay(text)
      setDots(1)
      // Next tick, animate in the new line
      requestAnimationFrame(() => {
        const el2 = ref.current
        if (!el2) return
        el2.animate(
          [
            { transform: 'perspective(600px) rotateX(-90deg)', opacity: 0 },
            { transform: 'perspective(600px) rotateX(0deg)', opacity: 1 }
          ],
          { duration: 260, easing: 'ease-out' }
        )
      })
    }
  }, [text, display])

  // Animated ellipsis 1..2..3..1.. while streaming
  useEffect(() => {
    const id = window.setInterval(() => {
      setDots((d) => (d % 3) + 1)
    }, Math.max(200, dotSpeedMs))
    return () => window.clearInterval(id)
  }, [display, dotSpeedMs])

  if (!display) return null
  return (
    <div ref={ref} className={cn('mt-2 text-[13px] text-gray-600 dark:text-gray-300 origin-top', className)}>
      <span className="shimmer-text">{display}</span>
      <span aria-hidden className="ml-1">{'.'.repeat(dots)}</span>
    </div>
  )
}

export default StreamingAction
