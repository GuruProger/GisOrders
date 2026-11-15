import type { HTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

export type CardProps = HTMLAttributes<HTMLDivElement>

/** White surface used for every card-like block. */
export function Card({ className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(16,36,26,0.04)]',
        className,
      )}
      {...rest}
    />
  )
}
