import type { Order } from '@/api/types'
import { formatMoney } from '@/shared/lib/format'

export interface MapMarker {
  id: number
  lat: number
  lon: number
  price: number | null
  label: string
}

/** Maps orders onto the minimal shape the map needs: point, price and label. */
export function buildMarkers(orders: Order[]): MapMarker[] {
  return orders.map((order) => {
    const price = order.min_price
    return {
      id: order.id,
      lat: order.lat,
      lon: order.lon,
      price,
      label: price === null ? '—' : formatMoney(price),
    }
  })
}
