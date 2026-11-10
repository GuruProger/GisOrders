import { cn } from '@/shared/lib/cn'

export interface AvatarProps {
  name?: string | null
  className?: string
}

/** First letters of the first two words; `?` keeps empty profiles visible. */
export function getInitials(name?: string | null): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (words.length === 0) return '?'

  const initials = words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('')

  return initials || '?'
}

/** 32 px initials circle used in the header. */
export function Avatar({ name, className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-sage-100 text-sm font-semibold text-moss-600',
        className,
      )}
    >
      {getInitials(name)}
    </span>
  )
}
