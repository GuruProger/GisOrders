import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export interface EmptyStateProps {
  title: string
  description?: string
  /** Defaults to a simple inline illustration. */
  icon?: ReactNode
  /** Optional call to action, usually a `Button`. */
  action?: ReactNode
  className?: string
}

function DefaultIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-8"
    >
      <path d="M4 20h16" />
      <path d="M12 4v4" />
      <path d="M12 8c-3 0-5 2-5 5h10c0-3-2-5-5-5Z" />
    </svg>
  )
}

/** Empty list state: icon, title, description and an optional action. */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-10 text-center', className)}>
      <span aria-hidden="true" className="text-muted">
        {icon ?? <DefaultIcon />}
      </span>
      <p className="text-base font-semibold text-forest-900">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted-strong">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
