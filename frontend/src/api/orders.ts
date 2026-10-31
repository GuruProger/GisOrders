import type { FeedFilters, Order, OrderStatus } from './types'
import { apiRequest } from './client'

export const FEED_PAGE_SIZE = 20

/**
 * Maps the UI filter model onto the backend parameter names. The address bar
 * uses short keys and never carries the point; the API needs both.
 */
function toApiParams(filters: FeedFilters): URLSearchParams {
  const params = new URLSearchParams()

  params.set('user_lat', String(filters.lat))
  params.set('user_lon', String(filters.lon))
  params.set('radius_km', String(filters.radiusKm))

  const search = filters.q.trim()
  if (search !== '') params.set('search', search)
  if (filters.minPrice !== null && filters.minPrice !== undefined) {
    params.set('min_price', String(filters.minPrice))
  }
  if (filters.maxPrice !== null && filters.maxPrice !== undefined) {
    params.set('max_price', String(filters.maxPrice))
  }
  if (filters.treeType) params.set('tree_type', filters.treeType)
  if (filters.maxHeight !== null && filters.maxHeight !== undefined) {
    params.set('max_height', String(filters.maxHeight))
  }

  params.set('sort_by', filters.sortBy)
  params.set('sort_order', filters.sortOrder)

  return params
}

/** One page of orders around the user's point; `total` comes from `X-Total-Count`. */
export async function fetchAvailableOrders(
  filters: FeedFilters,
  page: number,
): Promise<{ orders: Order[]; total: number | null }> {
  const params = toApiParams(filters)
  params.set('page', String(page))
  params.set('per_page', String(FEED_PAGE_SIZE))

  const { data, total } = await apiRequest<Order[]>(`/orders/available?${params.toString()}`)
  return { orders: data, total }
}

/** Orders owned by the current user, optionally filtered by status. */
export async function fetchMyOrders(status?: OrderStatus): Promise<Order[]> {
  const query = status ? `?order_status=${encodeURIComponent(status)}` : ''
  const { data } = await apiRequest<Order[]>(`/orders/my${query}`)
  return data
}

export async function fetchOrder(id: number): Promise<Order> {
  const { data } = await apiRequest<Order>(`/orders/${id}`)
  return data
}

/** Closes an order; the owner (or an admin) only. */
export async function closeOrder(id: number): Promise<void> {
  await apiRequest<Order>(`/orders/${id}/close`, { method: 'POST' })
}

/** Deletes an order; the backend refuses while an executor is assigned. */
export async function deleteOrder(id: number): Promise<void> {
  await apiRequest<null>(`/orders/${id}`, { method: 'DELETE' })
}
