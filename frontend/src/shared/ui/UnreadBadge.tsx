import { cn } from '@/shared/lib/cn'
import { plural } from '@/shared/lib/plural'

export interface UnreadBadgeProps {
  count: number
  className?: string
}

/**
 * Small numeric counter for unread messages. It is intentionally separate from
 * the status `Badge`: it renders nothing at zero and never carries a label.
 */
export function UnreadBadge({ count, className }: UnreadBadgeProps) {
  if (count <= 0) return null

  return (
    <span
      aria-label={`${count} ${plural(count, ['непрочитанное', 'непрочитанных', 'непрочитанных'])}`}
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-terracotta-600 px-1.5 text-[11px] font-semibold leading-5 text-white',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
