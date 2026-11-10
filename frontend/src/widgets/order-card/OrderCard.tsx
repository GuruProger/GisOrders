import { useState } from 'react'
import type { Order } from '@/api/types'
import { distanceKm, formatDistance, type Point } from '@/entities/order/lib/distance'
import { cn } from '@/shared/lib/cn'
import { formatDeadline, formatMoney } from '@/shared/lib/format'
import { plural } from '@/shared/lib/plural'
import { Badge } from '@/shared/ui/Badge'
import { Card } from '@/shared/ui/Card'

export interface OrderCardProps {
  order: Order
  userPoint: Point
  onClick?: () => void
  selected?: boolean
}

const PROPOSAL_FORMS: [string, string, string] = ['отклик', 'отклика', 'откликов']

/** Feed list item: title, distance/deadline/species, status, price, proposals. */
export function OrderCard({ order, userPoint, onClick, selected = false }: OrderCardProps) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null)

  const photo = order.photos?.[0]
  const showPhoto = Boolean(photo) && failedPhoto !== photo
  const distance = formatDistance(distanceKm(userPoint, { lat: order.lat, lon: order.lon }))
  const deadline = formatDeadline(order.deadline)
  const price = order.max_price ?? order.min_price

  const content = (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {photo && (
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sage-100">
            {showPhoto && (
              <img
                src={photo}
                alt=""
                className="size-11 object-cover"
                onError={() => setFailedPhoto(photo)}
              />
            )}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-base font-semibold text-forest-900">{order.title}</h3>
          <p className="mt-1 truncate text-sm text-muted-strong">
            <span>{distance}</span> · <span>{deadline}</span> · {order.tree_type},{' '}
            {order.tree_height} м
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Badge status={order.status} />
        {order.proposals_count === 0 ? (
          <span className="inline-flex min-h-6 items-center rounded-full bg-sage-100 px-2.5 py-0.5 text-xs font-medium text-moss-600">
            новый
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
