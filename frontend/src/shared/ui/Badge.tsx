import type { OrderStatus, ProposalStatus } from '@/api/types'
import { cn } from '@/shared/lib/cn'

export type BadgeVariant = 'open' | 'work' | 'closed' | 'accepted' | 'pending' | 'rejected'

export type BadgeStatus = OrderStatus | ProposalStatus

export type BadgeProps =
  | { status: BadgeStatus; variant?: undefined; className?: string }
  | { variant: BadgeVariant; status?: undefined; className?: string }

const labels: Record<BadgeVariant, string> = {
  open: 'Открыт',
  work: 'В работе',
  closed: 'Закрыт',
  accepted: 'Принят',
  pending: 'Ожидает',
  rejected: 'Отклонён',
}

const variants: Record<BadgeVariant, string> = {
  open: 'bg-sage-100 text-moss-600',
  work: 'bg-amber-500/15 text-amber-700',
  closed: 'bg-line text-muted-strong',
  accepted: 'bg-moss-600 text-white',
  pending: 'bg-amber-500/15 text-amber-700',
  rejected: 'bg-terracotta-50 text-terracotta-600',
}

const statusToVariant: Record<BadgeStatus, BadgeVariant> = {
  open: 'open',
  assigned: 'work',
  closed: 'closed',
  accepted: 'accepted',
  pending: 'pending',
  rejected: 'rejected',
}

/** Maps backend order/proposal statuses onto the six badge variants. */
export function badgeVariantForStatus(status: BadgeStatus): BadgeVariant {
  return statusToVariant[status]
}

export function Badge(props: BadgeProps) {
  const variant = props.status !== undefined ? statusToVariant[props.status] : props.variant

  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        props.className,
      )}
    >
      {labels[variant]}
    </span>
  )
}
