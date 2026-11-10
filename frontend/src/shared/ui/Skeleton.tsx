import { cn } from '@/shared/lib/cn'

export interface SkeletonProps {
  className?: string
  /** Rounded corners are on by default; pass `false` for full-bleed bars. */
  rounded?: boolean
}

/** Loading placeholder rectangle reused by every list. */
export function Skeleton({ className, rounded = true }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse bg-sage-100', rounded && 'rounded-lg', className)}
    />
  )
}
