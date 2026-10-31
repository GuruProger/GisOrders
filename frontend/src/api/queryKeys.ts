import type { FeedFilters, OrderStatus } from './types'

/**
 * Single source of query keys for every screen. Keeping them in one factory
 * makes cross-feature invalidation (e.g. a new order refreshing the feed)
 * predictable.
 */
export const qk = {
  orders: {
    all: ['orders'] as const,
    available: (filters: FeedFilters) => ['orders', 'available', filters] as const,
    /** Single-page shape used by the map; kept apart from the infinite feed. */
    map: (filters: FeedFilters) => ['orders', 'map', filters] as const,
    my: (status?: OrderStatus) => ['orders', 'my', status ?? 'all'] as const,
    detail: (id: number) => ['orders', 'detail', id] as const,
  },
  proposals: {
    all: ['proposals'] as const,
    mine: () => ['proposals', 'mine'] as const,
    forOrder: (orderId: number) => ['proposals', 'order', orderId] as const,
  },
  chats: {
    all: ['chats'] as const,
    list: () => ['chats', 'list'] as const,
    detail: (id: number) => ['chats', 'detail', id] as const,
    unread: () => ['chats', 'unread'] as const,
  },
  users: { detail: (id: number) => ['users', 'detail', id] as const },
} as const
