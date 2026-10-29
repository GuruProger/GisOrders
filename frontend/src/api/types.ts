export type OrderStatus = 'open' | 'assigned' | 'closed'

export type ProposalStatus = 'pending' | 'accepted' | 'rejected'

export type SortField = 'created_at' | 'deadline' | 'min_price'

export type SortOrder = 'asc' | 'desc'

export interface Order {
  id: number
  title: string
  description: string
  min_price: number | null
  max_price: number | null
  deadline: string
  address: string
  tree_type: string
  tree_height: number
  tree_diameter: number
  photos: string[] | null
  status: OrderStatus
  created_at: string
  closed_at: string | null
  customer_id: number
  accepted_proposal_id: number | null
  lat: number
  lon: number
  proposals_count: number
}

export interface Proposal {
  id: number
  proposed_price: number
  message: string | null
  created_at: string
  order_id: number
  executor_id: number
  status: ProposalStatus
  order?: Order
}

export interface Chat {
  id: number
  order_id: number
  customer_id: number
  executor_id: number
  proposal_id: number | null
  is_active: boolean
  created_at: string
  updated_at: string
  last_message: string | null
  unread_count: number
  messages?: Message[]
}

export interface Message {
  id: number
  chat_id: number
  sender_id: number
  text: string
  is_read: boolean
  created_at: string
}

export interface User {
  id: number
  email: string
  username: string
  phone_number: string | null
  is_admin: boolean
  is_active: boolean
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
  user: User
}

/**
 * UI filter state of the feed, stored in the address bar. The API uses
 * snake_case names and a different subset of fields; `api/orders.ts` maps
 * between the two.
 */
export interface FeedFilters {
  q: string
  radiusKm: number
  minPrice?: number | null
  maxPrice?: number | null
  treeType?: string | null
  maxHeight?: number | null
  sortBy: SortField
  sortOrder: SortOrder
  lat: number
  lon: number
}
