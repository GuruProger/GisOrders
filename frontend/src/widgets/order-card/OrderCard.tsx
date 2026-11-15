import { useState } from 'react'
import type { Order } from '@/api/types'
import { distanceKm, formatDistance, type Point } from '@/entities/order/lib/distance'
import { cn } from '@/shared/lib/cn'
import { formatDeadline, formatMoney } from '@/shared/lib/format'
import { plural } from '@/shared/lib/plural'
import { Card } from '@/shared/ui/Card'

export interface OrderCardProps {
  order: Order
  userPoint: Point
  onClick?: () => void
  selected?: boolean
}

const PROPOSAL_FORMS: [string, string, string] = ['отклик', 'отклика', 'откликов']

function TreeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <path d="M12 3 7 10h3l-3 5h10l-3-5h3L12 3Z" />
      <path d="M12 15v6" />
    </svg>
  )
}

/** Feed list item: title, distance/deadline/species, status, price, proposals. */
export function OrderCard({ order, userPoint, onClick, selected = false }: OrderCardProps) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null)

  const photo = order.photos?.[0]
  const distance = formatDistance(distanceKm(userPoint, { lat: order.lat, lon: order.lon }))
  const deadline = formatDeadline(order.deadline)
  const price = order.max_price ?? order.min_price

  const content = (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sage-100 text-muted-strong">
          {photo !== undefined && failedPhoto !== photo ? (
            <img
              src={photo}
              alt=""
              className="size-11 object-cover"
              onError={() => setFailedPhoto(photo)}
            />
          ) : (
            <TreeGlyph />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-semibold text-forest-900">{order.title}</h3>
          <p className="mt-1 truncate text-sm text-muted-strong">
            <span>{distance}</span> · <span>{deadline}</span> · {order.tree_type},{' '}
            {order.tree_height} м
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {order.proposals_count === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-moss-600">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-leaf-500" />
            Новый
          </span>
        ) : (
          <span className="text-xs text-muted-strong">
            {order.proposals_count} {plural(order.proposals_count, PROPOSAL_FORMS)}
          </span>
        )}
        <span className="ml-auto text-base font-semibold text-forest-900">
          {price === null ? '—' : formatMoney(price)}
        </span>
      </div>
    </div>
  )

  return (
    <div role="listitem">
      <Card className={cn('overflow-hidden', selected && 'ring-2 ring-moss-600')}>
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className="flex min-h-16 w-full flex-col rounded-xl p-4 text-left transition-colors hover:bg-sage-100/60 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:ring-inset focus-visible:outline-none"
          >
            {content}
          </button>
        ) : (
          <div className="p-4">{content}</div>
        )}
      </Card>
    </div>
  )
}
