import React from 'react'
import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

export const ThinkingActionLine: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  return (
    <div className={cn('relative pl-5 text-[13px] text-gray-600 dark:text-gray-300', className)}>
      <Zap className="absolute left-0 top-0.5 h-4 w-4 text-amber-500" />
      <span className="shimmer-text">{text}</span>
    </div>
  )
}

export default ThinkingActionLine

