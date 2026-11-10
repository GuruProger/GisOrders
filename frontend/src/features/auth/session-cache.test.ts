import { QueryClient } from '@tanstack/react-query'
import { qk } from '@/api/queryKeys'
import type { Chat, Order, User } from '@/api/types'
import { useSession } from './session'
import { attachSessionCacheReset } from './session-cache'

const user: User = {
  id: 1,
  email: 'customer@example.com',
  username: 'customer',
  phone_number: null,
  is_admin: false,
  is_active: true,
}

const order = { id: 1, title: 'Заказ' } as unknown as Order
const chat = { id: 1, order_id: 1 } as unknown as Chat

function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: null, status: 'anonymous' })
})

afterEach(() => {
  useSession.setState({ user: null, status: 'anonymous' })
  localStorage.clear()
})

test('clears every cached query when the session ends', () => {
  const queryClient = createQueryClient()
  const unsubscribe = attachSessionCacheReset(queryClient)

  useSession.setState({ user, status: 'authenticated' })
  queryClient.setQueryData(qk.orders.my(), [order])
  queryClient.setQueryData(qk.chats.list(), [chat])

  expect(queryClient.getQueryData(qk.orders.my())).toEqual([order])
  expect(queryClient.getQueryData(qk.chats.list())).toEqual([chat])

  useSession.getState().clear()

  expect(queryClient.getQueryData(qk.orders.my())).toBeUndefined()
  expect(queryClient.getQueryData(qk.chats.list())).toBeUndefined()
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0)

  unsubscribe()
})

test('does not clear data when an unauthenticated bootstrap settles anonymously', () => {
  useSession.setState({ user: null, status: 'loading' })
  const queryClient = createQueryClient()
  const unsubscribe = attachSessionCacheReset(queryClient)

  queryClient.setQueryData(qk.orders.my(), [order])
  useSession.setState({ user: null, status: 'anonymous' })

  expect(queryClient.getQueryData(qk.orders.my())).toEqual([order])

  unsubscribe()
})

test('clears cached data when a signed-in visitor logs in as another account', () => {
  const queryClient = createQueryClient()
  const unsubscribe = attachSessionCacheReset(queryClient)

  useSession.setState({ user, status: 'authenticated' })
  queryClient.setQueryData(qk.orders.my(), [order])

  useSession.setState({
    user: { ...user, id: 2, email: 'other@example.com', username: 'other' },
    status: 'authenticated',
  })

  expect(queryClient.getQueryCache().getAll()).toHaveLength(0)

  unsubscribe()
})

test('keeps cached data when the same profile is refreshed', () => {
  const queryClient = createQueryClient()
  const unsubscribe = attachSessionCacheReset(queryClient)

  useSession.setState({ user, status: 'authenticated' })
  queryClient.setQueryData(qk.orders.my(), [order])
  useSession.getState().setUser({ ...user, username: 'renamed' })

  expect(queryClient.getQueryData(qk.orders.my())).toEqual([order])

  unsubscribe()
})

test('stops clearing after unsubscribe', () => {
  const queryClient = createQueryClient()
  const unsubscribe = attachSessionCacheReset(queryClient)
  unsubscribe()

  useSession.setState({ user, status: 'authenticated' })
  queryClient.setQueryData(qk.orders.my(), [order])
  useSession.getState().clear()

  expect(queryClient.getQueryData(qk.orders.my())).toEqual([order])
})
