import type { FeedFilters, SortField, SortOrder } from '@/api/types'
import type { Point } from '@/entities/order/lib/distance'

export const DEFAULT_FILTERS: Omit<FeedFilters, 'lat' | 'lon'> = {
  q: '',
  radiusKm: 10,
  minPrice: null,
  maxPrice: null,
  treeType: null,
  maxHeight: null,
  sortBy: 'created_at',
  sortOrder: 'desc',
}

const SORT_FIELDS: readonly SortField[] = ['created_at', 'deadline', 'min_price']
const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc']

function isSortField(value: string | null): value is SortField {
  return value !== null && (SORT_FIELDS as readonly string[]).includes(value)
}

function isSortOrder(value: string | null): value is SortOrder {
  return value !== null && (SORT_ORDERS as readonly string[]).includes(value)
}

/** Parses a finite number; blank and malformed values become `null`. */
function parseNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parsePrice(value: string | null): number | null {
  const parsed = parseNumber(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

/**
 * Reads feed filters from a query string. Unknown, out-of-range and malformed
 * values silently fall back to defaults so a shared link always renders.
 */
export function parseFilters(search: string, fallback: Point): FeedFilters {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)

  const radius = parseNumber(params.get('radius'))
  const radiusKm =
    radius !== null && radius >= 1 && radius <= 50 ? radius : DEFAULT_FILTERS.radiusKm

  const minPrice = parsePrice(params.get('min'))
  let maxPrice = parsePrice(params.get('max'))
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) maxPrice = null

  const tree = params.get('tree')?.trim() ?? ''
  const treeType = tree === '' ? null : tree

  const height = parseNumber(params.get('height'))
  const maxHeight = height !== null && height > 0 ? height : null

  const sort = params.get('sort')
  const sortBy = isSortField(sort) ? sort : DEFAULT_FILTERS.sortBy

  const order = params.get('order')
  const sortOrder = isSortOrder(order) ? order : DEFAULT_FILTERS.sortOrder

  return {
    q: params.get('q')?.trim() ?? '',
    radiusKm,
    minPrice,
    maxPrice,
    treeType,
    maxHeight,
    sortBy,
    sortOrder,
    lat: fallback.lat,
    lon: fallback.lon,
  }
}

/**
 * Builds the short address-bar query (`?radius=25&sort=min_price`) used for
 * shareable links. The point is not part of the URL and default values are
 * omitted.
 */
export function toSearchParams(filters: FeedFilters): URLSearchParams {
  const params = new URLSearchParams()
  const q = filters.q.trim()

  if (q !== '') params.set('q', q)
  if (filters.radiusKm !== DEFAULT_FILTERS.radiusKm) {
    params.set('radius', String(filters.radiusKm))
  }
  if (filters.minPrice !== null && filters.minPrice !== undefined) {
    params.set('min', String(filters.minPrice))
  }
  if (filters.maxPrice !== null && filters.maxPrice !== undefined) {
    params.set('max', String(filters.maxPrice))
  }
  if (filters.treeType) params.set('tree', filters.treeType)
  if (filters.maxHeight !== null && filters.maxHeight !== undefined) {
    params.set('height', String(filters.maxHeight))
  }
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) params.set('sort', filters.sortBy)
  if (filters.sortOrder !== DEFAULT_FILTERS.sortOrder) params.set('order', filters.sortOrder)

  return params
}
